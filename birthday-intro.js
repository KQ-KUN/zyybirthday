import {mosaicPhotos,createPhotoMosaic} from './photo-mosaic.js?v=20261116-16';
const running=new WeakMap();

export function birthdayLabel(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value.replaceAll('-',' · '):'';
}

// 主动关闭共用一个可取消的生命周期，晚到的照片不能重新打开动画。
export function createIntroTimeline({onFinish,onReveal=()=>{},onConverge=()=>{},reduced=false,setTimer=setTimeout,clearTimer=clearTimeout}){
  let active=true;
  const timers=[];
  const stop=()=>{if(!active)return false;active=false;timers.forEach(clearTimer);return true;};
  const finish=()=>{if(stop())onFinish();};
  timers.push(setTimer(()=>{if(active)onReveal();},reduced?1600:2400));
  if(!reduced)timers.push(setTimer(()=>{if(active)onConverge();},5400));
  return {finish,dispose:stop,get active(){return active;}};
}

export function playBirthdayIntro(dialog,{album,loadPhoto,onFinish,onOpenPhoto=()=>{},onDispose=()=>{}}){
  running.get(dialog)?.();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  dialog.dataset.reduced=String(reduced);dialog.dataset.state='playing';dialog.dataset.phase='opening';
  const page=document.createElement('div');page.className='intro-page';
  const skip=document.createElement('button');skip.className='intro-skip';skip.textContent='×';skip.setAttribute('aria-label','关闭生日祝福，进入相册');
  const heading=document.createElement('h2');heading.id='intro-title';heading.className='sr-only';heading.textContent='生日快乐';
  const canvas=document.createElement('canvas');canvas.className='intro-mosaic';canvas.setAttribute('aria-label','照片拼成的生日快乐');canvas.setAttribute('role','img');
  const date=document.createElement('p');date.className='intro-date';date.textContent=birthdayLabel(album.celebration?.birthDate);date.hidden=!date.textContent;
  const wish=document.createElement('p');wish.className='intro-wish';wish.textContent='愿你自在，常有欢喜。';
  const links=document.createElement('div');links.className='intro-photo-links';links.setAttribute('aria-label','打开拼字中的照片');
  const photos=mosaicPhotos(album.places),buttons=new Map();
  for(const [index,photo] of photos.entries()){const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`打开拼字照片 ${index+1}：${photo.alt}`);button.textContent=String(index+1);button.addEventListener('click',()=>onOpenPhoto(photo,photos,button));buttons.set(photo.id,button);links.append(button);}
  page.append(skip,heading,canvas,links,date,wish);dialog.replaceChildren(page);
  const disposeMosaic=createPhotoMosaic(canvas,{photos,loadPhoto,reduced,onOpenPhoto,onPhotoReady:(photo,url)=>{const img=document.createElement('img');img.src=url;img.alt='';buttons.get(photo.id)?.replaceChildren(img);}});
  const timeline=createIntroTimeline({reduced,onFinish,onReveal:()=>{dialog.dataset.phase='photos';},onConverge:()=>{dialog.dataset.phase='held';}});
  const dispose=()=>{timeline.dispose();disposeMosaic();links.querySelectorAll('img').forEach(img=>img.removeAttribute('src'));dialog.dataset.state='finished';dialog.removeEventListener('close',closed);skip.removeEventListener('click',timeline.finish);running.delete(dialog);onDispose();};
  const closed=()=>{if(!dialog.open)dispose();};
  skip.addEventListener('click',timeline.finish);dialog.addEventListener('close',closed);running.set(dialog,dispose);skip.focus();
  return {finish:timeline.finish,dispose};
}
