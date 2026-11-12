import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSample, assessBatch } from './assessment.js';

const settings = {count:4,size:200,layout:'spread',scale:1,glow:'on'};
function sample(mode='baked', options={}) {
  const {fps=60,seconds=20,ratio=1,gpu=1,...extra}=options;
  const n=Math.round(fps*seconds), intervals=Array(n).fill(1000/fps);
  const stepSeries=intervals.map((_,i)=>Math.floor((i+1)*30/fps)-Math.floor(i*30/fps));
  return {id:mode,batchId:1,mode,settings:{...settings},canvas:[356,408],secondsTarget:seconds,wallSeconds:seconds,intervals,stepSeries,simulatedSeconds:seconds*ratio,gpu:intervals.map(()=>({ms:gpu,steps:0})),aborted:false,...extra};
}
function batch(options={}) {return {id:1,status:'complete',kind:'compare',sequence:['baked','live','live','baked'],duration:20,settings:{...settings},canvas:[356,408],visualQuality:'pending',...options};}
function samples(baked={},live={}) {return [sample('baked',baked),sample('live',live),sample('live',live),sample('baked',baked)].map((s,i)=>({...s,id:`1-${i+1}`}));}

test('58 FPS and 95% simulation speed are inclusive; lower values fail their gates',()=>{
  assert.equal(assessSample(sample('live',{fps:58,ratio:.95})).tier,60);
  assert.equal(assessSample(sample('live',{fps:57.9})).tier,30);
  assert.equal(assessSample(sample('live',{ratio:.949})).tier,0);
  assert.match(assessSample(sample('live',{ratio:.8})).reasons.join(' '),/放慢/);
});
test('P95 20 ms is inclusive and 1% slow frames is exclusive',()=>{
  const s=sample();s.intervals=Array(94).fill(16).concat(Array(6).fill(20));
  assert.equal(assessSample(s).tier,60);
  s.intervals=Array(94).fill(16).concat(Array(6).fill(20.01));
  assert.equal(assessSample(s).tier,30);
  s.intervals=Array(99).fill(16).concat(45);
  assert.equal(assessSample(s).tier,30);
});
test('29 FPS can pass fallback despite many frames exceeding 33.3ms',()=>{
  assert.equal(assessSample(sample('baked',{fps:29})).tier,30);
  assert.equal(assessSample(sample('baked',{fps:28.9})).tier,0);
});
test('aborted, short, nonfinite, or missing simulation timing are data insufficient',()=>{
  for(const change of [{aborted:true},{wallSeconds:5},{intervals:[NaN]},{simulatedSeconds:NaN}]) assert.equal(assessSample(sample('live',change)).valid,false);
});
test('180-second windows catch late slowdown hidden by the overall average',()=>{
  const intervals=[...Array(7200).fill(1000/60),...Array(1200).fill(50)];
  const s=sample('baked',{seconds:180,intervals});
  const a=assessSample(s);assert.equal(a.status,'unstable');assert.equal(a.tier,0);assert.ok(a.trend.fpsDeclinePercent>60);
});
test('long live run cannot pass sustained check without per-frame step data',()=>{
  assert.equal(assessSample(sample('live',{seconds:180,stepSeries:[]})).status,'unstable');
  assert.equal(assessSample(sample('live',{seconds:180})).sustained,'stable');
});
test('high render FPS cannot hide a late live simulation slowdown',()=>{
  const s=sample('live',{seconds:180});s.stepSeries.fill(0,7200);
  const a=assessSample(s);assert.equal(a.tier,0);assert.match(a.reasons.join(' '),/後段/);
});
test('only a complete, matching ABBA batch produces comparison advice',()=>{
  const s=samples();
  assert.equal(assessBatch(batch({status:'interrupted'}),s).recommendation,null);
  assert.equal(assessBatch(batch(),s.slice(0,3)).recommendation,null);
  s[2].settings.count=64;assert.equal(assessBatch(batch(),s).recommendation,null);
  const foreign=samples().map(x=>({...x,batchId:2}));assert.equal(assessBatch(batch(),foreign).recommendation,null);
});
test('higher performance tier wins, neither passing never produces a recommendation',()=>{
  assert.equal(assessBatch(batch(),samples({}, {fps:40})).recommendation,'baked');
  assert.equal(assessBatch(batch(),samples({fps:40},{})).recommendation,'live');
  assert.equal(assessBatch(batch(),samples({fps:20},{fps:20})).recommendation,null);
});
test('default tie is decorative baked, qualified GPU advantage can favor live',()=>{
  assert.equal(assessBatch(batch(),samples()).recommendation,'baked');
  assert.equal(assessBatch(batch(),samples({gpu:2},{gpu:.5})).recommendation,'live');
  assert.match(assessBatch(batch(),samples({gpu:.5},{gpu:2})).detail,/持續較低/);
  assert.equal(assessBatch(batch(),samples({gpu:2},{gpu:.5,gpuDisjoint:true})).recommendation,'baked');
  const noTimer=samples();for(const s of noTimer)s.gpu=[];
  assert.equal(assessBatch(batch(),noTimer).recommendation,'baked');
  assert.equal(assessBatch(batch(),samples({gpu:2,fps:144},{gpu:.5,fps:60})).recommendation,'baked');
});
test('visual choice can veto an otherwise fast mode; pending quality is explicit',()=>{
  assert.equal(assessBatch(batch({visualQuality:'live'}),samples()).recommendation,'live');
  assert.equal(assessBatch(batch({visualQuality:'neither'}),samples()).recommendation,null);
  const a=assessBatch(batch(),samples());assert.match(a.reasons.join(' '),/畫質尚未確認/);assert.equal(a.confidence,'preliminary');
});
test('single mode needs comparison unless live capability is unavailable',()=>{
  const b=batch({kind:'single',sequence:['baked']});const s=[sample()];
  assert.equal(assessBatch(b,s).recommendation,null);
  assert.equal(assessBatch(b,s,{liveAvailable:false}).recommendation,'baked');
  assert.equal(assessBatch(b,[sample('baked',{fps:20})],{liveAvailable:false}).recommendation,null);
});
test('later same-mode degradation prevents a stable verdict despite passing averages',()=>{
  const s=samples({fps:120},{fps:120});s[3]=sample('baked',{fps:90});
  const a=assessBatch(batch(),s);assert.equal(a.modes.baked.status,'unstable');assert.equal(a.recommendation,'live');
});
test('only observed stable long segments earn sustained confidence',()=>{
  const a=assessBatch(batch({duration:180,visualQuality:'both'}),samples({seconds:180},{seconds:180}));
  assert.equal(a.confidence,'sustained-observed');assert.equal(a.recommendation,'baked');
});
