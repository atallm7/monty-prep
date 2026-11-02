// Single-NMOS (BSS138-style) bidirectional level shifter, DC solution by nested bisection.
//
//   Low-voltage bus  A = FET source (Vs) ── Rl ──► Vlow        Gate tied to Vlow
//   High-voltage bus B = FET drain  (Vd) ── Rh ──► Vhigh
//   Each side can be driven low by an open-drain/push-pull driver of resistance Rdrv, or released.
// MOSFET (level-1, symmetric channel, W/L folded into K):
//     Vov = Vg − Vlow_node − Vth,  Vds = Vd − Vs
//     cutoff    Vov ≤ 0 : I = 0
//     triode    Vds < Vov : I = K·(Vov·Vds − Vds²/2)(1 + λVds)
//     saturation          : I = ½K·Vov²(1 + λVds)
//   (for Vds < 0 the channel swaps roles: source = drain pin). Body diode: anode = source, cathode = drain,
//     Ib = Is·(exp((Vs − Vd)/(n·Vt)) − 1)  (turns on at ≈ 0.6 V and holds the released side near Vf while it is being pulled down).
// KCL at both nodes is monotonic in each node voltage, so a nested bisection always converges.
export type LSIn = {
  vlow: number; vhigh: number; lowDrive: boolean; highDrive: boolean;
  rl?: number; rh?: number; rdrv?: number; vth?: number; k?: number; bodyDiode?: boolean;
};
const VT = 0.02585, N_D = 1.0, IS_D = 1e-13;
export const LS_DEFAULTS = { rl: 10e3, rh: 10e3, rdrv: 25, vth: 1.3, k: 0.083, bodyDiode: true };
const LAMBDA = 0.02;

/** Channel current drain→source (signed) and body-diode current source→drain. */
export function fet(vg: number, vd: number, vs: number, vth: number, k: number) {
  const sgn = vd >= vs ? 1 : -1;
  const hi = sgn > 0 ? vd : vs, lo = sgn > 0 ? vs : vd; // hi/lo channel terminals; "source" = lo
  const vov = vg - lo - vth, vds = hi - lo;
  let i = 0;
  if (vov > 0) i = vds < vov ? k * (vov * vds - 0.5 * vds * vds) * (1 + LAMBDA * vds) : 0.5 * k * vov * vov * (1 + LAMBDA * vds);
  return sgn * i;
}
export function bodyI(vs: number, vd: number) {
  const x = Math.min((vs - vd) / (N_D * VT), 40);
  return IS_D * (Math.exp(x) - 1);
}
export type LSOut = {
  vs: number; vd: number; vgs: number; ich: number; ibody: number; state: string; tone: 'ok' | 'warn' | 'bad' | 'info';
  ilow: number; ihigh: number; resid: number; rdson: number;
};
export function solve(p: LSIn): LSOut {
  const q = { ...LS_DEFAULTS, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as Required<LSIn>;
  const gl = q.lowDrive ? 1 / q.rdrv : 0, gh = q.highDrive ? 1 / q.rdrv : 0;
  const ich = (vd: number, vs: number) => fet(q.vlow, vd, vs, q.vth, q.k);
  const ib = (vd: number, vs: number) => (q.bodyDiode ? bodyI(vs, vd) : 0);
  // KCL residual at drain: current into node − current out (decreasing in vd)
  const fd = (vd: number, vs: number) => (q.vhigh - vd) / q.rh - vd * gh - ich(vd, vs) + ib(vd, vs);
  const fs = (vs: number, vd: number) => (q.vlow - vs) / q.rl - vs * gl + ich(vd, vs) - ib(vd, vs);
  const lo0 = -0.5, hi0 = Math.max(q.vlow, q.vhigh) + 0.5;
  const bis = (f: (x: number) => number, a: number, b: number) => { // f decreasing
    for (let i = 0; i < 60; i++) { const m = 0.5 * (a + b); if (f(m) > 0) a = m; else b = m; }
    return 0.5 * (a + b);
  };
  const solveD = (vs: number) => bis(vd => fd(vd, vs), lo0, hi0);
  const vs = bis(x => fs(x, solveD(x)), lo0, hi0), vd = solveD(vs);
  const I = ich(vd, vs), Ib = ib(vd, vs), vgs = q.vlow - vs;
  const vov = vgs - q.vth;
  let state: string, tone: LSOut['tone'];
  if (Ib > 20e-6 && Math.abs(I) < 0.2 * Ib) { state = 'Body diode conducting'; tone = 'warn'; }
  else if (Ib > 20e-6) { state = 'Body diode + channel turning on'; tone = 'warn'; }
  else if (vov <= 0) { state = 'FET off (Vgs < Vth)'; tone = 'info'; }
  else if (Math.abs(vd - vs) < vov) { state = 'FET on (triode)'; tone = 'ok'; }
  else { state = 'FET on (saturation)'; tone = 'warn'; }
  return { vs, vd, vgs, ich: I, ibody: Ib, state, tone, ilow: (q.vlow - vs) / q.rl, ihigh: (q.vhigh - vd) / q.rh, resid: Math.abs(fd(vd, vs)) + Math.abs(fs(vs, vd)), rdson: vov > 0 ? 1 / (q.k * vov) : Infinity };
}

/** Transfer curves: force one bus from 0 to its pull-up voltage (through Rdrv) and read the other. */
export function sweep(p: LSIn, side: 'high' | 'low', n = 80) {
  const q = { ...LS_DEFAULTS, ...p };
  const vmax = side === 'high' ? q.vhigh : q.vlow;
  const x: number[] = [], y: number[] = [], vgs: number[] = [];
  for (let i = 0; i <= n; i++) {
    const v = (vmax * i) / n;
    // an ideal driver at v: emulate with a Norton source (tiny Rdrv, pullup replaced) by solving the free side only
    const free = solveFree(q, side, v);
    x.push(v); y.push(free.v); vgs.push(free.vgs);
  }
  return { x, y, vgs };
}
function solveFree(q: Required<LSIn> & { lowDrive?: boolean }, side: 'high' | 'low', vForced: number) {
  const ich = (vd: number, vs: number) => fet(q.vlow, vd, vs, q.vth, q.k);
  const ib = (vd: number, vs: number) => (q.bodyDiode ? bodyI(vs, vd) : 0);
  let a = -0.5, b = Math.max(q.vlow, q.vhigh) + 0.5;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (a + b); let f: number;
    if (side === 'high') { const vs = m; f = (q.vlow - vs) / q.rl + ich(vForced, vs) - ib(vForced, vs); }   // free low node
    else { const vd = m; f = (q.vhigh - vd) / q.rh - ich(vd, vForced) + ib(vd, vForced); }                  // free high node
    if (f > 0) a = m; else b = m;
  }
  const v = 0.5 * (a + b);
  return { v, vgs: q.vlow - (side === 'high' ? v : vForced) };
}
