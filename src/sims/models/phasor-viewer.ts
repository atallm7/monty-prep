// Phasors and sinusoids.
// Convention: x(t) = A·sin(ωt + φ) + offset, ω = 2πf. Its phasor is A∠φ; the rotating phasor
// A·e^{j(ωt+φ)} projected on the vertical (imaginary) axis gives A·sin(ωt+φ).
// Same-frequency sum (phasor addition):  A∠φ = A1∠φ1 + A2∠φ2
//   A = √((A1cosφ1 + A2cosφ2)² + (A1sinφ1 + A2sinφ2)²),  φ = atan2(…)
// Different frequencies: no single phasor; the sum beats at |f1 − f2| with envelope |A1 − A2| … A1 + A2.
// Time shift for phase difference Δφ (deg): Δt = Δφ / (360·f).
// RMS of a sinusoid with DC offset: √(offset² + A²/2).
//
// Pure elements driven by v(t) = Vp·sin(ωt):
//   Z_R = R (i in phase), Z_L = jωL, X_L = ωL (i lags v by 90°), Z_C = 1/(jωC), X_C = 1/(ωC) (i leads by 90°)
//   i(t) = (Vp/|Z|)·sin(ωt − arg Z);  average power P = ½·Vp·Ip·cos(arg Z) → Vp²/(2R) for R, 0 for L and C.

export type Wave = { A: number; f: number; phi: number; off: number }; // phi in degrees
const D2R = Math.PI / 180;

export const wave = (w: Wave, t: number) => w.A * Math.sin(2 * Math.PI * w.f * t + w.phi * D2R) + w.off;

/** Phasor sum of two same-frequency sinusoids: amplitude and phase (deg). */
export function phasorSum(a: { A: number; phi: number }, b: { A: number; phi: number }) {
  const re = a.A * Math.cos(a.phi * D2R) + b.A * Math.cos(b.phi * D2R);
  const im = a.A * Math.sin(a.phi * D2R) + b.A * Math.sin(b.phi * D2R);
  const A = Math.hypot(re, im);
  return { A, phi: A < 1e-12 ? 0 : Math.atan2(im, re) / D2R, re, im };
}

/** Wrap an angle in degrees to (−180, 180]. */
export function wrapDeg(x: number) { let y = ((x + 180) % 360 + 360) % 360 - 180; if (y === -180) y = 180; return y; }

/** Phase difference of b relative to a (deg, wrapped) and the equivalent time shift at frequency f. */
export function phaseDiff(a: Wave, b: Wave) {
  const d = wrapDeg(b.phi - a.phi);
  return { deg: d, dt: a.f > 0 ? d / (360 * a.f) : 0 };
}

export const rms = (w: Wave) => Math.sqrt(w.off * w.off + (w.A * w.A) / 2);

/** Summary of x1 + x2. */
export function sumInfo(a: Wave, b: Wave) {
  const same = Math.abs(a.f - b.f) <= 1e-9 * Math.max(a.f, b.f, 1);
  if (same) { const s = phasorSum(a, b); return { same, A: s.A, phi: s.phi, off: a.off + b.off, beat: 0, envMin: s.A, envMax: s.A }; }
  return { same, A: NaN, phi: NaN, off: a.off + b.off, beat: Math.abs(a.f - b.f), envMin: Math.abs(a.A - b.A), envMax: a.A + b.A };
}

// ---- pure R, L, C -------------------------------------------------------------------------
export type El = 'R' | 'L' | 'C';
/** Complex impedance {re, im} of a pure element. */
export function zOf(el: El, value: number, f: number) {
  const w = 2 * Math.PI * f;
  if (el === 'R') return { re: value, im: 0 };
  if (el === 'L') return { re: 0, im: w * value };
  return { re: 0, im: w * value > 0 ? -1 / (w * value) : -Infinity };
}
/** |Z| (Ω): R, X_L = ωL, X_C = 1/(ωC). */
export function reactance(el: El, value: number, f: number) { const z = zOf(el, value, f); return Math.hypot(z.re, z.im); }

export function rlc(el: El, value: number, f: number, vp: number) {
  const z = zOf(el, value, f); const zm = Math.hypot(z.re, z.im);
  const argZ = Math.atan2(z.im, z.re) / D2R;                // +90 for L, −90 for C
  const ip = zm > 0 && isFinite(zm) ? vp / zm : zm === 0 ? Infinity : 0;
  const iPhase = -argZ;                                      // current phase relative to voltage (deg)
  const pAvg = isFinite(ip) ? 0.5 * vp * ip * Math.cos(argZ * D2R) : NaN;
  const q = isFinite(ip) ? 0.5 * vp * ip * Math.sin(argZ * D2R) : NaN; // reactive power (var), + for L
  const relation = el === 'R' ? 'in phase' : el === 'L' ? 'current lags voltage by 90°' : 'current leads voltage by 90°';
  return { z, zm, argZ, ip, iPhase, pAvg: Math.abs(pAvg) < 1e-12 * vp * Math.max(ip, 1e-300) ? 0 : pAvg, q, relation };
}

/** v(t), i(t), p(t) samples over `periods` periods. */
export function rlcWaves(el: El, value: number, f: number, vp: number, periods = 2, n = 400) {
  const r = rlc(el, value, f, vp); const T = 1 / f;
  const t: number[] = [], v: number[] = [], i: number[] = [], p: number[] = [];
  for (let k = 0; k < n; k++) {
    const tt = (k / (n - 1)) * periods * T; t.push(tt);
    const vv = vp * Math.sin(2 * Math.PI * f * tt), ii = r.ip * Math.sin(2 * Math.PI * f * tt + r.iPhase * D2R);
    v.push(vv); i.push(ii); p.push(vv * ii);
  }
  return { t, v, i, p, ...r };
}
