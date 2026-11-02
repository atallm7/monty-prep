// First-order RC / RL transient model (exact piecewise-exponential solution).
//
// RC (series R, output across C): state vC.  C·dvC/dt = (vin − vC)/R   → τ = R·C,
//   vC(t) = vF + (v0 − vF)·e^{−(t−t0)/τ}, vF = vin.   iC = (vin − vC)/R jumps when vin jumps; vC never does.
// RL (series R, L):               state iL.  L·diL/dt = vin − R·iL      → τ = L/R,
//   iL(t) = iF + (i0 − iF)·e^{−(t−t0)/τ}, iF = vin/R. vL = vin − R·iL jumps; iL never does.
// Square drive (0 ↔ Vs, 50 % duty, period T): with a = T/(2τ), the periodic steady state swings between
//   x_lo = X·e^{−a}/(1+e^{−a}) and x_hi = X/(1+e^{−a}) where X = Vs (RC) or Vs/R (RL).
export type Kind = 'rc' | 'rl';
export type Drive = 'step' | 'square';
export type RCIn = { kind: Kind; r: number; c: number; l: number; vs: number; f: number; drive: Drive };

export function tauOf({ kind, r, c, l }: Pick<RCIn, 'kind' | 'r' | 'c' | 'l'>) {
  return kind === 'rc' ? r * c : r > 0 ? l / r : Infinity;
}
/** Final value of the state for a constant input vin. */
export function finalState(kind: Kind, vin: number, r: number) { return kind === 'rc' ? vin : vin / r; }
/** Fraction of the final step reached after time t: 1 − e^{−t/τ} (63.2 % at τ, 99.3 % at 5τ). */
export const fractionAt = (t: number, tau: number) => 1 - Math.exp(-t / tau);
/** Time to reach a fraction p of the step: −τ·ln(1 − p). */
export const timeTo = (p: number, tau: number) => -tau * Math.log(1 - p);

export function squareSteady(p: RCIn) {
  const tau = tauOf(p); const X = finalState(p.kind, p.vs, p.r);
  const a = 1 / (2 * p.f * tau); const e = Math.exp(-a);
  return { lo: (X * e) / (1 + e), hi: X / (1 + e), ripple: (X * (1 - e)) / (1 + e), a };
}

export type Wave = { t: number[]; vin: number[]; x: number[]; vR: number[]; y: number[] };
/**
 * Simulate the circuit over [t0, t1]. Edges are sampled twice (left and right limits) so jumps render as
 * vertical lines. start='zero' begins discharged at t=0; start='steady' starts on the periodic steady state.
 * x = vC (RC) or iL (RL); y = iC (RC) or vL (RL); vR = voltage across the resistor.
 */
export function simulate(p: RCIn, t0: number, t1: number, n = 600, start: 'zero' | 'steady' = 'zero'): Wave {
  const tau = tauOf(p); const { kind, r, vs } = p;
  const T = p.drive === 'square' ? 1 / p.f : Infinity;
  const vinAt = (t: number) => t < 0 ? 0 : p.drive === 'step' ? vs : (((t % T) + T) % T) < T / 2 ? vs : 0;
  // event times (input edges) inside the window
  const edges: number[] = [];
  if (t0 < 0 && t1 > 0) edges.push(0);
  if (p.drive === 'square') for (let k = 1; k * T / 2 < t1; k++) if (k * T / 2 > t0) edges.push(k * T / 2);
  if (edges.length > 4000) edges.length = 4000;
  const grid = new Set<number>();
  for (let k = 0; k <= n; k++) grid.add(t0 + (t1 - t0) * k / n);
  for (const e of edges) grid.add(e);
  const ts = [...grid].sort((a, b) => a - b);
  let x = start === 'steady' && p.drive === 'square' ? squareSteady(p).lo : 0;
  const out: Wave = { t: [], vin: [], x: [], vR: [], y: [] };
  const push = (t: number, vin: number) => {
    const vR = kind === 'rc' ? vin - x : x * r;
    const y = kind === 'rc' ? (r > 0 ? (vin - x) / r : 0) : vin - x * r;
    out.t.push(t); out.vin.push(vin); out.x.push(x); out.vR.push(vR); out.y.push(y);
  };
  let tPrev = ts[0]; let segVin = vinAt(tPrev + 1e-15 * Math.max(1, Math.abs(tPrev)));
  const edgeSet = new Set(edges);
  for (let k = 0; k < ts.length; k++) {
    const t = ts[k];
    // advance exactly from tPrev to t with constant input segVin
    const dt = t - tPrev;
    if (dt > 0) { const xf = finalState(kind, segVin, r); x = isFinite(tau) && tau > 0 ? xf + (x - xf) * Math.exp(-dt / tau) : (tau === 0 ? xf : x); }
    if (edgeSet.has(t)) { push(t, segVin); segVin = vinAt(t + 1e-12 * Math.max(T === Infinity ? 1 : T, 1e-9)); push(t, segVin); }
    else { segVin = vinAt(t); push(t, segVin); }
    tPrev = t;
  }
  return out;
}
