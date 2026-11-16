import {test} from 'node:test';
import assert from 'node:assert/strict';
import {birthdayLabel,introPhotos,createIntroTimeline} from '../birthday-intro.js';

test('开场日期来自已解锁的数据，拒绝无效日期，不补造生日',()=>{
  assert.equal(birthdayLabel('2000-02-29'),'2000 · 02 · 29');
  for(const value of ['2001-02-29','2000-02-31','2000-13-01',undefined,''])assert.equal(birthdayLabel(value),'');
});
test('开场只选三个不同地区，优先竖幅，不修改相册',()=>{
  const places=Array.from({length:8},(_,index)=>({id:String(index),region:`地区${index%4} · 城市`,photos:[{width:200,height:100},{width:100,height:200}]}));
  const before=structuredClone(places),selected=introPhotos(places);
  assert.equal(selected.length,3);assert.equal(new Set(selected.map(entry=>entry.place.region)).size,3);assert(selected.every(entry=>entry.photo.height>entry.photo.width));assert.deepEqual(places,before);assert.deepEqual(introPhotos([]),[]);
});
test('跳过、自动结束和返回取消互不重复，减少动态效果不移动照片',()=>{
  let jobs=[],finished=0,converged=0;
  const options={onFinish:()=>finished++,onConverge:()=>converged++,setTimer:(fn,delay)=>{const job={fn,delay};jobs.push(job);return job;},clearTimer:job=>{jobs=jobs.filter(item=>item!==job);}};
  let intro=createIntroTimeline(options);const late=jobs.map(job=>job.fn);intro.finish();intro.finish();late.forEach(fn=>fn());assert.equal(finished,1);assert.equal(converged,0);assert.equal(jobs.length,0);
  intro=createIntroTimeline(options);intro.dispose();assert.equal(jobs.length,0);assert.equal(finished,1);
  intro=createIntroTimeline({...options,reduced:true});assert.equal(jobs.length,2);assert(jobs.at(-1).delay<6000);jobs.at(-1).fn();assert.equal(finished,2);assert.equal(converged,0);
});
