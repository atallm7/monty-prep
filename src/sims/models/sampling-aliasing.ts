// Sampling & aliasing model.
// A tone cos(2π f t + φ) sampled at fs gives x[n] = cos(2π f n/fs + φ). Because e^{j2π(f − k fs)n/fs} = e^{j2π f n/fs},
// every frequency f − k·fs produces identical samples (Nyquist–Shannon; Oppenheim & Schafer §4.2).
// The ideal reconstruction (Whittaker–Shannon): x_r(t) = Σ x[n]·sinc(fs·t − n) only produces content below fs/2,
// so the tone appears at the folded frequency fa = |f − k·fs|, k = round(f/fs)  (0 ≤ fa ≤ fs/2).
// Odd Nyquist zones (f mod fs > fs/2) are spectrally inverted: the phase flips sign (φ → −φ).
// Optional anti-alias filter: n-th order Butterworth low-pass, H(s) = Π (−p_k)/(s − p_k),
// p_k = ωc·exp(jπ(2k + n − 1)/(2n)), |H(jω)| = 1/√(1 + (ω/ωc)^{2n}).

export const sinc = (x: number) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

/** Folded (apparent) frequency and Nyquist zone (1 = baseband). */
export function alias(f: number, fs: number) {
  const fa0 = ((f % fs) + fs) % fs;
  const inverted = fa0 > fs / 2;
  const fa = inverted ? fs - fa0 : fa0;
  const k = Math.round(f / fs);
  const zone = Math.floor(f / (fs / 2)) + 1;
  return { fa, k, zone, inverted, aliased: f > fs / 2 };
}

/** Butterworth low-pass complex response at frequency f (Hz). Returns magnitude and phase (rad). */
export function butter(f: number, fc: number, order: number) {
  let re = 1, im = 0; // running product
  const wc = 2 * Math.PI * fc, w = 2 * Math.PI * f;
  for (let k = 1; k <= order; k++) {
    const th = Math.PI * (2 * k + order - 1) / (2 * order);
    const pr = wc * Math.cos(th), pi = wc * Math.sin(th);
    // term = (−p)/(jw − p)
    const nr = -pr, ni = -pi; const dr = -pr, di = w - pi;
    const den = dr * dr + di * di;
    const tr = (nr * dr + ni * di) / den, ti = (ni * dr - nr * di) / den;
    const r2 = re * tr - im * ti, i2 = re * ti + im * tr; re = r2; im = i2;
  }
  return { mag: Math.hypot(re, im), phase: Math.atan2(im, re) };
}

export type SampleIn = { f: number; fs: number; phase?: number; amp?: number; filter?: boolean; fc?: number; order?: number };

/** Effective amplitude/phase of the tone reaching the sampler (after optional anti-alias filter). */
export function inputTone(p: SampleIn) {
  const A = p.amp ?? 1, ph = p.phase ?? 0;
  if (!p.filter) return { A, ph, gain: 1 };
  const h = butter(p.f, p.fc ?? 0.45 * p.fs, p.order ?? 4);
  return { A: A * h.mag, ph: ph + h.phase, gain: h.mag };
}

/** Samples, continuous input and sinc reconstruction over [0, T]. */
export function simulate(p: SampleIn, T: number, pts = 1200) {
  const { A, ph } = inputTone(p);
  const ts = 1 / p.fs;
  // samples cover a wide margin around the window so truncation of the sinc sum is small
  const margin = 200;
  const n0 = -margin, n1 = Math.ceil(T / ts) + margin;
  const xn: number[] = [];
  for (let n = n0; n <= n1; n++) xn.push(A * Math.cos(2 * Math.PI * p.f * n * ts + ph));
  const t: number[] = [], x: number[] = [], xr: number[] = [], xa: number[] = [];
  const al = alias(p.f, p.fs);
  const sgn = al.inverted ? -1 : 1;
  for (let i = 0; i < pts; i++) {
    const tt = T * i / (pts - 1); t.push(tt);
    x.push(A * Math.cos(2 * Math.PI * p.f * tt + ph));
    // Whittaker–Shannon, with a Hann taper on the far tails to suppress truncation ripple
    let s = 0; const u = tt / ts;
    for (let k = 0; k < xn.length; k++) {
      const n = n0 + k; const d = u - n; if (Math.abs(d) > margin) continue;
      const wdw = 0.5 + 0.5 * Math.cos(Math.PI * d / margin);
      s += xn[k] * sinc(d) * wdw;
    }
    xr.push(s);
    // analytic alias tone: f = k·fs + δ, |δ| ≤ fs/2 → samples equal cos(2π|δ|t ± φ)
    xa.push(A * Math.cos(2 * Math.PI * al.fa * tt + sgn * ph));
  }
  const st: number[] = [], sv: number[] = [];
  for (let n = 0; n * ts <= T + 1e-15; n++) { st.push(n * ts); sv.push(xn[n - n0]); }
  return { t, x, xr, xa, st, sv, alias: al, A };
}

/** Spectral lines of the sampled signal in [0, fmax]: |f + k fs| and |−f + k fs| images (all with the same amplitude). */
export function images(f: number, fs: number, fmax: number) {
  const out: { f: number; k: number; neg: boolean }[] = [];
  const K = Math.ceil((fmax + f) / fs) + 1;
  for (let k = -K; k <= K; k++) for (const neg of [false, true]) {
    const v = (neg ? -f : f) + k * fs;
    if (v >= 0 && v <= fmax) out.push({ f: v, k, neg });
  }
  return out.sort((a, b) => a.f - b.f);
}
