// IEC 60063 preferred-number series (E6, E12, E24, E96), nearest-value search, colour code
// (IEC 60062) and Monte-Carlo of a resistive divider built from toleranced parts.
//
// Each En series spaces values ≈ 10^(1/n) apart, so the ±tolerance bands of neighbouring values
// just touch/overlap: E6 ↔ ±20 %, E12 ↔ ±10 %, E24 ↔ ±5 %, E96 ↔ ±1 %.
// Divider ratio k = R2/(R1+R2). Worst case: k_max = R2(1+t)/(R2(1+t) + R1(1−t)), k_min likewise.
// Sensitivities: ∂k/k = (1−k)(∂R2/R2 − ∂R1/R1)  → σ_k/k = (1−k)·√2·σ_R  for independent parts.
// Uniform ±t distribution has σ = t/√3; a Gaussian with t = 3σ has σ = t/3.

export const SERIES: Record<string, number[]> = {
  E6: [1.0, 1.5, 2.2, 3.3, 4.7, 6.8],
  E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
  E24: [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1],
  E96: [1.00, 1.02, 1.05, 1.07, 1.10, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.30, 1.33, 1.37, 1.40, 1.43, 1.47, 1.50, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.00, 2.05, 2.10, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.80, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.40, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.90, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.50, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76],
};
export type SeriesName = 'E6' | 'E12' | 'E24' | 'E96';
export const SERIES_TOL: Record<SeriesName, number> = { E6: 0.2, E12: 0.1, E24: 0.05, E96: 0.01 };

const fix = (x: number) => Number(x.toPrecision(6)); // kill float noise like 4699.999999

/** All series values in the decades around v: below, nearest (log distance) and above. */
export function nearest(v: number, name: SeriesName) {
  const s = SERIES[name]; const e = Math.floor(Math.log10(v));
  const cands: number[] = [];
  for (let d = e - 1; d <= e + 1; d++) for (const m of s) cands.push(fix(m * 10 ** d));
  cands.sort((a, b) => a - b);
  let best = cands[0];
  for (const c of cands) if (Math.abs(Math.log(c / v)) < Math.abs(Math.log(best / v))) best = c;
  const below = [...cands].reverse().find(c => c <= v * (1 + 1e-12)) ?? cands[0];
  const above = cands.find(c => c >= v * (1 - 1e-12)) ?? cands[cands.length - 1];
  return { value: best, err: best / v - 1, below, above };
}

// ---- colour code (IEC 60062) ----------------------------------------------------------------
export const DIGIT_COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
export const MULT_COLORS: Record<number, string> = { [-2]: 'silver', [-1]: 'gold', 0: 'black', 1: 'brown', 2: 'red', 3: 'orange', 4: 'yellow', 5: 'green', 6: 'blue', 7: 'violet', 8: 'grey', 9: 'white' };
export const TOL_COLORS: [number, string][] = [[0.01, 'brown'], [0.02, 'red'], [0.005, 'green'], [0.0025, 'blue'], [0.001, 'violet'], [0.0005, 'grey'], [0.05, 'gold'], [0.1, 'silver'], [0.2, 'none']];

export function tolColor(t: number) {
  let best = TOL_COLORS[0]; for (const c of TOL_COLORS) if (Math.abs(c[0] - t) < Math.abs(best[0] - t)) best = c; return best[1];
}

/** Colour bands for a resistance: digits (2 or 3) + multiplier + tolerance. Returns null if unrepresentable. */
export function colorBands(r: number, digits: 2 | 3, tol: number) {
  if (!(r > 0)) return null;
  const e = Math.floor(Math.log10(r)) - (digits - 1);
  let sig = Math.round(r / 10 ** e);
  let mult = e;
  if (sig >= 10 ** digits) { sig = Math.round(sig / 10); mult += 1; }
  if (mult < -2 || mult > 9) return null;
  const ds = String(sig).padStart(digits, '0').split('').map(Number);
  return { digits: ds, mult, bands: [...ds.map(d => DIGIT_COLORS[d]), MULT_COLORS[mult], tolColor(tol)], value: fix(sig * 10 ** mult) };
}

// ---- Monte-Carlo divider --------------------------------------------------------------------
/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Sample a relative deviation in [−t, t]: uniform, or Gaussian with σ = t/3 truncated at ±t. */
function dev(r: () => number, t: number, dist: 'uniform' | 'gauss') {
  if (dist === 'uniform') return (2 * r() - 1) * t;
  for (;;) { const u = Math.max(1e-12, r()), v = r(); const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * t / 3; if (Math.abs(z) <= t) return z; }
}

export function dividerWorstCase(r1: number, r2: number, t: number) {
  const k = r2 / (r1 + r2);
  const kmax = (r2 * (1 + t)) / (r2 * (1 + t) + r1 * (1 - t));
  const kmin = (r2 * (1 - t)) / (r2 * (1 - t) + r1 * (1 + t));
  return { k, kmin, kmax };
}

export function monteCarlo(vin: number, r1: number, r2: number, t: number, n: number, dist: 'uniform' | 'gauss', seed = 1) {
  const r = rng(seed); const out = new Float64Array(n);
  let sum = 0, sum2 = 0, mn = Infinity, mx = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = r1 * (1 + dev(r, t, dist)), b = r2 * (1 + dev(r, t, dist));
    const v = vin * b / (a + b); out[i] = v; sum += v; sum2 += v * v; if (v < mn) mn = v; if (v > mx) mx = v;
  }
  const mean = sum / n; const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  return { samples: out, mean, std, min: mn, max: mx };
}
/** First-order predicted σ of Vout. */
export function predictedStd(vin: number, r1: number, r2: number, t: number, dist: 'uniform' | 'gauss') {
  const k = r2 / (r1 + r2); const sr = dist === 'uniform' ? t / Math.sqrt(3) : t / 3;
  return vin * k * (1 - k) * Math.SQRT2 * sr;
}

export function histogram(xs: ArrayLike<number>, lo: number, hi: number, bins: number) {
  const c = new Array(bins).fill(0); const w = (hi - lo) / bins;
  for (let i = 0; i < xs.length; i++) { const b = Math.floor((xs[i] - lo) / w); if (b >= 0 && b < bins) c[b]++; else if (xs[i] === hi) c[bins - 1]++; }
  return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * w), counts: c };
}
