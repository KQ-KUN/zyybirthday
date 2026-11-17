import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gestureCamera,bindMapGestures} from '../map-gestures.js';
const camera={center:[1000,1500],zoom:4,pitch:0,padding:{left:0,right:0,top:0,bottom:0}},size={width:400,height:800};
test('双指距离增倍放大一级，缩回保持中点地理位置，并保持低视角',()=>{
 const from={x:130,y:240,distance:100},to={x:130,y:240,distance:200};
 for(const pitch of [0,62]){
  const before={...camera,pitch},after=gestureCamera(before,from,to,size);assert.equal(after.zoom,5);assert.equal(after.pitch,pitch);
  const restored=gestureCamera(after,to,from,size);assert.deepEqual(restored,before);
 }
 const max=gestureCamera({...camera,zoom:11.9},{x:200,y:400,distance:1},{x:200,y:400,distance:10},size);assert.equal(max.zoom,12);
});
test('双指变成单指后连续平移，松手结束；滚轮放大缩小拦截页面滚动',()=>{
 const handlers=new Map();let state=structuredClone(camera),ends=0,prevented=0;
 const surface={clientWidth:400,clientHeight:800,getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},addEventListener:(type,fn)=>handlers.set(type,fn)};
 const gestures=bindMapGestures(surface,{read:()=>structuredClone(state),write:value=>state=value,stop(){},onEnd:()=>ends++});
 const event=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,pointerType:'touch',target:{closest:()=>null},preventDefault(){prevented++;}});
 handlers.get('pointerdown')(event(1,100,300));handlers.get('pointerdown')(event(2,200,300));handlers.get('pointermove')(event(2,300,300));assert.equal(state.zoom,5);assert.equal(gestures.active,true);
 handlers.get('pointerup')(event(2,300,300));const center=[...state.center];handlers.get('pointermove')(event(1,120,300));assert.equal(state.zoom,5);assert.equal(state.center[0],center[0]-5);
 handlers.get('pointercancel')(event(1,120,300));assert.equal(gestures.active,false);assert.equal(ends,1);
 const zoom=state.zoom;handlers.get('wheel')({...event(0,200,400),deltaY:-100});assert(state.zoom>zoom);handlers.get('wheel')({...event(0,200,400),deltaY:100});assert.equal(state.zoom,zoom);assert(prevented>=4);gestures.dispose();
});
