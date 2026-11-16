import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ribbonPhotos} from '../photo-ribbon.js';
test('照片履带保留全部照片及地点上下文，不受拼字八张数量限制',()=>{
  const places=[{id:'a',photos:Array.from({length:200},(_,id)=>({id:String(id)}))},{id:'b',photos:[{id:'last'}]}];const photos=ribbonPhotos(places);
  assert.equal(photos.length,201);assert.equal(photos.at(-1).id,'last');assert.equal(photos.at(-1).place,places[1]);assert.equal(photos[199].index,199);assert.equal(places[0].photos[0].place,undefined);
});
