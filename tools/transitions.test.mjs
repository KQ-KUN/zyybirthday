import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLatestTask,createCameraMotion,mixCamera,regionMovement} from '../transitions.js';

test('主动切换地区即使系统减少动效也会连续移镜，关闭开关后才立即定位',()=>{
  const gentle=regionMovement({reducedMotion:true});assert(gentle.duration>=1800);assert.equal(gentle.essential,true);assert.equal(gentle.animate,true);
  const off=regionMovement({enabled:false,reducedMotion:true});assert.equal(off.duration,0);assert.equal(off.animate,false);
  const from={center:[3370,1560],zoom:7.5,pitch:46,bearing:0,padding:{top:0,bottom:0,left:0,right:0}};
  const to={...from,center:[3420,1690]};
  const middle=mixCamera(from,to,.5);assert.equal(middle.zoom,7.5);assert(middle.center[0]>from.center[0]&&middle.center[0]<to.center[0]);
  assert.deepEqual(mixCamera(from,to,0).center,from.center);assert.deepEqual(mixCamera(from,to,1).center,to.center);
});

test('快速切换地区时，只提交最新的照片，旧请求晚到不会覆盖',async()=>{
  const latest=createLatestTask(),commits=[];let finishFirst;
  const first=latest.run(()=>new Promise(resolve=>{finishFirst=resolve;}),value=>commits.push(value));
  const second=latest.run(async()=> '杭州',value=>commits.push(value));
  await second;finishFirst('北京');assert.equal(await first,false);assert.deepEqual(commits,['杭州']);
});
test('收起相册后，未完成请求不能重新写入画面或显示旧错误',async()=>{
  const latest=createLatestTask();let fail,committed=false,errored=false;
  const pending=latest.run(()=>new Promise((_,reject)=>{fail=reject;}),()=>{committed=true;},()=>{errored=true;});
  latest.cancel();fail(new Error('late failure'));await pending;assert.equal(committed,false);assert.equal(errored,false);
});
test('相机在中途转向时，从正在显示的位置继续，停止后保持该帧',()=>{
  let clock=0,queue=[],frameId=0;const painted=[];
  const initial={center:[0,0],zoom:4,pitch:35,bearing:0,padding:{top:0,bottom:0,left:0,right:0}};
  const motion=createCameraMotion(initial,value=>painted.push(value),{now:()=>clock,requestFrame:callback=>{queue.push({id:++frameId,callback});return frameId;},cancelFrame:id=>{queue=queue.filter(entry=>entry.id!==id);}});
  const frame=time=>{clock=time;const entry=queue.shift();entry.callback(time);};
  motion.to({...initial,center:[100,100]},1000);frame(500);const interrupted=motion.get();
  assert(interrupted.center[0]>0 && interrupted.center[0]<100);
  motion.to({...initial,center:[-100,50]},1000);assert.deepEqual(motion.get(),interrupted);
  frame(500);assert.deepEqual(motion.get(),interrupted);frame(800);motion.stop();const stopped=motion.get();assert.equal(motion.isMoving(),false);assert.deepEqual(motion.get(),stopped);assert.equal(queue.length,0);
  assert.deepEqual(mixCamera(initial,{...initial,zoom:8},.5).zoom,6);
});

test('相隔很远的地区切换保持近景高度与斜角，首次靠近也不反向拉远',()=>{
  const from={center:[3400,1500],zoom:8.6,pitch:62,bearing:0,padding:{top:90,bottom:350,left:55,right:30}};
  const to={...from,center:[2800,1700]};
  for(let i=0;i<=100;i++){const camera=mixCamera(from,to,i/100);assert.equal(camera.zoom,8.6);assert.equal(camera.pitch,62);}
  let previous=2;
  for(let i=0;i<=100;i++){const camera=mixCamera({...from,zoom:2,pitch:0},to,i/100);assert(camera.zoom>=previous);previous=camera.zoom;}
});
