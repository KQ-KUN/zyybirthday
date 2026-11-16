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
  let revision=0,currentRelease=null,pendingResolve=null,layers=[];
  function freeze(){for(const layer of layers){layer.node.style.opacity=getComputedStyle(layer.node).opacity;layer.animation.cancel();}}
  function clearLayers(){for(const layer of layers){layer.animation.cancel();layer.node.remove();layer.release?.();}layers=[];}
  image.style.opacity='1';image.style.transition='none';
  return {
    cancel(){revision++;pendingResolve?.(false);pendingResolve=null;clearLayers();image.removeAttribute('src');currentRelease?.();currentRelease=null;},
    show(photo,load,onCommit=()=>{},onError=()=>{}){
      const ticket=++revision;freeze();pendingResolve?.(false);let shown=false;
      const first=new Promise(resolve=>{pendingResolve=resolve;});
      async function stage(source,quality){
        const release=load.retain?.(source)||(()=>{});let kept=false,layer;
        try{
          const url=await load(source,{isRelevant:()=>ticket===revision});const ready=new Image();ready.src=url;await ready.decode();if(ticket!==revision)return false;
          // 旧图始终不透明；新图盖在其上淡入，避免双向淡出时露出底色。
          // 同一张照片的高清升级直接替换，不再触发第二次过渡。
          if(!shown&&image.getAttribute('src')&&image.getAttribute('src')!==url){
            const node=image.cloneNode(false);node.removeAttribute('id');node.hidden=false;node.alt='';node.src=url;node.setAttribute('aria-hidden','true');node.className='photo-incoming';
            node.style.cssText=`position:absolute;inset:0;width:100%;height:100%;margin:0;pointer-events:none;object-fit:${contain?'contain':getComputedStyle(image).objectFit};opacity:0;z-index:1;`;
            image.parentElement.append(node);
            const animation=node.animate([{opacity:0},{opacity:1}],{duration:reduced?160:480,easing:'linear',fill:'forwards'});
            layer={node,animation,release};layers.push(layer);kept=true;
            try{await animation.finished;}catch{return false;}
            if(ticket!==revision)return false;
          }
          image.src=url;image.alt=photo.alt||'';image.dataset.quality=quality;image.hidden=false;
          const previous=currentRelease;currentRelease=release;kept=true;if(layer)layer.release=null;clearLayers();previous?.();shown=true;onCommit(quality);pendingResolve?.(true);pendingResolve=null;return true;
        }finally{if(!kept)release();}
      }
      (async()=>{
        let previewError;
        if(photo.thumbnail)try{await stage(photo.thumbnail,'preview');}catch(error){previewError=error;}
        if(ticket!==revision)return;
        try{await stage(photo,'full');}
        catch(error){if(ticket!==revision)return;onError(error||previewError,{hasPreview:shown});pendingResolve?.(shown);pendingResolve=null;}
      })();
      return first;
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
export function travelEase(progress){return (1-Math.cos(Math.PI*progress))/2;}
export function regionMovement({enabled=true,reducedMotion=false}={}){
  // 地区移镜是用户主动请求的交互；减少动效采用较轻的平移，不再把时长清零。
  return {duration:enabled?(reducedMotion?2200:3000):0,animate:enabled,essential:true,easing:travelEase};
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
    to(target,duration=0,{easing=cameraEase,interpolate=mixCamera}={}){
      stop();const from=copyCamera(current),to=copyCamera(target),started=now();
      if(!duration){current=to;paint(current);return;}
      moving=true;
      function tick(timestamp){const progress=Math.min(1,Math.max(0,(timestamp-started)/duration));current=interpolate(from,to,easing(progress));if(progress===1){current=to;moving=false;}paint(current);if(moving)frame=requestFrame(tick);}
      frame=requestFrame(tick);
    }
  };
}
