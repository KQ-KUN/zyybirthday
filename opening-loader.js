function cancelled(){return new DOMException('照片加载已取消','AbortError');}
export function waitForPhotoRetry(delay,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(cancelled());return;}
  let timer;const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);globalThis.window?.removeEventListener('online',online);};
  const online=()=>{clean();resolve();},abort=()=>{clean();reject(cancelled());};
  timer=setTimeout(online,delay);signal?.addEventListener('abort',abort,{once:true});globalThis.window?.addEventListener('online',online,{once:true});
});}
async function decode(url){const image=new Image();image.src=url;await image.decode();}
export async function loadOpeningPhoto(photo,loadPhoto,{signal,isRelevant=()=>true,decodeImage=decode,wait=waitForPhotoRetry}={}){
  let attempt=0;
  while(!signal?.aborted&&isRelevant()){
    try{const url=await loadPhoto(photo,{isRelevant:()=>!signal?.aborted&&isRelevant()});if(signal?.aborted||!isRelevant())throw cancelled();await decodeImage(url);if(signal?.aborted||!isRelevant())throw cancelled();return url;}
    catch(error){if(signal?.aborted||!isRelevant()||error.name==='AbortError')throw cancelled();loadPhoto.invalidate?.(photo);await wait(Math.min(6000,800*2**attempt++),signal);}
  }
  throw cancelled();
}
