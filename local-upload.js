import {cityLocations} from './location-index.js?v=20261117-30';
export function uploadLocations(places,regions){
  return [
    ...places.map(place=>({id:place.id,name:place.name,region:place.region,coordinates:place.coordinates,targetId:place.id,group:'已有地点'})),
    ...regions.map((region,index)=>({id:'province-'+index,name:region.shortName||region.name,region:region.shortName||region.name,coordinates:region.coordinates,group:'省份'})),
    ...cityLocations
  ];
}
async function prepareImage(file,name){
  if(!file.size||file.size>30*1024*1024)throw new Error('每张照片请控制在 30 MB 以内');
  const url=URL.createObjectURL(file),image=new Image();image.src=url;
  try{
    try{await image.decode();}catch{throw new Error('这张照片无法读取，请转换为 JPG、PNG 或 WebP 后重试');}
    if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>60000000)throw new Error('照片尺寸过大，请先缩小图片');
    async function resize(limit){
      const ratio=Math.min(1,limit/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      const context=canvas.getContext('2d');if(!context)throw new Error('浏览器无法处理照片');context.fillStyle='#fffdf6';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',limit===480?.8:.86));if(!blob)throw new Error('照片压缩失败');
      const result={id:crypto.randomUUID(),bytes:new Uint8Array(await blob.arrayBuffer()),width:canvas.width,height:canvas.height};canvas.width=canvas.height=1;return result;
    }
    const full=await resize(2000),thumb=await resize(480);
    const entry=item=>({id:item.id,src:`sealed/${item.id}.bin`,width:item.width,height:item.height,local:true});
    return {photo:{...entry(full),alt:name,thumbnail:entry(thumb)},images:[full,thumb]};
  }finally{image.removeAttribute('src');URL.revokeObjectURL(url);}
}
export function searchLocations(locations,query){
  const normalize=value=>value.normalize('NFKC').toLowerCase().replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市|[\s·-]/gu,'');
  const q=normalize(query.trim());if(!q)return [];
  return locations.map((item,index)=>{const name=normalize(item.name),region=normalize(item.region);return {item,index,score:name===q?0:name.startsWith(q)?1:name.includes(q)?2:q.length>=3&&region.includes(q)?3:99};}).filter(entry=>entry.score<99).sort((a,b)=>a.score-b.score||a.index-b.index).slice(0,10).map(entry=>entry.item);
}
export function bindLocalUpload({store,getLocations,getHiddenPlaces=()=>[],onSaved,onRestore=async()=>{}}){
  const $=id=>document.getElementById(id),form=$('upload-form'),status=$('upload-status'),search=$('upload-location'),results=$('location-results');
  let busy=false,locations=[],selected=null,matches=[],active=-1;
  function controls(disabled){busy=disabled;form.querySelectorAll('input,button').forEach(element=>element.disabled=disabled);$('backup-export').disabled=disabled;$('backup-import').disabled=disabled;form.setAttribute('aria-busy',String(disabled));}
  function errorMessage(error){return error?.name==='QuotaExceededError'?'手机空间不足，照片尚未保存。请先导出备份。':error.message||'保存失败，请重试';}
  function hideResults(){results.hidden=true;search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');active=-1;}
  function pick(item){selected=item;search.value=item.region.includes(item.name)?item.region:item.region+' · '+item.name;search.focus();hideResults();}
  function showResults(){
    matches=searchLocations(locations,search.value);results.replaceChildren();active=-1;
    if(!search.value.trim()){hideResults();return;}
    for(const [index,item] of matches.entries()){
      const button=document.createElement('button');button.type='button';button.id='location-result-'+index;button.setAttribute('role','option');button.setAttribute('aria-selected','false');
      const name=document.createElement('strong');name.textContent=item.name;const region=document.createElement('span');region.textContent=item.region;button.append(name,region);
      // 保持输入框焦点，避免触摸结果时先失焦收起列表，导致点击丢失。
      button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>pick(item));results.append(button);
    }
    if(!matches.length){const empty=document.createElement('p');empty.textContent='未找到地点，可尝试所在城市或省份';results.append(empty);}
    results.hidden=false;search.setAttribute('aria-expanded','true');
  }
  search.addEventListener('input',()=>{selected=null;showResults();});search.addEventListener('focus',showResults);
  search.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hideResults();return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(results.hidden)showResults();if(!matches.length)return;active=(active+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length;[...results.children].forEach((element,index)=>element.setAttribute('aria-selected',String(index===active)));search.setAttribute('aria-activedescendant','location-result-'+active);results.children[active].scrollIntoView({block:'nearest'});}
    if(event.key==='Enter'&&!results.hidden){event.preventDefault();if(active>=0)pick(matches[active]);else if(matches.length===1)pick(matches[0]);}
  });
  search.parentElement.addEventListener('focusout',()=>queueMicrotask(()=>{if(!search.parentElement.contains(document.activeElement))hideResults();}));
  function refresh(){
    locations=getLocations();if(selected&&!locations.some(item=>item.id===selected.id)){selected=null;search.value='';}
    const hidden=getHiddenPlaces();$('removed-pins').hidden=!hidden.length;$('removed-pins-summary').textContent=`已移除的地点（${hidden.length}）`;$('removed-pins-list').replaceChildren();
    for(const place of hidden){const row=document.createElement('div'),name=document.createElement('span'),button=document.createElement('button');name.textContent=place.name;button.type='button';button.textContent='恢复';button.setAttribute('aria-label','恢复'+place.name+'的地图钉');button.addEventListener('click',async()=>{if(busy)return;controls(true);try{await onRestore(place.id);refresh();status.textContent='地图钉已恢复';}catch(error){status.textContent=errorMessage(error);}finally{controls(false);}});row.append(name,button);$('removed-pins-list').append(row);}
  }
  refresh();
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;status.textContent='';
    const files=[...$('upload-photos').files],name=$('upload-name').value.trim(),location=selected;
    if(!files.length||files.length>20){status.textContent='每次请选择 1–20 张照片';return;}
    if(!name||name.length>100||!location){status.textContent='请填写地点名称，并选择所在地区';return;}
    controls(true);const images=[];
    try{
      const photos=[];
      for(const [index,file] of files.entries()){status.textContent=`正在处理 ${index+1} / ${files.length}`;const prepared=await prepareImage(file,name);photos.push(prepared.photo);images.push(...prepared.images);}
      const targetId=location.targetId&&name===location.name?location.targetId:undefined;
      const place={id:'local-'+crypto.randomUUID(),name,region:location.region,coordinates:[...location.coordinates],...(targetId?{targetId}:{}),photos};
      status.textContent='正在保存到本机…';const additions=await store.add(place,images);
      navigator.storage?.persist?.().catch(()=>{});
      $('upload-photos').value='';status.textContent=`已保存 ${photos.length} 张照片，请导出备份`;await onSaved(additions,targetId||place.id);refresh();
    }catch(error){status.textContent=errorMessage(error);}
    finally{images.forEach(image=>image.bytes.fill(0));controls(false);}
  });
  $('backup-export').addEventListener('click',async()=>{
    if(busy)return;controls(true);status.textContent='正在导出本机新增照片…';
    try{const backup=await store.exportBackup(),url=URL.createObjectURL(backup),link=document.createElement('a');link.href=url;link.download=`地图相册本机备份-${new Date().toISOString().slice(0,10)}.mapalbum`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='备份已生成，请保存下载文件';}
    catch(error){status.textContent=errorMessage(error);}finally{controls(false);}
  });
  $('backup-import').addEventListener('click',()=>{if(!busy)$('backup-file').click();});
  $('backup-file').addEventListener('change',async()=>{
    const file=$('backup-file').files[0];if(!file||busy)return;controls(true);status.textContent='正在校验并恢复备份…';
    try{const additions=await store.importBackup(file);await onSaved(additions);refresh();status.textContent='备份已合并，原有照片已保留';}
    catch(error){status.textContent=errorMessage(error);}finally{$('backup-file').value='';controls(false);}
  });
  return {refresh};
}
