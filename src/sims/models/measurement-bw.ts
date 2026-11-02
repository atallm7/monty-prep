// Bandwidth, rise time and sample rate.
//   Gaussian-response scope: |H(f)| = 2^(-(f/BW)^2 / 2)  (-3 dB at BW)  <->  impulse sigma_b = sqrt(ln2)/(2 pi BW)
//   10-90 % rise of a Gaussian edge = 2*1.2816*sigma = 2.563 sigma  ->  tr_scope = 0.3398/BW ~ 0.35/BW (the rule of thumb)
//   Cascaded Gaussian stages add in quadrature:  tr_meas = sqrt(tr_sig^2 + tr_scope^2)   (exact for Gaussians)
//   Signal knee/bandwidth BW_sig ~ 0.35/tr_sig.  Edge as seen by the ADC: v(t) = (1 + erf(t/(sqrt(2) sigma_tot)))/2, sampled at fs.
//   Trapezoidal clock (50 % duty, linear 0-100 % edges of length tf): odd harmonics  c_n = (4/(n pi)) |sinc(n pi tf/T)| (peak amplitude, A = 1).
//   Samples above fs/2 alias: f_alias = |f - fs*round(f/fs)|.
const Z90 = 1.2815515655446004;
export const K_RISE = 2 * Z90 * Math.sqrt(Math.log(2)) / (2 * Math.PI); // = 0.3398 : tr(10-90) = K_RISE / BW for a Gaussian response
export const trScope = (bw: number) => K_RISE / bw;
export const trRule = (bw: number) => 0.35 / bw;
export const rss = (a: number, b: number) => Math.hypot(a, b);
export const sigmaFromTr = (tr: number) => tr / (2 * Z90);
export const sigmaFromBw = (bw: number) => Math.sqrt(Math.log(2)) / (2 * Math.PI * bw);

export function erf(x: number) { // Abramowitz-Stegun 7.1.26 refined (max err 1.5e-7)
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
export const edge = (t: number, sigma: number) => 0.5 * (1 + erf(t / (Math.SQRT2 * sigma)));

/** 10-90 % time from a (t, v) polyline with v rising 0 -> 1, linear interpolation between samples. */
export function riseTimeOf(t: number[], v: number[], lo = 0.1, hi = 0.9) {
  const cross = (lvl: number) => { for (let i = 1; i < t.length; i++) if (v[i - 1] < lvl && v[i] >= lvl) return t[i - 1] + (t[i] - t[i - 1]) * (lvl - v[i - 1]) / (v[i] - v[i - 1]); return NaN; };
  return cross(hi) - cross(lo);
}

export type BwIn = { tr: number; bw: number; fs: number; phase?: number; vmax?: number };
export function edgeAnalysis(p: BwIn) {
  const tsc = trScope(p.bw), ssig = sigmaFromTr(p.tr), sb = sigmaFromBw(p.bw), stot = Math.hypot(ssig, sb);
  const trMeas = Math.hypot(p.tr, tsc), trRSS = Math.hypot(p.tr, trRule(p.bw));
  const ts = 1 / p.fs, span = 6 * stot + 3 * ts;
  const N = 500, t: number[] = [], ideal: number[] = [], filt: number[] = [];
  for (let i = 0; i < N; i++) { const x = -span + 2 * span * i / (N - 1); t.push(x); ideal.push(edge(x, ssig)); filt.push(edge(x, stot)); }
  // ADC samples at times k*ts + phase*ts
  const off = ((p.phase ?? 0) % 1) * ts; const st: number[] = [], sv: number[] = [];
  for (let k = Math.ceil((-span - off) / ts); k * ts + off <= span; k++) { const x = k * ts + off; st.push(x); sv.push(edge(x, stot)); }
  const trSampled = st.length > 1 ? riseTimeOf(st, sv) : NaN;
  return { trScope: tsc, trRule: trRule(p.bw), trMeas, trRSS, errPct: (trMeas / p.tr - 1) * 100, trSampled, samplesPerEdge: trMeas * p.fs, sigTot: stot,
    sigBw: 0.35 / p.tr, nyquist: p.fs / 2, t, ideal, filt, st, sv };
}

/** Harmonics of a 50 % duty trapezoidal clock through the scope. */
export function harmonics(f0: number, tr: number, bw: number, fs: number, maxN = 61) {
  const tf = tr / 0.8, T = 1 / f0; const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x);
  const n: number[] = [], f: number[] = [], ideal: number[] = [], seen: number[] = [], alias: number[] = [], beyondNyq: boolean[] = [];
  for (let k = 1; k <= maxN; k += 2) {
    const a = (4 / (k * Math.PI)) * Math.abs(sinc(k * Math.PI * tf / T)); const fk = k * f0;
    n.push(k); f.push(fk); ideal.push(a); seen.push(a * 2 ** (-((fk / bw) ** 2) / 2));
    alias.push(Math.abs(fk - fs * Math.round(fk / fs))); beyondNyq.push(fk > fs / 2);
  }
  const rssAll = (arr: number[]) => Math.sqrt(arr.reduce((s, x) => s + x * x / 2, 0));
  return { n, f, ideal, seen, alias, beyondNyq, powerKept: rssAll(seen) ** 2 / rssAll(ideal) ** 2 };
}
export const scopeGain = (f: number, bw: number) => 2 ** (-((f / bw) ** 2) / 2);
