import {createPaperMap,localStyle} from './paper-map.js?v=20261115-4';
import {loadScript} from './network.js?v=20261115-4';

/* 地图位置只用于整理回忆，不用于定位或导航。 */
'use strict';
export function startAlbum() {
  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pinSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 17 5-5 4 4 3-3 5 5"/></svg>';
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
  let touchStart = null;
  let mapTimeout;
  let markerFrame = 0;
  let photoPerspective = false;
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
  function imageElement(photo, className) {
    const img = document.createElement('img');
    window.memoryAlbum.loadPhoto(photo).then(url=>{if(img.isConnected)img.src=url;}).catch(()=>{img.alt='照片暂时无法加载';}); img.alt = photo.alt; img.loading = 'lazy'; img.decoding = 'async';
    if (className) img.className = className;
    img.addEventListener('error', () => { img.alt = '照片暂时无法加载'; img.classList.add('image-unavailable'); });
    return img;
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
        if (selectedId === place.id && mapReady && map.getZoom() >= 7) setPhotoPerspective(place.id);
        else selectPlace(place.id);
      });
      $('place-strip').append(button);
    });
    if (places.length > 4) { $('place-strip').style.gridAutoColumns = '86px'; $('place-strip').style.overflowX = 'auto'; }
  }

  function cameraPadding(overview = false) {
    const mobile = window.innerWidth <= 700;
    if (!mobile) return {top:120,bottom:80,left:420,right:80};
    // 小屏幕也要留出可见地图，避免把相机目标挤出画面。
    const top = overview ? 140 : 110;
    const bottom = Math.min(overview ? 310 : 375, Math.max(130, window.innerHeight - top - 160));
    return {top,bottom,left:overview ? 48 : 25,right:overview ? 48 : 65};
  }

  function updatePerspectiveControls() {
    const near = mapReady && map.getZoom() >= 7;
    $('place-photo-view').setAttribute('aria-pressed',String(photoPerspective));
    $('place-photo-view').setAttribute('aria-label',photoPerspective ? '恢复斜俯视角' : '切换到低角度视角');
    markers.forEach((marker,id) => {
      const element = marker.getElement();
      element.classList.toggle('has-photo',near && element.querySelector('.pin-photo') !== null);
      const active = selectedId === id;
      element.setAttribute('aria-pressed',String(active));
      const place = places.find((p) => p.id === id);
      element.setAttribute('aria-label',active && near ? `${photoPerspective ? '恢复' : '切换'}${place.name}的${photoPerspective ? '斜俯' : '低角度'}视角` : `打开${place.name}的照片`);
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
    map.easeTo({center:place.coordinates,zoom:Math.max(7.5,map.getZoom()),pitch:low ? 68 : 46,padding:cameraPadding(),duration:reducedMotion ? 0 : 900,essential:false});
    setStatus(low ? '已切换低角度视角，再次点击照片可恢复' : '已恢复斜俯视角');
  }

  function selectPlace(id, options = {}) {
    const place = places.find((p) => p.id === id);
    if (!place) return;
    if (mapReady) map.stop();
    selectedId = id;
    photoPerspective = false;
    $('place-card').hidden = false;
    $('place-name').textContent = place.name;
    $('place-region').textContent = place.region;
    $('place-count').textContent = `${place.photos.length} 张${album.demo ? '示例' : ''}照片`;
    $('place-card-open').setAttribute('aria-label', `查看${place.name}的 ${place.photos.length} 张照片`);
    $('place-cover').hidden = !place.photos[0];
    $('place-photo-view').hidden = !place.photos[0];
    if (place.photos[0]) {const id=place.id;window.memoryAlbum.loadPhoto(place.photos[0]).then(url=>{if(selectedId===id)$('place-cover').src=url;}).catch(()=>{});}
    document.querySelectorAll('.place-tile').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    updatePerspectiveControls();
    if (mapReady && options.fly !== false) {
      const zoom = options.overview ? 6.2 : 7.5;
      const zoomSteps = Math.abs(map.getZoom() - zoom);
      // 跨城市用较平缓的飞行路径，近距离重定位避免先拉远再拉近。
      const camera = {center:place.coordinates,zoom,pitch:$('map-pitch').getAttribute('aria-pressed') === 'true' ? 46 : 0,bearing:map.getBearing(),padding:cameraPadding(),duration:reducedMotion ? 0 : Math.min(3000,Math.max(1100,zoomSteps * 360)),essential:false};
      if (zoomSteps > 2) map.flyTo({...camera,curve:1.08});
      else map.easeTo(camera);
    }
    if (options.hash !== false) writeHash(place);
    setStatus(`已选中${place.name}，${place.photos.length} 张照片`);
  }

  function fitAll() {
    if (!places.length || !mapReady) return;
    if(map.isPaper){map.fitPlaces(places,{padding:cameraPadding(true),maxZoom:6.2,pitch:35,duration:reducedMotion?0:1000});return;}
    const bounds = new maplibregl.LngLatBounds(); places.forEach((p) => bounds.extend(p.coordinates));
    map.stop();
    photoPerspective = false;
    updatePerspectiveControls();
    map.fitBounds(bounds,{padding:cameraPadding(true),maxZoom:places.length === 1 ? 8 : 6.2,pitch:$('map-pitch').getAttribute('aria-pressed') === 'true' ? 35 : 0,bearing:0,duration:reducedMotion ? 0 : 1400});
  }

  function renderMarkers() {
    if (!mapReady || map.isPaper || !map.getSource('memories')) return;
    const seen = new Set();
    for (const feature of map.querySourceFeatures('memories')) {
      if (feature.properties.cluster) continue;
      const id = feature.properties.id;
      const place = places.find((p) => p.id === id);
      if (!place || seen.has(id)) continue;
      seen.add(id);
      if (!markers.has(id)) {
        const button = document.createElement('button'); button.className = 'map-marker';
        button.innerHTML = `<span class="pin-head">${pinSvg}</span>`;
        if (place.photos[0]) { const photo = imageElement(place.photos[0],'pin-photo'); photo.alt = ''; button.append(photo); }
        const label = document.createElement('span'); label.className = 'pin-label'; label.textContent = place.name; button.append(label);
        button.setAttribute('aria-label', `打开${place.name}的照片`); button.setAttribute('aria-pressed', String(selectedId === id));
        button.addEventListener('click', (event) => {
          event.stopPropagation(); stopTour();
          if (selectedId === id && map.getZoom() >= 7) setPhotoPerspective(id);
          else selectPlace(id);
        });
        markers.set(id,new maplibregl.Marker({element:button,anchor:'bottom',offset:[0,16]}).setLngLat(place.coordinates).addTo(map));
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
    if(map){map.remove();map=null;}
    map=createPaperMap($('map'),places,id=>{if(selectedId===id && map.getZoom()>=7)setPhotoPerspective(id);else selectPlace(id);},updatePerspectiveControls);
    mapReady=true;$('map-notice').hidden=true;
    if(selectedId)selectPlace(selectedId);else fitAll();
  }
  async function createMap() {
    if(mapLoading)return;mapLoading=true;
    $('map-notice').hidden=false;$('map-notice').classList.remove('is-error');
    $('map-notice').textContent='正在展开地图';
    const paper=map;let engineReady=false;
    try {
      await loadScript('vendor/maplibre-gl.js?v=20261115-4',{timeoutMs:8000});
      if(!window.maplibregl)throw new Error('Map engine unavailable');
      map = new maplibregl.Map({container:'map',style:localStyle,center:[117.5,34],zoom:4.5,minZoom:2,maxZoom:8.5,pitch:35,bearing:0,attributionControl:false,renderWorldCopies:false,maxPitch:68,pixelRatio:Math.min(window.devicePixelRatio || 1,1.5),canvasContextAttributes:{antialias:false},maxTileCacheSize:192});
      map.getCanvas().setAttribute('aria-label','回忆地图，可用方向键平移，使用加减键缩放');
      mapTimeout=setTimeout(()=>{if(!engineReady){if(map && !map.isPaper)map.remove();map=paper;mapReady=true;$('map-notice').hidden=true;}},10000);
      map.on('load',() => {
        engineReady=true;if(paper?.isPaper)paper.remove();mapReady = true; clearTimeout(mapTimeout);
        $('map-notice').hidden = true; document.body.classList.remove('map-failed');
        map.addSource('memories',{type:'geojson',data:{type:'FeatureCollection',features:places.map((p) => ({type:'Feature',geometry:{type:'Point',coordinates:p.coordinates},properties:{id:p.id}}))},cluster:false});
        map.addLayer({id:'memory-clusters',type:'circle',source:'memories',filter:['has','point_count'],paint:{'circle-color':'#fcfaf4','circle-radius':22,'circle-stroke-color':'#62745b','circle-stroke-width':1.5}});
        /* 离线底图不加载远程字库。 */
        map.addLayer({id:'memory-points',type:'circle',source:'memories',filter:['!',['has','point_count']],paint:{'circle-radius':1,'circle-opacity':0}});
        map.on('click','memory-clusters',async (event) => {
          const feature=event.features[0];
          try { const zoom=await map.getSource('memories').getClusterExpansionZoom(feature.properties.cluster_id); map.easeTo({center:feature.geometry.coordinates,zoom,duration:reducedMotion ? 0 : 700}); } catch { setStatus('请放大地图查看地点'); }
        });
        map.on('mouseenter','memory-clusters',() => {map.getCanvas().style.cursor='pointer';});
        map.on('mouseleave','memory-clusters',() => {map.getCanvas().style.cursor='';});
        map.on('sourcedata',(event) => {if(event.sourceId==='memories' && event.isSourceLoaded)scheduleMarkers();});
        map.on('moveend',() => {
          photoPerspective = Boolean(selectedId) && map.getPitch() >= 60;
          const threeD = map.getPitch() > 1;
          $('map-pitch').setAttribute('aria-pressed',String(threeD));
          $('map-pitch').setAttribute('aria-label',threeD ? '切换到俯视地图' : '切换到三维视角');
          $('map-pitch').textContent = threeD ? '3D' : '2D';
          scheduleMarkers();
        });map.on('idle',scheduleMarkers);
        if (selectedId) selectPlace(selectedId,{hash:false}); else fitAll();
      });
      map.on('error',() => { if(!mapReady && !map.isStyleLoaded())setStatus('正在等待地图资源'); });
      map.on('webglcontextlost',mapUnavailable);
      window.addEventListener('resize',() => {if(map)map.resize();});
    } catch {if(paper?.isPaper){map=paper;mapReady=true;$('map-notice').hidden=true;}else mapUnavailable();} finally {mapLoading=false;}
  }

  function flattenPhotos(list) { return list.flatMap((place) => place.photos.map((photo,index) => ({...photo,place,index}))); }
  function openGallery(place) {
    const list = place ? [place] : places;
    $('photos-title').textContent = place ? place.name : '全部照片';
    const entries = flattenPhotos(list);
    $('photos-subtitle').textContent = `${entries.length} 张${album.demo ? '示例' : ''}照片`;
    const grid = $('photo-grid'); grid.replaceChildren();
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
    const photo=activePhotos[photoIndex]; if(!photo)return;
    $('photo-error').hidden=true;$('viewer-image').hidden=false;
    window.memoryAlbum.loadPhoto(photo).then(url=>{if(activePhotos[photoIndex]?.id===photo.id)$('viewer-image').src=url;}).catch(()=>{$('photo-error').hidden=false;});$('viewer-image').alt=photo.alt;
    $('viewer-caption').textContent=photo.place.name;
    $('viewer-note').textContent=photo.caption || photo.place.note || photo.place.region;
    $('viewer-counter').textContent=`${String(photoIndex+1).padStart(2,'0')} / ${String(activePhotos.length).padStart(2,'0')}`;
    $('photo-prev').disabled=photoIndex===0; $('photo-next').disabled=photoIndex===activePhotos.length-1;
    $('viewer-dots').replaceChildren();
    if (activePhotos.length<=20) activePhotos.forEach((entry,index) => {
      const button=document.createElement('button');button.className='viewer-dot';button.setAttribute('aria-label',`第 ${index+1} 张照片`);button.setAttribute('aria-current',String(index===photoIndex));
      button.addEventListener('click',() => {photoIndex=index;renderViewer();});$('viewer-dots').append(button);
    });
    writeHash(photo.place,photo.index);
  }
  function nextPhoto(delta) { const target=photoIndex+delta; if(target>=0 && target<activePhotos.length){photoIndex=target;renderViewer();} }
  function stopTour() {
    touring=false;$('tour-button').querySelector('span').textContent='按顺序看';$('tour-progress').hidden=true;
  }
  function tourStep() {
    if(!places.length)return;
    if(!touring){touring=true;tourIndex=0;}else{tourIndex++;}
    if(tourIndex>=places.length){stopTour();$('place-card').hidden=true;fitAll();return;}
    const place=places[tourIndex]; selectPlace(place.id,{overview:true});
    $('tour-progress').hidden=false;$('tour-progress').textContent=`${tourIndex+1} / ${places.length}`;
    $('tour-button').querySelector('span').textContent=tourIndex===places.length-1?'看完，回到地图':'下一站';
    // 不自动飞走，给长辈充足的照片阅读时间。
    openGallery(place);
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
  $('place-card-open').addEventListener('click',() => openGallery(places.find((p) => p.id===selectedId)));
  $('place-photo-view').addEventListener('click',() => setPhotoPerspective(selectedId));
  $('place-close').addEventListener('click',() => {$('place-card').hidden=true;});
  $('tour-button').addEventListener('click',tourStep);
  $('map-home').addEventListener('click',() => {stopTour();selectedId=null;$('place-card').hidden=true;writeHash(null);document.querySelectorAll('.place-tile,.map-marker').forEach((b)=>b.setAttribute('aria-pressed','false'));fitAll();});
  $('map-pitch').addEventListener('click',() => {if(!mapReady)return;const on=$('map-pitch').getAttribute('aria-pressed')!=='true';map.stop();photoPerspective=false;updatePerspectiveControls();$('map-pitch').setAttribute('aria-pressed',String(on));$('map-pitch').setAttribute('aria-label',on?'切换到俯视地图':'切换到三维视角');$('map-pitch').textContent=on?'3D':'2D';map.easeTo({pitch:on?46:0,duration:reducedMotion?0:650,essential:false});});
  $('map-zoom-in').addEventListener('click',() => {if(mapReady)map.zoomIn({duration:reducedMotion?0:300});});
  $('map-zoom-out').addEventListener('click',() => {if(mapReady)map.zoomOut({duration:reducedMotion?0:300});});
  $('photo-prev').addEventListener('click',()=>nextPhoto(-1));$('photo-next').addEventListener('click',()=>nextPhoto(1));
  $('viewer-image').addEventListener('error',() => {$('viewer-image').hidden=true;$('photo-error').hidden=false;});
  $('viewer').addEventListener('keydown',(event) => {if(event.key==='ArrowRight'){event.preventDefault();nextPhoto(1);}if(event.key==='ArrowLeft'){event.preventDefault();nextPhoto(-1);}});
  $('viewer').addEventListener('close',() => {const photo=activePhotos[photoIndex];if(photo)writeHash(photo.place);if(viewerTrigger && viewerTrigger.isConnected)viewerTrigger.focus();});
  $('viewer-map').addEventListener('click',() => {const photo=activePhotos[photoIndex];closeDialog('viewer');closeDialog('photos-dialog');if(photo){stopTour();selectPlace(photo.place.id);$('place-card-open').focus();}});
  $('viewer-stage').addEventListener('touchstart',(event) => {touchStart=event.touches.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;},{passive:true});
  $('viewer-stage').addEventListener('touchend',(event) => {if(!touchStart || !event.changedTouches.length)return;const dx=event.changedTouches[0].clientX-touchStart.x,dy=event.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.5)nextPhoto(dx<0?1:-1);touchStart=null;},{passive:true});
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
    if(place)map.easeTo({center:place.coordinates,padding:cameraPadding(),duration:0});else fitAll();
  });
}
