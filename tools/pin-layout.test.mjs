import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutPins} from '../pin-layout.js';
test('密集地点保留每一个独立标记，不改变坐标，并分散显示',()=>{
  const places=Array.from({length:38},(_,i)=>({id:String(i).padStart(2,'0'),coordinates:[120+i*.0001,30]}));
  const before=structuredClone(places),point=()=>({x:240,y:350});
  const layout=layoutPins(places,point),screen=[...layout.values()].map(item=>({x:240+item.offset[0],y:350+item.offset[1]}));
  assert.equal(layout.size,38);assert.deepEqual(places,before);
  for(let i=0;i<screen.length;i++)for(let j=i+1;j<screen.length;j++)assert(Math.hypot(screen[i].x-screen[j].x,screen[i].y-screen[j].y)>=24);
  assert.deepEqual(layoutPins([...places].reverse(),point),layout);
});
test('选中地点优先保留原锚点，屏幕外的标记不被拉入画面',()=>{
  const places=[{id:'a',coordinates:[0,0]},{id:'b',coordinates:[0,0]},{id:'c',coordinates:[1000,1000]}];
  const layout=layoutPins(places,coordinates=>({x:200+coordinates[0],y:300+coordinates[1]}),{selectedId:'b'});
  assert.deepEqual(layout.get('b').offset,[0,0]);assert.deepEqual(layout.get('c').offset,[0,0]);
});
