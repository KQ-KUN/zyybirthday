const running=new WeakMap();

export function birthdayLabel(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value.replaceAll('-',' · '):'';
}

export function introPhotos(places){
  const groups=new Map();
  for(const place of places||[]){
    if(!place.photos?.length)continue;
    const region=place.region.split('·')[0].trim();
    if(!groups.has(region))groups.set(region,[]);
    groups.get(region).push(place);
  }
  const selected=[];
  const buckets=[...groups.values()];
  const regions=buckets.length>3?[buckets[0],buckets[Math.round((buckets.length-1)/2)],buckets.at(-1)]:buckets;
  for(const list of regions){
    const place=list.find(place=>place.photos.some(photo=>photo.height>photo.width))||list[0];
    const photo=place.photos.find(photo=>photo.height>photo.width)||place.photos[0];
    selected.push({place,photo});if(selected.length===3)break;
  }
  return selected;
}

// 跳过、自动结束、返回关闭共用一个可取消的生命周期，晚到的照片不能重新打开动画。
export function createIntroTimeline({onFinish,onReveal=()=>{},onConverge=()=>{},reduced=false,setTimer=setTimeout,clearTimer=clearTimeout}){
  let active=true;
  const timers=[];
  const stop=()=>{if(!active)return false;active=false;timers.forEach(clearTimer);return true;};
  const finish=()=>{if(stop())onFinish();};
  timers.push(setTimer(()=>{if(active)onReveal();},reduced?1600:2400));
  if(!reduced)timers.push(setTimer(()=>{if(active)onConverge();},5400));
  timers.push(setTimer(finish,reduced?5200:7400));
  return {finish,dispose:stop,get active(){return active;}};
}

export function playBirthdayIntro(dialog,{album,loadPhoto,onFinish,onDispose=()=>{}}){
  running.get(dialog)?.();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  dialog.dataset.reduced=String(reduced);dialog.dataset.state='playing';dialog.dataset.phase='opening';
  const page=document.createElement('div');page.className='intro-page';
  const skip=document.createElement('button');skip.className='intro-skip';skip.textContent='跳过';skip.setAttribute('aria-label','跳过生日动画，进入相册');
  const date=document.createElement('p');date.className='intro-date';date.textContent=birthdayLabel(album.celebration?.birthDate);date.hidden=!date.textContent;
  const ornament=document.createElementNS('http://www.w3.org/2000/svg','svg');ornament.setAttribute('viewBox','0 0 150 46');ornament.classList.add('intro-ornament');ornament.setAttribute('aria-hidden','true');
  const branch=document.createElementNS(ornament.namespaceURI,'path');branch.setAttribute('d','M14 39Q69 39 136 9M39 37Q31 16 43 11Q57 22 51 34M65 30Q75 8 88 11Q88 25 72 28M96 21Q105 1 119 6Q115 18 102 19');ornament.append(branch);
  const heading=document.createElement('h2');heading.id='intro-title';heading.append('妈妈，',document.createElement('br'),'生日快乐。');
  const collage=document.createElement('div');collage.className='intro-collage';
  const leases=[],figures=[];
  for(const [index,{place,photo}] of introPhotos(album.places).entries()){
    const figure=document.createElement('figure');figure.className='intro-polaroid';figure.dataset.place=place.id;figure.dataset.ready='false';figure.style.setProperty('--stagger',`${index*.15}s`);
    const image=document.createElement('img');image.alt=photo.alt;image.decoding='async';
    const caption=document.createElement('figcaption');caption.textContent=place.name;figure.append(image,caption);collage.append(figure);figures.push(figure);
    const source=photo.thumbnail||photo;leases.push(loadPhoto.retain(source));
    Promise.resolve().then(()=>loadPhoto(source,{isRelevant:()=>timeline.active&&dialog.open})).then(async url=>{
      if(!timeline.active||!dialog.open)return;
      image.src=url;try{await image.decode();}catch{return;}
      if(timeline.active&&dialog.open)figure.dataset.ready='true';
    }).catch(()=>{});
  }
  const wish=document.createElement('p');wish.className='intro-wish';wish.textContent='愿你自在，常有欢喜。';
  page.append(skip,date,ornament,heading,collage,wish);dialog.replaceChildren(page);
  const timeline=createIntroTimeline({reduced,onFinish,onReveal:()=>{dialog.dataset.phase='photos';},onConverge:()=>{
    dialog.dataset.phase='gathering';
    for(const figure of figures){
      const target=document.querySelector(`.map-marker[data-place="${figure.dataset.place}"],.paper-pin[data-place="${figure.dataset.place}"]`);
      if(!target)continue;
      const from=figure.getBoundingClientRect(),to=target.getBoundingClientRect();
      if(to.x<0||to.x>innerWidth||to.y<0||to.y>innerHeight)continue;
      figure.style.setProperty('--flight-x',`${to.x+to.width/2-from.x-from.width/2}px`);
      figure.style.setProperty('--flight-y',`${to.y+to.height-from.y-from.height/2}px`);
    }
  }});
  const dispose=()=>{
    timeline.dispose();dialog.dataset.state='finished';
    dialog.removeEventListener('close',closed);skip.removeEventListener('click',timeline.finish);
    figures.forEach(figure=>figure.querySelector('img').removeAttribute('src'));leases.forEach(release=>release());
    running.delete(dialog);onDispose();
  };
  const closed=()=>{if(!dialog.open)dispose();};
  skip.addEventListener('click',timeline.finish);dialog.addEventListener('close',closed);running.set(dialog,dispose);skip.focus();
  return {finish:timeline.finish,dispose};
}
