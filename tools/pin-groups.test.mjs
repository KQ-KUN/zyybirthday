import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupPins} from '../pin-groups.js';
const places=[{id:'a',name:'甲',region:'浙江 · 杭州',coordinates:[0,0]},{id:'b',name:'乙',region:'浙江 · 杭州',coordinates:[1,1]},{id:'c',name:'丙',region:'新疆 · 喀什',coordinates:[100,100]}];
const point=scale=>coordinates=>({x:coordinates[0]*scale,y:coordinates[1]*scale});
test('近邻地点在全图聚合，放大后展开，全部地点保留且不重复',()=>{
  const overview=groupPins(places,point(1));assert.equal(overview.length,2);assert.equal(overview[0].members.length,2);
  assert.deepEqual(overview.flatMap(group=>group.members.map(place=>place.id)).sort(),['a','b','c']);
  assert.equal(groupPins(places,point(100)).length,3);
  assert.deepEqual(groupPins([...places].reverse(),point(1)),overview);
});
test('选中地点即使与其他地点重叠也不会被聚合隐藏',()=>{
  const groups=groupPins(places,point(1),{selectedId:'b'});
  assert.equal(groups.find(group=>group.id==='b').members.length,1);assert.equal(groups.length,3);
});
