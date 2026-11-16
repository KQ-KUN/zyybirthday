import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mosaicPhotos,mosaicAssignments} from '../photo-mosaic.js';
import {ribbonCycleLength,ribbonWindow} from '../photo-ribbon.js';
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
test('每次开场随机抽选可离线读取的照片，并保留准确地点和照片编号',()=>{
  const places=[{id:'one',photos:Array.from({length:30},(_,id)=>({id,thumbnail:{id}}))}],ready=photo=>photo.id<19;
  const a=mosaicPhotos(places,8,ready,random(1)),b=mosaicPhotos(places,8,ready,random(2));assert.equal(new Set(a.map(photo=>photo.id)).size,8);assert(a.every(photo=>photo.id<19&&photo.place.photos[photo.index].id===photo.id));assert.notDeepEqual(a.map(photo=>photo.id),b.map(photo=>photo.id));assert.equal(places[0].photos[0].id,0);
});
test('拼字小格采用均衡随机分布，消除固定轮排，相邻格不重复同一照片',()=>{
  const a=mosaicAssignments(501,8,random(3)),b=mosaicAssignments(501,8,random(4)),counts=Array(8).fill(0);for(const value of a)counts[value]++;
  assert.equal(a.length,501);assert(Math.max(...counts)-Math.min(...counts)<=1);assert(a.every((value,index)=>!index||value!==a[index-1]));assert.notDeepEqual(a,b);assert.deepEqual(mosaicAssignments(10,0),[]);
});
test('原生履带有足够循环空间，向后手动拖动仍能找到正确照片',()=>{
  for(const total of [1,2,3,8,124]){const cycle=ribbonCycleLength(total);assert(cycle>=12&&cycle>=total);assert.equal(cycle%total,0);}assert.deepEqual(ribbonWindow(-2,4,124),[122,123,0,1]);assert.equal(ribbonCycleLength(0),0);
});
