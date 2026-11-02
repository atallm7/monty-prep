// Pulsed LiDAR time-of-flight model.
//   Round-trip time           t = 2d/c
//   Range resolution (bin)    ΔR = c·Δt/2          (one TDC/ADC bin of width Δt)
//   Two-target separation     ≈ c·τ_p/2            (pulse-width limited)
//   Max unambiguous range     R_max = c/(2·PRF)    (echo must return before the next pulse)
//   Aliased (apparent) range  R_app = (t mod T_PRI)·c/2
//   Return amplitude (extended Lambertian target filling the beam): P_r ∝ ρ·A_rx/(π d²) → ∝ ρ/d²
//   Noise: electronic floor + shot noise of ambient (background) light + signal shot noise; averaging N shots: σ/√N.
//   Leading-edge (threshold) detection of a Gaussian pulse fires early by σ_p·√(2 ln(A/thr)) → "walk" that depends on amplitude.

export const C = 299792458;

export function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { u, gauss: () => { let x = 0, y = 0, r = 0; do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (r === 0 || r >= 1); return x * Math.sqrt(-2 * Math.log(r) / r); } };
}

export const roundTrip = (d: number) => 2 * d / C;
export const rangeRes = (tres: number) => C * tres / 2;
export const maxRange = (prf: number) => C / (2 * prf);
export function apparentRange(d: number, prf: number) {
  const T = 1 / prf, t = roundTrip(d), k = Math.floor(t / T + 1e-12);
  return { t, tApp: t - k * T, dApp: (t - k * T) * C / 2, pulsesLate: k };
}
/** Relative return amplitude: 1.0 at 30 m for ρ = 0.5, ∝ ρ/d², detector saturates at 5. */
export const returnAmp = (d: number, refl: number, power = 1) => Math.min(5, power * refl * 1800 / Math.max(d, 0.01) ** 2);

export type LidarIn = {
  d: number; tres: number; prf: number; pulseW: number; refl: number; ambient: number; power?: number; // laser peak power × receiver gain, relative
  second: boolean; d2: number; frac2: number;   // second return: a fraction frac2 of the beam passes the first target (foliage, edge, glass)
  shots: number; method: 'peak' | 'threshold'; interp: boolean; thr: number; seed: number; noise?: boolean;
};

export function simulate(p: LidarIn) {
  const T = 1 / p.prf, sp = p.pulseW / 2.3548;          // FWHM → σ
  const pw = p.power ?? 1;
  const targets = [{ d: p.d, a: returnAmp(p.d, p.refl, pw) * (p.second ? 1 - p.frac2 : 1) }];
  if (p.second) targets.push({ d: p.d2, a: returnAmp(p.d2, p.refl, pw) * p.frac2 });
  const ech = targets.map(t => ({ ...t, ...apparentRange(t.d, p.prf) }));
  const tMin = Math.min(...ech.map(e => e.tApp)), tMax = Math.max(...ech.map(e => e.tApp));
  let t0 = Math.max(0, tMin - 6 * sp - 8e-9), t1 = Math.min(T, tMax + 6 * sp + 8e-9);
  if (t1 <= t0) t1 = t0 + 10 * sp;
  const dt = p.tres;                                   // one sample per timing bin
  t0 = Math.floor(t0 / dt) * dt;                        // bins aligned to the pulse emission (t = 0)
  const N = Math.max(3, Math.min(40000, Math.ceil((t1 - t0) / dt)));
  const dc = 0.3 * p.ambient;
  const sigE = 0.02, sigAmb = 0.08 * Math.sqrt(Math.max(0, p.ambient));
  const shots = Math.max(1, Math.round(p.shots));
  const R = rng(p.seed);
  const tt: number[] = [], clean: number[] = [], meas: number[] = [];
  for (let k = 0; k < N; k++) {
    const tc = t0 + (k + 0.5) * dt;              // bin centre
    let s = dc;
    for (const e of ech) s += e.a * Math.exp(-0.5 * ((tc - e.tApp) / sp) ** 2);
    const sig = p.noise === false ? 0 : Math.sqrt(sigE ** 2 + sigAmb ** 2 + 0.03 ** 2 * Math.max(0, s - dc));
    let acc = 0; for (let j = 0; j < shots; j++) acc += s + sig * R.gauss();
    tt.push(tc); clean.push(s); meas.push(acc / shots);
  }
  // fine noise-free analog echo for display (independent of the bin width)
  const analogT: number[] = [], analog: number[] = [];
  for (let i = 0; i <= 600; i++) { const tc = t0 + i / 600 * N * dt; let v = dc; for (const e of ech) v += e.a * Math.exp(-0.5 * ((tc - e.tApp) / sp) ** 2); analogT.push(tc); analog.push(v); }
  const noiseRms = Math.sqrt(sigE ** 2 + sigAmb ** 2) / Math.sqrt(shots);

  // Detection on the digitised, averaged record
  const thrAbs = dc + p.thr;
  const detect = (from: number, to: number) => {
    if (p.method === 'threshold') {
      for (let k = Math.max(1, from); k < to; k++) if (meas[k] >= thrAbs && meas[k - 1] < thrAbs) {
        // leading edge = start of the first bin above threshold; calibrated for walk at amplitude 1.0
        const walkCal = p.thr < 1 ? sp * Math.sqrt(2 * Math.log(1 / p.thr)) : 0;
        const tc = p.interp ? tt[k - 1] + (thrAbs - meas[k - 1]) / (meas[k] - meas[k - 1]) * dt : tt[k] - dt / 2;
        return tc + walkCal;
      }
      return NaN;
    }
    let bi = -1, bv = -Infinity;
    for (let k = from; k < to; k++) if (meas[k] > bv) { bv = meas[k]; bi = k; }
    if (bi < 0 || bv < thrAbs) return NaN;
    if (p.interp && bi > 0 && bi < N - 1) {
      const y0 = meas[bi - 1], y1 = meas[bi], y2 = meas[bi + 1], den = y0 - 2 * y1 + y2;
      const off = den !== 0 ? 0.5 * (y0 - y2) / den : 0;
      return tt[bi] + Math.max(-0.5, Math.min(0.5, off)) * dt;
    }
    return tt[bi];
  };
  // Split the record into regions above threshold → one return per region (multiple-return LiDAR)
  const regions: [number, number][] = [];
  let inR = -1;
  const gap = Math.max(1, Math.round(sp / dt));
  for (let k = 0; k < N; k++) {
    if (meas[k] >= thrAbs) { if (inR < 0) inR = k; }
    else if (inR >= 0) {
      let j = k; while (j < N && j < k + gap && meas[j] < thrAbs) j++;
      if (j >= N || j >= k + gap) { regions.push([inR, k]); inR = -1; }
    }
  }
  if (inR >= 0) regions.push([inR, N]);
  const returns = regions.map(([a, b]) => detect(Math.max(0, a - 2), Math.min(N, b + 2))).filter(t => isFinite(t)).map(t => ({ t, d: t * C / 2 }));
  const first = returns[0];
  const snr = ech[0].a / Math.max(1e-12, noiseRms);
  return { t0, t1: t0 + N * dt, dt, tt, binStart: tt.map(t => t - dt / 2), analogT, analog, clean, meas, ech, returns, first, noiseRms, snr, thrAbs, dc, T, sp };
}
