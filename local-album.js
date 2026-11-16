import {sealPhoto,openPhoto} from './crypto.js?v=20261116-14';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const magic=encoder.encode('MEMORY-LOCAL-1\n');
const uuid=/^[a-f0-9-]{36}$/;
const MAX_BYTES=150*1024*1024;
const clone=value=>JSON.parse(JSON.stringify(value));
function assert(value,message){if(!value)throw new Error(message);}
function base64(bytes){let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);}
function unbase64(value){assert(typeof value==='string'&&value.length<700000&&/^[A-Za-z0-9+/]*={0,2}$/.test(value),'备份清单无效');return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export function validateLocalPlaces(value){
  assert(Array.isArray(value)&&value.length<=1000,'本机地点清单无效');
  const places=new Set(),photos=new Set();let count=0;
  for(const place of value){
    assert(place&&typeof place.id==='string'&&/^local-[a-f0-9-]{36}$/.test(place.id)&&!places.has(place.id),'本机地点编号无效');places.add(place.id);
    assert(typeof place.name==='string'&&place.name.trim()&&place.name.length<=100&&typeof place.region==='string'&&place.region.length<=150,'本机地点名称无效');
    assert(place.targetId===undefined||(typeof place.targetId==='string'&&/^[a-z0-9-]{1,90}$/.test(place.targetId)),'原地点编号无效');
    assert(Array.isArray(place.coordinates)&&place.coordinates.length===2&&place.coordinates.every(Number.isFinite)&&Math.abs(place.coordinates[0])<=180&&Math.abs(place.coordinates[1])<=85,'本机地点坐标无效');
    assert(Array.isArray(place.photos)&&place.photos.length>0,'本机照片清单无效');
    for(const photo of place.photos){
      assert(++count<=1000&&photo&&photo.local===true&&typeof photo.alt==='string'&&photo.alt.length<=500,'本机照片说明无效');
      for(const item of [photo,photo.thumbnail]){
        assert(item&&uuid.test(item.id)&&!photos.has(item.id)&&item.src===`sealed/${item.id}.bin`&&item.local===true,'本机照片编号或路径无效');photos.add(item.id);
        assert(Number.isInteger(item.width)&&item.width>0&&item.width<=4000&&Number.isInteger(item.height)&&item.height>0&&item.height<=4000,'本机照片尺寸无效');
      }
    }
  }
  return value;
}
export function mergeLocalPlaces(base,additions){
  const result=clone(base),byId=new Map(result.map(place=>[place.id,place]));
  for(const item of validateLocalPlaces(additions)){
    const target=byId.get(item.targetId||item.id);
    if(target){const ids=new Set(target.photos.map(photo=>photo.id));target.photos.push(...item.photos.filter(photo=>!ids.has(photo.id)));}
    else{const place=clone(item);result.push(place);byId.set(place.id,place);}
  }
  return result;
}
function photoItems(places){return places.flatMap(place=>place.photos.flatMap(photo=>[photo,photo.thumbnail]));}

export function createIndexedDBAdapter(){
  let pending;
  const db=()=>pending??=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('本机存储连接超时，请重新打开浏览器')),8000);
    const request=indexedDB.open('memory-map-local',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('albums',{keyPath:'id'});request.result.createObjectStore('photos',{keyPath:'id'});};
    request.onsuccess=()=>{clearTimeout(timeout);resolve(request.result);};request.onerror=()=>{clearTimeout(timeout);reject(new Error('此浏览器无法保存本机照片，请使用系统浏览器打开'));};
    request.onblocked=()=>reject(new Error('请关闭其他相册页面后重试'));
  });
  const get=async(store,id)=>{const connection=await db();return new Promise((resolve,reject)=>{const request=connection.transaction(store).objectStore(store).get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});};
  return {
    getMeta:namespace=>get('albums',namespace),
    async getPhoto(namespace,id){const item=await get('photos',namespace+'/'+id);assert(item?.blob instanceof Blob,'本机照片不存在，请导入备份恢复');return item.blob;},
    async commit(namespace,expectedRevision,bytes,photos){
      const connection=await db();
      return new Promise((resolve,reject)=>{
        const transaction=connection.transaction(['albums','photos'],'readwrite'),albums=transaction.objectStore('albums');let conflict=false;
        const request=albums.get(namespace);request.onsuccess=()=>{
          if((request.result?.revision||0)!==expectedRevision){conflict=true;transaction.abort();return;}
          for(const photo of photos)transaction.objectStore('photos').put({id:namespace+'/'+photo.id,blob:photo.blob});
          albums.put({id:namespace,revision:expectedRevision+1,bytes});
        };
        transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(new Error(conflict?'另一个页面正在保存，请稍后重试':transaction.error?.name==='QuotaExceededError'?'手机可用空间不足，请先导出备份再清理空间':'本机保存失败，照片尚未添加'));transaction.onerror=()=>{};
      });
    }
  };
}

export function createLocalAlbum({key,namespace,adapter=createIndexedDBAdapter()}){
  let queue=Promise.resolve();
  const exclusive=operation=>{const next=queue.then(operation);queue=next.catch(()=>{});return next;};
  async function read(){
    const record=await adapter.getMeta(namespace);if(!record)return {places:[],revision:0};
    const bytes=await openPhoto(new Uint8Array(record.bytes),key,'metadata:'+namespace);
    try{return {places:validateLocalPlaces(JSON.parse(decoder.decode(bytes))),revision:record.revision,bytes:record.bytes};}finally{bytes.fill(0);}
  }
  async function save(places,revision,photos){
    const plaintext=encoder.encode(JSON.stringify(validateLocalPlaces(places)));
    try{const sealed=await sealPhoto(plaintext,key,'metadata:'+namespace);await adapter.commit(namespace,revision,sealed,photos);}finally{plaintext.fill(0);}
  }
  return {
    async load(){return (await read()).places;},
    async readPhoto(photo){const blob=await adapter.getPhoto(namespace,photo.id);return new Uint8Array(await blob.arrayBuffer());},
    add(place,images){return exclusive(async()=>{
      validateLocalPlaces([place]);const current=await read(),wanted=photoItems([place]);
      assert(images.length===wanted.length,'照片数量不匹配');
      const sealed=[];
      let total=0;for(const item of photoItems(current.places))total+=(await adapter.getPhoto(namespace,item.id)).size;
      for(const item of wanted){const image=images.find(image=>image.id===item.id);assert(image?.bytes instanceof Uint8Array&&image.bytes.length<5*1024*1024,'照片内容无效');sealed.push({id:item.id,blob:new Blob([await sealPhoto(image.bytes,key,item.id)])});}
      for(const image of sealed)total+=image.blob.size;assert(total<=MAX_BYTES,'本机新增照片已达 150 MB，请先导出备份后再整理');
      await save([...current.places,place],current.revision,sealed);return [...current.places,place];
    });},
    exportBackup(){return exclusive(async()=>{
      const current=await read();assert(current.places.length,'还没有本机新增照片可备份');
      const parts=[],entries=[];let bytes=0;
      for(const photo of photoItems(current.places)){const blob=await adapter.getPhoto(namespace,photo.id);bytes+=blob.size;assert(bytes<=MAX_BYTES,'本机照片过多，请分批备份');entries.push({id:photo.id,length:blob.size});parts.push(blob);}
      const header=encoder.encode(JSON.stringify({namespace,metadata:base64(new Uint8Array(current.bytes)),entries}));assert(header.length<=512*1024,'备份清单过大');
      const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,header.length,true);
      return new Blob([magic,size,header,...parts],{type:'application/octet-stream'});
    });},
    importBackup(file){return exclusive(async()=>{
      assert(file instanceof Blob&&file.size<=MAX_BYTES+600000&&file.size>magic.length+4,'备份文件无效或过大');
      const prefix=new Uint8Array(await file.slice(0,magic.length+4).arrayBuffer());assert(magic.every((value,i)=>prefix[i]===value),'请选择相册导出的 .mapalbum 备份');
      const length=new DataView(prefix.buffer).getUint32(magic.length,true);assert(length>0&&length<=512*1024,'备份清单大小无效');
      let offset=magic.length+4+length;assert(offset<file.size,'备份文件不完整');
      const header=JSON.parse(decoder.decode(await file.slice(magic.length+4,offset).arrayBuffer()));
      assert(header.namespace===namespace,'这份备份属于另一个相册，请在原相册中恢复');assert(Array.isArray(header.entries)&&header.entries.length<=2000,'备份照片清单无效');
      const plaintext=await openPhoto(unbase64(header.metadata),key,'metadata:'+namespace);let incoming;
      try{incoming=validateLocalPlaces(JSON.parse(decoder.decode(plaintext)));}finally{plaintext.fill(0);}
      const expected=new Set(photoItems(incoming).map(photo=>photo.id)),seen=new Set(),photos=[];
      for(const entry of header.entries){
        assert(entry&&expected.has(entry.id)&&!seen.has(entry.id)&&Number.isInteger(entry.length)&&entry.length>=28&&entry.length<5*1024*1024&&offset+entry.length<=file.size,'备份照片缺失、重复或长度无效');seen.add(entry.id);
        const blob=file.slice(offset,offset+entry.length);offset+=entry.length;
        const image=await openPhoto(new Uint8Array(await blob.arrayBuffer()),key,entry.id);const jpeg=image[0]===255&&image[1]===216;image.fill(0);assert(jpeg,'备份照片格式无效');photos.push({id:entry.id,blob});
      }
      assert(offset===file.size&&seen.size===expected.size,'备份文件不完整');
      const current=await read(),merged=clone(current.places),byId=new Map(merged.map(place=>[place.id,place]));
      for(const place of incoming){const existing=byId.get(place.id);if(existing){assert(existing.name===place.name&&JSON.stringify(existing.coordinates)===JSON.stringify(place.coordinates),'备份地点发生冲突');const ids=new Set(existing.photos.map(photo=>photo.id));existing.photos.push(...place.photos.filter(photo=>!ids.has(photo.id)));}else{merged.push(place);byId.set(place.id,place);}}
      const existingIds=new Set(photoItems(current.places).map(photo=>photo.id));
      const added=photos.filter(photo=>!existingIds.has(photo.id));let total=added.reduce((sum,photo)=>sum+photo.blob.size,0);
      for(const id of existingIds)total+=(await adapter.getPhoto(namespace,id)).size;
      assert(total<=MAX_BYTES,'合并后的本机照片超过 150 MB，尚未导入');
      await save(merged,current.revision,added);return merged;
    });}
  };
}
