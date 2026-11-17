export function createMusicController({audio,tracks,preference={},onChange=()=>{},savePreference=()=>{}}){
  if(!Array.isArray(tracks)||!tracks.length||tracks.some(track=>!track.id||!track.title||!/^assets\/music\/[\w.-]+\.(mp3|wav|ogg|m4a)$/i.test(track.src)))throw new Error('音乐列表无效');
  let index=Math.max(0,tracks.findIndex(track=>track.id===preference.trackId)),wanted=false,status='paused',revision=0,autoStart=preference.enabled!==false;
  const listeners=[];
  audio.preload='none';audio.volume=.35;audio.muted=preference.muted===true;
  function snapshot(){return {index,track:tracks[index],playing:!audio.paused,muted:audio.muted,status,time:Number.isFinite(audio.currentTime)?audio.currentTime:0,duration:Number.isFinite(audio.duration)?audio.duration:0};}
  function emit(){onChange(snapshot());}
  function save(enabled){try{savePreference({enabled,trackId:tracks[index].id,muted:audio.muted});}catch{}}
  function source(){if(audio.getAttribute('src')!==tracks[index].src){audio.src=tracks[index].src;audio.load();}}
  async function play(){
    autoStart=false;wanted=true;const ticket=++revision;source();status='loading';save(true);emit();
    try{await audio.play();if(ticket!==revision)return false;status='playing';emit();return true;}
    catch(error){if(ticket!==revision)return false;wanted=false;status=error.name==='NotAllowedError'?'blocked':'error';if(status==='blocked')autoStart=true;emit();return false;}
  }
  async function startAutomatically(){const started=await play();if(!started&&status==='blocked')autoStart=true;return started;}
  function pause(){autoStart=false;wanted=false;revision++;audio.pause();status='paused';save(false);emit();}
  function setMuted(value){audio.muted=Boolean(value);save(wanted||!audio.paused);emit();}
  function select(next){if(!Number.isInteger(next)||next<0||next>=tracks.length)return Promise.resolve(false);revision++;audio.pause();index=next;audio.removeAttribute('src');return play();}
  function listen(type,handler){audio.addEventListener(type,handler);listeners.push([type,handler]);}
  listen('playing',()=>{if(wanted){status='playing';emit();}});
  listen('pause',()=>{if(status==='playing'){status='paused';emit();}});
  listen('timeupdate',emit);listen('loadedmetadata',emit);
  listen('ended',()=>{if(wanted)select((index+1)%tracks.length);});
  listen('error',()=>{wanted=false;status='error';emit();});
  return {snapshot,play,pause,select,setMuted,startAutomatically,next:()=>select((index+1)%tracks.length),previous:()=>select((index+tracks.length-1)%tracks.length),toggle:()=>!audio.paused||status==='loading'?pause():play(),startFromGesture(){if(autoStart)return play();},seek(value){if(Number.isFinite(value)&&Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=Math.max(0,Math.min(audio.duration,value));emit();}},dispose(){revision++;wanted=false;audio.pause();listeners.forEach(([type,handler])=>audio.removeEventListener(type,handler));audio.removeAttribute('src');audio.load();}};
}
