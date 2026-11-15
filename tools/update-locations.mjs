import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {decryptAlbum,resealAlbum} from '../crypto.js';

const [oldPath,newPath,destination='album.enc.json']=process.argv.slice(2);
if(!oldPath||!newPath)throw new Error('Provide previous and updated source album JSON paths');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stderr.write('Ready for metadata update input (hidden).\n');
let buffer='';
const input=await new Promise((resolveInput,reject)=>{
  process.stdin.setEncoding('utf8');
  const read=chunk=>{
    buffer+=chunk;
    if(buffer.includes('\u0003'))process.exit(130);
    if(buffer.length>1024){reject(new Error('Input too long'));return;}
    if(!/[\r\n]/.test(buffer))return;
    process.stdin.removeListener('data',read);process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.unref?.();
    try{resolveInput(JSON.parse(buffer));}catch{reject(new Error('Invalid update input'));}buffer='';
  };
  process.stdin.on('data',read);
});
const oldAlbum=JSON.parse(await readFile(resolve(oldPath),'utf8'));
const newAlbum=JSON.parse(await readFile(resolve(newPath),'utf8'));
const envelope=JSON.parse(await readFile(resolve(destination),'utf8'));
const payload=await decryptAlbum(envelope,input.name,input.birthday);
const assets=new Map(),used=new Set();
for(const place of oldAlbum.places){
  const sealed=payload.album.places.find(item=>item.id===place.id);
  if(!sealed||sealed.photos.length!==place.photos.length)throw new Error('Previous album does not match sealed album');
  place.photos.forEach((photo,i)=>{
    const encrypted=sealed.photos[i];if(photo.alt!==encrypted.alt||photo.width!==encrypted.width||photo.height!==encrypted.height)throw new Error('Photo order mismatch');
    assets.set(photo.src,encrypted);
  });
}
for(const place of newAlbum.places)place.photos=place.photos.map(photo=>{
  const sealed=assets.get(photo.src);if(!sealed||used.has(photo.src))throw new Error('Photo missing or repeated in updated album');used.add(photo.src);
  return {...photo,id:sealed.id,src:sealed.src,...(photo.thumbnail?{thumbnail:{...photo.thumbnail,id:sealed.thumbnail.id,src:sealed.thumbnail.src}}:{})};
});
if(used.size!==assets.size)throw new Error('Updated album drops photos');
payload.album=newAlbum;
const updated=await resealAlbum(payload,envelope,input.name,input.birthday);
const verified=await decryptAlbum(updated,input.name,input.birthday);
if(verified.album.places.reduce((sum,place)=>sum+place.photos.length,0)!==assets.size)throw new Error('Metadata roundtrip failed');
const serialized=JSON.stringify(updated),htmlPath=resolve(destination,'../index.html');
const html=(await readFile(htmlPath,'utf8')).replace(/(<script id="sealed-album" type="application\/json">)[\s\S]*?(<\/script>)/,(_,start,end)=>start+serialized+end);
await writeFile(resolve(destination),serialized);await writeFile(htmlPath,html);input.name='';input.birthday='';
console.log(JSON.stringify({updated:true,photos:assets.size,places:newAlbum.places.length,photoAssetsUnchanged:true}));
