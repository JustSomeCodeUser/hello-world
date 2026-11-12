import { assessBatch, assessSample, settingsKey } from './assessment.js';
import { assessSweep, qualityKey } from './sweep.js';

export function assessmentFor(batch, samples, liveAvailable) {
  if (batch?.kind === 'sweep') return assessSweep(batch, samples);
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
    scope.textContent = `本次：${a.kind === 'sweep' ? '4／16／32／64' : s.count} 團 · ${s.size} px · ${s.scale}× · ${s.layout === 'spread' ? '均勻分佈' : '密集重疊'} · 柔光${s.glow === 'on' ? '開' : '關'} · 畫布 ${a.scope.canvas.join('×')} · 每段 ${a.scope.secondsPerSegment} 秒`;
    const key = a.kind === 'sweep' ? qualityKey : settingsKey;
    if (key(s, a.scope.canvas) !== key(settings, canvas)) scope.textContent += '。目前設定已改變，以下是上一次設定的結果。';
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
    const cap = n => n === null ? '尚無有效上限' : n === 0 ? '無通過檔位' : `${n} 個${n === 64 ? '（已測到 64，未測更高）' : '（最高實測通過）'}`;
    measured.textContent = a.kind === 'sweep' ? (info.supported ? `60 FPS 檔：${cap(info.max60)}；30 FPS 檔：${cap(info.max30)}` : '缺少即時流體所需的浮點渲染能力；未冒充已測。') : `以本次各段較差結果判定 · FPS ${Number.isFinite(info.worstFps) ? info.worstFps.toFixed(1) : '—'} / P95 ${Number.isFinite(info.worstP95Ms) ? info.worstP95Ms.toFixed(1) : '—'} ms`;
    box.append(measured);
    for (const reason of info.reasons || []) {
      const line = document.createElement('p'); line.textContent = reason; box.append(line);
    }
    modeList.append(box);
  }
  if (a.kind === 'sweep') {
    const table = document.createElement('table'); table.className = 'sweep-table';
    const head = document.createElement('tr');
    for (const text of ['數量', '烘焙', '即時']) { const th = document.createElement('th'); th.textContent = text; head.append(th); }
    table.append(head);
    for (const row of a.counts) {
      const tr = document.createElement('tr'), count = document.createElement('th'); count.textContent = row.count; tr.append(count);
      for (const mode of ['baked', 'live']) {
        const info = row.assessment.modes[mode], td = document.createElement('td');
        td.textContent = !a.modes[mode].supported ? '不支援' : !row.complete ? '未完成' : info?.label || '無資料';
        if (row.complete && info) {
          const p = document.createElement('small'); p.textContent = `FPS ${info.worstFps.toFixed(1)} / P95 ${info.worstP95Ms.toFixed(1)} ms`; td.append(p);
          if (info.reasons.length) { const d = document.createElement('details'), s = document.createElement('summary'); s.textContent = '原因'; d.append(s); const p = document.createElement('p'); p.textContent = info.reasons.join('；'); d.append(p); td.append(d); }
        }
        tr.append(td);
      }
      table.append(tr);
    }
    modeList.append(table);
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
