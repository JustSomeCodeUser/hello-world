import { assessBatch, assessSample, settingsKey } from './assessment.js';

export function assessmentFor(batch, samples, liveAvailable) {
  return assessBatch(batch, samples, { liveAvailable });
}
export function renderAssessment(batch, samples, liveAvailable, settings, canvas) {
  const a = assessmentFor(batch, samples, liveAvailable);
  const card = document.getElementById('assessment');
  card.dataset.status = a.status;
  document.getElementById('verdictTitle').textContent = a.title;
  document.getElementById('verdictDetail').textContent = a.detail;
  document.getElementById('verdictNext').textContent = a.next;
  const scope = document.getElementById('verdictScope');
  if (a.scope) {
    const s = a.scope.settings;
    scope.textContent = `本次：${s.count} 團 · ${s.size} px · ${s.scale}× · ${s.layout === 'spread' ? '均勻分佈' : '密集重疊'} · 柔光${s.glow === 'on' ? '開' : '關'} · 畫布 ${a.scope.canvas.join('×')} · 每段 ${a.scope.secondsPerSegment} 秒`;
    if (settingsKey(s, a.scope.canvas) !== settingsKey(settings, canvas)) scope.textContent += '。目前設定已改變，以下是上一次設定的結果。';
  } else scope.textContent = '只判斷本次實測設定，不推算其他火焰數量或整台手機的能力。';
  const modeList = document.getElementById('modeVerdicts');
  modeList.replaceChildren();
  for (const [mode, info] of Object.entries(a.modes)) {
    const box = document.createElement('div');
    box.className = 'mode-verdict';
    box.dataset.status = info.status;
    const title = document.createElement('strong');
    title.textContent = `${mode === 'baked' ? '烘焙動畫' : '共用即時模擬'}：${info.label}`;
    box.append(title);
    const measured = document.createElement('p');
    measured.textContent = `以本次各段較差結果判定 · FPS ${Number.isFinite(info.worstFps) ? info.worstFps.toFixed(1) : '—'} / P95 ${Number.isFinite(info.worstP95Ms) ? info.worstP95Ms.toFixed(1) : '—'} ms`;
    box.append(measured);
    for (const reason of info.reasons) {
      const line = document.createElement('p'); line.textContent = reason; box.append(line);
    }
    modeList.append(box);
  }
  const notes = document.getElementById('verdictNotes');
  notes.replaceChildren();
  for (const text of a.reasons || []) { const li = document.createElement('li'); li.textContent = text; notes.append(li); }
  return a;
}

export function verdictCell(sample) {
  const result = assessSample(sample), td = document.createElement('td');
  td.className = 'sample-verdict'; td.dataset.status = result.status;
  td.textContent = result.label;
  td.title = result.reasons.join('；') || (result.sustained === 'not_tested' ? '快速初篩，尚未完成 180 秒長測。' : '本段未觸發持續性提醒。');
  return td;
}
