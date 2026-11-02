// Sensor calibration & error.  Full scale FS = 10 units, input x in [0, FS].
//   reading  y(x) = offset + gain*x + 4*nonlin*FS*u(1-u) + noise,   u = x/FS   (bow of height nonlin*FS at mid-scale = "INL")
//   noise ~ N(0, sigma^2) per reading (seeded PRNG so the page is reproducible); averaging M readings -> sigma/sqrt(M).
// Calibration fits the forward map y = P(x) through measured (x_ref, mean reading) points by least squares and inverts it:
//   none:  x_hat = y          1-pt: x_hat = y - (y_c - x_c)  (offset only, assumes gain = 1)
//   2-pt:  degree-1 fit (offset + gain);  3-pt: degree-2 fit (+ curvature);  N-pt: degree-3 least squares on N points
// Accuracy = closeness of the mean to the truth (bias, systematic: fixable by calibration). Precision = scatter (random: averaging only).
export const FS = 10;
export type Sensor = { offset: number; gain: number; nonlin: number; noise: number };
export type Mode = 'none' | 'pt1' | 'pt2' | 'pt3' | 'multi';

export function mulberry32(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function gauss(rnd: () => number) { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); }

export const ideal = (s: Sensor, x: number) => s.offset + s.gain * x + 4 * s.nonlin * FS * (x / FS) * (1 - x / FS);
export const measure = (s: Sensor, x: number, rnd: () => number, avg = 1) => { let a = 0; for (let i = 0; i < avg; i++) a += ideal(s, x) + s.noise * gauss(rnd); return a / avg; };

/** Least-squares polynomial fit, returns coefficients c[0..deg] for sum c_k x^k. */
export function polyfit(x: number[], y: number[], deg: number) {
  const n = deg + 1, A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < x.length; i++) { const xs = x[i] / FS; for (let r = 0; r < n; r++) { for (let c = 0; c < n; c++) A[r][c] += xs ** (r + c); A[r][n] += y[i] * xs ** r; } }
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
  const co = new Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * co[k]; co[r] = s / A[r][r]; }
  return co; // coefficients in normalized x/FS
}
export const polyval = (co: number[], x: number) => { const u = x / FS; let s = 0; for (let k = co.length - 1; k >= 0; k--) s = s * u + co[k]; return s; };

export type CalIn = { mode: Mode; nMulti?: number; avg?: number; xcal1?: number; seed?: number };
export function calPoints(mode: Mode, nMulti = 6, xcal1 = FS / 2) {
  if (mode === 'none') return [] as number[];
  if (mode === 'pt1') return [xcal1];
  if (mode === 'pt2') return [0, FS];
  if (mode === 'pt3') return [0, FS / 2, FS];
  const n = Math.max(4, Math.round(nMulti)); return Array.from({ length: n }, (_, i) => FS * i / (n - 1));
}
export function calibrate(s: Sensor, c: CalIn) {
  const xs = calPoints(c.mode, c.nMulti, c.xcal1), rnd = mulberry32(c.seed ?? 7);
  const ys = xs.map(x => measure(s, x, rnd, c.avg ?? 1));
  let co: number[] | null = null; let offsetOnly = 0;
  if (c.mode === 'pt1') offsetOnly = ys[0] - xs[0];
  else if (c.mode === 'pt2') co = polyfit(xs, ys, 1);
  else if (c.mode === 'pt3') co = polyfit(xs, ys, 2);
  else if (c.mode === 'multi') co = polyfit(xs, ys, 3);
  const correct = (y: number) => {
    if (c.mode === 'none') return y; if (c.mode === 'pt1') return y - offsetOnly;
    let lo = -FS, hi = 2 * FS; const f = (x: number) => polyval(co!, x) - y; // monotone-increasing forward map assumed
    if (f(lo) > 0) return lo; if (f(hi) < 0) return hi;
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } return (lo + hi) / 2;
  };
  return { xs, ys, co, offsetOnly, correct, mode: c.mode };
}

/** Systematic error (noise-free sensor) before and after calibration across the range. */
export function errorCurves(s: Sensor, cal: ReturnType<typeof calibrate>, n = 101) {
  const x: number[] = [], raw: number[] = [], fixed: number[] = [];
  for (let i = 0; i < n; i++) { const xi = FS * i / (n - 1); x.push(xi); raw.push(ideal(s, xi) - xi); fixed.push(cal.correct(ideal(s, xi)) - xi); }
  const maxAbs = (a: number[]) => Math.max(...a.map(Math.abs)), rms = (a: number[]) => Math.sqrt(a.reduce((q, v) => q + v * v, 0) / a.length);
  return { x, raw, fixed, maxRaw: maxAbs(raw), maxFixed: maxAbs(fixed), rmsRaw: rms(raw), rmsFixed: rms(fixed) };
}
/** Local slope of corrected-vs-true response (noise gain through the correction). */
export function noiseGain(s: Sensor, cal: ReturnType<typeof calibrate>, x: number) { const h = 0.01 * FS; return (cal.correct(ideal(s, x + h)) - cal.correct(ideal(s, x - h))) / (2 * h); }

/** n repeated readings at truth x, each the mean of `avg` raw samples, corrected. */
export function readings(s: Sensor, cal: ReturnType<typeof calibrate>, x: number, n: number, avg: number, seed = 99) {
  const rnd = mulberry32(seed); const out: number[] = []; for (let i = 0; i < n; i++) out.push(cal.correct(measure(s, x, rnd, avg))); return out;
}
export const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
export const std = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
export function histogram(a: number[], lo: number, hi: number, bins: number) {
  const cnt = new Array(bins).fill(0); for (const v of a) { const k = Math.floor((v - lo) / (hi - lo) * bins); if (k >= 0 && k < bins) cnt[k]++; }
  const x: number[] = [], y: number[] = []; for (let k = 0; k < bins; k++) { x.push(lo + (k + 0.5) * (hi - lo) / bins); y.push(cnt[k] / a.length); }
  return { x, y, width: (hi - lo) / bins };
}
