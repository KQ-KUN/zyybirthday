import {createPhotoCache} from './photo-cache.js?v=20261115-8';
import {openAlbum,openPhoto,normalizeName,normalizeBirthday} from './crypto.js?v=20261115-8';
import {downloadBytes} from './network.js?v=20261115-8';
import {startAlbum} from './app.js?v=20261115-8';

const form=document.getElementById('unlock-form');
const error=document.getElementById('unlock-error');
const submit=document.getElementById('unlock-submit');
const originalLabel=submit.textContent;
let busy=false;
const envelope=JSON.parse(document.getElementById('sealed-album').textContent);
submit.disabled=false;submit.textContent=originalLabel;

function hydrate(payload,key) {
  if(!payload || payload.version!==2 || !payload.album || !Array.isArray(payload.album.places) || !Array.isArray(payload.credits))throw new Error('相册格式无效');
  const cache=createPhotoCache({
    dispose:url=>URL.revokeObjectURL(url),
    isVisible:url=>[...document.images].some(img=>img.src===url),
    load:async(photo)=>{

    if(!/^sealed\/[a-f0-9-]{36}\.bin$/.test(photo.src) || !/^[a-f0-9-]{36}$/.test(photo.id))throw new Error('照片路径无效');

      let bytes;
      for(let attempt=0;attempt<2;attempt++){
        try{bytes=await downloadBytes(photo.src,{timeoutMs:25000});break;}
        catch(e){if(attempt===1)throw e;await new Promise(resolve=>setTimeout(resolve,400));}
      }
      const plaintext=await openPhoto(bytes,key,photo.id);
      const size=plaintext.byteLength;
      const url=URL.createObjectURL(new Blob([plaintext],{type:'image/jpeg'}));plaintext.fill(0);return {url,bytes:size};
    }
  });
  const loadPhoto=(photo,options)=>cache.get(photo,options);
  loadPhoto.retain=photo=>cache.retain(photo.id);
  window.memoryAlbum={album:payload.album,credits:payload.credits,loadPhoto,trimPhotos:cache.trim};
  window.addEventListener('pagehide',()=>{cache.clear();delete window.memoryAlbum;},{once:true});
  return ()=>cache.clear();
}

form.addEventListener('submit',async(event)=>{
  event.preventDefault();if(busy)return;
  error.textContent='';
  const nameInput=document.getElementById('unlock-name');
  const birthdayInput=document.getElementById('unlock-birthday');
  let name,birthday;
  try{name=normalizeName(nameInput.value);birthday=normalizeBirthday(birthdayInput.value);}catch(e){error.textContent=e.message;return;}
  if(!window.isSecureContext || !window.crypto?.subtle){error.textContent='请使用 HTTPS 网址和较新的浏览器打开。';return;}
  busy=true;submit.disabled=true;submit.textContent='正在读取相册…';form.setAttribute('aria-busy','true');
  try{
    submit.textContent='正在解锁…';
    await new Promise(resolve=>requestAnimationFrame(resolve));
    let payload,key;
    try{({payload,key}=await openAlbum(envelope,name,birthday));}catch{error.textContent='信息不匹配，请检查姓名和生日月日。';return;}
    nameInput.value='';birthdayInput.value='';name='';birthday='';
    const disposePhotos=hydrate(payload,key);
    document.getElementById('unlock-screen').hidden=true;
    document.getElementById('app').hidden=false;
    document.body.classList.add('album-unlocked');
    try{startAlbum();}
    catch(e){
      document.getElementById('unlock-screen').hidden=false;
      document.getElementById('app').hidden=true;
      document.body.classList.remove('album-unlocked');
      disposePhotos();delete window.memoryAlbum;throw e;
    }
    document.getElementById('map-home').focus();
  }catch(e){error.textContent=e.message?.includes('超时')?e.message:'相册加载失败，请检查网络后再次点击打开。';}
  finally{busy=false;submit.disabled=false;submit.textContent=originalLabel;form.removeAttribute('aria-busy');name='';birthday='';}
});

window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
