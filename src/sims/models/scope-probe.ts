// Oscilloscope probe models.
//
// 1) Compensation (10× passive probe): tip R1‖C1 in series with scope-side R2‖C2 (C2 = cable + scope input + trimmer).
//    H(s) = Z2/(Z1+Z2), Zi = Ri/(1+sRiCi). Flat (frequency-independent) iff R1·C1 = R2·C2.
//    Step response: instant capacitive division C1/(C1+C2), then relaxes to the resistive ratio R2/(R1+R2)
//    with τ = (R1‖R2)(C1+C2). C2 too big → under-compensated (rounded); too small → over-compensated (peaky).
// 2) Loading: source Thevenin R_s driving the probe input Z_p = R_p‖C_p; measured/true = Z_p/(R_s+Z_p).
//    DC error R_s/(R_s+R_p); loaded bandwidth f = 1/(2π (R_s‖R_p) C_p); added 10–90 % rise ≈ 2.2·(R_s‖R_p)·C_p.
// 3) Ground lead: series R-L-C loop (source R_s, lead inductance L ≈ 1 nH/mm, probe tip C_p):
//    f0 = 1/(2π√(LC)), ζ = (R_s/2)·√(C/L); for ζ<1 overshoot = exp(−πζ/√(1−ζ²)). Solved with RK4.

export type CompIn = { r1: number; c1: number; r2: number; c2: number; f: number; vpp: number; atten: number };

export function compensation(p: CompIn) {
  const kr = p.r2 / (p.r1 + p.r2), kc = p.c1 / (p.c1 + p.c2);
  const tau = (p.r1 * p.r2 / (p.r1 + p.r2)) * (p.c1 + p.c2);
  const P = 1 / p.f, H = P / 2;
  // periodic steady state by iterating half-periods: v(H−) after relaxation, jumps at each edge
  let v = 0, vin = 0; // start low
  const relax = (v0: number, vinLvl: number, t: number) => vinLvl * kr + (v0 - vinLvl * kr) * Math.exp(-t / tau);
  for (let i = 0; i < 400; i++) {
    const nv = i % 2 === 0 ? p.vpp : 0; v += (nv - vin) * kc; vin = nv; v = relax(v, vin, H);
  }
  // now at end of a low half-period (i=399 odd → vin=0). Sample two periods.
  const n = 400; const t: number[] = [], y: number[] = [], ideal: number[] = [];
  let vStart = v, lvl = 0;
  for (let half = 0; half < 4; half++) {
    const nv = half % 2 === 0 ? p.vpp : 0; vStart += (nv - lvl) * kc; lvl = nv;
    for (let k = 0; k <= n / 4; k++) {
      const tt = k / (n / 4) * H; t.push(half * H + tt); y.push(relax(vStart, lvl, tt) * p.atten); ideal.push(lvl);
    }
    vStart = relax(vStart, lvl, H);
  }
  const peak = Math.max(...y), flat = p.vpp * kr * p.atten;
  const ratio = (p.r1 * p.c1) / (p.r2 * p.c2);
  return { t, y, ideal, kr, kc, tau, ratio, hfGainErr: kc / kr - 1, overshoot: peak / flat - 1, cIdeal: p.r1 * p.c1 / p.r2 };
}

export function compMag(f: number, p: { r1: number; c1: number; r2: number; c2: number }) {
  const w = 2 * Math.PI * f;
  // Zi = Ri/(1 + jωRiCi) → admittance Yi = 1/Ri + jωCi ; H = Y1/(Y1+Y2)
  const y1r = 1 / p.r1, y1i = w * p.c1, y2r = 1 / p.r2, y2i = w * p.c2;
  return Math.hypot(y1r, y1i) / Math.hypot(y1r + y2r, y1i + y2i);
}

export type Probe = { id: string; label: string; r: number; c: number; color: string };
export const PROBES: Probe[] = [
  { id: 'x1', label: '1× passive', r: 1e6, c: 110e-12, color: 'red' },
  { id: 'x10', label: '10× passive', r: 10e6, c: 10e-12, color: 'accent' },
  { id: 'active', label: 'Active FET', r: 1e6, c: 0.9e-12, color: 'green' },
  { id: 'lowz', label: 'Low-Z 10× (500 Ω)', r: 500, c: 0.5e-12, color: 'orange' },
];
export function loadingRatio(f: number, rs: number, rp: number, cp: number) {
  // Zp = rp/(1+jωrpcp); ratio = Zp/(rs+Zp) = 1/(1 + rs·Yp), Yp = 1/rp + jωcp
  const w = 2 * Math.PI * f; const re = 1 + rs / rp, im = rs * w * cp; return 1 / Math.hypot(re, im);
}
export function loading(rs: number, pr: { r: number; c: number }, f: number) {
  const rpar = rs * pr.r / (rs + pr.r), w = 2 * Math.PI * f;
  return {
    zp: pr.r / Math.hypot(1, w * pr.r * pr.c), dcRatio: pr.r / (rs + pr.r), ratio: loadingRatio(f, rs, pr.r, pr.c),
    f3: 1 / (2 * Math.PI * rpar * pr.c), tau: rpar * pr.c, trAdded: 2.197 * rpar * pr.c,
  };
}

export type GndIn = { L: number; C: number; rs: number; tr: number; v: number; tEnd?: number };
export function rlcParams(L: number, C: number, R: number) {
  const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C)), zeta = (R / 2) * Math.sqrt(C / L);
  return { f0, zeta, Q: 1 / (2 * zeta), fd: zeta < 1 ? f0 * Math.sqrt(1 - zeta * zeta) : 0, os: zeta < 1 ? Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta * zeta)) : 0 };
}
/** Ramp input 0→v over tr (10–90 % of a linear ramp is 0.8·tr; we specify the full ramp duration = tr/0.8). */
export function groundLead(p: GndIn) {
  const rp = rlcParams(p.L, p.C, p.rs);
  const tRamp = Math.max(1e-13, p.tr / 0.8);
  const vin = (t: number) => t <= 0 ? 0 : t >= tRamp ? p.v : p.v * t / tRamp;
  const T0 = 1 / rp.f0;
  const decay = rp.zeta < 1 ? 1 / (rp.zeta * 2 * Math.PI * rp.f0) : p.rs * p.C;
  const tEnd = p.tEnd ?? Math.min(Math.max(8 * Math.min(decay, 40 * T0), 3 * tRamp, 6 * T0), 200e-9);
  const h = Math.min(T0 / 200, tRamp / 20, tEnd / 2000);
  const steps = Math.min(200000, Math.ceil(tEnd / h));
  const dt = tEnd / steps;
  let i = 0, vc = 0;
  const f = (t: number, i_: number, v_: number) => [(vin(t) - p.rs * i_ - v_) / p.L, i_ / p.C];
  const stride = Math.max(1, Math.floor(steps / 800));
  const t: number[] = [0], y: number[] = [0], yin: number[] = [0];
  let peak = 0;
  for (let k = 0; k < steps; k++) {
    const tk = k * dt;
    const [a1, b1] = f(tk, i, vc), [a2, b2] = f(tk + dt / 2, i + a1 * dt / 2, vc + b1 * dt / 2);
    const [a3, b3] = f(tk + dt / 2, i + a2 * dt / 2, vc + b2 * dt / 2), [a4, b4] = f(tk + dt, i + a3 * dt, vc + b3 * dt);
    i += dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4); vc += dt / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
    peak = Math.max(peak, vc);
    if ((k + 1) % stride === 0) { t.push(tk + dt); y.push(vc); yin.push(vin(tk + dt)); }
  }
  return { ...rp, t, y, yin, overshootSim: peak / p.v - 1, tEnd };
}
