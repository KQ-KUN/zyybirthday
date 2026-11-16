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
  const intersects=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
  const pinRects=[...result.values()].map(item=>{const x=item.anchor.x+item.offset[0],y=item.anchor.y+item.offset[1];return {left:x-12,right:x+12,top:y-34,bottom:y+2};});
  for(const place of ordered){
    const item=result.get(place.id),w=Math.min(132,place.name?[...place.name].reduce((sum,char)=>sum+(char.charCodeAt(0)<128?6:11),16):60);
    const x=item.anchor.x+item.offset[0],y=item.anchor.y+item.offset[1];
    const candidates=[['left',x-w-18,y-32],['right',x+18,y-32],['top',x-w/2,y-65],['bottom',x-w/2,y+6],['top-left',x-w-14,y-65],['top-right',x+14,y-65],['bottom-left',x-w-14,y+6],['bottom-right',x+14,y+6]];
    let best=null,bestScore=Infinity;
    for(const [index,[side,left,topY]] of candidates.entries()){
      const rect={left:Math.max(8,Math.min(width-w-8,left)),top:Math.max(top+4,Math.min(height-bottom-29,topY))};rect.right=rect.left+w;rect.bottom=rect.top+25;
      const collision=pinRects.reduce((sum,pin)=>sum+intersects(rect,pin),0)+labelRects.reduce((sum,other)=>sum+intersects(rect,{left:other.left-5,right:other.right+5,top:other.top-3,bottom:other.bottom+3}),0);
      const score=collision*1000+Math.abs(rect.left-left)+Math.abs(rect.top-topY)+index*.1;
      if(score<bestScore){bestScore=score;best={rect,side,collision};}
    }
    item.labelRect=best.rect;item.labelSide=best.side;item.labelOffset=[best.rect.left-x+16,best.rect.top-y+40];
    const onScreen=item.anchor.x>=0&&item.anchor.x<=width&&item.anchor.y>=top-30&&item.anchor.y<=height-bottom+30;
    item.showLabel=place.id===selectedId||labelsVisible&&onScreen&&best.collision===0;
    if(item.showLabel)labelRects.push(best.rect);
  }
  return result;
}
export function applyPinLabel(element,layout){
  const label=element.querySelector('.pin-label');if(!label)return;
  element.dataset.labelSide=layout.labelSide;label.style.left=layout.labelOffset[0]+'px';label.style.top=layout.labelOffset[1]+'px';label.style.width=(layout.labelRect.right-layout.labelRect.left)+'px';element.classList.toggle('show-label',layout.showLabel);
}
