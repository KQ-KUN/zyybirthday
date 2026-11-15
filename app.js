import {pushpinSvg} from './pushpin.js?v=20261115-7';
import {regionLabels} from './region-labels.js?v=20261115-7';
import {createImageSwap,crossfade,cameraEase,regionMovement} from './transitions.js?v=20261115-7';
import {createPaperMap,localStyle} from './paper-map.js?v=20261115-7';
import {loadScript} from './network.js?v=20261115-7';

/* 地图位置只用于整理回忆，不用于定位或导航。 */
'use strict';
export function startAlbum() {
  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coverSwap=createImageSwap($('place-cover'),{reduced:reducedMotion,contain:true});
  const viewerSwap=createImageSwap($('viewer-image'),{reduced:reducedMotion,contain:true});

  let album;
  let places = [];
  let map = null;
  let mapReady = false;
  let mapLoading = false;
  let selectedId = null;
  let touring = false;
  let tourIndex = 0;
  let activePhotos = [];
  let photoIndex = 0;
  let viewerTrigger = null;
  let cardPhotoIndex=0;
  let suppressPhotoClick=false;
  let mapTimeout;
  let markerFrame = 0;
  let photoPerspective = false;
  let movementEnabled=true;
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
      }
    }
    return value;
  }
  const lazyImages=new WeakMap();
  const imageObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      const img=entry.target,state=lazyImages.get(img);if(!state)continue;
      state.visible=entry.isIntersecting;
      if(!state.visible){state.token++;img.removeAttribute('src');continue;}
      const token=++state.token;
      const release=window.memoryAlbum.loadPhoto.retain(state.photo);
      window.memoryAlbum.loadPhoto(state.photo,{isRelevant:()=>state.visible&&img.isConnected}).then(url=>{
        if(state.visible&&state.token===token&&img.isConnected)img.src=url;
      }).catch(()=>{if(state.visible&&state.token===token)img.alt='照片暂时无法加载';}).finally(release);
    }
    window.memoryAlbum.trimPhotos();
  },{rootMargin:'100px'});
  function imageElement(photo,className){
    const img=document.createElement('img');img.alt=photo.alt;img.decoding='async';
    if(className)img.className=className;
    lazyImages.set(img,{photo,visible:false,token:0});imageObserver.observe(img);
    return img;
  }
  function clearGrid(){
    $('photo-grid').querySelectorAll('img').forEach(img=>{const state=lazyImages.get(img);if(state){state.visible=false;state.token++;}imageObserver.unobserve(img);img.removeAttribute('src');});
    $('photo-grid').replaceChildren();window.memoryAlbum.trimPhotos();
  }
  function writeHash(place, index) {
    const params = new URLSearchParams();
    if (place) params.set('place', place.id);
    if (Number.isInteger(index)) params.set('photo', String(index + 1));
    history.replaceState(null, '', `${location.pathname}${location.search}${params.size ? '#' + params : ''}`);
  }
  function showDialog(id) {
    const dialog = $(id);
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog(id) { if ($(id).open) $(id).close(); }

  function renderStrip() {
    $('place-strip').replaceChildren();
    $('place-summary').textContent = album.demo ? `${places.length} 处示例地点` : `${places.length} 处回忆`;
    places.forEach((place) => {
      const button = document.createElement('button');
      button.className = 'place-tile'; button.dataset.id = place.id; button.dataset.count = String(place.photos.length);
      button.setAttribute('aria-label', `${place.name}，${place.photos.length} 张${album.demo ? '示例' : ''}照片`);
      button.setAttribute('aria-pressed', 'false');
      if (place.photos[0]) { const img = imageElement(place.photos[0]); img.alt = ''; button.append(img); }
      const name = document.createElement('strong'); name.textContent = place.name; button.append(name);
      button.addEventListener('click', () => {
        stopTour();
        selectPlace(place.id);
      });
      $('place-strip').append(button);
    });
    if (places.length > 4) { $('place-strip').style.gridAutoColumns = '86px'; $('place-strip').style.overflowX = 'auto'; }
  }

  function cameraPadding(overview = false) {
    if(window.innerWidth>=560 && window.innerHeight<=500)return {top:40,bottom:30,left:285,right:85};
    if(window.innerWidth>700)return {top:65,bottom:50,left:405,right:85};
    const sheet=document.querySelector('.album-content').getBoundingClientRect();
    return {top:155,bottom:Math.min(window.innerHeight-230,window.innerHeight-sheet.top+36),left:45,right:100};
  }

  function updatePerspectiveControls() {
    if(map?.isPaper)map.updateSelection(selectedId,photoPerspective);
    if(map?.isPaper && !map.isMoving()){$('map').removeAttribute('aria-busy');document.body.classList.remove('map-travelling');}
    const near = mapReady && map.getZoom() >= 7;
    $('place-photo-view').setAttribute('aria-pressed',String(photoPerspective));
    $('place-photo-view').setAttribute('aria-label',photoPerspective?'恢复斜俯视角':'切换到低角度视角');
    markers.forEach((marker,id) => {
      const element = marker.getElement();
      element.classList.toggle('has-photo',near && element.querySelector('.pin-photo') !== null);
      const active = selectedId === id;
      element.setAttribute('aria-pressed',String(active));
      const place = places.find((p) => p.id === id);
      element.setAttribute('aria-label',`打开${place.name}的照片`);
    });
  }

  function setPhotoPerspective(id) {
    const place = places.find((p) => p.id === id);
    if (!place) return;
    if (!mapReady) { openGallery(place); return; }
    if (selectedId !== id) selectPlace(id,{fly:false});
    const low = !photoPerspective;
    map.stop();
    photoPerspective = low;
    $('map-pitch').setAttribute('aria-pressed','true');
    $('map-pitch').setAttribute('aria-label','切换到俯视地图');
    $('map-pitch').textContent = '3D';
    updatePerspectiveControls();
    // 保持地点与当前方位，单独改变观察角度；再次点击可反向过渡。
    map.easeTo({center:place.coordinates,zoom:Math.max(7.5,map.getZoom()),pitch:low ? 68 : 46,padding:cameraPadding(),duration:movementEnabled?750:0,essential:true});
    setStatus(low ? '已切换低角度视角，再次点击照片可恢复' : '已恢复斜俯视角');
  }

  function selectPlace(id, options = {}) {
    const place = places.find((p) => p.id === id);
    if (!place) return;
    if (mapReady) map.stop();
    selectedId = id;
    photoPerspective = false;
    $('place-card').hidden = false;
    $('place-card').setAttribute('aria-busy','true');$('place-card-open').setAttribute('aria-disabled','true');
    cardPhotoIndex=0;
    $('place-name').textContent=place.name;$('place-region').textContent=place.region;
    $('place-index').textContent=String(places.indexOf(place)+1).padStart(2,'0');
    $('place-card-open').setAttribute('aria-label',`查看${place.name}的全部照片`);
    showCardPhoto();
    document.querySelectorAll('.place-tile').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    updatePerspectiveControls();
    if (mapReady && options.fly !== false) {
      const zoom = options.overview ? 6.2 : 7.5;
      const camera={center:place.coordinates,zoom,pitch:$('map-pitch').getAttribute('aria-pressed')==='true'?46:0,bearing:map.getBearing(),padding:cameraPadding(),...regionMovement({enabled:movementEnabled,reducedMotion})};
      $('map').setAttribute('aria-busy','true');
      if(reducedMotion)map.easeTo(camera);else map.flyTo({...camera,curve:1.3});
      document.body.classList.toggle('map-travelling',movementEnabled);
    }
    if (options.hash !== false) writeHash(place);
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
    coverSwap.show(photo,window.memoryAlbum.loadPhoto,()=>{
      $('place-cover').hidden=false;$('place-card').removeAttribute('aria-busy');$('place-card-open').setAttribute('aria-disabled','false');
      const next=place.photos[cardPhotoIndex+1];if(next)window.memoryAlbum.loadPhoto(next).catch(()=>{});
    },()=>{$('place-cover').hidden=true;$('place-card').removeAttribute('aria-busy');$('place-card-open').setAttribute('aria-disabled','false');setStatus('照片暂时无法加载，请点击大头钉重试');});
  }
  function nextCardPhoto(delta){
    const place=places.find(p=>p.id===selectedId),target=cardPhotoIndex+delta;
    if(place&&target>=0&&target<place.photos.length){cardPhotoIndex=target;showCardPhoto();}
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

  function fitAll(animate=true) {
    if (!places.length || !mapReady) return;
    if(map.isPaper){map.fitPlaces(places,{padding:cameraPadding(true),maxZoom:6.2,pitch:35,duration:animate&&movementEnabled?1400:0});return;}
    const bounds = new maplibregl.LngLatBounds(); places.forEach((p) => bounds.extend(p.coordinates));
    map.stop();
    photoPerspective = false;
    updatePerspectiveControls();
    map.fitBounds(bounds,{padding:cameraPadding(true),maxZoom:places.length === 1 ? 8 : 6.2,pitch:$('map-pitch').getAttribute('aria-pressed') === 'true' ? 35 : 0,bearing:0,duration:animate&&movementEnabled?1400:0,essential:true});
  }

  function renderMarkers() {
    if (!mapReady || map.isPaper) return;
    const seen = new Set();
    for(const place of places){
      const id=place.id;
      seen.add(id);
      if (!markers.has(id)) {
        const button = document.createElement('button'); button.className = 'map-marker';
        button.innerHTML = pushpinSvg;
        const label = document.createElement('span'); label.className = 'pin-label'; label.textContent = place.name; button.append(label);
        button.setAttribute('aria-label', `打开${place.name}的照片`); button.setAttribute('aria-pressed', String(selectedId === id));
        button.addEventListener('click', (event) => {
          event.stopPropagation(); stopTour();
          selectPlace(id);
        });
        markers.set(id,new maplibregl.Marker({element:button,anchor:'bottom',offset:[0,0]}).setLngLat(place.coordinates).addTo(map));
      }
    }
    markers.forEach((marker,id) => { if (!seen.has(id)) { marker.remove(); markers.delete(id); } });
    updatePerspectiveControls();
  }

  function scheduleMarkers() {
    // 保留飞行期间的地图钉，只在镜头停下后处理聚合与 DOM。
    if (!mapReady || map.isMoving() || markerFrame) return;
    markerFrame = requestAnimationFrame(() => { markerFrame = 0; if (!map.isMoving()) renderMarkers(); });
  }

  function mapUnavailable() {
    clearTimeout(mapTimeout);
    if(map?.isPaper){$('map-notice').hidden=true;return;}
    if(map){map.remove();map=null;}mapReady=false;
    map=createPaperMap($('map'),places,id=>{stopTour();selectPlace(id);},updatePerspectiveControls);
    mapReady=true;$('map-notice').hidden=true;
    if(selectedId)selectPlace(selectedId);else fitAll(false);
  }
  async function createMap() {
    if(mapLoading)return;mapLoading=true;
    const paper=map;
    try {
      await loadScript('vendor/maplibre-gl.js?v=20261115-7',{timeoutMs:8000});
      if(!window.maplibregl)throw new Error('Map engine unavailable');
      const engine=new maplibregl.Map({container:'map',style:localStyle,minZoom:2,maxZoom:8.5,attributionControl:false,renderWorldCopies:false,maxPitch:68,pixelRatio:Math.min(window.devicePixelRatio||1,1.5),canvasContextAttributes:{antialias:false},...paper.getCamera()});
      engine.getCanvas().setAttribute('aria-label','回忆地图，可用方向键平移，使用加减键缩放');
      let ready=false;
      mapTimeout=setTimeout(()=>{if(!ready)engine.remove();},10000);
      engine.on('load',()=>{
        ready=true;clearTimeout(mapTimeout);
        const connect=()=>{
          // 地图正在移镜时继续使用当前渲染器，完整走完这一段再无缝交接。
          if(paper.isMoving()){requestAnimationFrame(connect);return;}
        // 引擎准备好后接续纸地图当前帧，不再重新飞向默认位置。
        const camera=paper.getCamera();engine.jumpTo(camera);map=engine;mapReady=true;
        $('map-notice').hidden=true;
        const labels=regionLabels.map(region=>{
          const element=document.createElement('span');element.className='map-region-label';element.textContent=region.name;
          new maplibregl.Marker({element,anchor:'center'}).setLngLat(region.coordinates).addTo(engine);
          element.setAttribute('aria-hidden','true');element.removeAttribute('role');element.removeAttribute('aria-label');element.tabIndex=-1;
          return {element,coordinates:region.coordinates};
        });
        const updateLabels=()=>{
          const points=places.map(place=>engine.project(place.coordinates));
          for(const label of labels){const point=engine.project(label.coordinates);const overlap=points.some(pin=>Math.abs(pin.x-point.x)<60&&Math.abs(pin.y-point.y)<65);label.element.style.opacity=!overlap&&engine.getZoom()>=4&&engine.getZoom()<8?'1':'0';}
        };
        engine.on('move',updateLabels);updateLabels();
        engine.addSource('memories',{type:'geojson',data:{type:'FeatureCollection',features:places.map(place=>({type:'Feature',geometry:{type:'Point',coordinates:place.coordinates},properties:{id:place.id}}))}});
        engine.addLayer({id:'memory-points',type:'circle',source:'memories',paint:{'circle-radius':1,'circle-opacity':0}});
        engine.on('sourcedata',event=>{if(event.sourceId==='memories' && event.isSourceLoaded)scheduleMarkers();});
        engine.on('moveend',()=>{
          $('map').removeAttribute('aria-busy');document.body.classList.remove('map-travelling');
          photoPerspective=Boolean(selectedId)&&engine.getPitch()>=60;
          const tilted=engine.getPitch()>1;
          $('map-pitch').setAttribute('aria-pressed',String(tilted));
          $('map-pitch').setAttribute('aria-label',tilted?'切换到俯视地图':'切换到三维视角');
          $('map-pitch').textContent=tilted?'3D':'2D';
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
    const list = place ? [place] : places;
    $('photos-title').textContent = place ? place.name : '全部照片';
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
    if (!entries.length) return;
    activePhotos=entries; photoIndex=Math.max(0,Math.min(index,entries.length-1));viewerTrigger=trigger || document.activeElement;
    showDialog('viewer');renderViewer();
  }
  function renderViewer() {
    const photo=activePhotos[photoIndex];if(!photo)return;
    const requestedIndex=photoIndex;
    $('photo-error').hidden=true;$('viewer-stage').setAttribute('aria-busy','true');$('viewer-map').disabled=true;
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
    },()=>{$('viewer-stage').removeAttribute('aria-busy');$('photo-error').hidden=false;});
  }
  function nextPhoto(delta) { const target=photoIndex+delta; if(target>=0 && target<activePhotos.length){photoIndex=target;renderViewer();} }
  function stopTour() {
    touring=false;$('tour-button').querySelector('span').textContent='按地点浏览';$('tour-progress').hidden=true;
  }
  function tourStep() {
    if(!places.length)return;
    if(!touring){touring=true;tourIndex=0;}else{tourIndex++;}
    if(tourIndex>=places.length){stopTour();$('place-card').hidden=true;fitAll();return;}
    const place=places[tourIndex]; selectPlace(place.id,{overview:true});
    $('tour-progress').hidden=false;$('tour-progress').textContent=`${tourIndex+1} / ${places.length}`;
    $('tour-button').querySelector('span').textContent=tourIndex===places.length-1?'返回全图':'下一站';
    // 地图导览保留完整移镜，照片由地点卡片打开，避免弹窗遮住地图。
  }
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
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click',(event) => {if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)dialog.close();}}));
  $('letter-open').addEventListener('click',() => showDialog('letter-dialog'));
  $('credits-open').addEventListener('click',() => {showDialog('credits-dialog');loadCredits();});
  $('gallery-open').addEventListener('click',() => {stopTour();openGallery();});
  $('place-card-open').addEventListener('click',() => {if($('place-card').getAttribute('aria-busy')!=='true')openGallery(places.find((p) => p.id===selectedId));});
  $('place-photo-view').addEventListener('click',()=>{if(!suppressPhotoClick)setPhotoPerspective(selectedId);});
  $('card-expand').addEventListener('click',()=>{const place=places.find(p=>p.id===selectedId);if(place)openViewer(flattenPhotos([place]),cardPhotoIndex,$('card-expand'));});
  $('card-prev').addEventListener('click',()=>nextCardPhoto(-1));$('card-next').addEventListener('click',()=>nextCardPhoto(1));
  bindSwipe($('place-photo-view'),nextCardPhoto);
  bindSwipe($('viewer-stage'),nextPhoto);
  $('photos-dialog').addEventListener('close',clearGrid);
  $('place-close').addEventListener('click',() => {coverSwap.cancel();$('place-card').hidden=true;const place=places.find(p=>p.id===selectedId);if(mapReady&&place)map.easeTo({center:place.coordinates,padding:cameraPadding(),duration:movementEnabled?400:0,essential:true});});
  $('tour-button').addEventListener('click',tourStep);
  $('map-home').addEventListener('click',() => {stopTour();selectedId=null;coverSwap.cancel();$('place-card').hidden=true;writeHash(null);document.querySelectorAll('.place-tile,.map-marker').forEach((b)=>b.setAttribute('aria-pressed','false'));fitAll();});
  $('map-motion').addEventListener('click',()=>{movementEnabled=!movementEnabled;map?.stop();$('map-motion').setAttribute('aria-pressed',String(movementEnabled));$('map-motion').setAttribute('aria-label',movementEnabled?'关闭地图移动动画':'开启地图移动动画');$('map-motion').textContent=movementEnabled?'平滑':'静止';});
  $('map-pitch').addEventListener('click',() => {if(!mapReady)return;const on=$('map-pitch').getAttribute('aria-pressed')!=='true';map.stop();photoPerspective=false;updatePerspectiveControls();$('map-pitch').setAttribute('aria-pressed',String(on));$('map-pitch').setAttribute('aria-label',on?'切换到俯视地图':'切换到三维视角');$('map-pitch').textContent=on?'3D':'2D';map.easeTo({pitch:on?46:0,duration:movementEnabled?650:0,essential:true});});
  $('map-zoom-in').addEventListener('click',() => {if(mapReady)map.zoomIn({duration:reducedMotion?0:300});});
  $('map-zoom-out').addEventListener('click',() => {if(mapReady)map.zoomOut({duration:reducedMotion?0:300});});
  $('photo-prev').addEventListener('click',()=>nextPhoto(-1));$('photo-next').addEventListener('click',()=>nextPhoto(1));
  $('viewer-image').addEventListener('error',() => {$('viewer-image').hidden=true;$('photo-error').hidden=false;});
  $('viewer').addEventListener('keydown',(event) => {if(event.key==='ArrowRight'){event.preventDefault();nextPhoto(1);}if(event.key==='ArrowLeft'){event.preventDefault();nextPhoto(-1);}});
  $('viewer').addEventListener('close',() => {viewerSwap.cancel();const photo=activePhotos[photoIndex];if(photo)writeHash(photo.place);if(viewerTrigger && viewerTrigger.isConnected)viewerTrigger.focus();});
  $('viewer-map').addEventListener('click',() => {const photo=activePhotos[photoIndex];closeDialog('viewer');closeDialog('photos-dialog');if(photo){stopTour();selectPlace(photo.place.id);$('place-card-open').focus();}});
  function initialize() {
    try {
      album=validateAlbum(window.memoryAlbum.album);places=album.places;
      document.title=typeof album.title==='string'?album.title:'给妈妈的地图相册';
      $('demo-badge').hidden=!album.demo;document.querySelector('.letter-demo').hidden=!album.demo;
      if(record(album.letter)) {if(typeof album.letter.message==='string')$('letter-message').textContent=album.letter.message;if(typeof album.letter.signature==='string')$('letter-signature').textContent=album.letter.signature;}
      renderStrip();
      if(!places.length){$('tour-button').disabled=true;$('map-notice').textContent='回忆地点还在准备中';return;}
      const hash=new URLSearchParams(location.hash.slice(1));const place=places.find((p) => p.id===hash.get('place'));
      if(place){selectPlace(place.id,{fly:false,hash:false});const index=Number(hash.get('photo'))-1;if(hash.has('photo') && Number.isInteger(index) && index>=0 && index<place.photos.length)openViewer(flattenPhotos([place]),index);}
      mapUnavailable();
      createMap();
    } catch(error) {$('map-notice').textContent=error.message || '相册暂时无法加载，请稍后重试。';$('map-notice').classList.add('is-error');$('tour-button').disabled=true;$('gallery-open').disabled=true;}
  }
  initialize();
  window.addEventListener('resize',()=>{
    if(!mapReady)return;
    const place=places.find(value=>value.id===selectedId);
    if(place)map.easeTo({center:place.coordinates,padding:cameraPadding(),duration:0});else fitAll(false);
  });
}
