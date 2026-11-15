export function createLatestTask() {
  let revision=0;
  return {
    cancel(){revision++;},
    async run(work,commit,onError=()=>{}){
      const ticket=++revision;
      try{const value=await work();if(ticket!==revision)return false;commit(value);return true;}
      catch(error){if(ticket===revision)onError(error);return false;}
    }
  };
}

const surfaces=new WeakMap();
export function crossfade(element,update,{duration=280,reduced=false,contain=false}={}) {
  let state=surfaces.get(element);
  if(!state){state={layers:[],frame:0};surfaces.set(element,state);}
  cancelAnimationFrame(state.frame);
  const time=reduced?100:duration;
  const opacity=Number(getComputedStyle(element).opacity);
  // 中断时保留正在显示的混合画面，再淡入最新内容，避免重新从黑场开始。
  for(const layer of state.layers){
    const current=getComputedStyle(layer.node).opacity;
    clearTimeout(layer.timer);layer.node.style.transition='none';layer.node.style.opacity=current;
  }
  if(element.tagName!=='IMG' || element.getAttribute('src')){
    const ghost=element.cloneNode(true);ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    ghost.setAttribute('aria-hidden','true');ghost.classList.add('transition-ghost');
    ghost.style.cssText=`position:absolute;left:${contain?0:element.offsetLeft}px;top:${contain?0:element.offsetTop}px;width:${contain?'100%':element.offsetWidth+'px'};height:${contain?'100%':element.offsetHeight+'px'};margin:0;pointer-events:none;opacity:${opacity};transition:none;`;
    if(contain){ghost.style.objectFit=getComputedStyle(element).objectFit;ghost.style.maxWidth='100%';ghost.style.maxHeight='100%';}
    if(ghost.tagName==='IMG')ghost.alt='';
    element.parentElement.append(ghost);state.layers.push({node:ghost,timer:0});
  }
  element.style.transition='none';element.style.opacity='0';update();
  state.frame=requestAnimationFrame(()=>{
    // 读取一次尺寸，确保起始样式已提交；没有逐帧布局读取。
    element.getBoundingClientRect();
    element.style.transition=`opacity ${time}ms var(--ease-out)`;element.style.opacity='1';
    for(const layer of state.layers){layer.node.style.transition=`opacity ${time}ms var(--ease-out)`;layer.node.style.opacity='0';layer.timer=setTimeout(()=>{layer.node.remove();state.layers=state.layers.filter(value=>value!==layer);},time+40);}
  });
}

export function createImageSwap(image,{reduced=false,contain=false}={}) {
  const latest=createLatestTask();
  return {
    cancel:()=>latest.cancel(),
    show(photo,load,onCommit=()=>{},onError=()=>{}){
      return latest.run(async()=>{
        const url=await load(photo);
        const ready=new Image();ready.src=url;
        if(ready.decode)await ready.decode();
        else if(!ready.complete)await new Promise((resolve,reject)=>{ready.onload=resolve;ready.onerror=reject;});
        return url;
      },url=>{
        if(image.getAttribute('src')!==url)crossfade(image,()=>{image.src=url;image.alt=photo.alt||'';},{reduced,contain});
        onCommit();
      },onError);
    }
  };
}

function bezierCoordinate(t,a,b){return 3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;}
export function cameraEase(progress){
  if(progress<=0)return 0;if(progress>=1)return 1;
  let low=0,high=1,t=progress;
  for(let i=0;i<14;i++){t=(low+high)/2;if(bezierCoordinate(t,.77,.175)<progress)low=t;else high=t;}
  return bezierCoordinate(t,0,1);
}
function copyCamera(value){return {...value,center:[...value.center],padding:{...value.padding}};}
export function mixCamera(from,to,progress){
  const mix=(a,b)=>a+(b-a)*progress;
  return {center:from.center.map((value,index)=>mix(value,to.center[index])),zoom:mix(from.zoom,to.zoom),pitch:mix(from.pitch,to.pitch),bearing:mix(from.bearing,to.bearing),padding:Object.fromEntries(Object.keys(from.padding).map(key=>[key,mix(from.padding[key],to.padding[key])]))};
}
export function createCameraMotion(initial,paint,{requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id),now=()=>performance.now()}={}){
  let current=copyCamera(initial),frame=0,moving=false;
  function stop(){cancelFrame(frame);frame=0;moving=false;}
  return {
    get:()=>copyCamera(current),stop,isMoving:()=>moving,
    to(target,duration=0){
      stop();const from=copyCamera(current),to=copyCamera(target),started=now();
      if(!duration){current=to;paint(current);return;}
      moving=true;
      function tick(timestamp){const progress=Math.min(1,Math.max(0,(timestamp-started)/duration));current=mixCamera(from,to,cameraEase(progress));if(progress===1){current=to;moving=false;}paint(current);if(moving)frame=requestFrame(tick);}
      frame=requestFrame(tick);
    }
  };
}
