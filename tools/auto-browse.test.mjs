import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAutoBrowse} from '../auto-browse.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function clock(){let time=0,id=0;const jobs=new Map();return {set(fn,delay){const key=++id;jobs.set(key,{at:time+delay,fn});return key;},clear(key){jobs.delete(key);},async advance(delta){const end=time+delta;while(true){const next=[...jobs].sort((a,b)=>a[1].at-b[1].at).find(([,job])=>job.at<=end);if(!next)break;time=next[1].at;jobs.delete(next[0]);next[1].fn();await flush();}time=end;},get size(){return jobs.size;}};}
test('一键浏览按2秒切照片、5秒切地区，循环后接续未显示照片，停止会取消计时',async()=>{
  const timer=clock(),seen=[],places=[{id:'a',photos:[0,1,2,3,4]},{id:'b',photos:[0]}];
  const tour=createAutoBrowse({getPlaces:()=>places,onPlace:async(p,index)=>{seen.push([p.id,index]);return true;},onPhoto:index=>seen.push(['photo',index]),setTimer:timer.set,clearTimer:timer.clear});
  tour.start();await flush();await timer.advance(1999);assert.deepEqual(seen,[['a',0]]);await timer.advance(1);assert.deepEqual(seen.at(-1),['photo',1]);
  await timer.advance(2000);assert.deepEqual(seen.at(-1),['photo',2]);await timer.advance(1000);assert.deepEqual(seen.at(-1),['b',0]);
  await timer.advance(5000);assert.deepEqual(seen.at(-1),['a',3]);tour.stop();assert.equal(timer.size,0);const count=seen.length;await timer.advance(20000);assert.equal(seen.length,count);
});
test('首图加载完成后才开始计时，停止后的迟到加载不能重启浏览',async()=>{
  const timer=clock();let ready;const tour=createAutoBrowse({getPlaces:()=>[{id:'a',photos:[0,1]}],onPlace:()=>new Promise(resolve=>{ready=resolve;}),onPhoto:()=>{},setTimer:timer.set,clearTimer:timer.clear});
  tour.start();assert.equal(timer.size,0);tour.stop();ready(true);await flush();assert.equal(timer.size,0);assert.equal(tour.active,false);
});
