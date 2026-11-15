import {geography,land} from './geography.js?v=20261115-4';

export function project([longitude,latitude]) {
  const radians=Math.max(-85,Math.min(85,latitude))*Math.PI/180;
  return [(longitude+180)/360*4096,(1-Math.log(Math.tan(Math.PI/4+radians/2))/Math.PI)/2*4096];
}
function paths(geometry) {
  const rings=geometry.type==='Polygon'?geometry.coordinates:geometry.type==='MultiPolygon'?geometry.coordinates.flat():[];
  return rings.map(ring=>ring.map((point,i)=>(i?'L':'M')+project(point).map(n=>n.toFixed(2)).join(',')).join('')+'Z').join('');
}

// 使用同一份真实地理数据。地图引擎尚未到达或 WebGL 不可用时仍可操作。
export function createPaperMap(container,places,onSelect,onMove) {
  const surface=document.createElement('div');surface.className='paper-map';surface.tabIndex=0;
  surface.setAttribute('role','region');surface.setAttribute('aria-label','回忆地图，可拖动和缩放');
  const ground=document.createElement('div');ground.className='paper-ground';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const shapes=document.createElementNS(svg.namespaceURI,'g');svg.append(shapes);
  for(const [collection,kind] of [[land,'land'],[geography,'province']])for(const feature of collection.features){
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths(feature.geometry));path.setAttribute('class',kind);shapes.append(path);
  }
  ground.append(svg);surface.append(ground);container.append(surface);
  let center=project([110,35]),zoom=4,pitch=35,bearing=0,padding={top:0,bottom:0,left:0,right:0};
  const pins=[];
  for(const place of places){
    const point=project(place.coordinates),button=document.createElement('button');button.className='paper-pin';button.setAttribute('aria-label',`打开${place.name}的照片`);
    button.style.left=point[0]+'px';button.style.top=point[1]+'px';
    const label=document.createElement('span');label.textContent=place.name;button.append(label);
    if(place.photos[0])window.memoryAlbum.loadPhoto(place.photos[0]).then(url=>{const img=document.createElement('img');img.src=url;img.alt='';button.prepend(img);}).catch(()=>{});
    button.addEventListener('click',event=>{event.stopPropagation();onSelect(place.id);});
    ground.append(button);pins.push({button,point});
  }
  function draw(duration=0){
    const scale=2**zoom/16;
    const width=surface.clientWidth*2,height=surface.clientHeight*2;
    ground.style.width=width+'px';ground.style.height=height+'px';svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    ground.style.left=(surface.clientWidth/2+(padding.left-padding.right)/2-width/2)+'px';
    ground.style.top=(surface.clientHeight/2+(padding.top-padding.bottom)/2-height/2)+'px';
    ground.style.transitionDuration=duration+'ms';
    ground.style.transform=`rotateX(${pitch}deg) rotateZ(${-bearing}deg)`;
    // 变换 SVG 向量坐标，避免放大整张位图造成模糊和过大的手机纹理。
    shapes.style.transitionDuration=duration+'ms';
    shapes.style.transform=`translate(${width/2}px,${height/2}px) scale(${scale}) translate(${-center[0]}px,${-center[1]}px)`;
    for(const {button,point} of pins){button.style.left=(width/2+(point[0]-center[0])*scale)+'px';button.style.top=(height/2+(point[1]-center[1])*scale)+'px';button.style.transitionDuration=duration+'ms';button.style.transform=`translate(-50%,-100%) rotateZ(${bearing}deg) rotateX(${-pitch}deg)`;}
    onMove();
  }
  const api={
    isPaper:true,getZoom:()=>zoom,getPitch:()=>pitch,getBearing:()=>bearing,
    stop(){},isMoving:()=>false,getSource:()=>null,resize:()=>draw(),
    easeTo(options){if(options.center)center=project(options.center);if(options.zoom!==undefined)zoom=Math.max(2.5,Math.min(8.2,options.zoom));if(options.pitch!==undefined)pitch=options.pitch;if(options.bearing!==undefined)bearing=options.bearing;if(options.padding)padding=options.padding;draw(options.duration||0);},
    flyTo(options){api.easeTo(options);},
    fitPlaces(list,options){
      const points=list.map(place=>project(place.coordinates)),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      padding=options.padding;center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
      const width=Math.max(100,surface.clientWidth-padding.left-padding.right),height=Math.max(120,surface.clientHeight-padding.top-padding.bottom);
      zoom=Math.min(options.maxZoom,Math.log2(16*Math.min(width/Math.max(30,Math.max(...xs)-Math.min(...xs)),height/Math.max(30,Math.max(...ys)-Math.min(...ys)))));
      pitch=options.pitch;bearing=0;draw(options.duration);
    },
    zoomIn(){api.easeTo({zoom:zoom+.7,duration:300});},zoomOut(){api.easeTo({zoom:zoom-.7,duration:300});},
    remove(){surface.remove();window.removeEventListener('resize',resize);}
  };
  let drag;
  surface.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;drag={x:event.clientX,y:event.clientY,center:[...center]};surface.setPointerCapture(event.pointerId);});
  surface.addEventListener('pointermove',event=>{if(!drag)return;const scale=2**zoom/16;center=[drag.center[0]-(event.clientX-drag.x)/scale,drag.center[1]-(event.clientY-drag.y)/scale/Math.max(.4,Math.cos(pitch*Math.PI/180))];draw();});
  surface.addEventListener('pointerup',()=>{drag=null;});surface.addEventListener('pointercancel',()=>{drag=null;});
  surface.addEventListener('wheel',event=>{event.preventDefault();api.easeTo({zoom:zoom-Math.sign(event.deltaY)*.3,duration:180});},{passive:false});
  surface.addEventListener('keydown',event=>{if(event.key==='+'||event.key==='='){event.preventDefault();api.zoomIn();}if(event.key==='-'){event.preventDefault();api.zoomOut();}});
  const resize=()=>draw();window.addEventListener('resize',resize);
  draw();return api;
}

export const localStyle={version:8,sources:{land:{type:'geojson',data:land},provinces:{type:'geojson',data:geography}},layers:[
  {id:'sea',type:'background',paint:{'background-color':'#b8d0ca'}},
  {id:'land',type:'fill',source:'land',paint:{'fill-color':'#e8e5d7'}},
  {id:'province',type:'fill',source:'provinces',paint:{'fill-color':'#f3f0e5','fill-opacity':.92}},
  {id:'province-line',type:'line',source:'provinces',paint:{'line-color':'#b9bea9','line-width':.8,'line-opacity':.8}}
]};
