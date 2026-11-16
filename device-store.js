// 优先结构化克隆不可导出的 CryptoKey；不支持 IndexedDB 时使用本机解锁凭据，不保存姓名和生日。
export function createDeviceStore({budget=128*1024*1024,storage=globalThis.localStorage}={}){
  let pending;
  const db=()=>pending??=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('本机存储连接超时')),2500),request=indexedDB.open('memory-map-device',1);
    request.onupgradeneeded=()=>{for(const name of ['state','photos','photo-index'])request.result.createObjectStore(name,{keyPath:'id'});};
    request.onsuccess=()=>{clearTimeout(timer);resolve(request.result);};request.onerror=()=>{clearTimeout(timer);reject(request.error);};request.onblocked=()=>{clearTimeout(timer);reject(new Error('本机存储暂时不可用'));};
  });
  async function read(store,id){const connection=await db();return new Promise((resolve,reject)=>{const request=connection.transaction(store).objectStore(store).get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function change(stores,work){const connection=await db();return new Promise((resolve,reject)=>{const transaction=connection.transaction(stores,'readwrite');transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(transaction.error||new Error('本机存储写入失败'));transaction.onerror=()=>{};work(transaction);});}
  const credential=namespace=>'memory-album-device:'+namespace;
  const photoCache=()=>caches.open('memory-album-encrypted-photos');
  const photoUrl=id=>new URL('sealed/'+encodeURIComponent(id)+'.bin',location.href).href;
  let writes=Promise.resolve();
  async function cachePhoto(id,bytes){const cache=await photoCache(),keys=await cache.keys();let size=bytes.byteLength;const older=[];for(const request of keys){if(request.url===photoUrl(id))continue;const response=await cache.match(request);size+=Number(response.headers.get('x-photo-size')||0);older.push(request);}while(size>budget&&older.length){const request=older.shift(),response=await cache.match(request);size-=Number(response.headers.get('x-photo-size')||0);await cache.delete(request);}await cache.put(photoUrl(id),new Response(bytes,{headers:{'Content-Type':'application/octet-stream','x-photo-size':String(bytes.byteLength)}}));}
  return {
    async remembered(namespace){try{const record=await read('state','unlock:'+namespace);if(record?.key)return record.key;}catch{}const value=storage?.getItem(credential(namespace));if(!value)return null;const jwk=JSON.parse(value);if(jwk.kty!=='oct'||jwk.alg!=='A256GCM'||typeof jwk.k!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(jwk.k))throw new Error('本机解锁记录无效');return crypto.subtle.importKey('jwk',jwk,{name:'AES-GCM'},false,['encrypt','decrypt']);},
    remember:async(namespace,key,exportFallback)=>{if(key.extractable||key.algorithm.name!=='AES-GCM')throw new Error('解锁密钥格式无效');try{await change(['state'],tx=>tx.objectStore('state').put({id:'unlock:'+namespace,key}));storage?.removeItem(credential(namespace));}catch(error){if(!storage||!exportFallback)throw error;storage.setItem(credential(namespace),JSON.stringify(await exportFallback()));}},
    forget:async namespace=>{storage?.removeItem(credential(namespace));try{await change(['state'],tx=>tx.objectStore('state').delete('unlock:'+namespace));}catch{}},
    async getPhoto(id){try{return (await read('photos',id))?.bytes||null;}catch{const response=await (await photoCache()).match(photoUrl(id));return response?new Uint8Array(await response.arrayBuffer()):null;}},
    deletePhoto:async id=>{try{await change(['photos','photo-index'],tx=>{tx.objectStore('photos').delete(id);tx.objectStore('photo-index').delete(id);});}catch{await (await photoCache()).delete(photoUrl(id));}},
    putPhoto:async(id,bytes)=>{
      if(bytes.byteLength>budget)return;
      try{await change(['photos','photo-index'],tx=>{
        const index=tx.objectStore('photo-index'),request=index.getAll();request.onsuccess=()=>{
          const entries=request.result.filter(item=>item.id!==id).sort((a,b)=>a.time-b.time);let size=entries.reduce((sum,item)=>sum+item.size,0)+bytes.byteLength;
          while(size>budget&&entries.length){const oldest=entries.shift();size-=oldest.size;index.delete(oldest.id);tx.objectStore('photos').delete(oldest.id);}
          tx.objectStore('photos').put({id,bytes});index.put({id,size:bytes.byteLength,time:Date.now()});
        };
      });}catch{const task=writes.catch(()=>{}).then(()=>cachePhoto(id,bytes));writes=task;await task;}
    }
  };
}
