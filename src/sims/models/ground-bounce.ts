// Ground bounce / simultaneous switching noise (SSN).
// N identical output drivers pull their load capacitances CL (referenced to board ground) low through the shared
// package/bond-wire ground inductance L:   Vg = L * dI/dt   (+ Rl*I)   with  I = N * i_driver.
// Self-consistent lumped model (solved with RK4):
//   driver:   i_d  = G(t) * (Vo - Vg),  G(t) = (1/Ron) * (1 - cos(pi t/tr))/2 for t<tr, else 1/Ron   (raised-cosine gate edge)
//   load:     CL dVo/dt = -i_d
//   ground node (internal die ground): Cd dVg/dt = N*i_d - iL
//   inductance: Leff diL/dt = Vg - Rl*iL ,  Leff = L / pins   (parallel ground pins/bonds)
// The negative feedback (Vg reduces Vo - Vg, hence the current) is why measured bounce is far below the open-loop N*L*di/dt estimate.
// Open-loop estimate for an ideal raised-cosine output edge: i = N*CL*dV/dt, peak di/dt = N*CL*Vdd*pi^2/(2 tr^2).
export type GbIn = { n: number; l: number; cl: number; tr: number; vdd: number; cd?: number; pins?: number; ron?: number; rl?: number };

export const openLoopDiDt = (p: GbIn) => p.n * p.cl * p.vdd * Math.PI ** 2 / (2 * p.tr ** 2);
export const openLoopBounce = (p: GbIn) => (p.l / (p.pins ?? 1)) * openLoopDiDt(p);
/** Output-edge current for an ideal raised-cosine voltage edge (used for the open-loop estimate). */
export function idealCurrent(p: GbIn, t: number) { return t < 0 || t > p.tr ? 0 : p.n * p.cl * p.vdd * (Math.PI / (2 * p.tr)) * Math.sin(Math.PI * t / p.tr); }

export function simulate(p: GbIn, maxPts = 700) {
  const n = Math.max(1, p.n), cd = Math.max(p.cd ?? 5e-12, 0.5e-12), pins = Math.max(1, p.pins ?? 1), ron = p.ron ?? 30, rl = p.rl ?? 0.1;
  const L = Math.max(p.l, 1e-12) / pins, CL = p.cl, tr = p.tr, vdd = p.vdd;
  const tauMin = cd * ron / n, T0 = 2 * Math.PI * Math.sqrt(L * cd);
  const tEnd = 2.2 * tr + 8 * ron * CL + 4 * T0 + 1e-9;
  const dt = Math.min(tr / 400, 1.2 * tauMin, T0 / 40);
  const steps = Math.min(400000, Math.ceil(tEnd / dt));
  const h = tEnd / steps;
  const G = (t: number) => (t >= tr ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * t / tr)) / ron;
  const f = (t: number, vo: number, il: number, vg: number) => {
    const id = G(t) * (vo - vg);
    return [-id / CL, (vg - rl * il) / L, (n * id - il) / cd, id];
  };
  let vo = vdd, il = 0, vg = 0, t = 0, qCharge = 0;
  const every = Math.max(1, Math.floor(steps / maxPts));
  const T: number[] = [], VO: number[] = [], VG: number[] = [], IL: number[] = [], ID: number[] = [];
  let vgMax = -Infinity, vgMin = Infinity, iMax = 0, didtMax = 0, prevI = 0;
  for (let k = 0; k <= steps; k++) {
    const id = G(t) * (vo - vg), itot = n * id;
    if (k % every === 0) { T.push(t); VO.push(vo); VG.push(vg); IL.push(il); ID.push(itot); }
    vgMax = Math.max(vgMax, vg); vgMin = Math.min(vgMin, vg); iMax = Math.max(iMax, Math.abs(il));
    if (k > 0) didtMax = Math.max(didtMax, Math.abs((itot - prevI) / h)); prevI = itot;
    qCharge += il * h;
    const a = f(t, vo, il, vg), b = f(t + h / 2, vo + h / 2 * a[0], il + h / 2 * a[1], vg + h / 2 * a[2]);
    const c = f(t + h / 2, vo + h / 2 * b[0], il + h / 2 * b[1], vg + h / 2 * b[2]), d = f(t + h, vo + h * c[0], il + h * c[1], vg + h * c[2]);
    vo += h / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0]); il += h / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1]); vg += h / 6 * (a[2] + 2 * b[2] + 2 * c[2] + d[2]);
    t += h;
  }
  const vil = 0.3 * vdd; // CMOS input-low threshold for the receiver of a quiet-low line
  const ringF = 1 / (2 * Math.PI * Math.sqrt(L * cd));
  return {
    t: T, vo: VO, vg: VG, il: IL, itot: ID, peak: vgMax, trough: vgMin, pkpk: vgMax - vgMin, iPeak: iMax, didtPeak: didtMax,
    charge: qCharge, expectedCharge: n * CL * vdd, vil, falseTrigger: vgMax > vil, margin: vil - vgMax, leff: L, ringF,
    openLoop: openLoopBounce({ ...p, pins }), vfinal: vo, vgfinal: vg, tEnd,
  };
}
