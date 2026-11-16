import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createImageSwap} from '../transitions.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('新照片盖在不透明旧图上淡入，高清升级不重复闪动，快速切换和退出释放租约',async()=>{
  const originalImage=globalThis.Image,originalStyle=globalThis.getComputedStyle,animations=[],leases=new Map();
  class Picture{
    constructor(){this.style={opacity:'1'};this.dataset={};this.src='';this.hidden=false;}
    decode(){return this.decodeGate||Promise.resolve();}getAttribute(name){return name==='src'?this.src:null;}removeAttribute(name){if(name==='src')this.src='';}setAttribute(){}
    cloneNode(){return new Picture();}remove(){this.parentElement.children=this.parentElement.children.filter(node=>node!==this);}
    animate(frames,options){let finish,reject;const finished=new Promise((resolve,fail)=>{finish=resolve;reject=fail;});const animation={finished,frames,options,node:this,finish:()=>{this.style.opacity='1';finish();},cancel:()=>reject(new Error('cancelled'))};animations.push(animation);return animation;}
  }
  globalThis.Image=Picture;globalThis.getComputedStyle=node=>({opacity:node.style.opacity,objectFit:'contain'});
  const image=new Picture();image.parentElement={children:[image],append(node){node.parentElement=this;this.children.push(node);}};
  const load=async photo=>photo.id;load.retain=photo=>{leases.set(photo.id,(leases.get(photo.id)||0)+1);return()=>leases.set(photo.id,leases.get(photo.id)-1);};
  const photo=id=>({id,alt:id,thumbnail:{id:id+'-preview'}});
  try{
    const swap=createImageSwap(image,{contain:true});await swap.show(photo('a'),load);await flush();assert.equal(image.src,'a');assert.equal(animations.length,0);
    let repeated=0;await swap.show(photo('a'),load,()=>repeated++);await flush();assert.equal(repeated,1);assert.equal(animations.length,0);assert.equal(image.src,'a');
    const stale=swap.show(photo('stale'),load);await swap.show(photo('a'),load);assert.equal(await stale,false);await flush();assert.equal(image.src,'a');assert.equal(animations.length,0);
    const second=swap.show(photo('b'),load);await flush();assert.equal(image.src,'a');assert.equal(image.style.opacity,'1');assert.equal(leases.get('a'),1);assert.deepEqual(animations[0].frames,[{opacity:0},{opacity:1}]);
    let decoded;image.decodeGate=new Promise(resolve=>{decoded=resolve;});animations[0].finish();await flush();assert.equal(image.parentElement.children.length,2);assert.equal(leases.get('a'),1);
    image.decodeGate=null;decoded();assert.equal(await second,true);await flush();assert.equal(image.src,'b');assert.equal(animations.length,1);assert.equal(leases.get('a'),0);assert.equal(leases.get('b-preview'),0);
    const third=swap.show(photo('c'),load);await flush();const fourth=swap.show(photo('d'),load);await flush();assert.equal(await third,false);assert.equal(image.src,'b');assert.equal(image.style.opacity,'1');
    animations.at(-1).finish();await fourth;await flush();assert.equal(image.src,'d');assert.equal(image.parentElement.children.length,1);assert.equal(leases.get('c-preview'),0);
    swap.cancel();assert.equal(image.src,'');assert([...leases.values()].every(count=>count===0));
  }finally{globalThis.Image=originalImage;globalThis.getComputedStyle=originalStyle;}
});
