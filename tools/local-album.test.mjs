import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLocalAlbum,validateLocalPlaces,mergeLocalPlaces} from '../local-album.js';
import {openPhoto,sealPhoto} from '../crypto.js';
import {mosaicCells,mosaicPhotos} from '../photo-mosaic.js';
import {uploadLocations,searchLocations} from '../local-upload.js';
function adapter(){const metadata=new Map(),photos=new Map();return {metadata,photos,getMeta:async id=>metadata.get(id),getPhoto:async(ns,id)=>photos.get(ns+'/'+id),async commit(ns,revision,bytes,entries){assert.equal(metadata.get(ns)?.revision||0,revision);for(const entry of entries)photos.set(ns+'/'+entry.id,entry.blob);metadata.set(ns,{revision:revision+1,bytes:bytes.slice()});}};}
async function fixture(){
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),namespace='sample-album',db=adapter();
  const make=()=>{const id=crypto.randomUUID();return {id,src:`sealed/${id}.bin`,local:true,width:480,height:320};};
  const photo={...make(),alt:'春游',thumbnail:make()},place={id:'local-'+crypto.randomUUID(),name:'春游',region:'浙江',coordinates:[120,30],photos:[photo]};
  const images=[photo,photo.thumbnail].map(photo=>({id:photo.id,bytes:new Uint8Array([255,216,12,34,255,217])}));
  return {key,namespace,db,place,images,store:createLocalAlbum({key,namespace,adapter:db})};
}
test('本机保存逐张加密，重新打开后仍可解密，错误密钥不能读取',async()=>{
  const f=await fixture();await f.store.add(f.place,f.images);
  const reopened=createLocalAlbum({key:f.key,namespace:f.namespace,adapter:f.db});assert.deepEqual(await reopened.load(),[f.place]);
  const ciphertext=await reopened.readPhoto(f.place.photos[0]);assert.notDeepEqual(ciphertext,f.images[0].bytes);assert.deepEqual(await openPhoto(ciphertext,f.key,f.images[0].id),f.images[0].bytes);
  assert(!new TextDecoder().decode(f.db.metadata.get(f.namespace).bytes).includes('春游'));
  const wrong=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await assert.rejects(createLocalAlbum({key:wrong,namespace:f.namespace,adapter:f.db}).load());
});
test('备份可在空存储恢复，重复导入不增加照片，原有照片不丢失',async()=>{
  const f=await fixture();await f.store.add(f.place,f.images);const backup=await f.store.exportBackup(),db=adapter();
  const target=createLocalAlbum({key:f.key,namespace:f.namespace,adapter:db});await target.importBackup(backup);await target.importBackup(backup);
  assert.deepEqual(await target.load(),[f.place]);assert.equal(db.photos.size,2);
});
test('损坏或属于其他相册的备份被拒绝，失败前不写入任何照片',async()=>{
  const f=await fixture();await f.store.add(f.place,f.images);const backup=await f.store.exportBackup(),data=new Uint8Array(await backup.arrayBuffer());data[data.length-1]^=1;
  const db=adapter(),target=createLocalAlbum({key:f.key,namespace:f.namespace,adapter:db});await assert.rejects(target.importBackup(new Blob([data])));assert.equal(db.photos.size,0);assert.equal(db.metadata.size,0);
  await assert.rejects(createLocalAlbum({key:f.key,namespace:'another',adapter:db}).importBackup(backup),/另一个相册/);
});
test('非法坐标、外部路径及重复图片拒绝入库',async()=>{
  const f=await fixture();const bad=structuredClone(f.place);bad.coordinates=[200,30];assert.throws(()=>validateLocalPlaces([bad]));
  bad.coordinates=[120,30];bad.photos[0].src='https://example.com/photo.jpg';assert.throws(()=>validateLocalPlaces([bad]));
  await f.store.add(f.place,f.images);await assert.rejects(f.store.add(f.place,f.images));assert.deepEqual(await f.store.load(),[f.place]);
});
test('新增照片可以接续原地点，合并不修改原相册',async()=>{
  const f=await fixture(),base=[{id:'west-lake',name:'西湖',photos:[]}];f.place.targetId='west-lake';const merged=mergeLocalPlaces(base,[f.place]);
  assert.equal(base[0].photos.length,0);assert.equal(merged.length,1);assert.equal(merged[0].photos.length,1);
  const entries=uploadLocations(base,[{name:'浙江',coordinates:[120,30]}],[]);assert.equal(entries[0].targetId,'west-lake');assert.equal(entries[1].group,'省份');
});
test('拼字网格只采样笔画，照片在整本相册中均匀选取',()=>{
  const pixels=new Uint8ClampedArray(8*8*4);pixels[(2*8+2)*4+3]=255;const cells=mosaicCells(pixels,8,8,4);assert.equal(cells.length,1);assert.equal(cells[0].x,0);assert.equal(cells[0].y,0);
  assert.throws(()=>mosaicCells(pixels,9,8));const photos=Array.from({length:124},(_,id)=>({id}));const selected=mosaicPhotos([{photos}]);assert.equal(selected.length,8);assert.equal(selected[0].id,0);assert.equal(selected.at(-1).id,123);
});

test('旧本机照片清单可迁移；移除地图钉后照片仍保存，可恢复',async()=>{
  const f=await fixture();await f.store.add(f.place,f.images);
  f.db.metadata.get(f.namespace).bytes=await sealPhoto(new TextEncoder().encode(JSON.stringify([f.place])),f.key,'metadata:'+f.namespace);
  assert.deepEqual(await f.store.load(),[f.place]);assert.deepEqual(await f.store.hiddenIds(),[]);
  await f.store.setHidden(f.place.id,true);assert.deepEqual(await f.store.hiddenIds(),[f.place.id]);assert.deepEqual(await f.store.load(),[f.place]);assert.equal(f.db.photos.size,2);
  await f.store.setHidden(f.place.id,false);assert.deepEqual(await f.store.hiddenIds(),[]);
});
test('只有移除设置、没有新增照片时也可导出并恢复备份',async()=>{
  const f=await fixture();await f.store.setHidden('west-lake',true);const backup=await f.store.exportBackup();
  const target=createLocalAlbum({key:f.key,namespace:f.namespace,adapter:adapter()});await target.importBackup(backup);assert.deepEqual(await target.hiddenIds(),['west-lake']);assert.deepEqual(await target.load(),[]);
});
test('地点搜索覆盖全国城市和已有景点，按输入过滤而不是默认列出选项',()=>{
  const locations=uploadLocations([{id:'lake',name:'西湖',region:'浙江 · 杭州',coordinates:[120,30],photos:[]}],[{name:'浙江',coordinates:[120,30]}]);
  assert.deepEqual(searchLocations(locations,''),[]);assert.equal(searchLocations(locations,'西湖')[0].targetId,'lake');assert(searchLocations(locations,'西安').some(item=>item.name==='西安市'));assert(!searchLocations(locations,'西安').some(item=>item.name==='安康市'));assert(searchLocations(locations,'浙江杭州').some(item=>item.name==='杭州市'));assert.equal(searchLocations(locations,'不存在的景点123').length,0);
});
