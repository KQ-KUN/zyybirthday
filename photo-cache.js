// 只保留近期照片；正在显示的 URL 不回收，离屏照片可重新按需读取。
export function createPhotoCache({load,dispose,isVisible=()=>false,limit=12,concurrency=2,maxBytes=32*1024*1024}) {
  const entries=new Map(),queue=[],retained=new Map();
  let running=0,closed=false;
  function trim(reserve=0) {
    let bytes=[...entries.values()].reduce((sum,item)=>sum+(item.value?.bytes||0),0);
    for(const [id,item] of entries){
      if(entries.size<=Math.max(0,limit-reserve) && bytes<=maxBytes)break;
      if(!item.value || retained.has(id) || isVisible(item.value.url))continue;
      entries.delete(id);bytes-=item.value.bytes||0;dispose(item.value.url);
    }
  }
  function pump(){
    while(!closed && running<concurrency && queue.length){
      const job=queue.shift();
      if(!job.relevant()){entries.delete(job.id);job.reject(new Error('照片已离屏'));continue;}
      running++;
      Promise.resolve().then(()=>load(job.photo)).then(value=>{
        if(closed){dispose(value.url);throw new Error('相册已关闭');}
        job.item.value=value;job.resolve(value.url);
      }).catch(error=>{entries.delete(job.id);job.reject(error);}).finally(()=>{running--;pump();});
    }
  }
  return {
    retain(id){
      retained.set(id,(retained.get(id)||0)+1);let released=false;
      return ()=>{if(released)return;released=true;const count=(retained.get(id)||1)-1;if(count)retained.set(id,count);else retained.delete(id);};
    },
    get(photo,{isRelevant=()=>true}={}){
      if(closed)return Promise.reject(new Error('相册已关闭'));
      const id=photo.id;
      if(entries.has(id)){const item=entries.get(id);entries.delete(id);entries.set(id,item);return item.promise;}
      trim(1);
      const item={value:null};
      item.promise=new Promise((resolve,reject)=>queue.push({id,photo,item,resolve,reject,relevant:isRelevant}));
      entries.set(id,item);pump();return item.promise;
    },
    trim,
    clear(){closed=true;for(const item of entries.values())if(item.value)dispose(item.value.url);entries.clear();for(const job of queue)job.reject(new Error('相册已关闭'));queue.length=0;},
    stats:()=>({entries:entries.size,running,queued:queue.length})
  };
}
