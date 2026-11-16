import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
test('首屏预览与相册使用同一命名空间、保留源缩略图编号，并限制额外加载体积',async()=>{
  const root=new URL('../',import.meta.url),html=await readFile(new URL('index.html',root),'utf8'),envelope=JSON.parse(await readFile(new URL('album.enc.json',root),'utf8'));
  const opening=JSON.parse(html.match(/<script id="opening-photos" type="application\/json">([\s\S]*?)<\/script>/)[1]);assert.equal(opening.namespace,envelope.salt);assert.equal(opening.version,1);
  const entries=Object.entries(opening.photos);assert(entries.length>=8&&entries.length<=32);assert(Buffer.byteLength(JSON.stringify(opening))<250000);
  for(const [id,value] of entries){assert.match(id,/^[a-f0-9-]{36}$/);const bytes=Buffer.from(value,'base64');assert(bytes.length>28);assert.equal(bytes.toString('base64'),value);assert((await stat(new URL('sealed/'+id+'.bin',root))).size>28);}
});
