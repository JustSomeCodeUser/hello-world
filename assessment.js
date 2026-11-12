// Experimental screening rules, not device certification or game acceptance.
export const RULES = Object.freeze({
  version: 'ember-screening/1',
  good: { minFps: 58, maxP95Ms: 20, maxSlowFramesPercentExclusive: 1 },
  fallback: { minFps: 29, maxP95Ms: 40 },
  minSimulationRatio: 0.95,
  sustainedSeconds: 180,
  maxFpsDeclinePercent: 10,
  gpuAdvantage: { minFraction: 0.2, minMs: 0.2, minCoverage: 0.8, minCadenceRatio: 0.95 },
});

const finite = Number.isFinite;
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
function percentile(a, q) {
  if (!a.length) return null;
  const sorted = [...a].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
}
function frameStats(intervals) {
  return {
    fps: intervals.length ? 1000 / mean(intervals) : null,
    p50FrameMs: percentile(intervals, .5),
    p95FrameMs: percentile(intervals, .95),
    p99FrameMs: percentile(intervals, .99),
    framesOver33msPercent: intervals.length ? 100 * intervals.filter(v => v > 1000 / 30).length / intervals.length : null,
  };
}
export function summarize(s) {
  const gpu = s.gpu || [];
  return {
    ...frameStats(s.intervals || []),
    gpuMeanMs: mean(gpu.map(v => v.ms)),
    gpuP50Ms: percentile(gpu.map(v => v.ms), .5),
    gpuP95Ms: percentile(gpu.map(v => v.ms), .95),
    gpuSimulationFrameP50Ms: percentile(gpu.filter(v => v.steps > 0).map(v => v.ms), .5),
    gpuRenderOnlyP50Ms: percentile(gpu.filter(v => v.steps === 0).map(v => v.ms), .5),
    gpuSamples: gpu.length,
    simulationToWallRatio: s.mode === 'live' && s.wallSeconds ? s.simulatedSeconds / s.wallSeconds : null,
  };
}
function tierOf(stats, mode) {
  if (!finite(stats.fps) || !finite(stats.p95FrameMs)) return 0;
  if (mode === 'live' && (!finite(stats.simulationToWallRatio) || stats.simulationToWallRatio < RULES.minSimulationRatio)) return 0;
  if (stats.fps >= RULES.good.minFps && stats.p95FrameMs <= RULES.good.maxP95Ms && stats.framesOver33msPercent < RULES.good.maxSlowFramesPercentExclusive) return 60;
  if (stats.fps >= RULES.fallback.minFps && stats.p95FrameMs <= RULES.fallback.maxP95Ms) return 30;
  return 0;
}
function windows(s) {
  const duration = s.intervals.reduce((a, b) => a + b, 0);
  let elapsed = 0;
  const parts = [[], []], steps = [0, 0];
  const hasSteps = s.mode !== 'live' || (s.stepSeries?.length === s.intervals.length && s.stepSeries.every(v => Number.isInteger(v) && v >= 0));
  s.intervals.forEach((dt, i) => {
    const midpoint = elapsed + dt / 2;
    const part = midpoint < duration / 3 ? 0 : midpoint >= duration * 2 / 3 ? 1 : -1;
    if (part >= 0) { parts[part].push(dt); steps[part] += s.stepSeries?.[i] || 0; }
    elapsed += dt;
  });
  const stats = parts.map((values, i) => ({
    ...frameStats(values),
    simulationToWallRatio: s.mode === 'live' && hasSteps && values.length ? steps[i] / 30 / (values.reduce((a, b) => a + b, 0) / 1000) : null,
  }));
  return { first: stats[0], last: stats[1], hasSteps, fpsDeclinePercent: stats[0].fps ? (stats[0].fps - stats[1].fps) / stats[0].fps * 100 : null };
}
export function assessSample(s) {
  const stats = summarize(s);
  const invalid = [];
  if (s.aborted) invalid.push('記錄已中止：' + (s.abortReason || '未完成'));
  if (![20, 60, 180].includes(s.secondsTarget) || !finite(s.wallSeconds) || s.wallSeconds < s.secondsTarget - .25) invalid.push('記錄長度不足');
  if (!s.intervals?.length || s.intervals.some(v => !finite(v) || v <= 0)) invalid.push('幀資料不完整');
  if (!['live', 'baked'].includes(s.mode)) invalid.push('未知動畫模式');
  if (s.mode === 'live' && (!finite(stats.simulationToWallRatio) || stats.simulationToWallRatio > 1.05)) invalid.push('模擬計時資料異常或缺失');
  if (invalid.length) return { valid: false, tier: 0, status: 'insufficient', label: '資料不足', reasons: invalid, stats, sustained: 'unverified' };

  let tier = tierOf(stats, s.mode);
  const reasons = [];
  if (stats.fps < 58) reasons.push(`平均 FPS ${stats.fps.toFixed(1)}，低於 60 FPS 檔門檻 58`);
  if (stats.fps < 29) reasons.push('平均 FPS 也低於最低候選檔門檻 29');
  if (stats.p95FrameMs > 20) reasons.push(`P95 ${stats.p95FrameMs.toFixed(1)} ms，高於 60 FPS 檔門檻 20 ms`);
  if (stats.p95FrameMs > 40) reasons.push('P95 也高於最低候選檔門檻 40 ms');
  if (stats.framesOver33msPercent >= 1) reasons.push(`超過 33.3 ms 的幀占 ${stats.framesOver33msPercent.toFixed(2)}%，未低於 1%（只影響 60 FPS 檔）`);
  if (s.mode === 'live' && stats.simulationToWallRatio < .95) reasons.push(`模擬速度 ${(stats.simulationToWallRatio * 100).toFixed(1)}%，低於 95%，火焰已放慢`);
  const trend = windows(s), long = s.secondsTarget >= RULES.sustainedSeconds;
  let sustained = 'not_tested';
  if (long) {
    if (!trend.hasSteps) { sustained = 'unverified'; reasons.push('缺少逐幀模擬步數，不能確認長測前後段的模擬速度'); }
    else {
      const wholeTier = tier;
      tier = Math.min(tier, tierOf(trend.first, s.mode), tierOf(trend.last, s.mode));
      if (tier < wholeTier) reasons.push('前段或後段比整段平均的達標檔位低，採較差結果');
      sustained = trend.fpsDeclinePercent > RULES.maxFpsDeclinePercent ? 'decline' : 'stable';
      if (sustained === 'decline') reasons.push(`後 1/3 的 FPS 比前 1/3 下降 ${trend.fpsDeclinePercent.toFixed(1)}%，超過 10% 提醒線；原因未確定`);
      if (!tier && tierOf(stats, s.mode)) reasons.push('整段平均尚可，但前段或後段未達 30 FPS 檔／模擬速度門檻');
    }
  }
  const unstable = sustained === 'decline' || (long && sustained === 'unverified');
  const status = unstable ? 'unstable' : tier === 60 ? 'good' : tier === 30 ? 'fallback' : 'fail';
  const label = unstable ? '持續性未通過' : tier === 60 ? '60 FPS 檔達標' : tier === 30 ? '僅達 30 FPS 檔' : '未達標';
  return { valid: true, tier, status, label, reasons, stats, sustained, trend };
}

export function settingsKey(settings, canvas) {
  return JSON.stringify([settings.count, settings.size, settings.layout, settings.scale, settings.glow, ...canvas]);
}
export function assessBatch(batch, samples, { liveAvailable = true } = {}) {
  const base = { rulesVersion: RULES.version, batchId: batch?.id ?? null, recommendation: null, modes: {}, reasons: [], visualQuality: batch?.visualQuality || 'pending', scope: batch ? { settings: batch.settings, canvas: batch.canvas, secondsPerSegment: batch.duration } : null };
  if (!batch) return { ...base, status: 'waiting', title: '測完後，自動告訴你怎麼選', detail: '選好畫質，按「一鍵測數量上限」；或只比較目前數量。', next: '建議先用 4 個火焰、200 px、1×、柔光開啟。' };
  const selected = samples.filter(s => s.batchId === batch.id);
  for (const mode of ['baked', 'live']) {
    const items = selected.filter(s => s.mode === mode).map(s => ({ sample: s, assessment: assessSample(s) }));
    if (!items.length) continue;
    const valid = items.every(x => x.assessment.valid);
    const tier = Math.min(...items.map(x => x.assessment.tier));
    const acrossDecline = items.length > 1 && items[0].assessment.stats.fps > 0 ? (items[0].assessment.stats.fps - items.at(-1).assessment.stats.fps) / items[0].assessment.stats.fps * 100 : 0;
    const unstable = items.some(x => x.assessment.status === 'unstable') || acrossDecline > RULES.maxFpsDeclinePercent;
    const reasons = [...new Set(items.flatMap(x => x.assessment.reasons))];
    if (acrossDecline > 10) reasons.push(`後一次同模式記錄比前一次 FPS 下降 ${acrossDecline.toFixed(1)}%，建議重測；不能據此認定是發熱`);
    base.modes[mode] = {
      valid, tier, eligible: valid && tier > 0 && !unstable,
      status: !valid ? 'insufficient' : unstable ? 'unstable' : tier === 60 ? 'good' : tier === 30 ? 'fallback' : 'fail',
      label: !valid ? '資料不足' : unstable ? '持續性未通過' : tier === 60 ? '60 FPS 檔達標' : tier === 30 ? '僅達 30 FPS 檔' : '未達標',
      sustained: items.every(x => x.assessment.sustained === 'stable') && !unstable,
      reasons, samples: items.map(x => x.sample.id),
      worstFps: Math.min(...items.map(x => x.assessment.stats.fps)),
      bestFps: Math.max(...items.map(x => x.assessment.stats.fps)),
      worstP95Ms: Math.max(...items.map(x => x.assessment.stats.p95FrameMs)),
      gpuMeans: items.map(x => x.assessment.stats.gpuMeanMs),
      gpuReliable: items.every(x => !x.sample.gpuDisjoint && x.assessment.stats.gpuSamples / x.sample.intervals.length >= RULES.gpuAdvantage.minCoverage && finite(x.assessment.stats.gpuMeanMs)),
    };
  }
  const compatible = selected.every(s => settingsKey(s.settings, s.canvas) === settingsKey(batch.settings, batch.canvas) && s.secondsTarget === batch.duration);
  const complete = batch.status === 'complete' && selected.length === batch.sequence.length && selected.every((s, i) => s.mode === batch.sequence[i] && assessSample(s).valid);
  if (!compatible || !complete) return { ...base, status: 'insufficient', title: batch.status === 'running' ? '測試進行中，尚未做最終推薦' : '資料不足，暫不推薦模式', detail: !compatible ? '設定或畫布尺寸不同，不能合併比較。' : '須完成同一次、相同設定的所有測試段落。中止段不算通過。', next: '保持頁面前台，完成一次 A/B/B/A 比較。' };
  if (batch.kind !== 'compare' && liveAvailable) return { ...base, status: 'partial', title: '單一模式已評分，還不能比較優劣', detail: '上方顯示這個模式的達標情況；尚未測試另一種模式。', next: '按「比較目前數量」，完成 A/B/B/A。' };
  if (batch.kind === 'compare' && (!base.modes.baked || !base.modes.live || batch.sequence.length !== 4 || batch.sequence.filter(m => m === 'baked').length !== 2 || batch.sequence.filter(m => m === 'live').length !== 2)) return { ...base, status: 'insufficient', title: '缺少完整的雙模式對照', detail: '兩種模式各需要兩段有效記錄。', next: '重新完成 A/B/B/A 比較。' };

  const accepted = mode => base.visualQuality === 'pending' || base.visualQuality === 'both' || base.visualQuality === mode;
  const candidates = ['baked', 'live'].filter(m => base.modes[m]?.eligible && accepted(m) && (m !== 'live' || liveAvailable));
  if (!candidates.length) {
    const visuallyRejected = Object.entries(base.modes).some(([m, v]) => v.eligible && !accepted(m));
    return { ...base, status: 'fail', title: visuallyRejected ? '目前沒有兼顧畫質與效能的模式' : '目前設定不建議使用', detail: visuallyRejected ? '達標的模式未獲你接受畫質，不能只憑 FPS 推薦。' : '沒有模式同時通過幀時間、模擬速度與已觀測的持續性檢查。', next: '先關柔光，再試 0.5× 或減少數量；每次改一項後重測。' };
  }
  let choice = candidates[0], reason;
  if (candidates.length === 1) reason = !liveAvailable ? '裝置不支援即時流體所需的浮點渲染，烘焙模式已通過本次性能門檻。' : '另一模式未同時滿足本次性能、穩定性與已確認的畫質條件。';
  else if (base.modes.live.tier > base.modes.baked.tier) { choice = 'live'; reason = '即時模式通過較高的 FPS 檔；烘焙模式只通過較低檔。'; }
  else if (base.modes.baked.tier > base.modes.live.tier) { choice = 'baked'; reason = '烘焙模式通過較高的 FPS 檔；即時模式只通過較低檔。'; }
  else {
    const b = base.modes.baked, l = base.modes.live;
    const comparableCadence = Math.min(b.worstFps, l.worstFps) / Math.max(b.bestFps, l.bestFps) >= RULES.gpuAdvantage.minCadenceRatio;
    const clearLiveAdvantage = comparableCadence && b.gpuReliable && l.gpuReliable && Math.max(...l.gpuMeans) <= Math.min(...b.gpuMeans) * (1 - RULES.gpuAdvantage.minFraction) && mean(b.gpuMeans) - mean(l.gpuMeans) >= RULES.gpuAdvantage.minMs;
    const clearBakedAdvantage = comparableCadence && b.gpuReliable && l.gpuReliable && Math.max(...b.gpuMeans) <= Math.min(...l.gpuMeans) * (1 - RULES.gpuAdvantage.minFraction) && mean(l.gpuMeans) - mean(b.gpuMeans) >= RULES.gpuAdvantage.minMs;
    if (clearLiveAdvantage) { choice = 'live'; reason = '兩者通過同一檔，即時模式在兩次記錄的 GPU 平均耗時皆有明顯優勢（至少 20%，平均差至少 0.2 ms）。'; }
    else if (clearBakedAdvantage) { choice = 'baked'; reason = `兩者通過同一檔，烘焙模式的 GPU 平均耗時持續較低：烘焙 ${mean(b.gpuMeans).toFixed(2)} ms，即時 ${mean(l.gpuMeans).toFixed(2)} ms。這組設定下，烘焙能保留更多圖形運算餘量；電量差異尚未測量。`; }
    else { choice = 'baked'; reason = '兩者通過同一檔；裝飾性火焰優先烘焙，可省去現場流體求解。這是用途取捨，並不代表已測得較省電。需要動態氣流互動時，即時模式也是可選方案。'; }
  }
  const sustained = candidates.every(m => base.modes[m].sustained);
  const needsVisual = base.visualQuality === 'pending';
  const scopeNote = !sustained ? '這是快速初篩，尚未通過 180 秒長測。' : '本次 180 秒段落的前後段與重複記錄未觸發掉速提醒；不是溫度或電池驗證。';
  return { ...base, recommendation: choice, status: base.modes[choice].tier === 60 ? 'good' : 'fallback', title: `建議${choice === 'baked' ? '烘焙動畫' : '共用即時模擬'}${base.modes[choice].tier === 30 ? ' · 僅限 30 FPS 檔候選' : ''}`, detail: reason, reasons: [scopeNote, ...(needsVisual ? ['畫質尚未確認，這是性能建議。'] : []), '只適用本次設定與畫布尺寸；還需要在完整遊戲中驗證。'], confidence: sustained ? 'sustained-observed' : 'preliminary', next: !sustained ? '將每段改成 180 秒，以相同設定再比較；之後測密集重疊。' : needsVisual ? '確認下方畫質選項，再決定是否進入遊戲內測試。' : '以此設定進入遊戲內測試，確認轉輪、UI 與其他特效一起運行的成本。' };
}
