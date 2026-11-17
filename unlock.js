import {createDeviceStore} from './device-store.js?v=20261117-29';
import {createPhotoRepository} from './photo-repository.js?v=20261117-29';
import {createPhotoCache} from './photo-cache.js?v=20261117-29';
import {openAlbum,deriveKey,decryptAlbumWithKey,normalizeName,normalizeBirthday} from './crypto.js?v=20261117-29';
import {startAlbum} from './app.js?v=20261117-29';
import {createLocalAlbum,mergeLocalPlaces} from './local-album.js?v=20261117-29';
import {createOfflineDownload,ensureOfflineShell} from './offline-download.js?v=20261117-29';

const form=document.getElementById('unlock-form');
const error=document.getElementById('unlock-error');
const submit=document.getElementById('unlock-submit');
const originalLabel=submit.textContent;
let busy=false;
const envelope=JSON.parse(document.getElementById('sealed-album').textContent);
const deviceStore=createDeviceStore();

submit.disabled=false;submit.textContent=originalLabel;

async function hydrate(payload,key) {
  if(!payload || payload.version!==2 || !payload.album || !Array.isArray(payload.album.places) || !Array.isArray(payload.credits))throw new Error('相册格式无效');
  const localStore=createLocalAlbum({key,namespace:envelope.salt});let additions=[],hiddenIds=[],localWarning='';
  try{additions=await localStore.load();hiddenIds=await localStore.hiddenIds();}catch{localWarning='本机照片暂时无法读取，原有照片仍可浏览。请在同一浏览器中恢复备份。';}
  const basePlaces=JSON.parse(JSON.stringify(payload.album.places));
  let openingPhotos={};try{const opening=JSON.parse(document.getElementById('opening-photos')?.textContent||'{}');if(opening.version===1&&opening.namespace===envelope.salt&&opening.photos&&typeof opening.photos==='object')openingPhotos=opening.photos;}catch{}
  const repository=createPhotoRepository({key,store:deviceStore,localStore,openingPhotos});
  const cache=createPhotoCache({dispose:url=>URL.revokeObjectURL(url),isVisible:url=>[...document.images].some(img=>img.isConnected&&img.src===url),load:photo=>repository.load(photo)});
  const loadPhoto=(photo,options)=>cache.get(photo,options);
  loadPhoto.retain=photo=>cache.retain(photo.id);
  loadPhoto.invalidate=photo=>cache.invalidate(photo.id);
  loadPhoto.hasOpeningPreview=photo=>repository.hasOpeningPreview(photo);
  const allPlaces=mergeLocalPlaces(basePlaces,additions);
  const offlineDownload=createOfflineDownload();offlineDownload.restore();
  window.memoryAlbum={album:{...payload.album,places:allPlaces.filter(place=>!hiddenIds.includes(place.id))},allPlaces,hiddenIds,basePlaces,localStore,localWarning,forgetDevice:()=>deviceStore.forget(envelope.salt),credits:payload.credits,loadPhoto,trimPhotos:cache.trim};
  window.memoryAlbum.offlineDownload=offlineDownload;
  window.addEventListener('pagehide',()=>{repository.stop();cache.clear();delete window.memoryAlbum;},{once:true});
  setTimeout(()=>repository.warmThumbnails(allPlaces).catch(()=>{}),1500);
  return ()=>cache.clear();
}

async function enter(payload,key){
  const disposePhotos=await hydrate(payload,key);
  document.getElementById('unlock-screen').hidden=true;document.getElementById('app').hidden=false;document.body.classList.add('album-unlocked');
  try{startAlbum();}
  catch(error){document.getElementById('unlock-screen').hidden=false;document.getElementById('app').hidden=true;document.body.classList.remove('album-unlocked');disposePhotos();delete window.memoryAlbum;throw error;}
  document.body.dataset.unlockMode='device';
  if('serviceWorker' in navigator)ensureOfflineShell().then(()=>{document.body.dataset.offlineShell='ready';}).catch(()=>{});
}
form.addEventListener('submit',async(event)=>{
  event.preventDefault();if(busy)return;error.textContent='';
  const nameInput=document.getElementById('unlock-name'),birthdayInput=document.getElementById('unlock-birthday');let name,birthday;
  try{name=normalizeName(nameInput.value);birthday=normalizeBirthday(birthdayInput.value);}catch(failure){error.textContent=failure.message;return;}
  if(!window.isSecureContext||!window.crypto?.subtle){error.textContent='请使用 HTTPS 网址和较新的浏览器打开。';return;}
  busy=true;submit.disabled=true;submit.textContent='正在解锁…';form.setAttribute('aria-busy','true');
  try{
    let payload,key;try{({payload,key}=await openAlbum(envelope,name,birthday));}catch{error.textContent='信息不匹配，请检查姓名和生日月日。';return;}
    nameInput.value='';birthdayInput.value='';await enter(payload,key);
    try{await deviceStore.remember(envelope.salt,key,async()=>{const portable=await deriveKey(name,birthday,Uint8Array.from(atob(envelope.salt),char=>char.charCodeAt(0)),['encrypt','decrypt'],true);return crypto.subtle.exportKey('jwk',portable);});}catch{window.memoryAlbum.localWarning='浏览器未允许记住本机解锁，下次可能仍需输入。';document.getElementById('upload-status').textContent=window.memoryAlbum.localWarning;document.body.dataset.unlockMode='session';}
  }catch(failure){error.textContent=failure.message?.includes('超时')?failure.message:'相册加载失败，请检查网络后重试。';}
  finally{busy=false;submit.disabled=false;submit.textContent=originalLabel;form.removeAttribute('aria-busy');name='';birthday='';}
});
async function restoreDevice(){
  busy=true;submit.disabled=true;submit.textContent='正在读取本机记录…';
  try{
    const key=await deviceStore.remembered(envelope.salt);if(key){let payload;try{payload=await decryptAlbumWithKey(envelope,key);}catch{await deviceStore.forget(envelope.salt);return;}await enter(payload,key);}
  }catch{}
  finally{busy=false;submit.disabled=false;submit.textContent=originalLabel;}
}
restoreDevice();
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
