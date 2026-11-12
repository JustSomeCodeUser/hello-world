import { assessBatch, settingsKey } from './assessment.js';

export const SWEEP_COUNTS = Object.freeze([4, 16, 32, 64]);
export const SWEEP_SECONDS = 20;

export function createSweepPlan(firstMode = 'baked', liveAvailable = true) {
  const first = liveAvailable ? firstMode : 'baked';
  const second = first === 'baked' ? 'live' : 'baked';
  const sequence = liveAvailable ? [first, second, second, first] : ['baked', 'baked'];
  return SWEEP_COUNTS.flatMap(count => sequence.map(mode => ({ count, mode })));
}

export function qualityKey(settings, canvas) {
  return settingsKey({ ...settings, count: 0 }, canvas);
}

function capacity(rows, mode, tier) {
  let stopped = false, inconsistent = false, max = 0, observedMax = 0;
  for (const row of rows) {
    const m = row.assessment.modes[mode];
    const pass = row.complete && m?.eligible && m.tier >= tier;
    if (pass) {
      observedMax = row.count;
      if (stopped) inconsistent = true;
      else max = row.count;
    } else stopped = true;
  }
  return { max: inconsistent ? null : max, observedMax, inconsistent };
}

export function assessSweep(batch, samples) {
  const available = batch.liveAvailable !== false;
  const expected = createSweepPlan(batch.firstMode, available);
  const selected = samples.filter(s => s.batchId === batch.id);
  const visual = batch.visualQuality || 'pending';
  const base = {
    kind: 'sweep', rulesVersion: 'ember-capacity/1', batchId: batch.id,
    recommendation: null, recommendedCount: null, recommendedTier: null,
    scope: { settings: batch.settings, canvas: batch.canvas, secondsPerSegment: SWEEP_SECONDS, counts: [...SWEEP_COUNTS] },
    visualQuality: visual, modes: {}, counts: [], reasons: [], confidence: 'preliminary',
  };
  for (const count of SWEEP_COUNTS) {
    const group = selected.filter(s => s.settings.count === count);
    const sequence = expected.filter(s => s.count === count).map(s => s.mode);
    const child = { ...batch, kind: available ? 'compare' : 'single', settings: { ...batch.settings, count }, sequence, status: group.length === sequence.length ? 'complete' : 'running' };
    const assessment = assessBatch(child, group, { liveAvailable: available });
    base.counts.push({ count, complete: group.length === sequence.length && !['insufficient', 'waiting', 'partial'].includes(assessment.status), assessment });
  }
  const planCorrect = JSON.stringify(batch.plan) === JSON.stringify(expected) && batch.duration === SWEEP_SECONDS;
  const complete = batch.status === 'complete' && planCorrect && selected.length === expected.length && base.counts.every(r => r.complete) && selected.every((s, i) => s.mode === expected[i].mode && s.settings.count === expected[i].count && qualityKey(s.settings, s.canvas) === qualityKey(batch.settings, batch.canvas));
  for (const mode of ['baked', 'live']) {
    const supported = mode !== 'live' || available;
    const good = capacity(base.counts, mode, 60), fallback = capacity(base.counts, mode, 30);
    base.modes[mode] = {
      supported, max60: complete && supported ? good.max : null, max30: complete && supported ? fallback.max : null,
      observedMax60: good.observedMax, observedMax30: fallback.observedMax,
      inconsistent60: complete && supported && good.inconsistent, inconsistent30: complete && supported && fallback.inconsistent,
      label: !supported ? '裝置不支援' : !complete ? '掃描未完成' : good.inconsistent || fallback.inconsistent ? '部分檔位結果不一致' : good.max > 0 ? '有 60 FPS 檔可用' : fallback.max > 0 ? '僅有 30 FPS 檔候選' : '四個數量皆未達標',
      status: !supported || !complete ? 'insufficient' : good.inconsistent || fallback.inconsistent ? 'unstable' : good.max > 0 ? 'good' : fallback.max > 0 ? 'fallback' : 'fail',
    };
  }
  if (!complete) return {
    ...base, status: 'insufficient', title: batch.status === 'running' ? '正在尋找這組畫質的數量上限' : '掃描未完成，尚不能判定數量上限',
    detail: `已完成 ${base.counts.filter(r => r.complete).length}/4 個數量。下方只列已測結果，不用未完成或不同設定的資料推算上限。`,
    next: batch.status === 'running' ? '請保持頁面前台；將自動完成 4、16、32、64 個火焰的比較。' : '重新按「一鍵測數量上限」完成掃描。已完成段落仍可匯出。',
  };

  const accepts = mode => visual === 'pending' || visual === 'both' || visual === mode;
  const candidates = ['baked', 'live'].filter(m => base.modes[m].supported && accepts(m));
  const tier = candidates.some(m => base.modes[m].max60 > 0) ? 60 : 30;
  const key = tier === 60 ? 'max60' : 'max30';
  const limit = Math.max(0, ...candidates.map(m => base.modes[m][key] || 0));
  const anomalies = Object.entries(base.modes).filter(([, m]) => m.inconsistent60 || m.inconsistent30).map(([m]) => m === 'baked' ? '烘焙' : '即時');
  base.reasons = [
    '上限只限本次實測的 4、16、32、64 四檔；中間數量未測，64 通過也不代表硬體極限是 64。',
    '每段只有 20 秒，這是快速初篩；整輪掃描時間不等於推薦配置已通過 180 秒長測。',
    ...(visual === 'pending' ? ['畫質尚未確認，推薦先依性能判斷。'] : []),
    ...(anomalies.length ? [`${anomalies.join('、')}出現低數量未通過、高數量卻通過的情況；相關 FPS 檔上限暫不採信，請重測。`] : []),
    '只適用本次畫質與畫布尺寸，還需要在完整遊戲中驗證。',
  ];
  if (!limit) return {
    ...base, status: 'fail', title: anomalies.length ? '數量結果不一致，請重測' : visual === 'neither' ? '兩種畫質皆未接受，暫不推薦' : '這組畫質沒有可推薦的數量',
    detail: '沒有同時符合性能、已觀測穩定性與畫質選擇的有效數量上限。這不代表少於 4 個也一定不能運行。',
    next: '先關閉柔光或降至 0.5×，再重新掃描；也可單獨測試 1 個火焰。',
  };
  const tied = candidates.filter(m => base.modes[m][key] === limit);
  const atLimit = base.counts.find(r => r.count === limit).assessment;
  const choice = tied.includes(atLimit.recommendation) ? atLimit.recommendation : tied.includes('baked') ? 'baked' : tied[0];
  const modeName = choice === 'baked' ? '烘焙動畫' : '共用即時模擬';
  const rationale = tied.length > 1 ? atLimit.detail : '同一 FPS 檔下，這個模式通過的最高實測數量較多，或是唯一符合畫質選擇的模式。';
  return {
    ...base, recommendation: choice, recommendedCount: limit, recommendedTier: tier,
    status: tier === 60 ? 'good' : 'fallback',
    title: `建議${modeName} · 最高實測通過 ${limit} 個`,
    detail: `以流暢度優先：先選 60 FPS 檔，再比較通過數量；沒有可用的 60 FPS 檔才選 30 FPS。這次推薦為 ${tier} FPS 檔。${rationale}`,
    next: `先設為 ${limit} 個、${modeName}，用每段 180 秒再驗證；${limit === 64 ? '本次已測到 64 個，未測更高數量。' : '不要把未測的中間數量當成已通過。'}`,
  };
}
