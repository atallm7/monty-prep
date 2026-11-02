// Power, performance and thermals across process / voltage / temperature (PVT).
// Equations:
//  * Dynamic (switching) power:  P_dyn = α·C·V²·f                            (Rabaey, Digital ICs, ch. 5)
//  * Subthreshold leakage:       I_sub = I0·(T/T0)^0.5·exp(−(Vt − η·V)/(n·kT/q))  (BSIM-style; η = DIBL coeff.;
//    prefactor μ(T)·vT² ∝ T^−1.5·T² = T^0.5)  with Vt(T) = Vt0 + ΔVt_corner − κ·(T − T0)  (Vt falls ~0.8 mV/K)
//    Gate leakage (tunnelling) ~ V³, nearly temperature independent.     P_leak = V·(I_sub + I_gate)
//  * Speed: Sakurai–Newton alpha-power law, I_on ∝ μ(T)·(V − Vt)^a,
//    (here μ ∝ (T/T0)^−1.2, a = 1.3). gate delay t_d ∝ C·V / I_on   ⇒   f_max = K·μ(T)·(V − Vt(T))^a / V.
//    Because Vt falls with T while μ falls too, f_max falls with T at high V but RISES at low V
//    ("temperature inversion").
//  * Thermal: steady state Tj = Ta + θ_JA·P(Tj) (solved as a fixed point; no solution = thermal runaway);
//    transient C_th·dTj/dt = P(Tj) − (Tj − Ta)/θ_JA  (single-pole RC thermal model, forward Euler, dt ≪ τ = θ·C_th).

export type Corner = 'tt' | 'ff' | 'ss';
export const CORNERS: Record<Corner, { dVt: number; k: number; label: string }> = {
  tt: { dVt: 0, k: 1, label: 'TT (typical)' },
  ff: { dVt: -0.04, k: 1.08, label: 'FF (fast, leaky)' },
  ss: { dVt: 0.04, k: 0.92, label: 'SS (slow)' },
};
export const K_B_Q = 8.617333e-5; // k/q in V/K
export const T0 = 298.15;
export const TECH = { vt0: 0.35, kappa: 0.8e-3, eta: 0.08, n: 2.0, a: 1.3, muExp: 1.2, i0: 0, ig0: 0.05, kf: 0 };
// Calibrate: I_sub(0.9 V, TT, 25 °C) = 0.30 A; f_max(0.9 V, TT, 25 °C) = 2.6 GHz.
TECH.i0 = 0.30 / Math.exp(-(TECH.vt0 - TECH.eta * 0.9) / (TECH.n * K_B_Q * T0));
TECH.kf = 2.6e9 * 0.9 / Math.pow(0.9 - TECH.vt0, TECH.a);

export const C2K = (c: number) => c + 273.15;
export function vt(tC: number, corner: Corner) { return TECH.vt0 + CORNERS[corner].dVt - TECH.kappa * (C2K(tC) - T0); }

export function fmax(v: number, tC: number, corner: Corner) {
  const T = C2K(tC); const ov = v - vt(tC, corner);
  if (ov <= 0 || v <= 0) return 0;
  return TECH.kf * CORNERS[corner].k * Math.pow(T / T0, -TECH.muExp) * Math.pow(ov, TECH.a) / v;
}

export const pdyn = (alpha: number, c: number, v: number, f: number) => alpha * c * v * v * f;

export function leakage(v: number, tC: number, corner: Corner) {
  const T = C2K(tC); const vth = K_B_Q * T;
  const iSub = TECH.i0 * (T / T0) ** 0.5 * Math.exp(-(vt(tC, corner) - TECH.eta * v) / (TECH.n * vth));
  const iGate = TECH.ig0 * (v / 0.9) ** 3;
  return { iSub, iGate, pSub: v * iSub, pGate: v * iGate, p: v * (iSub + iGate) };
}

export type Op = { v: number; f: number; alpha: number; c: number; corner: Corner };
export function power(op: Op, tC: number) {
  const d = pdyn(op.alpha, op.c, op.v, op.f); const l = leakage(op.v, tC, op.corner);
  return { dyn: d, leak: l.p, total: d + l.p, sub: l.pSub, gate: l.pGate };
}

/** Steady-state junction temperature: lowest root of Ta + θ·P(T) − T. null = thermal runaway (no root below tMax). */
export function steadyTj(op: Op, ta: number, theta: number, tMax = 250): number | null {
  const h = (t: number) => ta + theta * power(op, t).total - t;
  let a = ta, ha = h(a);
  if (ha <= 0) return ta;
  for (let t = ta + 0.5; t <= tMax; t += 0.5) {
    const ht = h(t);
    if (ht <= 0) { let lo = a, hi = t; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (h(m) > 0) lo = m; else hi = m; } return (lo + hi) / 2; }
    a = t; ha = ht;
  }
  return null;
}

/** DVFS ladder: for each voltage, the highest frequency that meets timing at the guard-band temperature, with a margin. */
export function dvfsTable(corner: Corner, tGuard: number, alpha: number, c: number, volts = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1], margin = 0.9) {
  return volts.map(v => {
    const f = margin * fmax(v, tGuard, corner);
    const p = power({ v, f, alpha, c, corner }, tGuard);
    return { v, f, p: p.total, dyn: p.dyn, leak: p.leak, energy: f > 0 ? p.total / f : Infinity };
  });
}

export type ThrottleOpts = { op: Op; ta: number; theta: number; cth: number; tLimit: number; hyst: number; enabled: boolean; tEnd?: number; dt?: number; period?: number };
/**
 * Closed-loop thermal throttling: a bang-bang DVFS governor evaluated every `period` seconds steps down one
 * P-state when Tj > tLimit and back up when Tj < tLimit − hyst. Thermal RC integrated with forward Euler.
 */
export function throttle(o: ThrottleOpts) {
  const tEnd = o.tEnd ?? 30, dt = o.dt ?? 0.005, period = o.period ?? 0.1;
  const ladder = dvfsTable(o.op.corner, o.tLimit, o.op.alpha, o.op.c).filter(p => p.f < o.op.f * 0.999 && p.v < o.op.v - 1e-9).map(p => ({ v: p.v, f: p.f }));
  ladder.push({ v: o.op.v, f: o.op.f }); // requested point is the top state
  let lvl = ladder.length - 1; let T = o.ta; let nextCtl = period;
  const t: number[] = [], tj: number[] = [], f: number[] = [], p: number[] = [];
  let runaway = false, steps = 0, energy = 0, work = 0;
  for (let time = 0; time <= tEnd + 1e-9; time += dt) {
    const st = ladder[lvl];
    const P = power({ ...o.op, v: st.v, f: st.f }, T).total;
    if (steps % 10 === 0) { t.push(time); tj.push(T); f.push(st.f); p.push(P); }
    T += dt * (P - (T - o.ta) / o.theta) / o.cth;
    energy += P * dt; work += st.f * dt;
    if (T > 250) { runaway = true; T = 250; }
    if (o.enabled && time >= nextCtl) {
      nextCtl += period;
      if (T > o.tLimit && lvl > 0) lvl--;
      else if (T < o.tLimit - o.hyst && lvl < ladder.length - 1) lvl++;
    }
    steps++;
  }
  const n = f.length; const tail = Math.floor(n / 2);
  const avgF = f.slice(tail).reduce((a, b) => a + b, 0) / Math.max(1, n - tail);
  return { t, tj, f, p, ladder, runaway, avgF, peakTj: Math.max(...tj), finalTj: tj[n - 1], energyPerOp: work > 0 ? energy / work : 0, tau: o.theta * o.cth };
}
