import {decryptAlbum,normalizeName,normalizeBirthday} from './crypto.js?v=20261115-2';
import {downloadJSON} from './network.js?v=20261115-2';
import {startAlbum} from './app.js?v=20261115-2';

const form=document.getElementById('unlock-form');
const error=document.getElementById('unlock-error');
const submit=document.getElementById('unlock-submit');
const originalLabel=submit.textContent;
let busy=false;
let envelope;

function hydrate(payload) {
  if(!payload || payload.version!==1 || !payload.album || !Array.isArray(payload.album.places) || !payload.images || !Array.isArray(payload.credits))throw new Error('相册格式无效');
  const urls=[];
  for(const place of payload.album.places){
    if(!Array.isArray(place.photos))throw new Error('照片列表无效');
    for(const photo of place.photos){
      const value=payload.images[photo.src];
      if(typeof value!=='string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw new Error('照片格式无效');
      const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
      if(bytes[0]!==0xff || bytes[1]!==0xd8)throw new Error('照片格式无效');
      const url=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
      urls.push(url);photo.src=url;
    }
  }
  // 只在解锁成功后把相册内容放入本页内存，不写入浏览器持久存储。
  window.memoryAlbum={album:payload.album,credits:payload.credits};
  window.addEventListener('pagehide',()=>{urls.forEach(url=>URL.revokeObjectURL(url));delete window.memoryAlbum;},{once:true});
  return urls;
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
    if(!envelope)envelope=await downloadJSON('album.enc.json?v=20261115-2',{
      onProgress:(received,total)=>{
        submit.textContent=total>0 && received<=total?`正在读取 ${Math.min(100,Math.round(received/total*100))}%`:`正在读取 ${Math.round(received/1024)} KB`;
      }
    });
    submit.textContent='正在解锁…';
    await new Promise(resolve=>requestAnimationFrame(resolve));
    let payload;
    try{payload=await decryptAlbum(envelope,name,birthday);}catch{error.textContent='信息不匹配，请检查姓名和生日月日。';return;}
    nameInput.value='';birthdayInput.value='';name='';birthday='';
    const urls=hydrate(payload);
    document.getElementById('unlock-screen').hidden=true;
    document.getElementById('app').hidden=false;
    document.body.classList.add('album-unlocked');
    try{startAlbum();}
    catch(e){
      document.getElementById('unlock-screen').hidden=false;
      document.getElementById('app').hidden=true;
      document.body.classList.remove('album-unlocked');
      urls.forEach(url=>URL.revokeObjectURL(url));delete window.memoryAlbum;throw e;
    }
    document.getElementById('map-home').focus();
  }catch(e){error.textContent=e.message?.includes('超时')?e.message:'相册加载失败，请检查网络后再次点击打开。';}
  finally{busy=false;submit.disabled=false;submit.textContent=originalLabel;form.removeAttribute('aria-busy');name='';birthday='';}
});

window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
