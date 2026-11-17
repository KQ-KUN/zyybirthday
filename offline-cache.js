export const OFFLINE_CACHE='memory-album-offline-v1';
export async function offlineResponse(path){
  if(!globalThis.caches)return null;
  try{return await (await caches.open(OFFLINE_CACHE)).match(new URL(path,location.href).href)||null;}catch{return null;}
}
