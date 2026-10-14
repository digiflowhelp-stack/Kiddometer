// Data-driven copy for the results view: verdict, summary, advice, tips,
// intense moments, confidence and per-metric captions.

import { BANDS, METRICS, METRIC_KEYS, bandIndexFor, summarizeMetric } from './scoring.js';

const DRIVER_PHRASES = {
  cuts: 'a very fast editing pace',
  motion: 'a lot of continuous motion on screen',
  complexity: 'images very crowded with elements',
  flashes: 'intense light flashes',
  volumePeaks: 'frequent volume spikes',
  soundDensity: 'many sustained sound stimuli',
};

const VERDICT_TITLES = [
  'Suitable even for the youngest children',
  'Better from age 4',
  'Better from age 7',
  'Better from age 13',
];

const CALM_SUMMARY = 'Slow pace, steady volume and few stimuli. Calm content that does not overload attention.';

export function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// Metrics whose sustained (p90) value demands the final band.
export function findDrivers(intervals, overallIndex) {
  if (overallIndex === 0) return [];
  const drivers = [];
  for (const key of METRIC_KEYS) {
    const summary = summarizeMetric(intervals, key);
    if (summary != null && bandIndexFor(key, summary) >= overallIndex) drivers.push(key);
  }
  return drivers;
}

export function verdictTitle(overallIndex) {
  return VERDICT_TITLES[overallIndex];
}

export function verdictSummary(drivers, overallIndex) {
  if (overallIndex === 0 || !drivers.length) return CALM_SUMMARY;
  const phrases = drivers.map((k) => DRIVER_PHRASES[k]);
  let joined;
  if (phrases.length === 1) joined = phrases[0];
  else joined = `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
  const cap = joined.charAt(0).toUpperCase() + joined.slice(1);
  const target = BANDS[overallIndex] === '13+' ? '13' : BANDS[overallIndex].split('-')[0];
  return `${cap}. For children under ${target} it is exhausting for attention.`;
}

export function confidence(intervals) {
  const n = intervals.length;
  if (n >= 8) return `High confidence · ${n} segments`;
  if (n >= 4) return `Medium confidence · ${n} segments`;
  return `Low confidence · short video (${n} ${n === 1 ? 'segment' : 'segments'})`;
}

// First time range where the WCAG flash limit is exceeded.
export function flashViolationRange(intervals) {
  const limit = METRICS.flashes.thresholds[2];
  const bad = intervals.filter((iv) => (iv.metrics.flashes ?? 0) > limit);
  if (!bad.length) return null;
  return { start: bad[0].start, end: bad[bad.length - 1].end, count: bad.length };
}

export function warningText(range) {
  return `Exceeds 3 flashes per second (WCAG 2.3.1) between ${formatTime(range.start)} and ${formatTime(range.end)}. `
    + 'Not recommended for people with photosensitive epilepsy, at any age.';
}

export function advice(drivers, overallIndex, flashRange) {
  if (overallIndex === 0) {
    return 'Calm content. Even so, better to watch it accompanied, at a moderate volume and without stretching the session.';
  }
  const parts = [];
  if (drivers.includes('volumePeaks') || drivers.includes('soundDensity')) {
    parts.push('turn the volume down');
  }
  parts.push('watch it with them');
  let text = `If young children are going to watch it, ${parts.join(', ')}`;
  if (flashRange) {
    text += ` and skip the ${formatTime(flashRange.start)}–${formatTime(flashRange.end)} segment`;
  }
  text += '.';
  if (drivers.includes('cuts') || drivers.includes('motion') || overallIndex >= 2) {
    text += ' Better not to watch it right before bedtime.';
  }
  return text;
}

export function buildTips(drivers, overallIndex, flashRange) {
  const tips = [
    { title: 'Watch it together', desc: 'Talking about what happens reduces the impact of the stimuli.' },
    { title: 'Volume below 75 dB', desc: 'Safe listening for children according to the WHO.' },
  ];
  if (flashRange) {
    tips.push({
      title: `Skip the ${formatTime(flashRange.start)}–${formatTime(flashRange.end)} segment`,
      desc: 'It concentrates the flashes and volume spikes.',
    });
  }
  if (drivers.includes('cuts') || drivers.includes('motion') || overallIndex >= 2) {
    tips.push({ title: 'Not right before bedtime', desc: 'The fast pace stimulates instead of relaxing.' });
  }
  while (tips.length < 4) {
    tips.push(
      { title: 'Breaks every 20–30 minutes', desc: 'Resting your eyes and moving around balances the session.' },
      { title: 'Alternate with screen-free play', desc: 'The WHO recommends prioritising active play.' },
    );
  }
  return tips.slice(0, 4);
}

const MOMENT_DESCRIPTIONS = {
  cuts: (v) => `${Math.round(v)} shot cuts in a single minute`,
  volumePeaks: (v) => `Abrupt volume spike (+${v} dB)`,
  flashes: (v) => `Flashes over the limit (${v}/s)`,
  soundDensity: (v) => `${Math.round(v)} striking sounds in one minute`,
  motion: () => 'Very high continuous motion',
  complexity: () => 'Image very crowded with elements',
};

export function intenseMoments(intervals, overallIndex, maxItems = 3) {
  const candidates = intervals
    .filter((iv) => iv.rating.bandIndex > 0 && iv.rating.bandIndex >= overallIndex)
    .sort((a, b) => b.rating.bandIndex - a.rating.bandIndex
      || intensityScore(b) - intensityScore(a))
    .slice(0, maxItems);

  return candidates.map((iv) => {
    const key = iv.rating.drivenBy;
    const value = iv.metrics[key];
    return {
      start: iv.start,
      end: iv.end,
      bandIndex: iv.rating.bandIndex,
      description: key ? MOMENT_DESCRIPTIONS[key](value) : 'Intense segment',
    };
  });
}

// 0..1.5 — how far the interval's worst metric exceeds the 7-12 threshold.
export function intensityScore(interval) {
  let worst = 0;
  for (const key of METRIC_KEYS) {
    const v = interval.metrics[key];
    if (v == null) continue;
    worst = Math.max(worst, Math.min(1.5, v / METRICS[key].thresholds[2]));
  }
  return worst;
}

export function metricCaption(key, summary, intervals) {
  const def = METRICS[key];
  if (summary == null) return 'Not evaluated in this analysis';
  const idx = bandIndexFor(key, summary);

  if (key === 'flashes' && summary > def.thresholds[2]) {
    return 'WCAG 2.3.1 limit: 3/s · raises an explicit warning';
  }
  if (idx === 0) {
    return `Below all thresholds · ${def.evidence ? 'no known risk' : 'heuristic threshold'}`;
  }

  const limit = def.thresholds[idx - 1];
  const exceeding = intervals.filter((iv) => {
    const v = iv.metrics[key];
    return v != null && v > limit;
  }).length;
  const sustained = exceeding > intervals.length / 2;
  const qualifier = sustained ? 'exceeds it consistently' : 'exceeds it in some segments';
  return `Threshold ${BANDS[idx - 1]}: ≤ ${limit}${key === 'volumePeaks' ? ' dB' : ''} · ${qualifier}`;
}
