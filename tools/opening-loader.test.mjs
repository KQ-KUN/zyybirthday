import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadOpeningPhoto,waitForPhotoRetry} from '../opening-loader.js';
import {ribbonWindow} from '../photo-ribbon.js';
test('开场照片失败后持续重试并解码，成功前不交付空白图片',async()=>{
  let calls=0,invalidated=0;const waits=[];const load=async()=>{if(++calls<3)throw new Error('offline');return 'decoded-photo';};load.invalidate=()=>invalidated++;
  const url=await loadOpeningPhoto({id:'a'},load,{decodeImage:async value=>assert.equal(value,'decoded-photo'),wait:async delay=>waits.push(delay)});
  assert.equal(url,'decoded-photo');assert.equal(calls,3);assert.equal(invalidated,2);assert.deepEqual(waits,[800,1600]);
});
test('关闭开场会取消重试计时，迟到照片不能重新出现',async()=>{
  const controller=new AbortController(),waiting=waitForPhotoRetry(6000,controller.signal);controller.abort();await assert.rejects(waiting,{name:'AbortError'});
  let finish;const late=loadOpeningPhoto({id:'a'},()=>new Promise(resolve=>{finish=resolve;}),{signal:controller.signal,decodeImage:async()=>{throw new Error('must not decode');}});await assert.rejects(late,{name:'AbortError'});assert.equal(finish,undefined);
  const live=new AbortController();let resolve,decoded=false;const pending=loadOpeningPhoto({id:'late'},()=>new Promise(done=>{resolve=done;}),{signal:live.signal,decodeImage:async()=>{decoded=true;}});live.abort();resolve('late-photo');await assert.rejects(pending,{name:'AbortError'});assert.equal(decoded,false);
});
test('履带窗口跨越末尾时保留开头照片，少量照片不会重复持有租约',()=>{
  assert.deepEqual(ribbonWindow(122,8,124),[122,123,0,1,2,3,4,5]);assert.deepEqual(ribbonWindow(0,8,2),[0,1]);assert.deepEqual(ribbonWindow(0,8,0),[]);
});

test('下载成功但图片解码失败时，重新加载而不留下永久占位',async()=>{
  let attempts=0,decodes=0;const url=await loadOpeningPhoto({id:'a'},async()=>`photo-${++attempts}`,{decodeImage:async()=>{if(++decodes===1)throw new Error('decode interrupted');},wait:async()=>{}});
  assert.equal(url,'photo-2');assert.equal(decodes,2);
});
