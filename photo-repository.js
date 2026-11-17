import {downloadBytes} from './network.js?v=20261117-30';
import {openPhoto} from './crypto.js?v=20261117-30';
import {offlineResponse} from './offline-cache.js?v=20261117-30';

export function photoRoutes(photo){
  if(!/^sealed\/[a-f0-9-]{36}\.bin$/.test(photo.src)||!photo.src.endsWith('/'+photo.id+'.bin'))throw new Error('照片路径无效');
  return [photo.src,'https://cdn.jsdelivr.net/gh/KQ-KUN/zyybirthday@main/'+photo.src,'https://raw.githubusercontent.com/KQ-KUN/zyybirthday/main/'+photo.src];
}
export function firstVerifiedPhoto(routes,verify,{download=downloadBytes,delays=[0,1400,3200]}={}){
  return new Promise((resolve,reject)=>{
    let done=false,failed=0;const controllers=[],timers=[];
    function stop(){timers.forEach(clearTimeout);controllers.forEach(controller=>controller.abort());}
    routes.forEach((url,index)=>{
      timers.push(setTimeout(async()=>{
        if(done)return;const controller=new AbortController();controllers.push(controller);
        try{const bytes=await download(url,{timeoutMs:8000,maxBytes:8*1024*1024,signal:controller.signal,cache:index?'reload':'default'});const plaintext=await verify(bytes);
          if(done){plaintext.fill(0);return;}done=true;stop();resolve({bytes,plaintext});
        }catch(error){if(done)return;failed++;if(failed===routes.length){done=true;stop();reject(error);}}
      },delays[index]||0));
    });
  });
}
export function createPhotoRepository({key,store,localStore,download,delays,openingPhotos={}}){
  let foreground=0,stopped=false;
  const embedded=new Map(Object.entries(openingPhotos).filter(([id,value])=>/^[a-f0-9-]{36}$/.test(id)&&typeof value==='string'&&value.length<100000));
  async function verify(bytes,id){const plaintext=await openPhoto(new Uint8Array(bytes),key,id);if(plaintext[0]!==255||plaintext[1]!==216){plaintext.fill(0);throw new Error('照片内容无效');}return plaintext;}
  async function read(photo){
    photoRoutes(photo);
    if(photo.local)return verify(await localStore.readPhoto(photo),photo.id);
    const offline=await offlineResponse(photo.src);
    if(offline)try{return await verify(new Uint8Array(await offline.arrayBuffer()),photo.id);}catch{}
    if(embedded.has(photo.id))try{return await verify(Uint8Array.from(atob(embedded.get(photo.id)),value=>value.charCodeAt(0)),photo.id);}catch{embedded.delete(photo.id);}
    let cached;try{cached=await store.getPhoto(photo.id);}catch{}
    if(cached)try{return await verify(cached,photo.id);}catch{try{await store.deletePhoto(photo.id);}catch{}}
    foreground++;
    try{
      const result=await firstVerifiedPhoto(photoRoutes(photo),bytes=>verify(bytes,photo.id),{download,delays});
      try{await store.putPhoto(photo.id,result.bytes);}catch{}
      return result.plaintext;
    }finally{foreground--;}
  }
  return {
    hasOpeningPreview:photo=>photo.local||embedded.has(photo.id),
    read,
    async load(photo){const plaintext=await read(photo);const size=plaintext.byteLength;try{return {url:URL.createObjectURL(new Blob([plaintext],{type:'image/jpeg'})),bytes:size};}finally{plaintext.fill(0);}},
    async warmThumbnails(places){
      const photos=places.flatMap(place=>place.photos.map(photo=>photo.thumbnail).filter(photo=>photo&&!photo.local));
      for(const photo of photos){
        while(!stopped&&(foreground||globalThis.document?.hidden))await new Promise(resolve=>setTimeout(resolve,800));if(stopped)return;
        try{const bytes=await read(photo);bytes.fill(0);}catch{}
      }
    },
    stop(){stopped=true;}
  };
}
