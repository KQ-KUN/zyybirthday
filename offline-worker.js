/* Safari 音频会请求字节范围，缓存的完整文件也须返回规范的 206 响应。 */
self.albumRangeResponse=async function(response,range){
  const blob=await response.blob(),size=blob.size,match=/^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid=()=>new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
  if(!match||(!match[1]&&!match[2]))return invalid();
  let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  let end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size)return invalid();
  const headers=new Headers(response.headers);headers.set('Content-Range',`bytes ${start}-${end}/${size}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
  return new Response(blob.slice(start,end+1),{status:206,headers});
};
self.installAlbumWorker=function({version,shell}){
  const prefix='memory-album-shell:'+self.registration.scope+':',name=prefix+version,index=new URL('index.html?v='+version,self.registration.scope).href;
  self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(name);for(const path of shell)await cache.add(new Request(new URL(path,self.registration.scope),{cache:'reload'}));await self.skipWaiting();})()));
  self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
  self.addEventListener('fetch',event=>{
    const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.endsWith('service-worker.js'))return;
    event.respondWith((async()=>{
      const offline=await caches.open('memory-album-offline-v1'),shellCache=await caches.open(name);
      if(request.mode==='navigate'){
        const cached=await shellCache.match(index),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1400);
        try{const response=await fetch(request,{signal:controller.signal});if(!response.ok)throw new Error('offline');await shellCache.put(index,response.clone());return response;}catch(error){if(cached)return cached;throw error;}finally{clearTimeout(timer);}
      }
      const cached=await offline.match(url.href)||await shellCache.match(url.href);
      if(cached)return request.headers.has('range')?self.albumRangeResponse(cached,request.headers.get('range')):cached;
      const response=await fetch(request);
      if(response.status===200&&!request.headers.has('range')&&/\.(?:js|css|svg|png|webmanifest|mp3)$/.test(url.pathname))await shellCache.put(url.href,response.clone());
      return response;
    })());
  });
};
