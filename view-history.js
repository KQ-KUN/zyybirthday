const KEY='memoryAlbumNavigation';
const copy=value=>JSON.parse(JSON.stringify(value));
function owned(state){
  const entry=state?.[KEY];
  return entry?.version===1&&typeof entry.session==='string'&&Number.isInteger(entry.depth)&&entry.depth>=0&&entry.depth<64&&entry.view&&typeof entry.view==='object'?entry:null;
}

// 只为站内层级增加历史记录；地图主界面不会拦截正常离站。
export function createViewHistory({history,subscribe,initial,onRestore,urlForView,session=crypto.randomUUID()}){
  const existing=owned(history.state);
  if(existing)session=existing.session;
  let depth=existing?.depth||0,current=copy(existing?.view||initial),pending=null;
  const snapshots=new Map([[depth,copy(current)]]);
  const state=view=>({...((history.state&&typeof history.state==='object')?history.state:{}),[KEY]:{version:1,session,depth,view:copy(view)}});
  function replace(view){current=copy(view);snapshots.set(depth,copy(current));history.replaceState(state(current),'',urlForView(current));}
  replace(current);
  const unsubscribe=subscribe(event=>{
    const entry=owned(event.state);if(!entry||entry.session!==session)return;
    const previous=copy(current);depth=entry.depth;current=copy(entry.view);
    if(pending?.depth===depth&&pending.view)replace(pending.view);
    pending=null;snapshots.set(depth,copy(current));onRestore(copy(current),previous);
  });
  function goTo(target,view){
    if(pending||target<0||target>depth)return false;
    if(target===depth){if(view){const previous=copy(current);replace(view);onRestore(copy(current),previous);}return true;}
    pending={depth:target,view:view?copy(view):null};history.go(target-depth);return true;
  }
  return {
    get current(){return copy(current);},get parent(){return snapshots.has(depth-1)?copy(snapshots.get(depth-1)):null;},
    get depth(){return depth;},get busy(){return Boolean(pending);},get resumed(){return Boolean(existing);},
    push(view){if(pending)return false;depth++;current=copy(view);for(const key of snapshots.keys())if(key>depth)snapshots.delete(key);snapshots.set(depth,copy(current));history.pushState(state(current),'',urlForView(current));return true;},
    replace(view){if(pending)return false;replace(view);return true;},
    back:()=>goTo(depth-1),backWith:view=>goTo(depth-1,view),toBase:view=>goTo(0,view),goTo,
    dispose:()=>unsubscribe?.()
  };
}
