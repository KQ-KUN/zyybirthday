const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8',{fatal:true});
export const ITERATIONS = 600000;
const FORMAT = 'memory-map-v1';
const aad = encoder.encode(FORMAT);

export function normalizeName(value) {
  if (typeof value !== 'string') throw new Error('请输入姓名或昵称');
  const name=value.normalize('NFKC').replace(/\s+/gu,'');
  if (!name || name.length>80) throw new Error('请输入有效的姓名或昵称');
  return name;
}
export function normalizeBirthday(value) {
  if(typeof value!=='string')throw new Error('请输入生日月日');
  const text=value.normalize('NFKC').trim();
  const parts=text.match(/^(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})\s*日?$/u);
  const digits=parts ? parts[1].padStart(2,'0')+parts[2].padStart(2,'0') : text;
  if(!/^\d{4}$/.test(digits))throw new Error('生日请填写四位月日，例如 0518');
  const month=Number(digits.slice(0,2)),day=Number(digits.slice(2));
  if(month<1 || month>12 || day<1 || day>[31,29,31,30,31,30,31,31,30,31,30,31][month-1])throw new Error('请检查生日月日');
  return digits;
}
function toBase64(bytes) {
  let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary);
}
function fromBase64(value) {
  if(typeof value!=='string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length%4)throw new Error('加密文件格式无效');
  return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
}
export async function deriveKey(name,birthday,salt,usages) {
  const input=encoder.encode(normalizeName(name)+'\n'+normalizeBirthday(birthday));
  try {
    const material=await crypto.subtle.importKey('raw',input,'PBKDF2',false,['deriveKey']);
    return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,usages);
  } finally {input.fill(0);}
}
export async function encryptAlbum(payload,name,birthday) {
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(name,birthday,salt,['encrypt']);
  const plaintext=encoder.encode(JSON.stringify(payload));
  try {
    const result=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,plaintext);
    return {format:FORMAT,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(result))};
  } finally {plaintext.fill(0);}
}
export async function decryptAlbum(envelope,name,birthday) {
  if(!envelope || envelope.format!==FORMAT || envelope.kdf!=='PBKDF2-SHA256' || envelope.iterations!==ITERATIONS)throw new Error('加密文件版本无效');
  const salt=fromBase64(envelope.salt),iv=fromBase64(envelope.iv),ciphertext=fromBase64(envelope.ciphertext);
  if(salt.length!==16 || iv.length!==12 || ciphertext.length<16 || ciphertext.length>100*1024*1024)throw new Error('加密文件大小无效');
  const key=await deriveKey(name,birthday,salt,['decrypt']);
  const plaintext=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,ciphertext));
  try {return JSON.parse(decoder.decode(plaintext));}finally{plaintext.fill(0);}
}

// 更新地点文字时保留照片使用的密钥，以全新 IV 重新认证和加密清单。
export async function resealAlbum(payload,envelope,name,birthday){
  await decryptAlbum(envelope,name,birthday);
  const key=await deriveKey(name,birthday,fromBase64(envelope.salt),['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12)),plaintext=encoder.encode(JSON.stringify(payload));
  try{
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,plaintext);
    return {...envelope,iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(ciphertext))};
  }finally{plaintext.fill(0);}
}

export async function openAlbum(envelope,name,birthday) {
  const payload=await decryptAlbum(envelope,name,birthday);
  const key=await deriveKey(name,birthday,fromBase64(envelope.salt),['decrypt']);
  return {payload,key};
}
export async function sealPhoto(bytes,key,id) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode('photo:'+id)},key,bytes));
  const result=new Uint8Array(12+ciphertext.length);result.set(iv);result.set(ciphertext,12);return result;
}
export async function openPhoto(bytes,key,id) {
  if(bytes.length<28)throw new Error('照片文件不完整');
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:encoder.encode('photo:'+id)},key,bytes.slice(12)));
}
