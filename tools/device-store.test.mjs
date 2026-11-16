import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceStore} from '../device-store.js';
test('IndexedDB不可用时保存设备解锁凭据，恢复为不可导出密钥，并能忘记',async()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const portable=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']),jwk=await crypto.subtle.exportKey('jwk',portable);
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'AES-GCM'},false,['encrypt','decrypt']);
  const store=createDeviceStore({storage});await store.remember('fixture',key,()=>jwk);
  const saved=await createDeviceStore({storage}).remembered('fixture');assert.equal(saved.extractable,false);
  const iv=crypto.getRandomValues(new Uint8Array(12)),message=new Uint8Array([1,2,3]);const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,message);assert.deepEqual(new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},saved,cipher)),message);
  assert(![...values.values()].join('').includes('姓名'));await store.forget('fixture');assert.equal(await store.remembered('fixture'),null);
});
test('浏览器拒绝所有本机存储时明确失败，不谎报已记住',async()=>{
  const store=createDeviceStore({storage:{setItem(){throw new Error('blocked');}}});const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['decrypt']);await assert.rejects(store.remember('fixture',key,()=>({})));
});
