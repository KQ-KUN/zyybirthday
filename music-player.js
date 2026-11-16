import {createMusicController} from './music-controller.js?v=20261116-19';
const note='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/></svg>';
const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>',pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const stamp=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
export function mountMusicPlayer({tracks,root}){
  const audio=document.createElement('audio');audio.id='album-music';audio.setAttribute('playsinline','');audio.hidden=true;document.body.append(audio);
  const element=document.createElement('details');element.className='music-player';element.setAttribute('aria-label','音乐播放器');
  element.innerHTML=`<summary aria-label="打开音乐播放器">${note}<span class="music-summary">音乐</span></summary><div class="music-panel"><p class="music-title"></p><div class="music-actions"><button type="button" class="music-prev" aria-label="上一首">‹</button><button type="button" class="music-play" aria-label="播放音乐">${playIcon}</button><button type="button" class="music-next" aria-label="下一首">›</button></div><label class="sr-only" for="music-progress">音乐播放进度</label><input id="music-progress" class="music-progress" type="range" min="0" max="1" step=".1" value="0"><p class="music-time"></p><p class="music-status" role="status"></p><div class="music-list"></div></div>`;
  const find=selector=>element.querySelector(selector),title=find('.music-title'),play=find('.music-play'),progress=find('.music-progress'),time=find('.music-time'),status=find('.music-status');
  const list=find('.music-list');tracks.forEach((track,index)=>{const button=document.createElement('button');button.type='button';button.textContent=track.title;button.addEventListener('click',()=>controller.select(index));list.append(button);});
  if(tracks.length===1){find('.music-prev').hidden=true;find('.music-next').hidden=true;list.hidden=true;}
  let preference={};try{const saved=JSON.parse(localStorage.getItem('memory-album-music')||'{}');if(saved&&typeof saved==='object')preference=saved;}catch{}
  const controller=createMusicController({audio,tracks,preference,onChange:state=>{
    element.dataset.playing=String(state.playing);element.dataset.status=state.status;title.textContent=state.track.title;play.innerHTML=state.playing?pauseIcon:playIcon;play.setAttribute('aria-label',state.playing?'暂停音乐':'播放音乐');
    find('.music-summary').textContent=state.playing?'音乐 · 播放中':'音乐';progress.disabled=!state.duration;progress.max=String(state.duration||1);progress.value=String(state.time);time.textContent=`${stamp(state.time)} / ${stamp(state.duration)}`;
    status.textContent=state.status==='error'?'音乐加载失败，请重试':state.status==='blocked'?'点击播放音乐':state.status==='loading'?'正在加载…':'';status.hidden=!status.textContent;
    [...list.children].forEach((button,index)=>button.setAttribute('aria-current',String(index===state.index)));
  },savePreference:value=>localStorage.setItem('memory-album-music',JSON.stringify(value))});
  title.textContent=tracks[controller.snapshot().index].title;time.textContent='0:00 / 0:00';status.hidden=true;progress.disabled=true;
  play.addEventListener('click',()=>controller.toggle());find('.music-prev').addEventListener('click',()=>controller.previous());find('.music-next').addEventListener('click',()=>controller.next());progress.addEventListener('input',()=>controller.seek(Number(progress.value)));
  function gesture(event){if(event.isTrusted&&!element.contains(event.target)){element.open=false;controller.startFromGesture();}}
  document.addEventListener('pointerdown',gesture,true);document.addEventListener('keydown',gesture,true);
  let stack=[...document.querySelectorAll('dialog[open]')];
  function move(records=[]){for(const record of records){stack=stack.filter(dialog=>dialog!==record.target&&dialog.open);if(record.target.open)stack.push(record.target);}stack=stack.filter(dialog=>dialog.open);const host=stack.at(-1)||root;if(element.parentElement!==host){element.open=false;host.append(element);}element.dataset.surface=host.id;}
  element.addEventListener('keydown',event=>{if(event.key==='Escape'&&element.open){event.preventDefault();event.stopPropagation();element.open=false;find('summary').focus();}});
  const observer=new MutationObserver(move);document.querySelectorAll('dialog').forEach(dialog=>observer.observe(dialog,{attributes:true,attributeFilter:['open']}));move();
  return {dispose(){observer.disconnect();document.removeEventListener('pointerdown',gesture,true);document.removeEventListener('keydown',gesture,true);controller.dispose();audio.remove();element.remove();}};
}
