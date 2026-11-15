import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,sep,isAbsolute} from 'node:path';
import {encryptAlbum,decryptAlbum,deriveKey,sealPhoto,openPhoto} from '../crypto.js';

const source=resolve(process.argv[2]??'../birthday-map/dist');
const destination=resolve(process.argv[3]??'album.enc.json');
// 解锁信息只从隐藏的标准输入接收，避免进入命令行、文件和 Git 历史。
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stderr.write('Ready for encryption input (hidden).\n');
let text='';
const input=await new Promise((resolve,reject)=>{
  process.stdin.setEncoding('utf8');
  function finish(){process.stdin.removeListener('data',read);process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);try{resolve(JSON.parse(text));}catch{reject(new Error('Invalid encryption input'));}text='';}
  function read(chunk){text+=chunk;if(text.includes('\u0003'))process.exit(130);if(text.length>1024)reject(new Error('Input too long'));if(/[\r\n]/.test(text))finish();}
  process.stdin.on('data',read);process.stdin.resume();
});
const album=JSON.parse(await readFile(resolve(source,'album.json'),'utf8'));
const credits=JSON.parse(await readFile(resolve(source,'assets/credits.json'),'utf8'));
const images={};
for(const place of album.places)for(const photo of place.photos){
  if(images[photo.src])continue;
  if(typeof photo.src!=='string' || !/^assets\/[a-zA-Z0-9_./-]+\.jpe?g$/i.test(photo.src) || photo.src.includes('..'))throw new Error('Invalid photo path');
  const path=resolve(source,photo.src);const local=relative(source,path);
  if(local.startsWith('..'+sep) || local==='..' || isAbsolute(local))throw new Error('Photo path outside source');
  const bytes=await readFile(path);
  if(bytes[0]!==0xff || bytes[1]!==0xd8)throw new Error('Expected a JPEG photo');
  images[photo.src]=bytes.toString('base64');
}
const paths=new Map();
for(const place of album.places)for(const photo of place.photos){
  if(!paths.has(photo.src))paths.set(photo.src,crypto.randomUUID());
  photo.id=paths.get(photo.src);photo.src='sealed/'+photo.id+'.bin';
}
const payload={version:2,album,credits};
const envelope=await encryptAlbum(payload,input.name,input.birthday);
const key=await deriveKey(input.name,input.birthday,Uint8Array.from(Buffer.from(envelope.salt,'base64')),['encrypt','decrypt']);
const verified=await decryptAlbum(envelope,input.name,input.birthday);
if(verified.album.places.length!==album.places.length)throw new Error('Roundtrip verification failed');
await mkdir(resolve(destination,'../sealed'),{recursive:true});
for(const [path,id] of paths){
  const bytes=Uint8Array.from(Buffer.from(images[path],'base64'));
  const sealed=await sealPhoto(bytes,key,id);
  const opened=await openPhoto(sealed,key,id);
  if(!Buffer.from(opened).equals(Buffer.from(bytes)))throw new Error('Photo verification failed');
  await writeFile(resolve(destination,'../sealed/'+id+'.bin'),sealed);bytes.fill(0);opened.fill(0);
}
let rejected=false;
try{await decryptAlbum(envelope,input.name+'-invalid',input.birthday);}catch{rejected=true;}
if(!rejected)throw new Error('Incorrect credential was accepted');
const serialized=JSON.stringify(envelope);
if(serialized.includes(input.name))throw new Error('Name leaked into encryption envelope');
await writeFile(destination,serialized);
const htmlPath=resolve(destination,'../index.html');
let html=await readFile(htmlPath,'utf8');
html=html.replace(/\s*<script id="sealed-album"[\s\S]*?<\/script>/,'');
html=html.replace('</body>','<script id="sealed-album" type="application/json">'+serialized+'</script>\n</body>');
await writeFile(htmlPath,html);
input.name='';input.birthday='';
console.log(JSON.stringify({encrypted:true,photos:Object.keys(images).length,bytes:Buffer.byteLength(serialized),roundtrip:true,incorrectCredentialRejected:true}));
