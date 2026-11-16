import {loadOpeningPhoto} from './opening-loader.js?v=20261116-22';
export function ribbonPhotos(places){return places.flatMap(place=>place.photos.map((photo,index)=>({...photo,place,index})));}
export function ribbonWindow(start,count,total){return total?Array.from(new Set(Array.from({length:Math.min(count,total)},(_,index)=>(start+index)%total))):[];}

export function createPhotoRibbon({photos,loadPhoto,reduced=false,onOpenPhoto,trim=()=>{}}){
  const element=document.createElement('div');element.className='intro-photo-links';element.setAttribute('aria-label','所有照片');element.dataset.ready='false';
  const viewport=document.createElement('div');viewport.className='ribbon-window';
  const track=document.createElement('div');track.className='ribbon-track';
  const toggle=document.createElement('button');toggle.className='ribbon-toggle';toggle.type='button';
  const controller=new AbortController(),entries=new Map(),imageCopies=photos.map(()=>[]);
  let paused=reduced,active=true,animation=null,start=0,focusPaused=false,covered=false,pointerPaused=false,wake=null,needed=new Set();
  const canPlay=()=>active&&!paused&&!focusPaused&&!covered&&!pointerPaused;
  function paint(){element.dataset.paused=String(paused);toggle.setAttribute('aria-label',paused?'播放照片履带':'暂停照片履带');toggle.setAttribute('aria-pressed',String(paused));toggle.innerHTML=paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';if(animation){if(canPlay())animation.play();else animation.pause();}if(canPlay()){wake?.();wake=null;}}
  toggle.addEventListener('click',()=>{paused=!paused;paint();});paint();
  for(let copy=0;copy<2;copy++){
    const group=document.createElement('div');group.className='ribbon-group';
    photos.forEach((photo,index)=>{const button=document.createElement('button');button.type='button';button.className='ribbon-photo';button.setAttribute('aria-label',`打开照片 ${index+1}：${photo.alt}`);if(copy)button.tabIndex=-1;const image=document.createElement('img');image.alt='';image.decoding='async';image.style.visibility='hidden';imageCopies[index].push(image);button.append(image);button.addEventListener('click',()=>onOpenPhoto(photo,photos,button));group.append(button);});track.append(group);
  }
  viewport.append(track);element.append(viewport,toggle);
  async function load(index){
    if(entries.has(index))return entries.get(index).promise;
    const source=photos[index].thumbnail||photos[index],item={release:loadPhoto.retain(source),promise:null};entries.set(index,item);
    item.promise=(async()=>{await loadOpeningPhoto(source,loadPhoto,{signal:controller.signal,isRelevant:()=>active&&needed.has(index),decodeImage:async url=>{await Promise.all(imageCopies[index].map(async image=>{image.src=url;await image.decode();}));}});if(!active||entries.get(index)!==item)return;imageCopies[index].forEach(image=>{image.style.visibility='visible';});})();return item.promise;
  }
  function retainWindow(indices){
    needed=new Set(indices);
    for(const [index,item] of entries)if(!needed.has(index)){imageCopies[index].forEach(image=>{image.removeAttribute('src');image.style.visibility='hidden';});item.release();entries.delete(index);}
    trim();
  }
  async function prepare(indices){retainWindow(indices);await Promise.all([...needed].map(load));}
  function waitPlaying(){return canPlay()?Promise.resolve():new Promise(resolve=>{wake=resolve;});}
  async function run(){
    try{
      await prepare(ribbonWindow(0,8,photos.length));if(!active)return;element.dataset.ready='true';if(photos.length<2){toggle.hidden=true;return;}
      while(active){
        await waitPlaying();if(!active)return;
        const next=(start+1)%photos.length;
        // 先备好下一窗口；等待期间保留现有照片，不让空格或数字滚进画面。
        await prepare([...ribbonWindow(start,8,photos.length),...ribbonWindow(next,8,photos.length)]);await waitPlaying();if(!active)return;
        animation=track.animate([{transform:`translateX(${-start*80}px)`},{transform:`translateX(${-(start+1)*80}px)`}],{duration:2500,easing:'linear',fill:'forwards'});paint();
        await animation.finished;if(!active)return;start=next;track.style.transform=`translateX(${-start*80}px)`;animation.cancel();animation=null;retainWindow(ribbonWindow(start,8,photos.length));
      }
    }catch(error){if(active&&error.name!=='AbortError'){element.dataset.ready='true';toggle.setAttribute('aria-label','重新加载照片履带');}}
  }
  const focus=()=>{focusPaused=!!viewport.querySelector(':focus-visible');paint();};viewport.addEventListener('focusin',focus);viewport.addEventListener('focusout',()=>queueMicrotask(focus));
  viewport.addEventListener('pointerdown',()=>{pointerPaused=true;paint();});const up=()=>{pointerPaused=false;paint();};document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
  const viewer=document.getElementById('viewer'),observer=new MutationObserver(()=>{covered=!!viewer?.open;paint();});if(viewer)observer.observe(viewer,{attributes:true,attributeFilter:['open']});
  queueMicrotask(run);
  return {element,dispose(){active=false;controller.abort();animation?.cancel();wake?.();observer.disconnect();document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);for(const images of imageCopies)for(const image of images)image.removeAttribute('src');for(const item of entries.values())item.release();entries.clear();element.remove();trim();}};
}
