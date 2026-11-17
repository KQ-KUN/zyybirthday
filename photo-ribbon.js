import {loadOpeningPhoto} from './opening-loader.js?v=20261117-29';
export function ribbonPhotos(places){return places.flatMap(place=>place.photos.map((photo,index)=>({...photo,place,index})));}
export function ribbonWindow(start,count,total){return total?Array.from(new Set(Array.from({length:Math.min(count,total)},(_,index)=>((start+index)%total+total)%total))):[];}
export function ribbonCycleLength(total){return total?Math.max(total,Math.ceil(12/total)*total):0;}

export function createPhotoRibbon({photos,loadPhoto,reduced=false,onOpenPhoto,trim=()=>{}}){
  const element=document.createElement('div');element.className='intro-photo-links';element.setAttribute('aria-label','所有照片');element.dataset.ready='false';
  const viewport=document.createElement('div');viewport.className='ribbon-window';viewport.setAttribute('aria-label','照片履带，可左右滑动');viewport.tabIndex=0;
  const track=document.createElement('div');track.className='ribbon-track';
  const toggle=document.createElement('button');toggle.className='ribbon-toggle';toggle.type='button';
  const controller=new AbortController(),entries=new Map(),imageCopies=photos.map(()=>[]),cycleLength=ribbonCycleLength(photos.length),cycle=cycleLength*80;
  let active=true,paused=false,focused=false,covered=false,pointer=null,manual=false,resumeAt=0,suppressClickUntil=0,frame=0,scrollFrame=0,lastFrame=0,position=cycle,windowStart=-1,visibleCount=5,needed=new Set();
  function paint(){element.dataset.paused=String(paused);toggle.setAttribute('aria-label',paused?'播放照片履带':'暂停照片履带');toggle.setAttribute('aria-pressed',String(paused));toggle.innerHTML=paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';}
  toggle.addEventListener('click',()=>{paused=!paused;paint();});paint();
  for(let copy=0;copy<3;copy++){
    const group=document.createElement('div');group.className='ribbon-group';
    for(let slot=0;slot<cycleLength;slot++){
      const index=slot%photos.length,photo=photos[index],button=document.createElement('button');button.type='button';button.className='ribbon-photo';button.setAttribute('aria-label',`打开照片 ${index+1}：${photo.alt}`);if(copy!==1||slot>=photos.length)button.tabIndex=-1;
      const image=document.createElement('img');image.alt='';image.decoding='async';image.style.visibility='hidden';image.draggable=false;imageCopies[index].push(image);button.append(image);
      button.addEventListener('click',()=>{if(performance.now()>=suppressClickUntil)onOpenPhoto(photo,photos,button);});group.append(button);
    }track.append(group);
  }
  viewport.append(track);element.append(viewport,toggle);
  function load(index){
    if(entries.has(index))return entries.get(index).promise;
    const source=photos[index].thumbnail||photos[index],item={release:loadPhoto.retain(source),ready:false,promise:null};entries.set(index,item);
    item.promise=loadOpeningPhoto(source,loadPhoto,{signal:controller.signal,isRelevant:()=>active&&needed.has(index),decodeImage:async url=>{await Promise.all(imageCopies[index].map(async image=>{image.src=url;await image.decode();}));}}).then(()=>{
      if(!active||entries.get(index)!==item)return;item.ready=true;imageCopies[index].forEach(image=>{image.style.visibility='visible';});
    });item.promise.catch(()=>{});return item.promise;
  }
  function syncWindow(force=false){
    if(!photos.length)return;const current=Math.floor(viewport.scrollLeft/80)%photos.length;if(!force&&current===windowStart)return;windowStart=current;
    needed=new Set([...ribbonWindow(current,9,photos.length),...ribbonWindow(current-3,3,photos.length)]);
    for(const [index,item] of entries)if(!needed.has(index)){imageCopies[index].forEach(image=>{image.removeAttribute('src');image.style.visibility='hidden';});item.release();entries.delete(index);}
    // 当前窗口优先，向后拖动的缓冲在其后加载，不阻塞首屏。
    needed.forEach(load);trim();
  }
  function normalize(){
    if(!cycle||pointer||focused)return;
    if(viewport.scrollLeft>=cycle*2){viewport.scrollLeft-=cycle;position-=cycle;}
    else if(viewport.scrollLeft<cycle/2){viewport.scrollLeft+=cycle;position+=cycle;}
    if(manual||paused||focused||covered)position=viewport.scrollLeft;
  }
  function onScroll(){
    if(!active)return;if(manual)resumeAt=performance.now()+1600;
    if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;normalize();syncWindow();});
  }
  viewport.addEventListener('scroll',onScroll,{passive:true});
  function tick(now){
    if(!active)return;const delta=Math.min(50,lastFrame?now-lastFrame:0);lastFrame=now;
    if(!paused&&!focused&&!covered&&!pointer&&now>=resumeAt&&element.dataset.ready==='true'){
      const next=position+delta*(reduced ? .016 : .032),indices=ribbonWindow(Math.floor(next/80),visibleCount,photos.length);
      if(indices.every(index=>entries.get(index)?.ready)){manual=false;position=next;viewport.scrollLeft=position;if(position>=cycle*2){position-=cycle;viewport.scrollLeft=position;}}
    }else position=viewport.scrollLeft;
    frame=requestAnimationFrame(tick);
  }
  viewport.addEventListener('pointerdown',event=>{if(!event.isPrimary||event.button>0)return;pointer={id:event.pointerId,x:event.clientX,left:viewport.scrollLeft,mouse:event.pointerType==='mouse',dragged:false};manual=true;resumeAt=Infinity;viewport.classList.add('is-dragging');});
  viewport.addEventListener('pointermove',event=>{if(!pointer||pointer.id!==event.pointerId)return;const distance=event.clientX-pointer.x;if(Math.abs(distance)>5)pointer.dragged=true;if(pointer.mouse&&pointer.dragged){viewport.setPointerCapture(event.pointerId);viewport.scrollLeft=pointer.left-distance;position=viewport.scrollLeft;}});
  function release(event){if(!pointer||pointer.id!==event.pointerId)return;if(pointer.dragged)suppressClickUntil=performance.now()+350;if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);pointer=null;manual=true;resumeAt=performance.now()+1600;viewport.classList.remove('is-dragging');position=viewport.scrollLeft;}
  document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);
  viewport.addEventListener('wheel',event=>{manual=true;resumeAt=performance.now()+1600;if(Math.abs(event.deltaY)>Math.abs(event.deltaX)){event.preventDefault();viewport.scrollLeft+=event.deltaY;}position=viewport.scrollLeft;},{passive:false});
  viewport.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();manual=true;resumeAt=performance.now()+1600;viewport.scrollLeft+=event.key==='ArrowRight'?80:-80;position=viewport.scrollLeft;}});
  viewport.addEventListener('focusin',()=>{focused=!!viewport.querySelector(':focus-visible')||viewport.matches(':focus-visible');});viewport.addEventListener('focusout',()=>queueMicrotask(()=>{focused=!!viewport.querySelector(':focus-visible')||viewport.matches(':focus-visible');resumeAt=performance.now()+800;}));
  const viewer=document.getElementById('viewer'),observer=new MutationObserver(()=>{covered=!!viewer?.open;});if(viewer)observer.observe(viewer,{attributes:true,attributeFilter:['open']});
  const resize=new ResizeObserver(()=>{visibleCount=Math.ceil(viewport.clientWidth/80)+1;syncWindow(true);});resize.observe(viewport);
  queueMicrotask(async()=>{try{if(!photos.length){toggle.hidden=true;return;}viewport.scrollLeft=cycle;position=cycle;syncWindow(true);await Promise.all(ribbonWindow(0,visibleCount,photos.length).map(load));if(!active)return;element.dataset.ready='true';toggle.hidden=photos.length<2;if(photos.length>1)frame=requestAnimationFrame(tick);}catch{}});
  return {element,dispose(){active=false;controller.abort();cancelAnimationFrame(frame);cancelAnimationFrame(scrollFrame);observer.disconnect();resize.disconnect();document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',release);for(const images of imageCopies)for(const image of images)image.removeAttribute('src');for(const item of entries.values())item.release();entries.clear();element.remove();trim();}};
}
