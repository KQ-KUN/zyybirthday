import {OFFLINE_CACHE} from './offline-cache.js?v=20261117-30';
import {firstVerifiedPhoto} from './photo-repository.js?v=20261117-30';
import {downloadBytes} from './network.js?v=20261117-30';
const VERSION='20261117-30';
export function validateManifest(value){
  if(value?.version!==VERSION||!Array.isArray(value.assets)||!value.assets.length)throw new Error('下载清单无效');
  const paths=new Set();
  for(const file of value.assets){
    if(typeof file.path!=='string'||!/^[-\w./?=]+$/.test(file.path)||file.path.includes('..')||file.path.startsWith('/')||paths.has(file.path)||!['shell','photo','music'].includes(file.kind)||!Number.isSafeInteger(file.bytes)||file.bytes<=0||file.bytes>16*1024*1024||!/^[a-f0-9]{64}$/.test(file.sha256))throw new Error('下载文件无效');
    paths.add(file.path);
  }
  return value;
}
export async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
export async function downloadAssets(manifest,{cache,baseUrl,download,onProgress=()=>{},concurrency=2}={}){
  const files=manifest.assets,total=files.reduce((sum,file)=>sum+file.bytes,0);let cursor=0,done=0,failed;
  async function worker(){while(cursor<files.length&&!failed){const file=files[cursor++],url=new URL(file.path,baseUrl).href;
    try{
      const stored=await cache.match(url);
      if(!stored||stored.headers.get('x-album-sha256')!==file.sha256||Number(stored.headers.get('content-length'))!==file.bytes){
        const routes=[url,...['https://cdn.jsdelivr.net/gh/KQ-KUN/zyybirthday@main/','https://raw.githubusercontent.com/KQ-KUN/zyybirthday/main/'].map(root=>root+file.path)];
        const result=await firstVerifiedPhoto(routes,async bytes=>{if(bytes.byteLength!==file.bytes||await sha256(bytes)!==file.sha256)throw new Error('文件校验失败');return bytes;},{download});
        await cache.put(url,new Response(result.bytes,{headers:{'Content-Type':file.type,'Content-Length':String(file.bytes),'x-album-sha256':file.sha256}}));
      }
      done+=file.bytes;onProgress({done,total,percent:Math.floor(done/total*100)});
    }catch(error){failed=error;}
  }}
  await Promise.all(Array.from({length:concurrency},worker));if(failed)throw failed;
}
export function ensureOfflineShell({serviceWorker=navigator.serviceWorker,timeoutMs=90000}={}){
  if(!serviceWorker)return Promise.reject(new Error('请在 Safari 中打开，再下载离线相册'));
  return new Promise((resolve,reject)=>{
    let worker,registration,finished=false;
    const timer=setTimeout(()=>finish(new Error('离线程序下载超时，请重试')),timeoutMs);
    function finish(error){if(finished)return;finished=true;clearTimeout(timer);worker?.removeEventListener('statechange',changed);error?reject(error):resolve(registration);}
    function changed(){if(worker.state==='activated')finish();else if(worker.state==='redundant')finish(new Error('离线程序下载失败，请重试'));}
    serviceWorker.register('service-worker.js?v='+VERSION).then(value=>{
      if(finished)return;registration=value;worker=registration.installing||registration.waiting||registration.active;
      if(!worker||new URL(worker.scriptURL).searchParams.get('v')!==VERSION){finish(new Error('离线程序尚未准备好，请重试'));return;}
      worker.addEventListener('statechange',changed);changed();
    }).catch(finish);
  });
}
export function createOfflineDownload(){
  let state={status:'idle',percent:0},running;const listeners=new Set();
  const publish=next=>{state=next;for(const listener of listeners)listener(state);};
  async function manifest(cache,cachedFirst=false){
    const url=new URL('offline-manifest.json?v='+VERSION,location.href).href;
    let response;if(cachedFirst){response=await cache.match(url);if(response)return validateManifest(await response.json());}
    try{const bytes=await downloadBytes(url,{timeoutMs:20000,maxBytes:1024*1024,cache:'no-cache'}),value=validateManifest(JSON.parse(new TextDecoder().decode(bytes)));await cache.put(url,new Response(bytes,{headers:{'Content-Type':'application/json'}}));return value;}
    catch{response=await cache.match(url);if(response)return validateManifest(await response.json());throw new Error('请联网完成首次下载');}
  }
  async function run(){
    publish({status:'downloading',percent:0});
    try{
      if(!globalThis.caches)throw new Error('请在 Safari 中打开，再下载离线相册');
      const cache=await caches.open(OFFLINE_CACHE),files=await manifest(cache);
      await ensureOfflineShell();
      await downloadAssets(files,{cache,baseUrl:location.href,onProgress:progress=>publish({status:'downloading',...progress})});
      const marker=new URL('offline-ready-'+VERSION,location.href).href;
      await cache.put(marker,new Response('ready'));
      publish({status:'complete',percent:100});
    }catch(error){publish({status:'error',percent:state.percent,message:error.message||'下载未完成，请重试'});}
  }
  return {
    download(){if(!running)running=run().finally(()=>{running=null;});return running;},
    async restore(){try{const cache=await caches.open(OFFLINE_CACHE),ready=await cache.match(new URL('offline-ready-'+VERSION,location.href).href);if(!ready||running)return;const value=await manifest(cache,true);for(const file of value.assets){const stored=await cache.match(new URL(file.path,location.href).href);if(!stored||stored.headers.get('x-album-sha256')!==file.sha256||Number(stored.headers.get('content-length'))!==file.bytes)return;}if(!running)publish({status:'complete',percent:100});}catch{}},
    bind(button){
      const paint=value=>{button.textContent=value.status==='complete'?'已下载，可离线打开':value.status==='downloading'?`下载中 ${value.percent}%`:value.status==='error'?'下载未完成 · 点击重试':'一键下载';button.disabled=['complete','downloading'].includes(value.status);button.setAttribute('aria-busy',String(value.status==='downloading'));button.setAttribute('aria-label',value.status==='error'?value.message+'，点击重试':button.textContent);};
      const click=()=>this.download();button.addEventListener('click',click);listeners.add(paint);paint(state);
      return ()=>{listeners.delete(paint);button.removeEventListener('click',click);};
    }
  };
}
