import test from 'node:test';
import assert from 'node:assert/strict';
import { createSweepPlan, assessSweep } from './sweep.js';

const settings = { count: 8, size: 200, scale: 1, layout: 'spread', glow: 'on' };
function fixture({ first = 'baked', available = true, baked = [60,60,60,60], live = [60,60,60,60], status = 'complete', quality = 'pending' } = {}) {
  const plan = createSweepPlan(first, available);
  const batch = { id: 1, kind: 'sweep', status, firstMode: first, liveAvailable: available, settings: {...settings}, canvas: [356,408], plan, sequence: plan.map(s=>s.mode), duration:20, visualQuality:quality };
  const samples = plan.map((p,i)=>{
    const fps = (p.mode === 'baked' ? baked : live)[[4,16,32,64].indexOf(p.count)];
    const intervals = Array(Math.round(fps*20)).fill(1000/fps);
    return {id:`1-${i+1}`,batchId:1,mode:p.mode,settings:{...settings,count:p.count},canvas:[356,408],secondsTarget:20,wallSeconds:20,simulatedSeconds:20,intervals,gpu:[],aborted:false};
  });
  return { batch, samples };
}
const assess = f => assessSweep(f.batch, f.samples);

test('plan runs four complete ABBA groups, in ascending count, including live-first',()=>{
  for(const first of ['baked','live']){
    const plan=createSweepPlan(first);assert.equal(plan.length,16);
    for(let i=0;i<4;i++){const group=plan.slice(i*4,i*4+4);assert.deepEqual(group.map(s=>s.count),Array(4).fill([4,16,32,64][i]));assert.deepEqual(group.map(s=>s.mode),[first,first==='baked'?'live':'baked',first==='baked'?'live':'baked',first]);}
  }
});
test('no live capability gets two baked samples per count, no invented live result',()=>{
  const f=fixture({available:false});assert.equal(f.batch.plan.length,8);
  const a=assess(f);assert.equal(a.recommendation,'baked');assert.equal(a.modes.live.supported,false);assert.equal(a.modes.live.max60,null);assert.equal(a.recommendedCount,64);
});
test('all counts passing reports highest tested 64 and preliminary, not hardware maximum',()=>{
  const a=assess(fixture());assert.equal(a.recommendedCount,64);assert.equal(a.recommendedTier,60);assert.equal(a.modes.baked.max60,64);assert.equal(a.modes.live.max60,64);assert.equal(a.confidence,'preliminary');assert.match(a.reasons.join(' '),/硬體極限/);
});
test('mode with higher 60fps count wins; separate 30fps maximum is preserved',()=>{
  const a=assess(fixture({baked:[60,60,60,40],live:[60,60,40,20]}));
  assert.equal(a.recommendation,'baked');assert.equal(a.recommendedCount,32);assert.equal(a.modes.baked.max30,64);assert.equal(a.modes.live.max60,16);assert.equal(a.modes.live.max30,32);
  const b=assess(fixture({baked:[60,40,40,20],live:[60,60,60,40]}));assert.equal(b.recommendation,'live');assert.equal(b.recommendedCount,32);
});
test('60fps at a lower count is preferred, with the 30fps high-count option still visible',()=>{
  const a=assess(fixture({baked:[40,40,40,40],live:[60,40,20,20]}));assert.equal(a.recommendation,'live');assert.equal(a.recommendedTier,60);assert.equal(a.recommendedCount,4);assert.equal(a.modes.baked.max30,64);
});
test('no 60fps success falls back to highest proven 30fps count',()=>{
  const a=assess(fixture({baked:[40,40,40,20],live:[40,40,20,20]}));assert.equal(a.recommendation,'baked');assert.equal(a.recommendedTier,30);assert.equal(a.recommendedCount,32);
});
test('all failures never claim a max of 0 or infer that 1 is impossible',()=>{
  const a=assess(fixture({baked:[20,20,20,20],live:[20,20,20,20]}));assert.equal(a.recommendation,null);assert.equal(a.recommendedCount,null);assert.equal(a.modes.baked.max60,0);assert.match(a.detail,/少於 4/);
});
test('interruption, missing samples, foreign batch or incorrect settings withhold maxima',()=>{
  const cases=[fixture({status:'interrupted'}),fixture({status:'running'}),fixture(),fixture(),fixture(),fixture()];
  cases[2].samples.pop();cases[3].samples[4].settings.scale=.5;cases[4].samples[4].canvas=[320,400];cases[5].samples[4].batchId=2;
  for(const f of cases){const a=assess(f);assert.equal(a.recommendation,null);assert.equal(a.recommendedCount,null);assert.equal(a.modes.baked.max60,null);}
});
test('aborted or duration-mismatched segments cannot establish capacity',()=>{
  const f=fixture();f.samples[9].aborted=true;assert.equal(assess(f).recommendedCount,null);
  const g=fixture();g.samples[9].secondsTarget=60;assert.equal(assess(g).recommendedCount,null);
  const h=fixture();h.batch.duration=180;assert.equal(assess(h).recommendedCount,null);
});
test('sample order and planned count sequence are validated',()=>{
  const f=fixture();[f.samples[0],f.samples[1]]=[f.samples[1],f.samples[0]];assert.equal(assess(f).recommendedCount,null);
  const g=fixture();g.batch.plan[0].count=16;assert.equal(assess(g).recommendedCount,null);
});
test('non-monotonic outcomes cannot silently become a trusted high-count cap',()=>{
  const a=assess(fixture({baked:[60,20,60,60],live:[60,60,20,20]}));assert.equal(a.modes.baked.max60,null);assert.equal(a.modes.baked.observedMax60,64);assert.equal(a.modes.baked.inconsistent60,true);assert.equal(a.recommendation,'live');assert.equal(a.recommendedCount,16);
});
test('quality selection can choose a lower-capacity mode or veto both',()=>{
  const a=assess(fixture({baked:[60,60,60,60],live:[60,60,20,20],quality:'live'}));assert.equal(a.recommendation,'live');assert.equal(a.recommendedCount,16);
  const b=assess(fixture({quality:'neither'}));assert.equal(b.recommendation,null);assert.equal(b.recommendedCount,null);
});
test('slow simulation and repeated-run decline count as capacity failures',()=>{
  const f=fixture();for(const s of f.samples)if(s.mode==='live'&&s.settings.count>=32)s.simulatedSeconds=15;
  assert.equal(assess(f).modes.live.max60,16);
  const g=fixture();const slow=g.samples[11];slow.intervals=Array(1800).fill(1000/90);g.samples[8].intervals=Array(2400).fill(1000/120);
  const a=assess(g);assert.equal(a.modes.baked.inconsistent60,true);assert.equal(a.modes.baked.max60,null);
});
