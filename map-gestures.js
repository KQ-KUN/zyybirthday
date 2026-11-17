const clampZoom=value=>Math.max(1.5,Math.min(12,value));
function measure(points){const [a,b]=points;return b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(2,Math.hypot(a.x-b.x,a.y-b.y))}:{...a,distance:1};}
// 手指中点下的地理位置保持不变，同时允许双指平移和缩放。
export function gestureCamera(camera,from,to,{width,height}){
  const zoom=clampZoom(camera.zoom+Math.log2(to.distance/from.distance));
  const before=2**camera.zoom/8,after=2**zoom/8,cos=Math.max(.4,Math.cos(camera.pitch*Math.PI/180));
  const x=width/2+((camera.padding?.left||0)-(camera.padding?.right||0))/2,y=height/2+((camera.padding?.top||0)-(camera.padding?.bottom||0))/2;
  return {...camera,zoom,center:[camera.center[0]+(from.x-x)/before-(to.x-x)/after,camera.center[1]+(from.y-y)/(before*cos)-(to.y-y)/(after*cos)]};
}
export function bindMapGestures(surface,{read,write,stop,onEnd=()=>{}}){
  const pointers=new Map(),controller=new AbortController();let base;
  const size=()=>({width:surface.clientWidth,height:surface.clientHeight});
  const point=event=>{const box=surface.getBoundingClientRect();return {x:event.clientX-box.left,y:event.clientY-box.top};};
  function rebase(){base=pointers.size?{camera:read(),measure:measure([...pointers.values()])}:null;}
  function listen(type,handler,options={}){surface.addEventListener(type,handler,{...options,signal:controller.signal});}
  listen('pointerdown',event=>{
    if(!pointers.size&&event.target.closest('button'))return;
    if(event.pointerType==='mouse'&&event.button!==0)return;
    stop();pointers.set(event.pointerId,point(event));surface.setPointerCapture(event.pointerId);rebase();
  });
  listen('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    event.preventDefault();pointers.set(event.pointerId,point(event));
    write(gestureCamera(base.camera,base.measure,measure([...pointers.values()]),size()),0);
  },{passive:false});
  function end(event){if(!pointers.delete(event.pointerId))return;rebase();if(!pointers.size)onEnd();}
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(type,end);
  listen('wheel',event=>{
    event.preventDefault();if(!event.deltaY)return;stop();
    const from={...point(event),distance:1},to={...from,distance:2**(-Math.sign(event.deltaY)*.3)};
    write(gestureCamera(read(),from,to,size()),180);
  },{passive:false});
  return {get active(){return pointers.size>0;},dispose(){controller.abort();pointers.clear();base=null;}};
}
