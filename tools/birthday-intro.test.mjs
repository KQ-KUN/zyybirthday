import {test} from 'node:test';
import assert from 'node:assert/strict';
import {birthdayLabel,createIntroTimeline} from '../birthday-intro.js';
import {mosaicPhotos} from '../photo-mosaic.js';

test('开场日期来自已解锁的数据，拒绝无效日期，不补造生日',()=>{
  assert.equal(birthdayLabel('2000-02-29'),'2000 · 02 · 29');
  for(const value of ['2001-02-29','2000-02-31','2000-13-01',undefined,''])assert.equal(birthdayLabel(value),'');
});
test('两百张照片只选择八张拼字，空相册和单张照片也可用',()=>{
  const photos=Array.from({length:220},(_,id)=>({id}));
  assert.equal(mosaicPhotos([{photos}]).length,8);assert.deepEqual(mosaicPhotos([{photos}],1),[photos[0]]);assert.deepEqual(mosaicPhotos([]),[]);
});
test('跳过、自动结束和返回取消互不重复，减少动态效果不移动照片',()=>{
  let jobs=[],finished=0,converged=0;
  const options={onFinish:()=>finished++,onConverge:()=>converged++,setTimer:(fn,delay)=>{const job={fn,delay};jobs.push(job);return job;},clearTimer:job=>{jobs=jobs.filter(item=>item!==job);}};
  let intro=createIntroTimeline(options);const late=jobs.map(job=>job.fn);intro.finish();intro.finish();late.forEach(fn=>fn());assert.equal(finished,1);assert.equal(converged,0);assert.equal(jobs.length,0);
  intro=createIntroTimeline(options);intro.dispose();assert.equal(jobs.length,0);assert.equal(finished,1);
  intro=createIntroTimeline({...options,reduced:true});assert.equal(jobs.length,2);assert(jobs.at(-1).delay<6000);jobs.at(-1).fn();assert.equal(finished,2);assert.equal(converged,0);
});
