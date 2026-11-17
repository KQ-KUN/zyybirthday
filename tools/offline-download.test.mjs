import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import {downloadAssets,sha256,validateManifest,ensureOfflineShell,createOfflineDownload} from '../offline-download.js';
const root=new URL('../',import.meta.url),baseUrl='https://fixture.test/album/';
function memoryCaches(){
  const stores=new Map();return {stores,async open(name){if(!stores.has(name))stores.set(name,new Map());const values=stores.get(name);return {
    async match(key){return values.get(typeof key==='string'?key:key.url)?.clone();},
    async put(key,value){assert.equal(value.status,200);values.set(typeof key==='string'?key:key.url,value.clone());},
    async add(request){const url=new URL(request.url),file=url.pathname.replace('/album/','');const bytes=await readFile(new URL(file,root));values.set(url.href,new Response(bytes));}
  };}};
}
test('下载按内容校验，重复点击跳过已保存文件，缓存写入失败不能报告完成',async()=>{
  const bytes=new Uint8Array([1,2,3]),file={path:'assets/test.mp3',kind:'music',bytes:3,type:'audio/mpeg',sha256:await sha256(bytes)},manifest={version:'20261117-29',assets:[file]};validateManifest(manifest);
  const cache=await memoryCaches().open('test');let downloads=0,last;
  const options={cache,baseUrl,download:async()=>{downloads++;return bytes;},onProgress:state=>last=state};
  await downloadAssets(manifest,options);assert.equal(downloads,1);assert.equal(last.percent,100);
  await downloadAssets(manifest,options);assert.equal(downloads,1);
  await cache.put(new URL(file.path,baseUrl).href,new Response('bad'));
  await downloadAssets(manifest,options);assert.equal(downloads,2);
  await assert.rejects(downloadAssets(manifest,{...options,cache:{match:async()=>null,put:async()=>{throw new Error('write failed');}}}),/write failed/);
  assert.throws(()=>validateManifest({...manifest,assets:[{...file,path:'../private'}]}));
});
test('拒绝内容损坏的下载，即使 HTTP 成功也不写入缓存',async()=>{
  const file={path:'sealed/test.bin',kind:'photo',bytes:2,type:'application/octet-stream',sha256:await sha256(new Uint8Array([1,2]))};let writes=0;
  await assert.rejects(downloadAssets({assets:[file]},{baseUrl,cache:{match:async()=>null,put:async()=>{writes++;}},download:async()=>new Uint8Array([3,4])}));assert.equal(writes,0);
});
test('Service Worker 必须激活当前版本，旧版本或安装失败不可通过',async()=>{
  const active={scriptURL:baseUrl+'service-worker.js?v=20261117-29',state:'activated',addEventListener(){},removeEventListener(){}};
  const registration={active};assert.equal(await ensureOfflineShell({serviceWorker:{register:async()=>registration}}),registration);
  await assert.rejects(ensureOfflineShell({serviceWorker:{register:async()=>({active:{...active,scriptURL:baseUrl+'service-worker.js?v=old'}})}}));
  await assert.rejects(ensureOfflineShell({serviceWorker:{register:async()=>({installing:{...active,state:'redundant'}})}}));
  await assert.rejects(ensureOfflineShell({serviceWorker:{register:()=>new Promise(()=>{})},timeoutMs:10}),/超时/);
});
test('一个按钮完成下载并记住完成状态，离线重开无需再次联网或重复下载',async()=>{
  const originals=Object.fromEntries(['location','caches','navigator','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const cacheStorage=memoryCaches(),bytes=new Uint8Array([1,2,3]),file={path:'assets/test.mp3',kind:'music',bytes:3,type:'audio/mpeg',sha256:await sha256(bytes)},manifest={version:'20261117-29',assets:[file]};
  const active={scriptURL:baseUrl+'service-worker.js?v=20261117-29',state:'activated',addEventListener(){},removeEventListener(){}};let requests=0;
  try{
    Object.defineProperty(globalThis,'location',{configurable:true,value:{href:baseUrl}});Object.defineProperty(globalThis,'caches',{configurable:true,value:cacheStorage});
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{register:async()=>({active})}}});
    globalThis.fetch=async url=>{requests++;return new Response(String(url).includes('offline-manifest')?JSON.stringify(manifest):bytes);};
    const button={setAttribute(){},addEventListener(){},removeEventListener(){}};
    const controller=createOfflineDownload();controller.bind(button);assert.equal(button.textContent,'一键下载');
    const first=controller.download();assert.equal(controller.download(),first);await first;
    assert.equal(button.textContent,'已下载，可离线打开');assert.equal(button.disabled,true);assert.equal(requests,2);
    globalThis.fetch=async()=>{throw new Error('offline');};
    const reopened=createOfflineDownload();reopened.bind(button);await reopened.restore();assert.equal(button.textContent,'已下载，可离线打开');
    const cache=await cacheStorage.open('memory-album-offline-v1');await cache.put(new URL(file.path,baseUrl).href,new Response('invalid'));
    const incomplete=createOfflineDownload();incomplete.bind(button);await incomplete.restore();assert.equal(button.textContent,'一键下载');
  }finally{for(const [key,descriptor] of Object.entries(originals))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});
test('真实离线包：下载全清单后禁用所有网络，重新导航及全部资源均可读取，三首音乐支持 Safari 范围请求',async()=>{
  const manifest=validateManifest(JSON.parse(await readFile(new URL('offline-manifest.json',root),'utf8'))),caches=memoryCaches();
  const events=new Map(),self={registration:{scope:baseUrl},location:{origin:new URL(baseUrl).origin},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,handler)=>events.set(name,handler)};
  let networkCalls=0;const context=vm.createContext({self,caches,fetch:async()=>{networkCalls++;throw new Error('airplane mode');},URL,Request,Response,Headers,AbortController,setTimeout,clearTimeout});
  const worker=await readFile(new URL('offline-worker.js',root),'utf8');context.importScripts=()=>vm.runInContext(worker,context);
  vm.runInContext(await readFile(new URL('service-worker.js',root),'utf8'),context);
  let install;events.get('install')({waitUntil:value=>install=value});await install;
  const cache=await caches.open('memory-album-offline-v1');let downloaded=0;
  await downloadAssets(manifest,{cache,baseUrl,download:async url=>{assert(url.startsWith(baseUrl));downloaded++;return new Uint8Array(await readFile(new URL(new URL(url).pathname.replace('/album/',''),root)));}});
  assert.equal(downloaded,manifest.assets.length);assert.equal(manifest.assets.filter(f=>f.kind==='photo').length,(await readdir(new URL('sealed/',root))).filter(name=>name.endsWith('.bin')).length);assert.equal(manifest.assets.filter(f=>f.kind==='music').length,3);
  async function respond(request){let pending;events.get('fetch')({request,respondWith:value=>pending=value});assert(pending);return pending;}
  const page=await respond({url:baseUrl,method:'GET',mode:'navigate',headers:new Headers()});assert((await page.text()).includes('unlock.js?v=20261117-29'));
  for(const file of manifest.assets){const response=await respond(new Request(new URL(file.path,baseUrl)));assert.equal(response.status,200,file.path);assert.equal(await sha256(await response.arrayBuffer()),file.sha256,file.path);}
  assert.equal(networkCalls,1);
  for(const file of manifest.assets.filter(f=>f.kind==='music')){
    for(const range of ['bytes=0-1','bytes=100-109','bytes=-128','bytes=100-']){
      const response=await respond(new Request(new URL(file.path,baseUrl),{headers:{Range:range}}));assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'audio/mpeg');assert.match(response.headers.get('content-range'),/^bytes \d+-\d+\/\d+$/);assert.equal((await response.arrayBuffer()).byteLength,Number(response.headers.get('content-length')));
    }
    const invalid=await respond(new Request(new URL(file.path,baseUrl),{headers:{Range:'bytes=99999999-'}}));assert.equal(invalid.status,416);
  }
  assert.equal(networkCalls,1);
  const count=downloaded;await downloadAssets(manifest,{cache,baseUrl,download:async()=>{downloaded++;throw new Error('offline');}});assert.equal(downloaded,count);
});
