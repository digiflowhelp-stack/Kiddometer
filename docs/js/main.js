import { analyzeVideoFile } from './video-analyzer.js';
import { analyzeAudioFile } from './audio-analyzer.js';
import {
  BANDS, METRICS, METRIC_KEYS, classifyInterval, overallRating, summarizeMetric,
} from './scoring.js';
import {
  formatTime, findDrivers, verdictTitle, verdictSummary, confidence,
  flashViolationRange, warningText, advice, buildTips, intenseMoments,
  intensityScore, metricCaption,
} from './insights.js';
import { BACKEND_URL } from './config.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const BAND_VAR = ['var(--age-0-3)', 'var(--age-4-6)', 'var(--age-7-12)', 'var(--age-13)'];
const BAND_LABELS = ['0–3', '4–6', '7–12', '13+'];

const METRIC_ICONS = {
  cuts: 'scissors',
  motion: 'move',
  complexity: 'scan-eye',
  flashes: 'zap',
  volumePeaks: 'volume-2',
  soundDensity: 'audio-waveform',
};

let mode = 'basic';
let activeTab = 'file';
let lastReport = null;

function icons() {
  window.lucide?.createIcons();
}

function agePillHTML(bandIndex, label, small = false) {
  return `<span class="age-pill band-${bandIndex}${small ? ' small' : ''}"><span class="dot"></span>${label}</span>`;
}

/* ================= Static home content ================= */

const AGE_CARD_DATA = [
  { band: 0, label: '0–3 years', big: 'Avoid', caption: 'Better with no screens' },
  { band: 1, label: '4–6 years', big: '≤ 1 h', caption: 'Supervised by an adult' },
  { band: 2, label: '7–12 years', big: '1–2 h', caption: 'With breaks and company' },
  { band: 3, label: '13+ years', big: 'Balanced', caption: 'Autonomy with judgement' },
];

function thresholdRows(bandIdx) {
  const rows = [
    ['Cuts / min', 'cuts', ''],
    ['Flashes / s', 'flashes', ''],
    ['Volume peaks', 'volumePeaks', ' dB'],
    ['Sound events / min', 'soundDensity', ''],
  ];
  return rows.map(([label, key, suffix]) => {
    const t = METRICS[key].thresholds;
    let value;
    if (bandIdx < 3) value = `≤ ${String(t[bandIdx])}${suffix}`;
    else value = key === 'flashes' ? '> 3 · warning' : `> ${t[2]}${suffix}`;
    return `<div class="threshold-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
  }).join('');
}

function renderAgeCards() {
  $('#age-cards').innerHTML = AGE_CARD_DATA.map((c) => `
    <div class="tile age-card">
      <div>${agePillHTML(c.band, c.label)}</div>
      <div>
        <div class="big-value">${c.big}</div>
        <p class="big-caption">${c.caption}</p>
      </div>
      <div class="threshold-list">${thresholdRows(c.band)}</div>
    </div>`).join('');
}

const METH_CARDS = [
  {
    icon: 'scissors', title: 'Visual cuts',
    friendly: 'How many times the shot changes per minute. A pace that is too fast exhausts the attention of the youngest children.',
    base: 'Lillard & Peterson (2011): ~5.5 cuts/min impaired executive function in 4-year-olds; ~1–2 cuts/min did not. Confirmed by a 2025 meta-analysis (Hinten et al.).',
  },
  {
    icon: 'zap', title: 'Flashes',
    friendly: 'Abrupt changes in light that can be unpleasant or, in extreme cases, dangerous.',
    base: 'Simplified WCAG 2.3.1: more than 3 flashes/s can trigger seizures in people with photosensitive epilepsy. If it is exceeded, Kiddometer always warns.',
  },
  {
    icon: 'volume-2', title: 'Volume peaks',
    friendly: 'Jumpscares and sound stings: loudness spikes far above the video\'s own average.',
    base: 'ITU-R BT.1770 K-weighted loudness (the TV standard behind EBU R128) in 400 ms windows. The WHO sets safe listening for children below 75 dB.',
  },
  {
    icon: 'audio-waveform', title: 'Sound density',
    friendly: 'How many striking sounds per minute bombard the ear: effects, stings, exclamations.',
    base: 'Christakis et al. (PNAS 2018): excessive audiovisual stimulation at early ages is linked to later attention problems.',
  },
  {
    icon: 'move', title: 'On-screen motion',
    friendly: 'How much the image moves within a single shot: a calm talk is not a chase scene.',
    base: 'Mean luminance change between frames of the same shot. Heuristic threshold.',
  },
  {
    icon: 'scan-eye', title: 'Visual complexity',
    friendly: 'How many elements compete at once for attention on screen.',
    base: 'Edge density (Sobel operator) per frame. Heuristic threshold.',
  },
];

function renderMethCards() {
  $('#meth-cards').innerHTML = METH_CARDS.map((c) => `
    <div class="tile meth-card">
      <div class="meth-top">
        <span class="icon-wrap md"><i data-lucide="${c.icon}"></i></span>
        <h3>${c.title}</h3>
      </div>
      <p class="meth-friendly">${c.friendly}</p>
      <div class="base-wrap">
        <span class="base-label">SCIENTIFIC BASIS</span>
        <p class="base-text">${c.base}</p>
      </div>
    </div>`).join('');
}

const REFERENCES = [
  ['Lillard & Peterson (2011)', "The Immediate Impact of Different Types of Television on Young Children's Executive Function. Pediatrics.", 'https://doi.org/10.1542/peds.2010-1919'],
  ['Hinten et al. (2025)', "Meta-Analytic Review of Media Exposure on Children's Attention and Executive Functions. Developmental Science.", 'https://onlinelibrary.wiley.com/doi/10.1111/desc.70069'],
  ['Christakis et al. (2018)', 'How early media exposure may affect cognitive function. PNAS.', 'https://www.pnas.org/doi/10.1073/pnas.1711548115'],
  ['W3C — WCAG 2.1, SC 2.3.1', 'Three Flashes or Below Threshold.', 'https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html'],
  ['ITU-R BT.1770 / EBU R128', 'Programme loudness measurement.', 'https://tech.ebu.ch/docs/r/r128.pdf'],
  ['OMS (2019)', 'Guidelines on physical activity, sedentary behaviour and sleep for children under 5.', 'https://apps.who.int/iris/handle/10665/311664'],
  ['OMS — Make Listening Safe', 'Safe listening for children: < 75 dB.', 'https://cdn.who.int/media/docs/default-source/documents/health-topics/deafness-and-hearing-loss/monograph-on-noise-exposure-limit-for-children-in-recreational-settings.pdf'],
  ['AAP (2016)', 'Media and Young Minds. Pediatrics.', 'https://publications.aap.org/pediatrics/article/138/5/e20162591/60321/Media-and-Young-Minds'],
];

function renderRefs() {
  $('#refs-grid').innerHTML = REFERENCES.map(([title, desc, url]) => `
    <a class="ref-card" href="${url}" target="_blank" rel="noopener">
      <i data-lucide="external-link"></i>
      <span>
        <span class="ref-title">${title}</span>
        <p class="ref-desc">${desc}</p>
      </span>
    </a>`).join('');
}

/* ================= Input: tabs, mode, sources ================= */

function showError(message) {
  const box = $('#error-box');
  box.textContent = message;
  box.hidden = false;
}

function clearError() {
  $('#error-box').hidden = true;
}

function setTab(tab) {
  activeTab = tab;
  $$('.source-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#panel-file').hidden = tab !== 'file';
  $('#panel-url').hidden = tab !== 'url';
  $('#panel-youtube').hidden = tab !== 'youtube';
  if (tab === 'youtube' && !BACKEND_URL) {
    $('#youtube-hint').textContent = 'No download server configured: YouTube does not allow accessing the video from another site. '
      + 'Download the video to your device and use "Local file" — the analysis is identical.';
  }
}

function setMode(m) {
  mode = m;
  $$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  applyMode();
}

function applyMode() {
  const expert = mode === 'expert';
  $$('.expert-only').forEach((el) => { el.hidden = !expert; });
  $('#basic-tips-section').hidden = expert;
}

function setProgress(videoP, audioP, label) {
  const p = Math.round((videoP * 0.8 + audioP * 0.2) * 100);
  $('#progress-bar').classList.remove('indeterminate');
  $('#progress-bar').style.width = `${p}%`;
  $('#progress-label').textContent = label || `Analyzing… ${p}%`;
}

// Animated bar for phases without a known total (server fetch, download).
function setBusyProgress(label) {
  $('#progress-bar').classList.add('indeterminate');
  $('#progress-bar').style.width = '';
  $('#progress-label').textContent = label;
}

function startProgress(label, busy = false) {
  clearError();
  $('#progress-wrap').hidden = false;
  $('#analyze-btn').disabled = true;
  if (busy) setBusyProgress(label);
  else setProgress(0, 0, label);
}

function stopProgress() {
  $('#progress-wrap').hidden = true;
  $('#analyze-btn').disabled = false;
}

/* ================= Analysis flows ================= */

let pendingFile = null;

async function analyze(file) {
  startProgress('Preparing analysis…');
  const t0 = performance.now();
  let videoP = 0;
  let audioP = 0;

  // Keep the screen awake: analysis stalls if the OS suspends the tab.
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* unsupported */ }

  try {
    const [videoResult, audioResult] = await Promise.all([
      analyzeVideoFile(file, { onProgress: (p) => { videoP = p; setProgress(videoP, audioP); } }),
      analyzeAudioFile(file, { onProgress: (p) => { audioP = p; setProgress(videoP, audioP); } }),
    ]);

    const intervals = videoResult.intervals.map((vi, i) => {
      const ai = audioResult?.intervals[i];
      const metrics = {
        cuts: vi.cuts,
        motion: vi.motion,
        complexity: vi.complexity,
        flashes: vi.flashes,
        volumePeaks: ai ? ai.volumePeaks : null,
        soundDensity: ai ? ai.soundDensity : null,
      };
      return { start: vi.start, end: vi.end, metrics, rating: classifyInterval(metrics) };
    });

    const overall = overallRating(intervals);
    const elapsed = (performance.now() - t0) / 1000;
    const result = {
      fileName: file.name,
      duration: videoResult.duration,
      intervals,
      overall,
      elapsed,
      degraded: videoResult.degraded,
      hasAudio: audioResult !== null,
    };
    renderResults(result);
    // Automation hook: batch tooling (Playwright) polls this global.
    window.__kiddometerResult = result;
    document.dispatchEvent(new CustomEvent('kiddometer:done'));
  } catch (e) {
    showError(e.message || 'Unexpected error during analysis.');
    window.__kiddometerError = e.message || 'unknown';
  } finally {
    wakeLock?.release().catch(() => {});
    stopProgress();
  }
}

const STREAMING_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|tiktok\.com|instagram\.com|facebook\.com|twitch\.tv|reddit\.com|twitter\.com|x\.com)$/i;

async function fetchAsFile(fetchUrl, displayName, label) {
  startProgress(label, true);
  const resp = await fetch(fetchUrl, { mode: 'cors' });
  if (!resp.ok) {
    let detail = '';
    try { detail = (await resp.json()).detail || ''; } catch { /* not JSON */ }
    throw new Error(detail || `The server responded ${resp.status}.`);
  }

  const total = Number(resp.headers.get('Content-Length')) || 0;
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const mb = (received / 1048576).toFixed(1);
    if (total) {
      const pct = Math.min(100, Math.round((received / total) * 100));
      $('#progress-bar').classList.remove('indeterminate');
      $('#progress-bar').style.width = `${pct}%`;
      $('#progress-label').textContent = `Downloading video… ${mb} MB (${pct}%)`;
    } else {
      setBusyProgress(`Downloading video… ${mb} MB`);
    }
  }

  const blob = new Blob(chunks, { type: resp.headers.get('Content-Type') || 'video/mp4' });
  return new File([blob], displayName, { type: blob.type || 'video/mp4' });
}

async function analyzeDirectUrl(rawUrl) {
  clearError();
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    showError('The URL is not valid.');
    return;
  }
  if (STREAMING_HOSTS.test(url.hostname)) {
    setTab('youtube');
    $('#youtube-input').value = rawUrl;
    analyzeYoutube(rawUrl);
    return;
  }
  try {
    const file = await fetchAsFile(url, decodeURIComponent(url.pathname.split('/').pop() || 'video'), 'Downloading video…');
    await analyze(file);
  } catch (e) {
    stopProgress();
    showError('Could not download the URL. The origin must allow CORS and point to a video file. '
      + `Alternative: download the video and use "Local file". Detail: ${e.message}`);
  }
}

async function analyzeYoutube(rawUrl) {
  clearError();
  if (!rawUrl) { showError('Paste a YouTube or Vimeo link.'); return; }
  if (!BACKEND_URL) {
    showError('This installation has no download server configured. YouTube does not allow accessing the video '
      + 'from another site: download the video to your device and use "Local file".');
    return;
  }
  try {
    const file = await fetchAsFile(
      `${BACKEND_URL.replace(/\/$/, '')}/api/fetch?url=${encodeURIComponent(rawUrl)}`,
      'video_online.mp4',
      'Connecting to the platform… the server is preparing the video, it may take 1-2 minutes. Do not close this tab.',
    );
    await analyze(file);
  } catch (e) {
    stopProgress();
    showError(`${e.message} An alternative that always works: download the video and use "Local file".`);
  }
}

function runAnalysis() {
  if (activeTab === 'file') {
    if (pendingFile) analyze(pendingFile);
    else $('#file-input').click();
  } else if (activeTab === 'url') {
    const v = $('#url-input').value.trim();
    if (v) analyzeDirectUrl(v);
    else showError('Paste the direct URL of a video file.');
  } else {
    analyzeYoutube($('#youtube-input').value.trim());
  }
}

/* ================= Results rendering ================= */

function renderResults(data) {
  const { fileName, duration, intervals, overall, elapsed, degraded, hasAudio } = data;
  const overallIndex = overall.bandIndex;
  const drivers = findDrivers(intervals, overallIndex);
  const flashRange = overall.flashViolation ? flashViolationRange(intervals) : null;

  $('#r-file').textContent = `${fileName} · ${formatTime(duration)}`;
  $('#r-done').textContent = `Analyzed in ${formatTime(elapsed)} · 100% local`;

  const circle = $('#r-age-circle');
  circle.textContent = BAND_LABELS[overallIndex];
  circle.style.background = BAND_VAR[overallIndex];
  circle.style.color = '#fff';

  $('#r-confidence').textContent = confidence(intervals);
  $('#r-verdict-title').textContent = verdictTitle(overallIndex);

  let summary = verdictSummary(drivers, overallIndex);
  if (degraded) summary += ' (Compatibility mode: flashes not evaluated.)';
  if (!hasAudio) summary += ' (No analyzable audio track.)';
  $('#r-verdict-summary').textContent = summary;

  const warningTile = $('#r-warning');
  if (flashRange) {
    warningTile.hidden = false;
    $('#r-warning-text').textContent = warningText(flashRange);
  } else {
    warningTile.hidden = true;
  }

  $('#r-advice').textContent = advice(drivers, overallIndex, flashRange);

  renderTimeline(intervals);
  renderMoments(intervals, overallIndex);
  renderMetricCards(intervals);
  renderDonut(intervals);

  const tips = buildTips(drivers, overallIndex, flashRange);
  const tipHTML = tips.map((t) => `
    <div class="tip">
      <i data-lucide="circle-check"></i>
      <span><span class="tip-title">${t.title}</span><p class="tip-desc">${t.desc}</p></span>
    </div>`).join('');
  $('#r-tips').innerHTML = tipHTML;
  $('#r-tips-basic').innerHTML = tipHTML;

  lastReport = data;
  window.__kiddometerReport = data;
  $('#view-home').hidden = true;
  $('#view-results').hidden = false;
  applyMode();
  icons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderTimeline(intervals) {
  const bars = $('#r-bars');
  bars.innerHTML = intervals.map((iv) => {
    const h = Math.round(15 + Math.min(1.5, intensityScore(iv)) / 1.5 * 85);
    const band = iv.rating.bandIndex;
    const driver = iv.rating.drivenBy ? ` · ${METRICS[iv.rating.drivenBy].label.toLowerCase()}` : '';
    return `<span class="bar" style="height:${h}%;background:${BAND_VAR[band]}"
      title="${formatTime(iv.start)}–${formatTime(iv.end)} · ${BAND_LABELS[band]}${driver}"></span>`;
  }).join('');

  const total = intervals[intervals.length - 1].end;
  const n = Math.min(5, Math.max(2, Math.round(total / 120) + 1));
  const labels = [];
  for (let i = 0; i < n; i++) labels.push(formatTime((total * i) / (n - 1)));
  $('#r-xlabels').innerHTML = labels.map((l) => `<span>${l}</span>`).join('');
}

function renderMoments(intervals, overallIndex) {
  const moments = intenseMoments(intervals, overallIndex);
  const tile = $('#r-moments-tile');
  if (!moments.length) {
    tile.querySelector('#r-moments').innerHTML = '<p class="tl-sub">No notable moments: steady intensity.</p>';
    return;
  }
  $('#r-moments').innerHTML = moments.map((m) => `
    <div class="moment">
      <div class="moment-top">
        <span class="moment-time">${formatTime(m.start)}–${formatTime(m.end)}</span>
        ${agePillHTML(m.bandIndex, BAND_LABELS[m.bandIndex], true)}
      </div>
      <p class="moment-desc">${m.description}</p>
    </div>`).join('');
}

function renderMetricCards(intervals) {
  $('#r-metrics').innerHTML = METRIC_KEYS.map((key) => {
    const def = METRICS[key];
    const summary = summarizeMetric(intervals, key);
    const values = intervals.map((iv) => iv.metrics[key] ?? 0);
    const max = Math.max(...values, 1e-6);
    const maxIdx = values.indexOf(Math.max(...values));

    let bandIdx = 0;
    if (summary != null) {
      bandIdx = def.thresholds.findIndex((t) => summary <= t);
      if (bandIdx === -1) bandIdx = def.thresholds.length;
    }
    const isFlashWarn = key === 'flashes' && summary != null && summary > def.thresholds[2];
    const pillLabel = isFlashWarn ? 'Warning' : BAND_LABELS[bandIdx];

    const sparkBars = values.slice(0, 16).map((v, i) => {
      const h = Math.max(4, Math.round((v / max) * 46));
      const color = i === maxIdx ? `background:${BAND_VAR[bandIdx]}` : '';
      return `<span style="height:${h}px;${color}"></span>`;
    }).join('');

    const display = summary == null ? '—'
      : (key === 'volumePeaks' ? `+${String(summary)}` : String(summary));

    return `
      <div class="tile metric-card">
        <div class="mc-top">
          <span class="mc-title"><i data-lucide="${METRIC_ICONS[key]}"></i> ${def.label}</span>
          ${agePillHTML(bandIdx, pillLabel, true)}
        </div>
        <div class="mc-mid">
          <div>
            <div class="mc-value">${display}</div>
            <p class="mc-unit">${def.unit}</p>
          </div>
          <div class="sparkline">${sparkBars}</div>
        </div>
        <div class="mc-caption">${metricCaption(key, summary, intervals)}</div>
      </div>`;
  }).join('');
}

function renderDonut(intervals) {
  const counts = [0, 0, 0, 0];
  for (const iv of intervals) counts[iv.rating.bandIndex]++;
  const total = intervals.length;

  let acc = 0;
  const stops = [];
  for (let b = 3; b >= 0; b--) {
    if (!counts[b]) continue;
    const from = (acc / total) * 360;
    acc += counts[b];
    const to = (acc / total) * 360;
    stops.push(`${BAND_VAR[b]} ${from.toFixed(1)}deg ${to.toFixed(1)}deg`);
  }
  $('#r-donut').style.background = `conic-gradient(${stops.join(', ')})`;
  $('#r-donut-num').textContent = total;

  $('#r-dist').innerHTML = [3, 2, 1, 0]
    .filter((b) => counts[b] > 0)
    .map((b) => `
      <div class="dist-row">
        <span class="dist-left"><span class="dot" style="background:${BAND_VAR[b]}"></span>${BAND_LABELS[b]}</span>
        <span class="dist-value">${counts[b]} ${counts[b] === 1 ? 'segment' : 'segments'} · ${Math.round((counts[b] / total) * 100)}%</span>
      </div>`).join('');
}

/* ================= Report download ================= */

function downloadReport() {
  if (!lastReport) return;
  const { fileName, duration, intervals, overall, elapsed } = lastReport;
  const overallIndex = overall.bandIndex;
  const drivers = findDrivers(intervals, overallIndex);
  const flashRange = overall.flashViolation ? flashViolationRange(intervals) : null;

  const rows = intervals.map((iv) => `
    <tr><td>${formatTime(iv.start)}–${formatTime(iv.end)}</td><td>${BAND_LABELS[iv.rating.bandIndex]}</td>
    ${METRIC_KEYS.map((k) => `<td>${iv.metrics[k] ?? '—'}</td>`).join('')}</tr>`).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Kiddometer Report — ${fileName}</title>
<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#1C1233}
h1{color:#7B61FF}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd;padding:6px 8px;text-align:center}
th{background:#F4F1FB}.badge{display:inline-block;background:${['#2FB67C', '#8BC34A', '#F5A524', '#F0426B'][overallIndex]};color:#fff;padding:6px 18px;border-radius:999px;font-size:22px;font-weight:700}</style></head><body>
<h1>🎬 Kiddometer Report</h1>
<p><strong>${fileName}</strong> · duration ${formatTime(duration)} · analyzed in ${formatTime(elapsed)} · 100% local</p>
<p>Recommended age: <span class="badge">${BAND_LABELS[overallIndex]}</span></p>
<p>${verdictSummary(drivers, overallIndex)}</p>
${flashRange ? `<p style="color:#B22650"><strong>⚠ ${warningText(flashRange)}</strong></p>` : ''}
<p><em>${advice(drivers, overallIndex, flashRange)}</em></p>
<h2>Per-segment detail</h2>
<table><tr><th>Segment</th><th>Age</th>${METRIC_KEYS.map((k) => `<th>${METRICS[k].label}</th>`).join('')}</tr>${rows}</table>
<p style="font-size:12px;color:#9A94AD">An orientation tool: it does not replace the judgement of parents or professionals. Methodology and references in the Kiddometer app.</p>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kiddometer-report-${fileName.replace(/\.[^.]+$/, '')}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ================= Wiring ================= */

function resetToHome() {
  $('#view-results').hidden = true;
  $('#view-home').hidden = false;
  pendingFile = null;
  $('#file-input').value = '';
  $('.drop-title').textContent = 'Drag a video here or click to select';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const dropzone = $('#dropzone');
dropzone.addEventListener('click', () => $('#file-input').click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragging');
  const file = e.dataTransfer.files[0];
  if (file) { pendingFile = file; analyze(file); }
});
$('#file-input').addEventListener('change', () => {
  const file = $('#file-input').files[0];
  if (file) {
    pendingFile = file;
    $('.drop-title').textContent = `Selected: ${file.name}`;
  }
});

$$('.source-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
$$('.mode-btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#analyze-btn').addEventListener('click', runAnalysis);
$('#url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runAnalysis(); });
$('#youtube-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runAnalysis(); });

$$('[data-new-analysis]').forEach((b) => b.addEventListener('click', resetToHome));
$('#logo-link').addEventListener('click', (e) => { e.preventDefault(); resetToHome(); });
$$('[data-scroll-top]').forEach((b) => b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })));
$('#download-report').addEventListener('click', downloadReport);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !$('#progress-wrap').hidden) {
    $('#progress-label').textContent = 'Keep this tab visible: the browser pauses analysis in the background.';
  }
});

renderAgeCards();
renderMethCards();
renderRefs();
setTab('file');
icons();
