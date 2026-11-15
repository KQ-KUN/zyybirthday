import {pushpinSvg} from './pushpin.js?v=20261115-7';
import {regionLabels} from './region-labels.js?v=20261115-7';
import {createCameraMotion,mixCamera,mixFlight,cameraEase} from './transitions.js?v=20261115-7';
import {geography,land} from './geography.js?v=20261115-7';

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
  const palette=['#edf1e7','#e3eada','#f0eee3','#e8eee1','#e0e9dc'];
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const shapes=document.createElementNS(svg.namespaceURI,'g');svg.append(shapes);
  for(const [collection,kind] of [[land,'land'],[geography,'province']])for(const [index,feature] of collection.features.entries()){
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths(feature.geometry));path.setAttribute('class',kind);if(kind==='province')path.style.fill=palette[index%palette.length];shapes.append(path);
  }
  ground.append(svg);surface.append(ground);container.append(surface);
  let center=project([110,35]),zoom=4,pitch=35,bearing=0,padding={top:0,bottom:0,left:0,right:0};
  let motion;
  const pins=[];
  for(const place of places){
    const point=project(place.coordinates),button=document.createElement('button');button.className='paper-pin';button.setAttribute('aria-label',`打开${place.name}的照片`);
    button.style.left=point[0]+'px';button.style.top=point[1]+'px';
    button.innerHTML=pushpinSvg;const label=document.createElement('span');label.className='pin-label';label.textContent=place.name;button.append(label);

    button.addEventListener('click',event=>{event.stopPropagation();onSelect(place.id);});
    ground.append(button);pins.push({button,point,placeId:place.id});button.dataset.label=`打开${place.name}的照片`;
  }
  function draw(duration=0){
    const scale=2**zoom/8;
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
    for(const {element,point} of labelNodes){element.style.left=(width/2+(point[0]-center[0])*scale)+'px';element.style.top=(height/2+(point[1]-center[1])*scale)+'px';element.style.transform=`translate(-50%,-50%) rotateX(${-pitch}deg)`;const overlap=pins.some(pin=>Math.abs(pin.point[0]-point[0])*scale<60&&Math.abs(pin.point[1]-point[1])*scale<65);element.style.opacity=!overlap&&zoom>=4&&zoom<=7.9?'1':'0';}
    onMove();
  }
  const labelNodes=regionLabels.map(region=>{
    const element=document.createElement('span');element.className='map-region-label';element.textContent=region.name;element.setAttribute('aria-hidden','true');
    ground.append(element);return {element,point:project(region.coordinates)};
  });
  const current=()=>({center:[...center],zoom,pitch,bearing,padding:{...padding}});
  motion=createCameraMotion(current(),camera=>{({center,zoom,pitch,bearing,padding}=camera);draw();});
  const unproject=point=>[(point[0]/4096*360)-180,Math.atan(Math.sinh(Math.PI*(1-2*point[1]/4096)))*180/Math.PI];
  const api={
    isPaper:true,getZoom:()=>zoom,getPitch:()=>pitch,getBearing:()=>bearing,
    getCamera:()=>({center:unproject(center),zoom,pitch,bearing,padding:{...padding}}),
    updateSelection(id,low){for(const {button,placeId} of pins){const active=placeId===id;button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',button.dataset.label);}},
    stop:()=>motion.stop(),isMoving:()=>motion.isMoving()||Boolean(drag),getSource:()=>null,resize:()=>draw(),
    easeTo(options){
      const target=current();if(options.center)target.center=project(options.center);
      if(options.zoom!==undefined)target.zoom=Math.max(2.5,Math.min(8.2,options.zoom));
      if(options.pitch!==undefined)target.pitch=options.pitch;if(options.bearing!==undefined)target.bearing=options.bearing;if(options.padding)target.padding=options.padding;
      motion.to(target,options.duration||0,{easing:options.easing||cameraEase,interpolate:options.flight?mixFlight:mixCamera});
    },
    flyTo(options){api.easeTo({...options,flight:true});},
    fitPlaces(list,options){
      const points=list.map(place=>project(place.coordinates)),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      const target=current();target.padding=options.padding;target.center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
      const width=Math.max(100,surface.clientWidth-target.padding.left-target.padding.right),height=Math.max(120,surface.clientHeight-target.padding.top-target.padding.bottom);
      target.zoom=Math.min(options.maxZoom,Math.log2(8*Math.min(width/Math.max(30,Math.max(...xs)-Math.min(...xs)),height/Math.max(30,Math.max(...ys)-Math.min(...ys)))));
      target.pitch=options.pitch;target.bearing=0;motion.to(target,options.duration||0);
    },
    zoomIn(){api.easeTo({zoom:zoom+.7,duration:300});},zoomOut(){api.easeTo({zoom:zoom-.7,duration:300});},
    remove(){motion.stop();surface.remove();window.removeEventListener('resize',resize);}
  };
  let drag;
  surface.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;motion.stop();drag={x:event.clientX,y:event.clientY,center:[...center]};surface.setPointerCapture(event.pointerId);});
  surface.addEventListener('pointermove',event=>{if(!drag)return;const scale=2**zoom/8;const target=current();target.center=[drag.center[0]-(event.clientX-drag.x)/scale,drag.center[1]-(event.clientY-drag.y)/scale/Math.max(.4,Math.cos(pitch*Math.PI/180))];motion.to(target,0);});
  surface.addEventListener('pointerup',()=>{drag=null;});surface.addEventListener('pointercancel',()=>{drag=null;});
  surface.addEventListener('wheel',event=>{event.preventDefault();api.easeTo({zoom:zoom-Math.sign(event.deltaY)*.3,duration:180});},{passive:false});
  surface.addEventListener('keydown',event=>{
    if(event.key==='+'||event.key==='='){event.preventDefault();api.zoomIn();}if(event.key==='-'){event.preventDefault();api.zoomOut();}
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(direction){event.preventDefault();const scale=2**zoom/8;api.easeTo({center:unproject([center[0]+direction[0]*60/scale,center[1]+direction[1]*60/scale]),duration:180});}
  });
  const resize=()=>draw();window.addEventListener('resize',resize);
  draw();return api;
}

const regions={...geography,features:geography.features.map((feature,index)=>({...feature,properties:{...feature.properties,shade:['#edf1e7','#e3eada','#f0eee3','#e8eee1','#e0e9dc'][index%5]}}))};
export const localStyle={version:8,sources:{land:{type:'geojson',data:land},provinces:{type:'geojson',data:regions}},layers:[
  {id:'sea',type:'background',paint:{'background-color':'#c5dddf'}},
  {id:'land',type:'fill',source:'land',paint:{'fill-color':'#e2e8db'}},
  {id:'province',type:'fill',source:'provinces',paint:{'fill-color':['get','shade'],'fill-opacity':.92}},
  {id:'province-line',type:'line',source:'provinces',paint:{'line-color':'#a4b5a1','line-width':1.1,'line-opacity':.8}}
]};
