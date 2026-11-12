import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ASSET_BUDGET_BYTES, validateAtlas, validateDownload} from './asset.js';
const manifest=JSON.parse(readFileSync(new URL('./atlas.json',import.meta.url)));

test('shipped atlas preserves animation and fits the decimal 500 KB budget',()=>{
  const file=readFileSync(new URL(manifest.image,import.meta.url));
  validateAtlas(manifest,2048);validateDownload(manifest,file.length);
  assert.ok(file.length<=500000);assert.equal(ASSET_BUDGET_BYTES,500000);
  assert.ok(file.length+readFileSync(new URL('./atlas.json',import.meta.url)).length<=500000);
  assert.equal(createHash('sha256').update(file).digest('hex'),manifest.sha256);
  assert.equal(manifest.frames/manifest.fps,3.5);
  assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WEBP');
});
test('stale, oversize and incompatible resources fail explicitly',()=>{
  assert.throws(()=>validateDownload(manifest,manifest.downloadBytes-1),/大小/);
  assert.throws(()=>validateDownload({...manifest,downloadBytes:500001},500001),/500 KB/);
  assert.throws(()=>validateAtlas({...manifest,encoding:'old-state'},4096),/格式/);
  assert.throws(()=>validateAtlas(manifest,1024),/2048px/);
});
