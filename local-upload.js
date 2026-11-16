export function uploadLocations(places,regions,divisions){
  return [
    ...places.map(place=>({id:place.id,name:place.name,region:place.region,coordinates:place.coordinates,targetId:place.id,group:'已有地点'})),
    ...regions.map((region,index)=>({id:'province-'+index,name:region.shortName||region.name,region:region.shortName||region.name,coordinates:region.coordinates,group:'省份'})),
    ...divisions.map((region,index)=>({id:'area-'+index,name:region.name,region:region.name,coordinates:region.coordinates,group:'城市与区县'}))
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
export function bindLocalUpload({store,getLocations,onSaved}){
  const $=id=>document.getElementById(id),form=$('upload-form'),status=$('upload-status');let busy=false,locations=[];
  function controls(disabled){busy=disabled;form.querySelectorAll('input,select,button').forEach(element=>element.disabled=disabled);$('backup-export').disabled=disabled;$('backup-import').disabled=disabled;form.setAttribute('aria-busy',String(disabled));}
  function errorMessage(error){return error?.name==='QuotaExceededError'?'手机空间不足，照片尚未保存。请先导出备份。':error.message||'保存失败，请重试';}
  function refresh(){
    locations=getLocations();const selected=$('upload-location').value;$('upload-location').replaceChildren();
    for(const name of ['已有地点','省份','城市与区县']){const group=document.createElement('optgroup');group.label=name;for(const item of locations.filter(item=>item.group===name)){const option=document.createElement('option');option.value=item.id;option.textContent=item.group==='已有地点'?`${item.region} · ${item.name}`:item.name;group.append(option);}$('upload-location').append(group);}
    if(locations.some(item=>item.id===selected))$('upload-location').value=selected;
  }
  refresh();
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;status.textContent='';
    const files=[...$('upload-photos').files],name=$('upload-name').value.trim(),location=locations.find(item=>item.id===$('upload-location').value);
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
      $('upload-photos').value='';status.textContent=`已保存 ${photos.length} 张照片，请导出备份`;onSaved(additions,targetId||place.id);refresh();
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
    try{const additions=await store.importBackup(file);onSaved(additions);refresh();status.textContent='备份已合并，原有照片已保留';}
    catch(error){status.textContent=errorMessage(error);}finally{$('backup-file').value='';controls(false);}
  });
  return {refresh};
}
