export function mosaicPhotos(places,limit=8){
  limit=Math.max(1,Math.min(12,Math.trunc(limit)||8));
  const photos=(places||[]).flatMap(place=>place.photos||[]);if(photos.length<=limit)return photos;
  if(limit===1)return [photos[0]];
  return Array.from({length:limit},(_,index)=>photos[Math.round(index*(photos.length-1)/(limit-1))]);
}
export function mosaicCells(pixels,width,height,step=8){
  if(pixels.length!==width*height*4||step<2||step>32)throw new Error('字形网格无效');
  const cells=[];
  for(let y=step/2;y<height;y+=step)for(let x=step/2;x<width;x+=step){if(pixels[(Math.floor(y)*width+Math.floor(x))*4+3]>127){const seed=Math.abs(Math.sin(x*12.9898+y*78.233)*43758.5453)%1;cells.push({x:x-step/2,y:y-step/2,startX:seed*width,startY:((seed*7.13)%1)*height});}}
  return cells;
}
export function createPhotoMosaic(canvas,{photos,loadPhoto,reduced=false}){
  const width=320,height=340,step=8,ratio=Math.min(devicePixelRatio||1,1.5);
  canvas.width=width*ratio;canvas.height=height*ratio;
  const mask=document.createElement('canvas');mask.width=width;mask.height=height;
  const glyph=mask.getContext('2d',{willReadFrequently:true}),context=canvas.getContext('2d');
  if(!glyph||!context)return ()=>{};
  glyph.fillStyle='#173d32';glyph.font='900 148px "Microsoft YaHei","PingFang SC",sans-serif';glyph.textAlign='center';glyph.textBaseline='middle';
  for(const [index,char] of [...'生日快乐'].entries())glyph.fillText(char,80+(index%2)*160,88+Math.floor(index/2)*164);
  const cells=mosaicCells(glyph.getImageData(0,0,width,height).data,width,height,step),tiles=[],releases=[];
  let active=true,frame=0,progress=reduced?1:0;
  function draw(){
    if(!active)return;context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);
    context.globalAlpha=.12;context.drawImage(mask,0,0);context.globalAlpha=1;
    const eased=1-(1-progress)**3;
    cells.forEach((cell,index)=>{
      const x=cell.startX+(cell.x-cell.startX)*eased,y=cell.startY+(cell.y-cell.startY)*eased,tile=tiles[index%Math.max(1,tiles.length)];
      if(tile){context.drawImage(tile,x,y,step-0.7,step-0.7);context.fillStyle='#173d3228';context.fillRect(x,y,step-.7,step-.7);}
      else{context.fillStyle=['#315746','#677650','#a18454'][index%3];context.fillRect(x,y,step-.7,step-.7);}
    });
    canvas.dataset.progress=progress===1?'complete':'assembling';
  }
  for(const photo of photos){
    const source=photo.thumbnail||photo;releases.push(loadPhoto.retain(source));
    loadPhoto(source,{isRelevant:()=>active}).then(async url=>{
      if(!active)return;const image=new Image();image.src=url;await image.decode();if(!active)return;
      const tile=document.createElement('canvas');tile.width=tile.height=40;const painter=tile.getContext('2d'),side=Math.min(image.naturalWidth,image.naturalHeight);
      painter.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,40,40);tiles.push(tile);canvas.dataset.photos=String(tiles.length);draw();
    }).catch(()=>{});
  }
  draw();
  if(!reduced){const started=performance.now();const tick=now=>{progress=Math.min(1,(now-started)/1900);draw();if(progress<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);}
  return ()=>{active=false;cancelAnimationFrame(frame);releases.forEach(release=>release());tiles.forEach(tile=>{tile.width=tile.height=1;});};
}
