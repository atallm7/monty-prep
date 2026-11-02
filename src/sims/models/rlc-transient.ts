// Second-order RLC step response (zero initial state: vC(0) = 0, iL(0) = 0).
//
// Series RLC driven by a step Vs (output vC):    LC·vC'' + RC·vC' + vC = Vs
//   α = R/(2L), ω0 = 1/√(LC), ζ = α/ω0, Q = (1/R)·√(L/C).  vC → Vs, i = C·dvC/dt → 0.
// Parallel RLC: the step Vs through R into an L‖C tank, i.e. the Norton equivalent Is = Vs/R
//   driving R‖L‖C (state iL):  LC·iL'' + (L/R)·iL' + iL = Is
//   α = 1/(2RC), ω0 = 1/√(LC), Q = R·√(C/L).  iL → Vs/R, v = L·diL/dt → 0 (the inductor shorts DC).
// Both reduce to the standard form x'' + 2αx' + ω0²x = ω0²·F with x(0) = x'(0) = 0, whose unit-step
// solution s(t) is (Nilsson & Riedel, Electric Circuits, ch. 8):
//   underdamped  (α<ω0): s = 1 − e^{−αt}(cos ωd t + (α/ωd) sin ωd t),  ωd = √(ω0² − α²)
//   critical     (α=ω0): s = 1 − e^{−αt}(1 + αt)
//   overdamped   (α>ω0): s = 1 + (s2·e^{s1 t} − s1·e^{s2 t})/(s1 − s2),  s1,2 = −α ± √(α² − ω0²)
// Overshoot Mp = e^{−πζ/√(1−ζ²)} at tp = π/ωd.
export type Topology = 'series' | 'parallel';
export type RLCIn = { topology: Topology; r: number; l: number; c: number; vs: number };
export type Damping = 'overdamped' | 'critically damped' | 'underdamped' | 'undamped';

export function params({ topology, r, l, c }: RLCIn) {
  const w0 = 1 / Math.sqrt(l * c);
  const alpha = topology === 'series' ? r / (2 * l) : r > 0 ? 1 / (2 * r * c) : Infinity;
  const zeta = alpha / w0;
  const Q = zeta > 0 ? 1 / (2 * zeta) : Infinity;
  const kind: Damping = alpha === 0 ? 'undamped' : Math.abs(zeta - 1) < 1e-3 ? 'critically damped' : zeta > 1 ? 'overdamped' : 'underdamped';
  const wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
  const disc = Math.sqrt(Math.max(0, alpha * alpha - w0 * w0));
  const s1 = -alpha + disc, s2 = -alpha - disc; // s1 is the slow (dominant) pole when overdamped
  return { w0, f0: w0 / (2 * Math.PI), alpha, zeta, Q, kind, wd, fd: wd / (2 * Math.PI), s1, s2 };
}

/** Unit-step response s(t) and its derivative s'(t) for the standard form. */
export function unitStep(alpha: number, w0: number, t: number): [number, number] {
  if (t <= 0) return [0, 0];
  const zeta = alpha / w0;
  if (Math.abs(zeta - 1) < 1e-3) {
    const e = Math.exp(-alpha * t);
    return [1 - e * (1 + alpha * t), alpha * alpha * t * e];
  }
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta); const e = Math.exp(-alpha * t);
    return [1 - e * (Math.cos(wd * t) + (alpha / wd) * Math.sin(wd * t)), e * (w0 * w0 / wd) * Math.sin(wd * t)];
  }
  const d = Math.sqrt(alpha * alpha - w0 * w0);
  const s2 = -alpha - d;
  // s1 = −w0²/(α + d) avoids cancellation when α ≫ w0
  const s1s = -(w0 * w0) / (alpha + d);
  const e1 = Math.exp(s1s * t), e2 = Math.exp(s2 * t);
  return [1 + (s2 * e1 - s1s * e2) / (s1s - s2), (s1s * s2 * (e1 - e2)) / (s1s - s2)];
}

export type Response = { t: number[]; vC: number[]; iL: number[]; vR: number[]; vL: number[] };
/** Full response on a time grid. */
export function response(p: RLCIn, tEnd: number, n = 800, tStart = 0): Response {
  const { alpha, w0 } = params(p); const { topology, r, l, c, vs } = p;
  const out: Response = { t: [], vC: [], iL: [], vR: [], vL: [] };
  for (let k = 0; k <= n; k++) {
    const t = tStart + (tEnd - tStart) * k / n;
    const [s, ds] = unitStep(alpha, w0, t);
    let vC: number, iL: number, vR: number, vL: number;
    if (topology === 'series') {
      vC = vs * s; iL = c * vs * ds; vR = iL * r; vL = (t >= 0 ? vs : 0) - vR - vC;
    } else {
      const Is = vs / r; iL = Is * s; vC = l * Is * ds; vL = vC; vR = (t >= 0 ? vs : 0) - vC; // vR across the feed resistor
    }
    out.t.push(t); out.vC.push(vC); out.iL.push(iL); out.vR.push(vR); out.vL.push(vL);
  }
  return out;
}

/** Peak overshoot (fraction) and peak time from theory (underdamped only). */
export function overshoot(zeta: number, wd: number) {
  if (zeta >= 1 || zeta < 0) return { mp: 0, tp: Infinity };
  return { mp: Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta * zeta)), tp: Math.PI / wd };
}

/** Settling time to within ±band of the final value, measured on the closed-form s(t). */
export function settlingTime(alpha: number, w0: number, band = 0.02) {
  const zeta = alpha / w0;
  // search horizon: slow pole decay rate
  const slow = zeta >= 1 ? w0 * w0 / (alpha + Math.sqrt(Math.max(0, alpha * alpha - w0 * w0))) : alpha;
  if (!(slow > 0)) return Infinity;
  const tMax = 20 / slow; const n = 20000;
  let last = 0;
  for (let k = 0; k <= n; k++) { const t = tMax * k / n; const [s] = unitStep(alpha, w0, t); if (Math.abs(s - 1) > band) last = t; }
  return last + tMax / n;
}

/** Suggested plot window: ~ settling plus a margin, at least two ringing periods. */
export function window(p: RLCIn) {
  const { alpha, w0, zeta, wd } = params(p);
  const slow = zeta >= 1 ? w0 * w0 / (alpha + Math.sqrt(Math.max(0, alpha * alpha - w0 * w0))) : alpha;
  let T = slow > 0 ? 6 / slow : 40 * Math.PI / w0;
  if (wd > 0) { const per = 2 * Math.PI / wd; T = Math.min(Math.max(T, 2.5 * per), 25 * per); }
  return T;
}
