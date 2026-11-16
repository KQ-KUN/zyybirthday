import {layoutPins,applyPinLabel} from './pin-layout.js?v=20261116-15';
import {administrativeAreas,administrativeLabels} from './administrative-areas.js?v=20261116-15';
import {pushpinSvg} from './pushpin.js?v=20261116-15';
import {regionLabels} from './region-labels.js?v=20261116-15';
import {createCameraMotion,mixCamera,cameraEase} from './transitions.js?v=20261116-15';
import {geography,land} from './geography.js?v=20261116-15';

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
  const divisionGroups={};
  for(const level of ['city','county']){
    const group=document.createElementNS(svg.namespaceURI,'g');group.classList.add('division-lines');
    for(const feature of administrativeAreas.features.filter(feature=>feature.properties.level===level)){
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths(feature.geometry));path.setAttribute('class',level+'-boundary');group.append(path);
    }
    shapes.append(group);divisionGroups[level]=group;
  }
  ground.append(svg);surface.append(ground);container.append(surface);
  let center=project([110,35]),zoom=4,pitch=0,bearing=0,padding={top:0,bottom:0,left:0,right:0};
  let motion;
  let selectedPin=null;
  const leaders=document.createElementNS(svg.namespaceURI,'svg');leaders.classList.add('pin-leaders');leaders.setAttribute('aria-hidden','true');surface.append(leaders);
  const pins=places.map(place=>{
    const point=project(place.coordinates),button=document.createElement('button');button.className='paper-pin';button.innerHTML=pushpinSvg;button.dataset.place=place.id;
    const label=document.createElement('span');label.className='pin-label';label.textContent=place.name;button.append(label);
    button.dataset.label=`打开${place.name}的照片`;button.setAttribute('aria-label',button.dataset.label);button.addEventListener('click',event=>{event.stopPropagation();onSelect(place.id);});ground.append(button);
    const line=document.createElementNS(svg.namespaceURI,'line');leaders.append(line);
    return {button,point,placeId:place.id,offset:[0,0],line};
  });
  function tiltedPoint(x,y){
    const radians=pitch*Math.PI/180,factor=1600/(1600-y*Math.sin(radians));
    return {x:surface.clientWidth/2+((padding.left-padding.right)/2+x)*factor,y:surface.clientHeight/2+((padding.top-padding.bottom)/2+y*Math.cos(radians))*factor,factor};
  }
  function screenPoint(coordinates){const point=project(coordinates),scale=2**zoom/8;return tiltedPoint((point[0]-center[0])*scale,(point[1]-center[1])*scale);}
  function refreshPins(){
    const layout=layoutPins(places,screenPoint,{selectedId:selectedPin,width:surface.clientWidth,height:surface.clientHeight,top:padding.top,bottom:padding.bottom,labelsVisible:zoom>=5.4});
    for(const pin of pins){pin.offset=layout.get(pin.placeId).offset;applyPinLabel(pin.button,layout.get(pin.placeId));}
  }
  function draw(duration=0){
    container.dataset.view=pitch>1?'tilted':'2d';container.dataset.zoom=zoom.toFixed(2);container.dataset.pitch=String(pitch);
    if(!motion?.isMoving()&&!drag)refreshPins();
    divisionGroups.city.style.display=zoom>=5?'':'none';divisionGroups.county.style.display=zoom>=7.2?'':'none';
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
    for(const {button,point,offset,line} of pins){
      const x=(point[0]-center[0])*scale,y=(point[1]-center[1])*scale;
      const origin=tiltedPoint(x,y),dx=offset[0]/origin.factor,dy=offset[1]/(origin.factor*Math.max(.3,Math.cos(pitch*Math.PI/180)));
      button.style.left=(width/2+x+dx)+'px';button.style.top=(height/2+y+dy)+'px';button.style.transform=`translate(-50%,-100%) rotateX(${-pitch}deg)`;button.style.transformOrigin='50% 100%';
      const end=tiltedPoint(x+dx,y+dy);
      line.setAttribute('x1',origin.x);line.setAttribute('y1',origin.y);line.setAttribute('x2',end.x);line.setAttribute('y2',end.y);
    }
    const occupied=[];
    for(const {element,point,level} of labelNodes){
      const x=width/2+(point[0]-center[0])*scale,y=height/2+(point[1]-center[1])*scale;
      element.style.left=x+'px';element.style.top=y+'px';element.style.transform=`translate(-50%,-50%) rotateX(${-pitch}deg)`;
      const eligible=level==='province'?zoom>=1.5&&zoom<5.4:level==='city'?zoom>=5&&zoom<8.3:zoom>=7.2;
      const overlap=occupied.some(p=>Math.abs(p.x-x)<52&&Math.abs(p.y-y)<22);
      element.hidden=!(eligible&&!overlap);if(eligible&&!overlap)occupied.push({x,y});
    }
    onMove();
  }
  const labelNodes=[...regionLabels.map(region=>({...region,level:'province'})),...administrativeLabels].map(region=>{
    const element=document.createElement('span');element.className='map-region-label '+region.level;element.textContent=region.shortName||region.name;element.setAttribute('aria-hidden','true');
    ground.append(element);return {element,point:project(region.coordinates),level:region.level};
  });
  const current=()=>({center:[...center],zoom,pitch,bearing,padding:{...padding}});
  motion=createCameraMotion(current(),camera=>{({center,zoom,pitch,bearing,padding}=camera);draw();});
  const unproject=point=>[(point[0]/4096*360)-180,Math.atan(Math.sinh(Math.PI*(1-2*point[1]/4096)))*180/Math.PI];
  const api={
    isPaper:true,getZoom:()=>zoom,getPitch:()=>pitch,getBearing:()=>bearing,
    getCamera:()=>({center:unproject(center),zoom,pitch,bearing,padding:{...padding}}),
    updateSelection(id){selectedPin=id;for(const {button,placeId} of pins){const active=placeId===id;button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',button.dataset.label);}},
    stop:()=>motion.stop(),isMoving:()=>motion.isMoving()||Boolean(drag),getSource:()=>null,resize:()=>draw(),
    easeTo(options){
      const target=current();if(options.center)target.center=project(options.center);
      if(options.zoom!==undefined)target.zoom=Math.max(1.5,Math.min(12,options.zoom));
      if(options.pitch!==undefined)target.pitch=options.pitch;if(options.bearing!==undefined)target.bearing=options.bearing;if(options.padding)target.padding=options.padding;
      motion.to(target,options.duration||0,{easing:options.easing||cameraEase,interpolate:mixCamera});
    },
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
  surface.addEventListener('pointerup',()=>{drag=null;draw();});surface.addEventListener('pointercancel',()=>{drag=null;draw();});
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
export const localStyle={version:8,sources:{land:{type:'geojson',data:land},provinces:{type:'geojson',data:regions},divisions:{type:'geojson',data:administrativeAreas}},layers:[
  {id:'sea',type:'background',paint:{'background-color':'#c5dddf'}},
  {id:'land',type:'fill',source:'land',paint:{'fill-color':'#e2e8db'}},
  {id:'province',type:'fill',source:'provinces',paint:{'fill-color':['get','shade'],'fill-opacity':.92}},
  {id:'city-line',type:'line',source:'divisions',minzoom:5,filter:['==',['get','level'],'city'],paint:{'line-color':'#a3b29a','line-width':.9,'line-opacity':.9}},
  {id:'county-line',type:'line',source:'divisions',minzoom:7.2,filter:['==',['get','level'],'county'],paint:{'line-color':'#a7b69c','line-width':.75,'line-opacity':.85}},
  {id:'province-line',type:'line',source:'provinces',paint:{'line-color':'#879e83','line-width':1.25,'line-opacity':.95}}
]};
