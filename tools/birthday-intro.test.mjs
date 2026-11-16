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
  assert.equal(mosaicPhotos([{photos}]).length,8);assert.equal(mosaicPhotos([{photos}],1)[0].id,photos[0].id);assert.deepEqual(mosaicPhotos([]),[]);
  const place={id:'place',photos};const tile=mosaicPhotos([place],1)[0];assert.equal(tile.place,place);assert.equal(tile.index,0);
});
test('生日开场只在主动关闭后退出，所有计时回调执行后仍然停留',()=>{
  let jobs=[],finished=0,converged=0;
  const options={onFinish:()=>finished++,onConverge:()=>converged++,setTimer:(fn,delay)=>{const job={fn,delay};jobs.push(job);return job;},clearTimer:job=>{jobs=jobs.filter(item=>item!==job);}};
  let intro=createIntroTimeline(options);const pending=[...jobs];jobs=[];pending.forEach(job=>job.fn());assert.equal(finished,0);assert.equal(converged,1);assert.equal(intro.active,true);
  intro.finish();intro.finish();assert.equal(finished,1);
  intro=createIntroTimeline(options);intro.dispose();assert.equal(jobs.length,0);assert.equal(finished,1);
  intro=createIntroTimeline({...options,reduced:true});assert.equal(jobs.length,1);jobs[0].fn();assert.equal(finished,1);intro.finish();assert.equal(finished,2);
});
