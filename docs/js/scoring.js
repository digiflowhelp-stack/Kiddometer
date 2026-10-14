// Age-rating model: metric thresholds per age band and aggregation rules.
//
// Evidence-based thresholds (see index.html#metodologia for citations):
// - cuts/min: Lillard & Peterson (2011) measured pacing as cuts/min.
//   Caillou (~1.8 cuts/min) was harmless for preschoolers, SpongeBob
//   (~5.5 cuts/min) impaired executive function in 4-year-olds.
// - flashes/s: WCAG 2.3.1 / ITU-R BT.1702 set 3 flashes/s as the
//   photosensitive-seizure safety limit at any age.
// - volume peaks: absolute SPL cannot be measured from a file, so we
//   score sudden loudness jumps relative to the programme's own integrated
//   loudness (ITU-R BT.1770 K-weighting, EBU R128 style).
//
// Heuristic thresholds (calibrated, flagged with evidence:false in the UI):
// motion, complexity, soundDensity.

export const BANDS = ['0-3', '4-6', '7-12', '13+'];

export const BAND_COLORS = {
  '0-3': '#20a05f',
  '4-6': '#7cb342',
  '7-12': '#f39c12',
  '13+': '#e74c3c',
};

export const METRICS = {
  cuts: {
    label: 'Visual cuts',
    unit: 'cuts/min',
    thresholds: [2, 4, 8],
    evidence: true,
    description: 'Shot changes per minute. A fast editing pace is associated with worse immediate executive function in preschoolers.',
  },
  motion: {
    label: 'On-screen motion',
    unit: 'index 0-100',
    thresholds: [5, 10, 18],
    evidence: false,
    description: 'Mean amount of change between consecutive frames within the same shot. Approximates continuous visual dynamism.',
  },
  complexity: {
    label: 'Visual complexity',
    unit: 'index 0-100',
    thresholds: [8, 14, 22],
    evidence: false,
    description: 'Edge density per frame (detail and saturation of elements on screen).',
  },
  flashes: {
    label: 'Flashes',
    unit: 'flashes/s (max)',
    thresholds: [0.5, 1.5, 3],
    evidence: true,
    description: 'Luminance flickers per second. More than 3/s breaches WCAG 2.3.1 and poses a photosensitive risk at any age.',
  },
  volumePeaks: {
    label: 'Volume peaks',
    unit: 'dB over average',
    thresholds: [6, 9, 12],
    evidence: true,
    description: 'Maximum short-term loudness jump relative to the video\'s average loudness (jumpscares, sound stings).',
  },
  soundDensity: {
    label: 'Sound density',
    unit: 'events/min',
    thresholds: [5, 10, 20],
    evidence: false,
    description: 'Salient sound events per minute (abrupt appearances of sound above the video\'s usual level).',
  },
};

export const METRIC_KEYS = Object.keys(METRICS);

// Returns band index (0..3) required by a metric value.
export function bandIndexFor(metricKey, value) {
  if (value == null || Number.isNaN(value)) return 0;
  const t = METRICS[metricKey].thresholds;
  for (let i = 0; i < t.length; i++) {
    if (value <= t[i]) return i;
  }
  return t.length; // 13+
}

// Per-interval rating: the strictest metric decides.
export function classifyInterval(metricValues) {
  const perMetric = {};
  let worst = 0;
  let worstKey = null;
  for (const key of METRIC_KEYS) {
    const idx = bandIndexFor(key, metricValues[key]);
    perMetric[key] = idx;
    if (idx > worst) {
      worst = idx;
      worstKey = key;
    }
  }
  return { perMetric, bandIndex: worst, drivenBy: worstKey };
}

// Global rating: 90th percentile of interval ratings, so sustained intensity
// dominates while a single outlier interval does not. A photosensitivity
// violation (>3 flashes/s) always escalates to 13+ with an explicit warning.
export function overallRating(intervals) {
  const indices = intervals.map((iv) => iv.rating.bandIndex).sort((a, b) => a - b);
  const p90 = indices[Math.min(indices.length - 1, Math.floor(0.9 * (indices.length - 1) + 0.999))];

  const flashLimit = METRICS.flashes.thresholds[2];
  const flashViolation = intervals.some((iv) => (iv.metrics.flashes ?? 0) > flashLimit);

  const warnings = [];
  if (flashViolation) {
    warnings.push({
      type: 'photosensitivity',
      text: 'The video exceeds 3 flashes per second (WCAG 2.3.1). Risk of photosensitive seizures at any age. Not recommended for people with photosensitive epilepsy.',
    });
  }

  const maxIdx = indices[indices.length - 1];
  if (maxIdx > p90) {
    warnings.push({
      type: 'peaks',
      text: 'Some specific moments of the video are more intense than the overall rating. Check the timeline.',
    });
  }

  const bandIndex = flashViolation ? BANDS.length - 1 : p90;
  return { bandIndex, band: BANDS[bandIndex], warnings, flashViolation };
}

// Summary value per metric across intervals: 90th percentile too,
// consistent with the global rule.
export function summarizeMetric(intervals, key) {
  const values = intervals
    .map((iv) => iv.metrics[key])
    .filter((v) => v != null && !Number.isNaN(v))
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const i = Math.min(values.length - 1, Math.floor(0.9 * (values.length - 1) + 0.999));
  return values[i];
}
