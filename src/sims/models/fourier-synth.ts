// Fourier synthesis model. All waves have period T = 1 (time in fractions of a period).
// Series used (standard results, e.g. Oppenheim & Willsky, Signals & Systems ch. 3):
//   square   (±1, odd):   x(t) = (4/π) Σ_{n odd} sin(2πnt)/n
//   triangle (±1, peak at t=1/4): x(t) = (8/π²) Σ_{n odd} (−1)^((n−1)/2) sin(2πnt)/n²
//   sawtooth (−1..1 rising, jump at t=1/2): x(t) = (2/π) Σ_n (−1)^(n+1) sin(2πnt)/n
//   pulse    (0..1, high for 0 ≤ t < D): x(t) = D + Σ_n 2D·sinc(nD)·cos(2πn(t − D/2)),  sinc(x)=sin(πx)/(πx)
// Finite edges: convolving any wave with a unit-area box of width tr turns each jump into a linear ramp
// of duration tr (a trapezoid for square/pulse). In frequency this multiplies every harmonic by
// sinc(n·tr), so the spectrum envelope gains a second corner at f = 1/(π·tr) (−40 dB/dec above it).
// The 10–90 % rise of that ramp is 0.8·tr; the usual "knee" rule of thumb is BW ≈ 0.35/t_r(10–90).

export type Wave = 'square' | 'triangle' | 'sawtooth' | 'pulse';
export type Harmonic = { n: number; a: number; b: number; amp: number }; // x = a·cos(2πnt) + b·sin(2πnt)

export const sinc = (x: number) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

/** DC term of the wave */
export function dcOf(wave: Wave, duty: number) { return wave === 'pulse' ? duty : 0; }

/** Single harmonic n ≥ 1 of the ideal (or edge-limited, tr > 0) wave. */
export function harmonic(wave: Wave, n: number, duty = 0.25, tr = 0): Harmonic {
  let a = 0, b = 0;
  if (wave === 'square') { if (n % 2 === 1) b = 4 / (Math.PI * n); }
  else if (wave === 'triangle') { if (n % 2 === 1) b = (8 / (Math.PI * Math.PI * n * n)) * (((n - 1) / 2) % 2 === 0 ? 1 : -1); }
  else if (wave === 'sawtooth') { b = (2 / (Math.PI * n)) * (n % 2 === 1 ? 1 : -1); }
  else {
    const c = 2 * duty * sinc(n * duty); const ph = 2 * Math.PI * n * duty / 2; // cos(θ − φ) = cosθcosφ + sinθ sinφ
    a = c * Math.cos(ph); b = c * Math.sin(ph);
  }
  if (tr > 0) { const k = sinc(n * tr); a *= k; b *= k; }
  return { n, a, b, amp: Math.hypot(a, b) };
}

export function harmonics(wave: Wave, N: number, duty = 0.25, tr = 0) {
  const out: Harmonic[] = [];
  for (let n = 1; n <= N; n++) out.push(harmonic(wave, n, duty, tr));
  return out;
}

/** Partial Fourier sum with harmonics 1..N evaluated at t (period 1). */
export function partialSum(wave: Wave, N: number, t: number, duty = 0.25, tr = 0, hs?: Harmonic[]) {
  const H = hs ?? harmonics(wave, N, duty, tr);
  let s = dcOf(wave, duty);
  const w = 2 * Math.PI * t;
  for (const h of H) { if (h.n > N) break; if (h.a) s += h.a * Math.cos(w * h.n); if (h.b) s += h.b * Math.sin(w * h.n); }
  return s;
}

/** Exact ideal waveform (tr = 0) */
export function ideal(wave: Wave, t: number, duty = 0.25) {
  const u = t - Math.floor(t);
  if (wave === 'square') return u < 0.5 ? 1 : -1;
  if (wave === 'triangle') return u < 0.25 ? 4 * u : u < 0.75 ? 2 - 4 * u : 4 * u - 4;
  if (wave === 'sawtooth') return u < 0.5 ? 2 * u : 2 * u - 2;
  return u < duty ? 1 : 0;
}

/** Exact edge-limited waveform: ideal wave convolved with a box of width tr (computed by numeric averaging). */
export function edged(wave: Wave, t: number, duty = 0.25, tr = 0) {
  if (tr <= 0) return ideal(wave, t, duty);
  const K = 64; let s = 0;
  for (let k = 0; k < K; k++) s += ideal(wave, t - tr / 2 + tr * (k + 0.5) / K, duty);
  return s / K;
}

/** Mean-square value of the ideal wave over a period (Parseval reference). */
export function meanSquare(wave: Wave, duty = 0.25) {
  if (wave === 'square') return 1;
  if (wave === 'triangle' || wave === 'sawtooth') return 1 / 3;
  return duty;
}

/** Fraction of the AC power (variance) captured by harmonics 1..N (Parseval: P_n = amp²/2).
 *  Ideal waves: total AC power = mean-square − DC² exactly; edge-limited waves: sum to n = 6000 (sinc² tail ~ 1/n⁴). */
export function powerFraction(wave: Wave, N: number, duty = 0.25, tr = 0) {
  let part = 0;
  for (let n = 1; n <= N; n++) part += harmonic(wave, n, duty, tr).amp ** 2 / 2;
  let tot: number;
  if (tr === 0) tot = meanSquare(wave, duty) - dcOf(wave, duty) ** 2;
  else { tot = 0; for (let n = 1; n <= 6000; n++) tot += harmonic(wave, n, duty, tr).amp ** 2 / 2; }
  return tot > 0 ? Math.min(1, part / tot) : 1;
}

/** Sample the partial sum and the ideal over [t0,t1]; return overshoot relative to the jump size. */
export function synthesize(wave: Wave, N: number, duty = 0.25, tr = 0, t0 = 0, t1 = 2, pts = 800) {
  const hs = harmonics(wave, N, duty, tr);
  const t: number[] = [], y: number[] = [], yi: number[] = [];
  let mx = -Infinity, mn = Infinity, err2 = 0;
  for (let i = 0; i < pts; i++) {
    const tt = t0 + (t1 - t0) * i / (pts - 1);
    const v = partialSum(wave, N, tt, duty, tr, hs); const vi = edged(wave, tt, duty, tr);
    t.push(tt); y.push(v); yi.push(vi); mx = Math.max(mx, v); mn = Math.min(mn, v); err2 += (v - vi) ** 2;
  }
  const hi = wave === 'pulse' ? 1 : 1, lo = wave === 'pulse' ? 0 : -1;
  const jump = hi - lo;
  return { t, y, yi, hs, overshoot: (mx - hi) / jump, undershoot: (lo - mn) / jump, rmsErr: Math.sqrt(err2 / pts), max: mx, min: mn };
}

/** Corner frequencies of the spectral envelope (in units of f0 = 1/T): flat→−20 dB/dec at 1/(π·τ), −20→−40 at 1/(π·tr). */
export function corners(wave: Wave, duty: number, tr: number) {
  const tau = wave === 'square' ? 0.5 : wave === 'pulse' ? duty : NaN;
  return { f1: isFinite(tau) && tau > 0 ? 1 / (Math.PI * tau) : NaN, f2: tr > 0 ? 1 / (Math.PI * tr) : Infinity, knee035: tr > 0 ? 0.35 / (0.8 * tr) : Infinity };
}
