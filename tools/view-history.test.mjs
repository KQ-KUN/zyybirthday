import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createViewHistory} from '../view-history.js';

const base={placeId:null,cardIndex:0,dialogs:[]};
const card={...base,placeId:'home'};
function fixture(){
  const entries=[{state:{outside:true},url:'/previous'},{state:null,url:'/album'}];let index=1,queued=null;
  const listeners=new Set(),restored=[];
  const history={get state(){return entries[index].state;},replaceState(state,_,url){entries[index]={state:structuredClone(state),url};},pushState(state,_,url){entries.splice(index+1);entries.push({state:structuredClone(state),url});index++;},go(delta){queued=index+delta;}};
  const options={history,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},initial:base,onRestore:view=>restored.push(view),urlForView:view=>'/album#'+(view.placeId||''),session:'test-session'};
  const flush=()=>{assert(queued!==null);index=queued;queued=null;for(const listener of listeners)listener({state:history.state});};
  return {history,options,entries,restored,flush,get index(){return index;}};
}
test('系统返回逐层关闭大图和地点，切图不堆积历史，地图层允许正常离站',()=>{
  const f=fixture(),nav=createViewHistory(f.options);nav.push(card);
  nav.push({...card,dialogs:[{id:'viewer',index:0}]});
  for(let index=1;index<100;index++)nav.replace({...card,dialogs:[{id:'viewer',index}]});
  assert.equal(f.entries.length,4);nav.back();f.flush();assert.deepEqual(f.restored.at(-1),card);
  nav.back();f.flush();assert.deepEqual(f.restored.at(-1),base);assert.equal(nav.back(),false);
  f.history.go(-1);f.flush();assert.equal(f.index,0);assert.equal(f.entries.length,4);
});
test('关闭按钮重复点击不会多退一层，浏览器前进恢复最后查看的照片',()=>{
  const f=fixture(),nav=createViewHistory(f.options);nav.push(card);nav.push({...card,dialogs:[{id:'viewer',index:5}]});
  assert.equal(nav.back(),true);assert.equal(nav.back(),false);f.flush();assert.equal(nav.depth,1);
  f.history.go(1);f.flush();assert.equal(nav.current.dialogs[0].index,5);
});
test('地区选择替换到原地点层，返回地图不会多出一个旧地点或空弹层',()=>{
  const f=fixture(),nav=createViewHistory(f.options);nav.push(card);nav.push({...card,dialogs:[{id:'regions-dialog'}]});
  const next={...card,placeId:'lake'};nav.backWith(next);f.flush();assert.deepEqual(nav.current,next);assert.equal(nav.depth,1);
  nav.back();f.flush();assert.deepEqual(nav.current,base);
});
test('刷新后接续已有站内层级；旧页面历史事件不会注入新记录',()=>{
  const f=fixture();let nav=createViewHistory(f.options);nav.push(card);nav.push({...card,dialogs:[{id:'viewer',index:2}]});nav.dispose();
  nav=createViewHistory({...f.options,session:'new-session'});assert.equal(nav.resumed,true);assert.equal(nav.depth,2);
  nav.back();f.flush();assert.equal(nav.current.placeId,'home');assert.equal(nav.current.dialogs.length,0);
});
