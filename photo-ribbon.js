import {createLazyPhotos} from './lazy-photos.js?v=20261116-21';

export function ribbonPhotos(places){return places.flatMap(place=>place.photos.map((photo,index)=>({...photo,place,index})));}

export function createPhotoRibbon({photos,loadPhoto,reduced=false,onOpenPhoto,trim=()=>{}}){
  const element=document.createElement('div');element.className='intro-photo-links';element.setAttribute('aria-label','所有照片');
  const viewport=document.createElement('div');viewport.className='ribbon-window';
  const track=document.createElement('div');track.className='ribbon-track';track.style.setProperty('--ribbon-duration',`${Math.max(12,photos.length*2.5)}s`);
  const toggle=document.createElement('button');toggle.className='ribbon-toggle';toggle.type='button';
  let paused=reduced;
  function paint(){element.dataset.paused=String(paused);toggle.setAttribute('aria-label',paused?'播放照片履带':'暂停照片履带');toggle.setAttribute('aria-pressed',String(paused));toggle.innerHTML=paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';}
  toggle.addEventListener('click',()=>{paused=!paused;paint();});paint();
  const images=createLazyPhotos({loadPhoto,trim,root:viewport});
  for(let copy=0;copy<2;copy++){
    const group=document.createElement('div');group.className='ribbon-group';
    photos.forEach((photo,index)=>{
      const button=document.createElement('button');button.type='button';button.className='ribbon-photo';button.setAttribute('aria-label',`打开照片 ${index+1}：${photo.alt}`);if(copy)button.tabIndex=-1;
      const number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');number.setAttribute('aria-hidden','true');button.append(number,images.image(photo));
      button.addEventListener('click',()=>onOpenPhoto(photo,photos,button));group.append(button);
    });track.append(group);
  }
  viewport.append(track);element.append(viewport,toggle);
  return {element,dispose(){images.clear();element.remove();}};
}
