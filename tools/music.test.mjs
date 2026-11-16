import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMusicController} from '../music-controller.js';
const tracks=[{id:'one',title:'One',src:'assets/music/one.wav'},{id:'two',title:'Two',src:'assets/music/two.mp3'}];
class AudioFixture extends EventTarget{
  paused=true;currentTime=0;duration=40;src='';denied=false;
  getAttribute(){return this.src;}removeAttribute(){this.src='';}load(){this.currentTime=0;}
  async play(){if(this.denied)throw Object.assign(new Error('blocked'),{name:'NotAllowedError'});this.paused=false;this.dispatchEvent(new Event('playing'));}
  pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
}
test('音乐支持选曲、下一首、列表循环和进度跳转，暂停偏好会阻止后续触摸重启',async()=>{
  const audio=new AudioFixture(),saved=[];const player=createMusicController({audio,tracks,savePreference:value=>saved.push(value)});
  await player.startFromGesture();assert.equal(audio.src,tracks[0].src);assert.equal(player.snapshot().playing,true);
  await player.next();assert.equal(player.snapshot().track.id,'two');audio.dispatchEvent(new Event('ended'));await Promise.resolve();assert.equal(player.snapshot().track.id,'one');
  audio.pause();await player.toggle();assert.equal(audio.paused,false);
  player.seek(12);assert.equal(audio.currentTime,12);player.seek(100);assert.equal(audio.currentTime,40);player.pause();await player.startFromGesture();assert.equal(audio.paused,true);assert.equal(saved.at(-1).enabled,false);player.dispose();assert.equal(audio.src,'');
});
test('自动播放被拒绝后可以由用户重试；关闭音乐的设备刷新后保持关闭',async()=>{
  const audio=new AudioFixture(),player=createMusicController({audio,tracks,preference:{enabled:false,trackId:'two'}});await player.startFromGesture();assert.equal(audio.src,'');assert.equal(player.snapshot().index,1);
  audio.denied=true;assert.equal(await player.play(),false);assert.equal(player.snapshot().status,'blocked');audio.denied=false;assert.equal(await player.play(),true);player.dispose();
  assert.throws(()=>createMusicController({audio,tracks:[{id:'bad',title:'bad',src:'https://bad/audio.mp3'}]}));
});

test('静音保持播放进度，切歌后仍静音，三个曲目按加减顺序循环',async()=>{
  const three=[...tracks,{id:'three',title:'Three',src:'assets/music/three.mp3'}],audio=new AudioFixture(),saved=[];
  const player=createMusicController({audio,tracks:three,savePreference:value=>saved.push(value)});await player.play();audio.currentTime=12;player.setMuted(true);
  assert.equal(audio.paused,false);assert.equal(audio.currentTime,12);assert.equal(player.snapshot().muted,true);assert.equal(saved.at(-1).muted,true);
  await player.next();assert.equal(player.snapshot().index,1);assert.equal(audio.muted,true);await player.next();assert.equal(player.snapshot().index,2);await player.next();assert.equal(player.snapshot().index,0);await player.previous();assert.equal(player.snapshot().index,2);
  player.setMuted(false);assert.equal(audio.muted,false);player.dispose();
});
