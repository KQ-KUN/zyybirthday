export function createLazyPhotos({loadPhoto,trim,root}){
  const states=new WeakMap(),images=new Set();let observer;
  function release(state){state.release?.();state.release=null;}
  function paintState(img,value){img.closest('.photo-item')?.setAttribute('data-image-state',value);}
  function fail(img,state,ticket){
    if(!state.visible||ticket!==state.ticket||state.failedTicket===ticket)return;state.failedTicket=ticket;state.loading=false;img.removeAttribute('src');img.style.visibility='hidden';release(state);loadPhoto.invalidate?.(state.photo);
    paintState(img,'error');
    if(state.visible&&state.retries<1){state.retries++;state.timer=setTimeout(()=>{if(state.visible)load(img,state);},700);}
  }
  async function load(img,state){
    const ticket=++state.ticket;state.loading=true;state.release??=loadPhoto.retain(state.photo);paintState(img,'loading');
    try{
      const url=await loadPhoto(state.photo,{isRelevant:()=>state.visible&&img.isConnected});
      if(ticket!==state.ticket||!state.visible||!img.isConnected)return;
      const ready=new Image();ready.src=url;await ready.decode();
      if(ticket!==state.ticket||!state.visible||!img.isConnected)return;
      img.src=url;await img.decode();if(ticket!==state.ticket||!state.visible)return;
      state.loading=false;state.retries=0;img.style.visibility='visible';paintState(img,'ready');
    }catch{fail(img,state,ticket);}
  }
  observer=new IntersectionObserver(entries=>{
    for(const entry of entries){const img=entry.target,state=states.get(img);if(!state)continue;state.visible=entry.isIntersecting;
      if(!state.visible){state.ticket++;state.loading=false;clearTimeout(state.timer);img.removeAttribute('src');img.style.visibility='hidden';release(state);continue;}
      if(!state.loading)load(img,state);
    }
    trim();
  },{root,rootMargin:'180px'});
  window.addEventListener('online',()=>{for(const img of images){const state=states.get(img);if(state.visible&&!state.loading)load(img,state);}});
  return {
    image(photo,className){const img=document.createElement('img');img.alt=photo.alt;img.decoding='async';img.style.visibility='hidden';if(className)img.className=className;const state={photo:photo.thumbnail||photo,visible:false,ticket:0,failedTicket:-1,retries:0,loading:false,release:null,timer:0};states.set(img,state);images.add(img);img.addEventListener('error',()=>fail(img,state,state.ticket));observer.observe(img);return img;},
    retry(){for(const img of images){const state=states.get(img);if(state.visible&&!state.loading){state.retries=0;load(img,state);}}},
    clear(){for(const img of images){const state=states.get(img);state.visible=false;state.ticket++;clearTimeout(state.timer);observer.unobserve(img);img.removeAttribute('src');release(state);}images.clear();trim();}
  };
}
