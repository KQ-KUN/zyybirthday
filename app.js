import {createLazyPhotos} from './lazy-photos.js?v=20261116-22';
import {createAutoBrowse} from './auto-browse.js?v=20261116-22';
import {layoutPins,applyPinLabel} from './pin-layout.js?v=20261116-22';
import {administrativeLabels} from './administrative-areas.js?v=20261116-22';
import {pushpinSvg} from './pushpin.js?v=20261116-22';
import {regionLabels} from './region-labels.js?v=20261116-22';
import {createImageSwap,crossfade,cameraEase,regionMovement} from './transitions.js?v=20261116-22';
import {createPaperMap,localStyle} from './paper-map.js?v=20261116-22';
import {loadScript} from './network.js?v=20261116-22';
import {createViewHistory} from './view-history.js?v=20261116-22';
import {playBirthdayIntro} from './birthday-intro.js?v=20261116-22';
import {mergeLocalPlaces} from './local-album.js?v=20261116-22';
import {bindLocalUpload,uploadLocations} from './local-upload.js?v=20261116-22';
import {mountMusicPlayer} from './music-player.js?v=20261116-22';
import {musicTracks} from './music-tracks.js?v=20261116-22';

/* 地图位置只用于整理回忆，不用于定位或导航。 */
'use strict';
export function startAlbum() {
  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coverSwap=createImageSwap($('place-cover'),{reduced:reducedMotion,contain:true});
  const viewerSwap=createImageSwap($('viewer-image'),{reduced:reducedMotion,contain:true});

  let album;
  let places = [];
  let allPlaces=[],hiddenIds=new Set(),uploadUI;
  let map = null;
  let mapReady = false;
  let mapLoading = false;
  let selectedId = null;
  let detailTilted=true;
  let navigation=null,applyingHistory=false,dialogStack=[],galleryPlaceIds=[],deferredDialog=null;
  let homeRequested=false;
  const music=mountMusicPlayer({tracks:musicTracks,root:document.querySelector('.header-actions')});

  let activePhotos = [];
  let photoIndex = 0;
  let viewerTrigger = null;
  let cardPhotoIndex=0;
  let suppressPhotoClick=false;
  let mapTimeout;
  let markerFrame = 0;

  let movementEnabled=true;
  let leaderLayer=null;
  const markers = new Map();

  function setStatus(message) { $('live-status').textContent = message; }
  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function validateAlbum(value) {
    if (!record(value) || !Array.isArray(value.places)) throw new Error('相册数据格式不正确');
    const ids = new Set();
    for (const place of value.places) {
      if (!record(place) || typeof place.id !== 'string' || !/^[a-z0-9-]+$/.test(place.id) || ids.has(place.id)) throw new Error('地点编号无效或重复');
      ids.add(place.id);
      if (typeof place.name !== 'string' || typeof place.region !== 'string') throw new Error('地点名称无效');
      const c = place.coordinates;
      if (!Array.isArray(c) || c.length !== 2 || !c.every(Number.isFinite) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 85) throw new Error('地点坐标超出范围');
      if (!Array.isArray(place.photos)) throw new Error('照片列表无效');
      for (const photo of place.photos) {
        if (!record(photo) || typeof photo.src !== 'string' || !/^sealed\/[a-f0-9-]{36}\.bin$/.test(photo.src) || photo.src.includes('..') || typeof photo.alt !== 'string') throw new Error('照片路径或说明无效');
        if(photo.thumbnail && (!record(photo.thumbnail)||typeof photo.thumbnail.src!=='string'||!/^sealed\/[a-f0-9-]{36}\.bin$/.test(photo.thumbnail.src)))throw new Error('缩略图路径无效');
      }
    }
    return value;
  }
  const lazyPhotos=createLazyPhotos({loadPhoto:window.memoryAlbum.loadPhoto,trim:window.memoryAlbum.trimPhotos,root:$('photos-dialog')});
  function imageElement(photo,className){return lazyPhotos.image(photo,className);}
  function clearGrid(){lazyPhotos.clear();$('photo-grid').replaceChildren();}
  const autoBrowse=createAutoBrowse({getPlaces:()=>places,onPlace:(place,index)=>{selectPlace(place.id,{tour:true,photoIndex:index});return cardReady;},onPhoto:index=>{cardPhotoIndex=index;recordView(true);return showCardPhoto();},onState:active=>{$('auto-browse').textContent=active?'暂停浏览':'一键浏览';$('auto-browse').setAttribute('aria-pressed',String(active));document.body.dataset.autoBrowse=String(active);}});
  let cardReady=Promise.resolve(false);
  function writeHash(place, index) {
    const params = new URLSearchParams();
    if (place) params.set('place', place.id);
    if (Number.isInteger(index)) params.set('photo', String(index + 1));
    if(navigation)return;
    history.replaceState(history.state, '', `${location.pathname}${location.search}${params.size ? '#' + params : ''}`);
  }
  function captureView(){
    return {placeId:selectedId,cardIndex:cardPhotoIndex,tilted:detailTilted,dialogs:dialogStack.filter(id=>$(id).open).map(id=>{
      if(id==='photos-dialog')return {id,placeIds:galleryPlaceIds};
      if(id==='viewer'){const photo=activePhotos[photoIndex];return {id,placeIds:[...new Set(activePhotos.map(p=>p.place.id))],index:photoIndex,photoPlaceId:photo?.place.id,photoIndex:photo?.index};}
      return {id};
    })};
  }
  function viewUrl(view){
    const params=new URLSearchParams(),viewer=view.dialogs?.find(dialog=>dialog.id==='viewer');
    if(viewer?.photoPlaceId){params.set('place',viewer.photoPlaceId);params.set('photo',String(viewer.photoIndex+1));}
    else if(view.placeId)params.set('place',view.placeId);
    return `${location.pathname}${location.search}${params.size?'#'+params:''}`;
  }
  function recordView(replace=false){
    if(navigation&&!applyingHistory){if(replace)navigation.replace(captureView());else navigation.push(captureView());}
    document.body.dataset.navigationDepth=String(navigation?.depth||0);
  }
  function restoreView(view){
    autoBrowse.stop();
    applyingHistory=true;
    try{
      const desired=(view.dialogs||[]).filter(dialog=>['viewer','photos-dialog','regions-dialog','letter-dialog','credits-dialog','birthday-intro','upload-dialog','delete-pin-dialog'].includes(dialog.id));
      const leavingPhoto=$('viewer').open&&!desired.some(dialog=>dialog.id==='viewer')?activePhotos[photoIndex]:null;
      const leavingGallery=$('photos-dialog').open&&!desired.some(dialog=>dialog.id==='photos-dialog');
      const leavingCard=selectedId&&!view.placeId;
      for(const id of [...dialogStack].reverse())if(!desired.some(dialog=>dialog.id===id)&&$(id).open)$(id).close();
      const place=places.find(place=>place.id===view.placeId);
      const index=leavingPhoto&&place&&leavingPhoto.place.id===place.id?leavingPhoto.index:view.cardIndex||0;
      if(place){
        if(selectedId!==place.id||$('place-card').hidden)selectPlace(place.id,{history:false,photoIndex:index,tilted:view.tilted!==false});
        else if(cardPhotoIndex!==index){cardPhotoIndex=Math.max(0,Math.min(index,place.photos.length-1));showCardPhoto();}
      }else{
        selectedId=null;cardPhotoIndex=0;coverSwap.cancel();$('place-card').hidden=true;updatePerspectiveControls();
      }
      if(leavingPhoto||leavingGallery||leavingCard){
        detailTilted=false;
        if(mapReady){map.stop();map.easeTo({pitch:0,bearing:0,padding:cameraPadding(),duration:movementEnabled?650:0,easing:cameraEase,essential:true});}
      }
      dialogStack=desired.map(dialog=>dialog.id);
      for(const dialog of desired){
        const list=(dialog.placeIds||[]).map(id=>places.find(place=>place.id===id)).filter(Boolean);
        if(dialog.id==='photos-dialog'){
          if(!$(dialog.id).open||JSON.stringify(galleryPlaceIds)!==JSON.stringify(dialog.placeIds))openGallery(list);
        }else if(dialog.id==='viewer')openViewer(flattenPhotos(list),dialog.index||0);
        else if(dialog.id==='birthday-intro'){if(!$(dialog.id).open)showBirthdayIntro();}
        else {showDialog(dialog.id);if(dialog.id==='credits-dialog')loadCredits();}
      }
      navigation?.replace(captureView());
      document.body.dataset.navigationDepth=String(navigation?.depth||0);
    }finally{applyingHistory=false;if(homeRequested){homeRequested=false;showBirthdayIntro();}if(deferredDialog){const id=deferredDialog;deferredDialog=null;showDialog(id);}}
  }
  function chooseRegion(id){
    const view={placeId:id,cardIndex:0,dialogs:[]};
    if(navigation.depth>1)navigation.backWith(view);
    else{navigation.replace(view);restoreView(view);}
  }
  function showDialog(id) {
    autoBrowse.stop();
    if(navigation?.busy&&!applyingHistory){deferredDialog=id;return;}
    const dialog = $(id);
    if (!dialog.open){dialogStack=dialogStack.filter(other=>$(other).open);dialog.showModal();dialogStack.push(id);recordView();}
  }
  function closeDialog(id) {if(!$(id).open)return;if(navigation?.depth&&!applyingHistory)navigation.back();else $(id).close();}
  function showBirthdayIntro(){
    showDialog('birthday-intro');
    playBirthdayIntro($('birthday-intro'),{album,loadPhoto:window.memoryAlbum.loadPhoto,onOpenPhoto:(photo,list,trigger)=>openViewer(list,list.findIndex(item=>item.id===photo.id),trigger),onFinish:()=>closeDialog('birthday-intro'),onDispose:()=>{
      if(!document.querySelector('dialog[open]'))$('tour-button').focus();
      // 先完整播放开场，再启动较重的地图增强引擎；纸地图始终已经可用。
      if(map?.isPaper)requestAnimationFrame(()=>createMap());
    }});
  }
  window.addEventListener('pagehide',()=>music.dispose(),{once:true});
  async function applyLocalAdditions(additions,id){
    autoBrowse.stop();
    hiddenIds=new Set(await window.memoryAlbum.localStore.hiddenIds());allPlaces=mergeLocalPlaces(window.memoryAlbum.basePlaces,additions);places=allPlaces.filter(place=>!hiddenIds.has(place.id));validateAlbum({...album,places});album.places=places;renderStrip();$('tour-button').disabled=!places.length;uploadUI?.refresh();
    if(map?.isPaper){const camera=map.getCamera();map.remove();map=createPaperMap($('map'),places,selectPlace,updatePerspectiveControls);map.easeTo({...camera,duration:0});updatePerspectiveControls();}
    else if(mapReady){map.getSource('memories')?.setData({type:'FeatureCollection',features:places.map(place=>({type:'Feature',geometry:{type:'Point',coordinates:place.coordinates},properties:{id:place.id}}))});renderMarkers();}
    if(id&&$('upload-dialog').open)chooseRegion(id);
  }

  function renderStrip(){
    $('place-strip').replaceChildren();$('place-summary').textContent=`${places.length} 处回忆`;
    const groups=new Map();
    for(const place of places){const province=place.region.split('·')[0].trim();if(!groups.has(province))groups.set(province,[]);groups.get(province).push(place);}
    for(const [province,list] of groups){
      const section=document.createElement('details'),summary=document.createElement('summary');
      summary.textContent=province;const count=document.createElement('span');count.textContent=String(list.length);summary.append(count);section.append(summary);
      for(const place of list){
        const button=document.createElement('button');button.className='place-tile';button.dataset.id=place.id;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',`${place.name}，${place.photos.length} 张照片`);
        const name=document.createElement('strong');name.textContent=place.name;const count=document.createElement('span');count.textContent=`${place.photos.length} 张`;button.append(name,count);
        button.addEventListener('click',()=>chooseRegion(place.id));section.append(button);
      }
      $('place-strip').append(section);
    }
  }
  function cameraPadding(){
    const sheet=document.querySelector('.album-content').getBoundingClientRect();
    return {top:90,bottom:Math.min(innerHeight-220,innerHeight-sheet.top+20),left:55,right:30};
  }

  function updatePerspectiveControls() {
    if(map?.isPaper)map.updateSelection(selectedId);
    if(map?.isPaper && !map.isMoving()){$('map').removeAttribute('aria-busy');document.body.classList.remove('map-travelling');}
    $('place-photo-view').setAttribute('aria-label','全屏查看当前照片');
    markers.forEach((marker,id) => {
      const element = marker.getElement();
      const active = selectedId === id;
      element.setAttribute('aria-pressed',String(active));
      const place = places.find((p) => p.id === id);
      if(place)element.setAttribute('aria-label',`打开${place.name}的照片`);
    });
  }

  function selectPlace(id, options = {}) {
    const place = places.find((p) => p.id === id);
    if (!place) return;
    if(!options.tour)autoBrowse.stop();
    const hadCard=selectedId&&!$('place-card').hidden;
    if (mapReady) map.stop();
    selectedId = id;
    $('pin-delete').setAttribute('aria-label',`删除${place.name}的地图钉`);
    detailTilted=options.tilted!==false;
    $('place-card').hidden = false;
    $('place-card').setAttribute('aria-busy','true');$('place-card-open').setAttribute('aria-disabled','true');
    cardPhotoIndex=Math.max(0,Math.min(options.photoIndex||0,place.photos.length-1));
    $('place-name').textContent=place.name;$('place-region').textContent=place.region;
    $('place-index').textContent=String(places.indexOf(place)+1).padStart(2,'0');
    $('place-card-open').setAttribute('aria-label',`查看${place.name}的全部照片`);
    cardReady=showCardPhoto();
    document.querySelectorAll('.place-tile').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    updatePerspectiveControls();
    if (mapReady && options.fly !== false) {
      const zoom = options.overview ? 6.2 : Math.max(8.6,map.getZoom());
      const camera={center:place.coordinates,zoom,pitch:options.overview||!detailTilted?0:62,bearing:map.getBearing(),padding:cameraPadding(),...regionMovement({enabled:movementEnabled,reducedMotion})};
      $('map').setAttribute('aria-busy','true');
      // 地区切换只做连续平移，不使用会先拉远、升高的 flyTo 曲线。
      map.easeTo(camera);
      document.body.classList.toggle('map-travelling',movementEnabled);
    }
    if (options.hash !== false) writeHash(place);
    if(options.history!==false)recordView(Boolean(hadCard));
    setStatus(`已选中${place.name}，${place.photos.length} 张照片`);
  }

  function showCardPhoto(){
    const place=places.find(p=>p.id===selectedId);if(!place)return;
    const photo=place.photos[cardPhotoIndex];
    $('place-count').textContent=`${place.photos.length} 张${album.demo?'示例':''}照片`;
    $('card-counter').textContent=photo?`${cardPhotoIndex+1} / ${place.photos.length}`:'0 / 0';
    $('card-prev').disabled=cardPhotoIndex===0;$('card-next').disabled=cardPhotoIndex>=place.photos.length-1;
    $('card-photo-nav').hidden=place.photos.length<2;
    $('place-photo-view').hidden=!photo;
    if(!photo){coverSwap.cancel();$('place-card').removeAttribute('aria-busy');return;}
    $('place-card').setAttribute('aria-busy','true');
    $('card-photo-retry').hidden=true;
    return coverSwap.show(photo,window.memoryAlbum.loadPhoto,()=>{
      $('place-cover').hidden=false;$('place-card').removeAttribute('aria-busy');$('place-card-open').setAttribute('aria-disabled','false');
      const next=place.photos[cardPhotoIndex+1];if(next)window.memoryAlbum.loadPhoto(next).catch(()=>{});
    },(error,{hasPreview}={})=>{if(!hasPreview)$('place-cover').hidden=true;$('place-card').removeAttribute('aria-busy');$('place-card-open').setAttribute('aria-disabled','false');$('card-photo-retry').hidden=false;setStatus(hasPreview?'已显示预览，高清照片可点击重试':'请点击重试照片');});
  }
  function nextCardPhoto(delta){
    autoBrowse.stop();
    const place=places.find(p=>p.id===selectedId),target=cardPhotoIndex+delta;
    if(place&&target>=0&&target<place.photos.length){cardPhotoIndex=target;showCardPhoto();recordView(true);}
  }
  function bindSwipe(element,onSwipe){
    let start=null;
    element.addEventListener('pointerdown',event=>{
      const button=event.target.closest('button');
      if(!event.isPrimary||event.button!==0||(button&&button!==element))return;start={x:event.clientX,y:event.clientY,id:event.pointerId};
      element.setPointerCapture(event.pointerId);
    });
    element.addEventListener('pointerup',event=>{
      if(!start||start.id!==event.pointerId)return;
      const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;
      if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.4){suppressPhotoClick=true;onSwipe(dx<0?1:-1);setTimeout(()=>suppressPhotoClick=false,350);}
    });
    element.addEventListener('pointercancel',()=>{start=null;});
    element.addEventListener('dragstart',event=>event.preventDefault());
  }

  function fitMapBounds(bounds,{padding,maxZoom,...options}){
    // 当前视口已带相册留白，cameraForBounds 的 padding 是额外留白，不能再加一次。
    let camera=map.cameraForBounds(bounds,{padding:0,maxZoom,bearing:options.bearing||0});
    if(!camera){map.jumpTo({padding});camera=map.cameraForBounds(bounds,{padding:0,maxZoom,bearing:options.bearing||0});}
    if(camera)map.easeTo({...camera,...options,padding,easing:cameraEase,essential:true});
  }
  function fitAll(animate=true) {
    if (!places.length || !mapReady) return;
    if(map.isPaper){map.fitPlaces(places,{padding:cameraPadding(true),maxZoom:6.2,pitch:0,duration:animate&&movementEnabled?1400:0});return;}
    const bounds = new maplibregl.LngLatBounds(); places.forEach((p) => bounds.extend(p.coordinates));
    map.stop();
    updatePerspectiveControls();
    fitMapBounds(bounds,{padding:cameraPadding(true),maxZoom:places.length === 1 ? 8 : 6.2,pitch:0,bearing:0,duration:animate&&movementEnabled?1400:0,essential:true});
  }

  function updateLeaders(){
    if(!leaderLayer||!mapReady||map.isPaper)return;
    for(const place of places){
      const marker=markers.get(place.id),line=leaderLayer.querySelector(`[data-place="${place.id}"]`);if(!marker||!line)continue;
      const point=map.project(place.coordinates),offset=marker.getOffset();
      line.setAttribute('x1',point.x);line.setAttribute('y1',point.y);line.setAttribute('x2',point.x+offset.x);line.setAttribute('y2',point.y+offset.y);
    }
  }
  function renderMarkers(){
    if(!mapReady||map.isPaper)return;
    for(const [id,marker] of markers)if(!places.some(place=>place.id===id)){marker.remove();markers.delete(id);leaderLayer?.querySelector(`[data-place="${id}"]`)?.remove();}
    if(!leaderLayer){leaderLayer=document.createElementNS('http://www.w3.org/2000/svg','svg');leaderLayer.classList.add('pin-leaders');leaderLayer.setAttribute('aria-hidden','true');$('map').append(leaderLayer);}
    const padding=cameraPadding(),layout=layoutPins(places,coordinates=>map.project(coordinates),{selectedId,width:innerWidth,height:innerHeight,top:padding.top,bottom:padding.bottom,labelsVisible:map.getZoom()>=5.4});
    for(const place of places){
      if(!markers.has(place.id)){
        const button=document.createElement('button');button.className='map-marker';button.innerHTML=pushpinSvg;button.dataset.place=place.id;
        const label=document.createElement('span');label.className='pin-label';label.textContent=place.name;button.append(label);button.setAttribute('aria-label',`打开${place.name}的照片`);
        button.addEventListener('click',event=>{event.stopPropagation();selectPlace(place.id);});
        markers.set(place.id,new maplibregl.Marker({element:button,anchor:'bottom'}).setLngLat(place.coordinates).addTo(map));
        const line=document.createElementNS(leaderLayer.namespaceURI,'line');line.dataset.place=place.id;leaderLayer.append(line);
      }
      const marker=markers.get(place.id);marker.setOffset(layout.get(place.id).offset);applyPinLabel(marker.getElement(),layout.get(place.id));
    }
    updateLeaders();updatePerspectiveControls();
  }

  function scheduleMarkers() {
    // 保留飞行期间的地图钉，只在镜头停下后调整近邻小钉的屏幕间距。
    if (!mapReady || map.isMoving() || markerFrame) return;
    markerFrame = requestAnimationFrame(() => { markerFrame = 0; if (!map.isMoving()) renderMarkers(); });
  }

  function mapUnavailable() {
    clearTimeout(mapTimeout);
    if(map?.isPaper){$('map-notice').hidden=true;return;}
    if(map){map.remove();map=null;}leaderLayer?.remove();leaderLayer=null;markers.clear();mapReady=false;
    map=createPaperMap($('map'),places,id=>{selectPlace(id);},updatePerspectiveControls);
    mapReady=true;$('map-notice').hidden=true;
    if(selectedId)selectPlace(selectedId,{history:false,photoIndex:cardPhotoIndex,tilted:detailTilted});else fitAll(false);
  }
  async function createMap() {
    if(mapLoading)return;mapLoading=true;
    const paper=map;
    try {
      await loadScript('vendor/maplibre-gl.js?v=20261116-22-map',{timeoutMs:8000});
      if(!window.maplibregl)throw new Error('Map engine unavailable');
      const engine=new maplibregl.Map({container:'map',style:localStyle,minZoom:1.5,maxZoom:12,attributionControl:false,renderWorldCopies:false,maxPitch:68,pixelRatio:Math.min(window.devicePixelRatio||1,1.5),canvasContextAttributes:{antialias:false},...paper.getCamera()});
      engine.dragRotate.disable();engine.touchZoomRotate.disableRotation();
      engine.getCanvas().setAttribute('aria-label','回忆地图，可用方向键平移，使用加减键缩放');
      let ready=false;
      mapTimeout=setTimeout(()=>{if(!ready)engine.remove();},10000);
      engine.on('load',()=>{
        ready=true;clearTimeout(mapTimeout);
        const connect=()=>{
          if(map?.isPaper&&map!==paper){engine.remove();mapLoading=false;createMap();return;}
          // 地图正在移镜时继续使用当前渲染器，完整走完这一段再无缝交接。
          if(paper.isMoving()){requestAnimationFrame(connect);return;}
        // 引擎准备好后接续纸地图当前帧，不再重新飞向默认位置。
        const camera=paper.getCamera();engine.jumpTo(camera);map=engine;mapReady=true;
        $('map-notice').hidden=true;
        const labels=[...regionLabels.map(region=>({...region,level:'province'})),...administrativeLabels].map(region=>{
          const element=document.createElement('span');element.className='map-region-label '+region.level;element.textContent=region.shortName||region.name;element.hidden=true;
          new maplibregl.Marker({element,anchor:'center'}).setLngLat(region.coordinates).addTo(engine);
          element.setAttribute('aria-hidden','true');element.removeAttribute('role');element.removeAttribute('aria-label');element.tabIndex=-1;
          return {element,coordinates:region.coordinates,level:region.level};
        });
        const updateLabels=()=>{
          $('map').dataset.view=engine.getPitch()>1?'tilted':'2d';$('map').dataset.zoom=engine.getZoom().toFixed(2);$('map').dataset.pitch=String(engine.getPitch());
          const points=places.map(place=>engine.project(place.coordinates)),occupied=[];
          for(const label of labels){
            const point=engine.project(label.coordinates);
            const overlap=(label.level!=='province'&&points.some(pin=>Math.abs(pin.x-point.x)<18&&Math.abs(pin.y-point.y)<22))||occupied.some(previous=>Math.abs(previous.x-point.x)<52&&Math.abs(previous.y-point.y)<22);
            const zoom=engine.getZoom();const visible=!overlap&&(label.level==='province'?zoom>=1.5&&zoom<5.4:label.level==='city'?zoom>=5&&zoom<8.3:zoom>=7.2);
            label.element.hidden=!visible;if(visible)occupied.push(point);
          }
        };
        engine.on('move',()=>{updateLabels();updateLeaders();});updateLabels();
        engine.addSource('memories',{type:'geojson',data:{type:'FeatureCollection',features:places.map(place=>({type:'Feature',geometry:{type:'Point',coordinates:place.coordinates},properties:{id:place.id}}))}});
        engine.addLayer({id:'memory-points',type:'circle',source:'memories',paint:{'circle-radius':1,'circle-opacity':0}});
        engine.on('sourcedata',event=>{if(event.sourceId==='memories' && event.isSourceLoaded)scheduleMarkers();});
        engine.on('moveend',()=>{
          $('map').removeAttribute('aria-busy');document.body.classList.remove('map-travelling');
          updatePerspectiveControls();scheduleMarkers();
        });
        engine.on('idle',scheduleMarkers);engine.once('idle',()=>paper.remove());
        if(!selectedId)fitAll(false);
        engine.on('webglcontextlost',mapUnavailable);
        scheduleMarkers();
        };
        connect();
      });
    } catch {map=paper;mapReady=true;}
    finally{mapLoading=false;$('map-notice').hidden=true;}
  }

  function flattenPhotos(list) { return list.flatMap((place) => place.photos.map((photo,index) => ({...photo,place,index}))); }
  function openGallery(place) {
    const list=Array.isArray(place)?place:place?[place]:places;
    galleryPlaceIds=list.map(place=>place.id);
    $('photos-title').textContent=Array.isArray(place)?'此处照片':place?place.name:'全部照片';
    const entries = flattenPhotos(list);
    $('photos-subtitle').textContent = `${entries.length} 张${album.demo ? '示例' : ''}照片`;
    clearGrid();const grid = $('photo-grid');
    entries.forEach((photo,index) => {
      const button = document.createElement('button'); button.className='photo-item'; button.setAttribute('aria-label',`放大：${photo.alt}`);
      button.append(imageElement(photo));
      const caption = document.createElement('span'); caption.textContent=photo.place.name;
      const detail = document.createElement('small'); detail.textContent=photo.place.region; caption.append(detail);button.append(caption);
      button.addEventListener('click',() => openViewer(entries,index,button)); grid.append(button);
    });
    if (!entries.length) { const empty=document.createElement('p');empty.className='empty-message';empty.textContent='这里的照片还在准备中。';grid.append(empty); }
    showDialog('photos-dialog');
  }
  function openViewer(entries,index,trigger) {
    autoBrowse.stop();
    if (!entries.length) return;
    activePhotos=entries; photoIndex=Math.max(0,Math.min(index,entries.length-1));viewerTrigger=trigger || document.activeElement;
    showDialog('viewer');renderViewer();
  }
  function renderViewer() {
    const photo=activePhotos[photoIndex];if(!photo)return;
    recordView(true);
    const requestedIndex=photoIndex;
    $('photo-error').hidden=true;$('photo-retry').hidden=true;$('viewer-stage').setAttribute('aria-busy','true');$('viewer-map').disabled=true;
    $('photo-prev').disabled=photoIndex===0;$('photo-next').disabled=photoIndex===activePhotos.length-1;
    const dots=$('viewer-dots');
    if(activePhotos.length>20)dots.replaceChildren();
    if(dots.childElementCount!==activePhotos.length && activePhotos.length<=20){
      dots.replaceChildren();activePhotos.forEach((entry,index)=>{
        const button=document.createElement('button');button.className='viewer-dot';button.setAttribute('aria-label',`第 ${index+1} 张照片`);
        button.addEventListener('click',()=>{photoIndex=index;renderViewer();});dots.append(button);
      });
    }
    [...dots.children].forEach((button,index)=>button.setAttribute('aria-current',String(index===photoIndex)));
    viewerSwap.show(photo,window.memoryAlbum.loadPhoto,()=>{
      $('viewer-image').hidden=false;$('viewer-stage').removeAttribute('aria-busy');$('viewer-map').disabled=false;
      crossfade($('viewer-copy'),()=>{
        $('viewer-caption').textContent=photo.place.name;$('viewer-note').textContent=photo.caption||photo.place.note||photo.place.region;
      },{reduced:reducedMotion});
      $('viewer-counter').textContent=`${String(requestedIndex+1).padStart(2,'0')} / ${String(activePhotos.length).padStart(2,'0')}`;
      writeHash(photo.place,photo.index);
      const next=activePhotos[requestedIndex+1];if(next)window.memoryAlbum.loadPhoto(next).catch(()=>{});
    },(error,{hasPreview}={})=>{$('viewer-stage').removeAttribute('aria-busy');$('photo-error').textContent=hasPreview?'已显示预览，高清照片可重试':'照片尚未加载，请重试';$('photo-error').hidden=false;$('photo-retry').hidden=false;});
  }
  function nextPhoto(delta) {if(!$('viewer').open)return;const target=photoIndex+delta; if(target>=0 && target<activePhotos.length){photoIndex=target;renderViewer();} }
  async function loadCredits() {
    const list=$('credits-list');if(list.childElementCount)return;
    try {
      const credits=window.memoryAlbum.credits;
      credits.forEach((credit) => {
        const article=document.createElement('article');const title=document.createElement('a');title.textContent=credit.title;
        if(typeof credit.source==='string' && credit.source.startsWith('https://commons.wikimedia.org/')){title.href=credit.source;title.target='_blank';title.rel='noopener';}
        const text=document.createElement('p');text.textContent=`${credit.author} · ${credit.license} · 原图经浏览器缩放显示`;
        article.append(title,text);
        if(typeof credit.licenseUrl==='string' && credit.licenseUrl.startsWith('https://creativecommons.org/')) {const license=document.createElement('a');license.href=credit.licenseUrl;license.target='_blank';license.rel='noopener';license.textContent='许可条款';article.append(license);}
        list.append(article);
      });
    } catch {list.textContent='来源清单暂时无法加载，请稍后重试。';}
  }

  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click',() => closeDialog(button.dataset.close)));
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog.id);});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog(dialog.id);}});
  });
  $('auto-browse').addEventListener('click',()=>{if(autoBrowse.active)autoBrowse.stop();else autoBrowse.start(selectedId);});
  $('map-home').addEventListener('click',()=>{if(navigation.busy)return;autoBrowse.stop();homeRequested=true;navigation.toBase({placeId:null,cardIndex:0,tilted:false,dialogs:[]});});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)autoBrowse.stop();});
  $('forget-device').addEventListener('click',async()=>{await window.memoryAlbum.forgetDevice();location.reload();});
  $('grid-retry').addEventListener('click',()=>lazyPhotos.retry());
  $('card-photo-retry').addEventListener('click',()=>showCardPhoto());
  $('photo-retry').addEventListener('click',()=>renderViewer());
  $('letter-open').addEventListener('click',() => showDialog('letter-dialog'));
  $('upload-open').addEventListener('click',()=>showDialog('upload-dialog'));
  $('pin-delete').addEventListener('click',()=>{const place=places.find(place=>place.id===selectedId);if(place){$('delete-pin-name').textContent=place.name;$('pin-delete-status').textContent='';showDialog('delete-pin-dialog');}});
  $('pin-delete-confirm').addEventListener('click',async()=>{
    const id=selectedId;if(!id)return;$('pin-delete-confirm').disabled=true;
    try{await window.memoryAlbum.localStore.setHidden(id,true);await applyLocalAdditions(await window.memoryAlbum.localStore.load());navigation.toBase({placeId:null,cardIndex:0,tilted:false,dialogs:[]});}
    catch(error){$('pin-delete-status').textContent=error.message||'未能移除地图钉，请重试';}
    finally{$('pin-delete-confirm').disabled=false;}
  });
  $('credits-open').addEventListener('click',() => {showDialog('credits-dialog');loadCredits();});
  $('gallery-open').addEventListener('click',() => {openGallery();});
  $('place-card-open').addEventListener('click',() => {if($('place-card').getAttribute('aria-busy')!=='true')openGallery(places.find((p) => p.id===selectedId));});
  $('place-photo-view').addEventListener('click',()=>{
    if(suppressPhotoClick)return;
    const place=places.find(p=>p.id===selectedId);
    if(place)openViewer(flattenPhotos([place]),cardPhotoIndex,$('place-photo-view'));
  });
  $('card-prev').addEventListener('click',()=>nextCardPhoto(-1));$('card-next').addEventListener('click',()=>nextCardPhoto(1));
  bindSwipe($('place-photo-view'),nextCardPhoto);
  bindSwipe($('viewer-stage'),nextPhoto);
  $('photos-dialog').addEventListener('close',()=>{if(!$('photos-dialog').open)clearGrid();});
  $('place-close').addEventListener('click',()=>{autoBrowse.stop();navigation.back();});
  $('tour-button').addEventListener('click',()=>showDialog('regions-dialog'));
  $('map-motion').addEventListener('click',()=>{movementEnabled=!movementEnabled;map?.stop();$('map-motion').setAttribute('aria-pressed',String(movementEnabled));$('map-motion').setAttribute('aria-label',movementEnabled?'关闭地图移动动画':'开启地图移动动画');$('map-motion').textContent='平滑移动';});
  $('photo-prev').addEventListener('click',()=>nextPhoto(-1));$('photo-next').addEventListener('click',()=>nextPhoto(1));
  $('viewer-image').addEventListener('error',() => {$('viewer-image').hidden=true;$('photo-error').hidden=false;});
  $('viewer').addEventListener('keydown',(event) => {if(event.key==='ArrowRight'){event.preventDefault();nextPhoto(1);}if(event.key==='ArrowLeft'){event.preventDefault();nextPhoto(-1);}});
  $('viewer').addEventListener('close',()=>{if(!$('viewer').open){viewerSwap.cancel();if(viewerTrigger?.isConnected&&viewerTrigger.getClientRects().length)viewerTrigger.focus();}});
  $('viewer-map').addEventListener('click',()=>{const photo=activePhotos[photoIndex];if(photo)navigation.goTo(1,{placeId:photo.place.id,cardIndex:photo.index,dialogs:[]});});
  function initialize() {
    try {
      album=validateAlbum(window.memoryAlbum.album);places=album.places;allPlaces=window.memoryAlbum.allPlaces;hiddenIds=new Set(window.memoryAlbum.hiddenIds);
      $('credits-open').hidden=window.memoryAlbum.credits.length===0;
      document.title='昀的旅行地图';
      $('demo-badge').hidden=!album.demo;document.querySelector('.letter-demo').hidden=!album.demo;
      if(record(album.letter)) {if(typeof album.letter.message==='string')$('letter-message').textContent=album.letter.message;if(typeof album.letter.signature==='string')$('letter-signature').textContent=album.letter.signature;}
      renderStrip();
      uploadUI=bindLocalUpload({store:window.memoryAlbum.localStore,getLocations:()=>uploadLocations(allPlaces,regionLabels,administrativeLabels),getHiddenPlaces:()=>allPlaces.filter(place=>hiddenIds.has(place.id)),onSaved:applyLocalAdditions,onRestore:async id=>{await window.memoryAlbum.localStore.setHidden(id,false);await applyLocalAdditions(await window.memoryAlbum.localStore.load());}});
      if(window.memoryAlbum.localWarning)$('upload-status').textContent=window.memoryAlbum.localWarning;
      if(!allPlaces.length){$('tour-button').disabled=true;$('map-notice').textContent='回忆地点还在准备中';return;}
      $('tour-button').disabled=!places.length;
      const hash=new URLSearchParams(location.hash.slice(1));const place=places.find((p) => p.id===hash.get('place'));
      navigation=createViewHistory({history,initial:{placeId:null,cardIndex:0,dialogs:[]},urlForView:viewUrl,onRestore:restoreView,subscribe:listener=>{window.addEventListener('popstate',listener);return()=>window.removeEventListener('popstate',listener);}});
      document.body.dataset.navigationDepth=String(navigation.depth);
      if(navigation.resumed)restoreView(navigation.current);
      else if(place){selectPlace(place.id,{fly:false,hash:false});const index=Number(hash.get('photo'))-1;if(hash.has('photo') && Number.isInteger(index) && index>=0 && index<place.photos.length)openViewer(flattenPhotos([place]),index);}
      mapUnavailable();
      if(!$('birthday-intro').open)showBirthdayIntro();
    } catch(error) {$('map-notice').textContent=error.message || '相册暂时无法加载，请稍后重试。';$('map-notice').classList.add('is-error');$('tour-button').disabled=true;$('gallery-open').disabled=true;}
  }
  initialize();
  window.addEventListener('resize',()=>{
    if(!mapReady)return;
    const place=places.find(value=>value.id===selectedId);
    if(place)map.easeTo({center:place.coordinates,padding:cameraPadding(),duration:0});else fitAll(false);
  });
}
