import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {openAlbum,openPhoto} from '../crypto.js';

test('打包照片与缩略图时分别加密，清单引用正确且不复制明文图片',async()=>{
  const parent=resolve(tmpdir()),dir=await mkdtemp(join(parent,'memory-map-pack-'));
  try{
    const source=join(dir,'source'),out=join(dir,'site');await mkdir(join(source,'assets'),{recursive:true});await mkdir(out);
    const full=Buffer.from([255,216,1,2,3,255,217]),thumb=Buffer.from([255,216,4,5,255,217]);
    await writeFile(join(source,'assets/full.jpg'),full);await writeFile(join(source,'assets/thumb.jpg'),thumb);
    await writeFile(join(source,'assets/credits.json'),'[]');
    await writeFile(join(source,'album.json'),JSON.stringify({places:[{id:'a',name:'测试地点',coordinates:[120,30],photos:[{src:'assets/full.jpg',alt:'测试照片',thumbnail:{src:'assets/thumb.jpg'}}]}]}));
    await writeFile(join(out,'index.html'),'<html><body></body></html>');
    const input={name:'fixture',birthday:'0101'};
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./encrypt-album.mjs',import.meta.url)),source,join(out,'album.enc.json')],{input:JSON.stringify(input)+'\n',encoding:'utf8',timeout:20000});
    assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).assets,2);
    const envelope=JSON.parse(await readFile(join(out,'album.enc.json'),'utf8'));
    const {payload,key}=await openAlbum(envelope,input.name,input.birthday);const photo=payload.album.places[0].photos[0];
    assert.notEqual(photo.id,photo.thumbnail.id);assert(photo.src.startsWith('sealed/'));assert(photo.thumbnail.src.startsWith('sealed/'));
    assert.deepEqual(Buffer.from(await openPhoto(new Uint8Array(await readFile(join(out,photo.src))),key,photo.id)),full);
    assert.deepEqual(Buffer.from(await openPhoto(new Uint8Array(await readFile(join(out,photo.thumbnail.src))),key,photo.thumbnail.id)),thumb);
    assert.equal((await readdir(join(out,'sealed'))).length,2);assert(!(await readdir(out)).includes('assets'));
  }finally{
    const local=relative(parent,resolve(dir));assert(local.startsWith('memory-map-pack-')&&!local.includes('..')&&!isAbsolute(local));await rm(dir,{recursive:true,force:true});
  }
});
