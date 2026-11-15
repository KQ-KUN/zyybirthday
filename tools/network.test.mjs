import {test} from 'node:test';
import assert from 'node:assert/strict';
import {downloadJSON} from '../network.js';

test('下载报告进度，并完整读取分块内容',async()=>{
  const bytes=new TextEncoder().encode('{"ok":true}'),progress=[];
  const stream=new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,4));controller.enqueue(bytes.slice(4));controller.close();}});
  const data=await downloadJSON('/album',{fetchImpl:async()=>new Response(stream,{headers:{'content-length':String(bytes.length)}}),onProgress:(received)=>progress.push(received)});
  assert.deepEqual(data,{ok:true});assert.deepEqual(progress,[4,bytes.length]);
});

test('请求卡住或响应正文卡住，都能超时退出',async()=>{
  let signal;
  await assert.rejects(downloadJSON('/album',{timeoutMs:20,fetchImpl:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}}),/超时/);
  assert.equal(signal.aborted,true);
  await assert.rejects(downloadJSON('/album',{timeoutMs:20,fetchImpl:async()=>new Response(new ReadableStream({start(){}}))}),/超时/);
});

test('下载失败不缓存失败结果，下一次可以成功；文件大小受限',async()=>{
  let attempts=0;
  const fetchImpl=async()=>++attempts===1?new Response('',{status:503}):new Response('{"ok":true}');
  await assert.rejects(downloadJSON('/album',{fetchImpl}),/下载失败/);
  assert.deepEqual(await downloadJSON('/album',{fetchImpl}),{ok:true});
  await assert.rejects(downloadJSON('/album',{fetchImpl,maxBytes:2}),/文件过大/);
});
