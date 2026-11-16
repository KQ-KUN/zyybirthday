import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoRepository,firstVerifiedPhoto,photoRoutes} from '../photo-repository.js';
import {sealPhoto,encryptAlbum,deriveKey,decryptAlbumWithKey} from '../crypto.js';
const id='12345678-1234-1234-1234-123456789abc',photo={id,src:'sealed/'+id+'.bin'},jpeg=new Uint8Array([255,216,1,2,3,255,217]);
test('照片读取优先本机密文；缓存损坏后验证备用源再更新缓存',async()=>{
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);const sealed=await sealPhoto(jpeg,key,id);let cached=sealed,calls=0,deleted=0;
  const store={getPhoto:async()=>cached,deletePhoto:async()=>{deleted++;cached=null;},putPhoto:async(_,bytes)=>{cached=bytes;}};
  const repository=createPhotoRepository({key,store,delays:[0,0,0],download:async url=>{calls++;if(url===photo.src)throw new Error('origin failed');return sealed;}});
  assert.deepEqual(await repository.read(photo),jpeg);assert.equal(calls,0);
  cached=new Uint8Array(30);assert.deepEqual(await repository.read(photo),jpeg);assert.equal(deleted,1);assert(calls>=2);assert.deepEqual(cached,sealed);
  assert.throws(()=>photoRoutes({...photo,src:'https://invalid/photo.bin'}));repository.stop();
});
test('下载成功但认证失败的线路不会被接受，备用线路仍能完成',async()=>{
  const result=await firstVerifiedPhoto(['bad','good'],async bytes=>{if(bytes[0]!==1)throw new Error('invalid');return new Uint8Array([255,216]);},{delays:[0,0],download:async url=>new Uint8Array([url==='good'?1:0])});
  assert.deepEqual(result.plaintext,new Uint8Array([255,216]));
  await assert.rejects(firstVerifiedPhoto(['bad'],async()=>{throw new Error('invalid');},{delays:[0],download:async()=>new Uint8Array()}));
});

test('开场预览内嵌密文在全部图片线路断开时仍可直接解密，不依赖存储或下载',async()=>{
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),sealed=await sealPhoto(jpeg,key,id);let downloads=0;
  const repository=createPhotoRepository({key,openingPhotos:{[id]:Buffer.from(sealed).toString('base64')},store:{getPhoto:async()=>{throw new Error('storage disabled');}},download:async()=>{downloads++;throw new Error('all routes offline');}});
  assert.equal(repository.hasOpeningPreview(photo),true);assert.deepEqual(await repository.read(photo),jpeg);assert.equal(downloads,0);repository.stop();
});
test('记住的密钥可结构化克隆并重新解锁，不能导出原始密钥',async()=>{
  const payload={version:2,album:{places:[]}};const envelope=await encryptAlbum(payload,'fixture','0101');const key=await deriveKey('fixture','0101',new Uint8Array(Buffer.from(envelope.salt,'base64')),['encrypt','decrypt']);
  const stored=structuredClone(key);assert.equal(stored.extractable,false);await assert.rejects(crypto.subtle.exportKey('raw',stored));assert.deepEqual(await decryptAlbumWithKey(envelope,stored),payload);
  const wrong=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['decrypt']);await assert.rejects(decryptAlbumWithKey(envelope,wrong));
});
