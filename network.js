// 总超时覆盖响应正文停滞，避免解锁一直处于等待状态。
export async function downloadBytes(url,{timeoutMs=30000,onProgress=()=>{},fetchImpl=fetch,maxBytes=100*1024*1024,signal,cache='default'}={}) {
  const controller=new AbortController();
  const abort=()=>controller.abort();if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(new Error('相册下载超时，请检查网络后重试。'));},timeoutMs);
  });
  const request=(async()=>{
    const response=await fetchImpl(url,{signal:controller.signal,credentials:'omit',cache});
    if(!response.ok)throw new Error('相册下载失败，请检查网络后重试。');
    const total=Number(response.headers.get('content-length'))||0;
    if(total>maxBytes)throw new Error('相册文件过大。');
    if(!response.body?.getReader){const value=new Uint8Array(await response.arrayBuffer());if(value.length>maxBytes)throw new Error('相册文件过大。');return value;}
    const reader=response.body.getReader(),chunks=[];
    let received=0;
    try {
      while(true){
        const {done,value}=await reader.read();if(done)break;
        received+=value.length;
        if(received>maxBytes)throw new Error('相册文件过大。');
        chunks.push(value);onProgress(received,total);
      }
      const bytes=new Uint8Array(received);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      return bytes;
    } finally {reader.releaseLock();}
  })();
  try{return await Promise.race([request,timeout]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}
}

const scripts=new Map();
export function loadScript(url,{timeoutMs=12000}={}) {
  if(scripts.has(url))return scripts.get(url);
  const promise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    let timer;
    const finish=(failure)=>{
      clearTimeout(timer);script.onload=null;script.onerror=null;
      if(failure){script.remove();scripts.delete(url);reject(new Error('地图引擎暂时无法加载。'));}
      else resolve();
    };
    script.src=url;script.async=true;script.onload=()=>finish(false);script.onerror=()=>finish(true);
    timer=setTimeout(()=>finish(true),timeoutMs);document.head.append(script);
  });
  scripts.set(url,promise);return promise;
}

export async function downloadJSON(url,options){return JSON.parse(new TextDecoder().decode(await downloadBytes(url,options)));}
