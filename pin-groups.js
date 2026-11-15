// 根据当前屏幕距离合并相邻地点；选中的地点始终保持独立。
export function groupPins(places,toScreen,{selectedId=null,width=62,height=86}={}){
  const ordered=[...places].sort((a,b)=>a.id.localeCompare(b.id));
  const points=ordered.map(place=>toScreen(place.coordinates));
  const parents=ordered.map((_,i)=>i);
  const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
    if(ordered[i].id===selectedId||ordered[j].id===selectedId)continue;
    if(Math.abs(points[i].x-points[j].x)<width&&Math.abs(points[i].y-points[j].y)<height)parents[root(j)]=root(i);
  }
  const buckets=new Map();
  ordered.forEach((place,i)=>{const key=root(i);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(place);});
  return [...buckets.values()].map(members=>{
    const single=members.length===1;
    const regions=new Set(members.map(place=>place.region.split('·')[0].trim()));
    return {id:single?members[0].id:'group:'+members.map(place=>place.id).join(','),members,
      coordinates:single?members[0].coordinates:[0,1].map(axis=>members.reduce((sum,place)=>sum+place.coordinates[axis],0)/members.length),
      label:single?members[0].name:`${regions.size===1?[...regions][0]:[...regions].every(region=>['浙江','江苏'].includes(region))?'江浙':[...regions].every(region=>['浙江','江苏','广东'].includes(region))?'东南沿海':'回忆'} · ${members.length}处`};
  });
}
