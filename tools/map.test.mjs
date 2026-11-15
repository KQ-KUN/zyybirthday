import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localStyle,project} from '../paper-map.js';

test('地图数据随站点提供，不依赖远程瓦片、字体或图标',()=>{
  assert.equal(localStyle.glyphs,undefined);assert.equal(localStyle.sprite,undefined);
  for(const source of Object.values(localStyle.sources)){
    assert.equal(source.type,'geojson');assert.equal(source.data.type,'FeatureCollection');
    assert(source.data.features.length>0);assert.equal(source.url,undefined);assert.equal(source.tiles,undefined);
  }
  const beijing=project([116.4,39.9]),hangzhou=project([120.2,30.3]);
  assert(beijing[0]<hangzhou[0]);assert(beijing[1]<hangzhou[1]);
});

test('解锁所需清单直接内嵌页面，不再下载整包照片',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const match=html.match(/<script id="sealed-album" type="application\/json">([\s\S]*?)<\/script>/);
  assert(match);const envelope=JSON.parse(match[1]);
  assert.equal(envelope.format,'memory-map-v1');assert(match[1].length<12000);
  const unlock=await readFile(new URL('../unlock.js',import.meta.url),'utf8');
  assert(!unlock.includes("downloadJSON('album.enc.json"));assert(!unlock.includes('payload.images'));
});
