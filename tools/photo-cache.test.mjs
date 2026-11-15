import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoCache} from '../photo-cache.js';

test('连续浏览 240 张照片时回收旧照片，保留屏幕上使用的照片',async()=>{
  const alive=new Set(),visible=new Set(['photo-0']);let fetches=0;
  const cache=createPhotoCache({limit:12,isVisible:url=>visible.has(url),dispose:url=>alive.delete(url),load:async photo=>{fetches++;const url='photo-'+photo.id;alive.add(url);return {url,bytes:1024};}});
  for(let id=0;id<240;id++){assert.equal(await cache.get({id}),'photo-'+id);assert(alive.size<=13);}
  assert(alive.has('photo-0'));assert(!alive.has('photo-1'));
  const previous=fetches;await cache.get({id:239});assert.equal(fetches,previous);
  visible.clear();cache.clear();assert.equal(alive.size,0);
});

test('限制两张并行下载，跳过已离屏排队项，失败后可以重试',async()=>{
  let active=0,peak=0,relevant=true,attempts=0;const calls=[];
  const cache=createPhotoCache({dispose:()=>{},load:async photo=>{
    calls.push(photo.id);active++;peak=Math.max(peak,active);
    await new Promise(resolve=>setTimeout(resolve,5));active--;
    if(photo.id==='retry'&&attempts++===0)throw new Error('offline');
    return {url:photo.id,bytes:1};
  }});
  const first=cache.get({id:'a'}),second=cache.get({id:'b'});
  const skipped=cache.get({id:'offscreen'},{isRelevant:()=>relevant}).catch(error=>error.message);relevant=false;
  await Promise.all([first,second]);assert.equal(await skipped,'照片已离屏');assert(!calls.includes('offscreen'));assert.equal(peak,2);
  await assert.rejects(cache.get({id:'retry'}));assert.equal(await cache.get({id:'retry'}),'retry');cache.clear();
});

test('按字节预算回收较大的照片',async()=>{
  const alive=new Set();const cache=createPhotoCache({maxBytes:10,dispose:url=>alive.delete(url),load:async photo=>{alive.add(photo.id);return {url:photo.id,bytes:6};}});
  for(let id=0;id<30;id++){await cache.get({id});assert(alive.size<=2);}
  cache.clear();assert.equal(alive.size,0);
});

test('异步解码中的照片持有租约，释放后才允许回收',async()=>{
  const revoked=[];const cache=createPhotoCache({limit:1,dispose:url=>revoked.push(url),load:async photo=>({url:photo.id,bytes:1})});
  const release=cache.retain('decoding');await cache.get({id:'decoding'});
  await cache.get({id:'other'});cache.trim();assert(!revoked.includes('decoding'));
  release();await cache.get({id:'last'});assert(revoked.includes('decoding'));cache.clear();
});
