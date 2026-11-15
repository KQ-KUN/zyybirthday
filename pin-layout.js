// 只移动屏幕上的标记，不修改地点坐标，也不合并不同地点。
export function layoutPins(places,toScreen,{selectedId=null,width=375,height=812,top=80,bottom=80,spacing=25,maxOffset=96,labelsVisible=false}={}){
  const ordered=[...places].sort((a,b)=>(a.id===selectedId?-1:b.id===selectedId?1:a.id.localeCompare(b.id)));
  const occupied=[],result=new Map();
  for(const place of ordered){
    const anchor=toScreen(place.coordinates);let offset=[0,0];
    const onScreen=anchor.x>-20&&anchor.x<width+20&&anchor.y>top-30&&anchor.y<height-bottom+30;
    if(onScreen){
      let best=null,bestScore=Infinity;
      for(let radius=0;radius<=maxOffset;radius+=8){
        const count=radius?Math.ceil(2*Math.PI*radius/12):1;
        for(let i=0;i<count;i++){
          const angle=i/count*Math.PI*2,dx=Math.round(Math.cos(angle)*radius),dy=Math.round(Math.sin(angle)*radius);
          const x=anchor.x+dx,y=anchor.y+dy;
          if(x<16||x>width-16||y<top+24||y>height-bottom-12)continue;
          const overlap=occupied.reduce((sum,p)=>sum+Math.max(0,spacing-Math.hypot(p.x-x,p.y-y)),0);
          const score=overlap*1000+radius;
          if(score<bestScore){bestScore=score;best=[dx,dy];}
        }
        if(bestScore===radius)break;
      }
      if(best)offset=best;
      occupied.push({x:anchor.x+offset[0],y:anchor.y+offset[1]});
    }
    result.set(place.id,{offset,anchor});
  }
  const labelRects=[];
  for(const place of ordered){
    const item=result.get(place.id),w=Math.min(110,place.name?place.name.length*10+12:60);
    const right=item.anchor.x+item.offset[0]-14,topY=item.anchor.y+item.offset[1]-32;
    const rect={left:right-w,right,top:topY,bottom:topY+21};
    const overlap=labelRects.some(other=>rect.left<other.right+5&&rect.right>other.left-5&&rect.top<other.bottom+3&&rect.bottom>other.top-3);
    item.showLabel=place.id===selectedId||labelsVisible&&!overlap;
    if(item.showLabel)labelRects.push(rect);
  }
  return result;
}
