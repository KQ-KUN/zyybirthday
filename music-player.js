import {createMusicController} from './music-controller.js?v=20261116-23';
const speaker='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4ZM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/></svg>';
const silent='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4ZM17 9l5 6m0-6-5 6"/></svg>';
export function mountMusicPlayer({tracks,root}){
  const audio=document.createElement('audio');audio.id='album-music';audio.setAttribute('playsinline','');audio.hidden=true;document.body.append(audio);
  const element=document.createElement('details');element.className='music-player';element.setAttribute('aria-label','音乐控制');
  element.innerHTML=`<summary class="round-button music-trigger" aria-label="打开音乐控制">${speaker}</summary><div class="music-panel"><button type="button" class="music-mute" aria-label="开启音乐">${silent}</button><button type="button" class="music-next" aria-label="下一首"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 10 7-10 7ZM19 5v14"/></svg></button><span class="music-status sr-only" role="status"></span></div>`;
  const find=selector=>element.querySelector(selector),trigger=find('summary'),mute=find('.music-mute'),status=find('.music-status');
  const preference={enabled:true,muted:false,trackId:tracks[0].id};
  let lastQuiet;
  function paint(state){
    const quiet=state.muted||!state.playing;if(quiet!==lastQuiet){trigger.innerHTML=quiet?silent:speaker;mute.innerHTML=quiet?silent:speaker;lastQuiet=quiet;}mute.setAttribute('aria-label',quiet?'开启音乐':'静音音乐');mute.setAttribute('aria-pressed',String(state.muted));
    element.dataset.playing=String(state.playing);element.dataset.muted=String(state.muted);element.dataset.status=state.status;element.dataset.trackId=state.track.id;
    const description=`${state.track.title} · ${state.track.artist||''}`;trigger.setAttribute('aria-label',`音乐控制：${description}，${quiet?'静音':'播放中'}`);
    const message=state.status==='error'?'音乐加载失败，点击开启音乐重试':state.status==='blocked'?'点击开启音乐播放':description;if(status.textContent!==message)status.textContent=message;
  }
  const controller=createMusicController({audio,tracks,preference,onChange:paint});paint(controller.snapshot());
  mute.addEventListener('click',()=>{const state=controller.snapshot();if(!state.playing){controller.setMuted(false);controller.play();}else controller.setMuted(!state.muted);});
  find('.music-next').addEventListener('click',()=>controller.next());
  function gesture(event){if(event.isTrusted&&!element.contains(event.target)){element.open=false;controller.startFromGesture();}}
  document.addEventListener('pointerdown',gesture,true);document.addEventListener('keydown',gesture,true);
  element.addEventListener('keydown',event=>{if(event.key==='Escape'&&element.open){event.preventDefault();event.stopPropagation();element.open=false;trigger.focus();}});
  root.append(element);
  controller.startAutomatically();
  return {dispose(){document.removeEventListener('pointerdown',gesture,true);document.removeEventListener('keydown',gesture,true);controller.dispose();audio.remove();element.remove();}};
}
