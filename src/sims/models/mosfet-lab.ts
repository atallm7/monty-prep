// MOSFET long-channel square-law model (SPICE level 1, Shichman–Hodges) with channel-length modulation.
//
// NMOS, with β = k'·(W/L), Vov = Vgs − Vt (Sedra/Smith §5.2, Razavi ch. 2):
//   cut-off     Vgs ≤ Vt                 Id = 0           (subthreshold conduction ignored)
//   triode      0 ≤ Vds < Vov            Id = β·(Vov·Vds − Vds²/2)·(1 + λVds)
//   saturation  Vds ≥ Vov                Id = ½β·Vov²·(1 + λVds)
// The (1 + λVds) factor is applied in triode too (as SPICE level 1 does) so Id is continuous at the
// boundary Vds = Vgs − Vt. For Vds < 0 the drain and source swap roles (device is symmetric).
//
// PMOS uses the same equations with every terminal voltage and the drain current negated:
//   Vt here is the magnitude |Vtp|; the device is on when Vsg > |Vtp| (Vgs < −|Vtp|);
//   saturation when Vsd ≥ Vsg − |Vtp|; Id (defined flowing INTO the drain) is negative.
//
// Small signal (saturation): gm = β·Vov·(1 + λVds) = √(2β·Id·(1+λVds)), ro = 1/(λ·Id_sat0) ≈ 1/(λ·Id).
// Deep-triode on-resistance (Vds → 0): Ron = 1 / (β·Vov).

export type MosType = 'nmos' | 'pmos';
export type MosParams = { type: MosType; vt: number; k: number; wl: number; lambda: number };
export type Region = 'cutoff' | 'triode' | 'saturation';

/** NMOS drain current for Vds ≥ 0 with magnitudes (β = k'W/L). */
function idCore(vgs: number, vds: number, vt: number, beta: number, lambda: number): { id: number; region: Region } {
  const vov = vgs - vt;
  if (vov <= 0) return { id: 0, region: 'cutoff' };
  const clm = 1 + lambda * vds;
  if (vds < vov) return { id: beta * (vov * vds - vds * vds / 2) * clm, region: 'triode' };
  return { id: 0.5 * beta * vov * vov * clm, region: 'saturation' };
}

/** NMOS with source/drain swap for Vds < 0. Returns Id into the drain. */
function idN(vgs: number, vds: number, vt: number, beta: number, lambda: number): { id: number; region: Region } {
  if (vds >= 0) return idCore(vgs, vds, vt, beta, lambda);
  // swap: the physical source is now the "drain" terminal
  const r = idCore(vgs - vds, -vds, vt, beta, lambda);
  return { id: r.id === 0 ? 0 : -r.id, region: r.region };
}

/**
 * Drain current (into the drain terminal, signed) for terminal voltages Vgs, Vds (signed, real polarity).
 * For PMOS pass negative Vgs/Vds as on a real circuit; Id comes back negative when conducting.
 */
export function drainCurrent(p: MosParams, vgs: number, vds: number): { id: number; region: Region } {
  const beta = p.k * p.wl;
  const vt = Math.abs(p.vt);
  if (p.type === 'nmos') return idN(vgs, vds, vt, beta, p.lambda);
  const r = idN(-vgs, -vds, vt, beta, p.lambda);
  return { id: r.id === 0 ? 0 : -r.id, region: r.region };
}

/** Magnitude form: |Vgs| overdrive etc. sign s = +1 NMOS, −1 PMOS. */
export const sgn = (t: MosType) => (t === 'nmos' ? 1 : -1);

export type SmallSignal = { vov: number; gm: number; ro: number; ron: number; ronOp: number; vdsSat: number };

/** Small-signal parameters at (Vgs, Vds) — all as positive magnitudes. */
export function smallSignal(p: MosParams, vgs: number, vds: number): SmallSignal {
  const s = sgn(p.type);
  const beta = p.k * p.wl;
  const vgsM = s * vgs, vdsM = s * vds;
  const vov = Math.max(0, vgsM - Math.abs(p.vt));
  const { id, region } = drainCurrent(p, vgs, vds);
  const idM = Math.abs(id);
  let gm = 0;
  if (region === 'saturation') gm = beta * vov * (1 + p.lambda * vdsM);
  else if (region === 'triode') gm = beta * vdsM * (1 + p.lambda * vdsM);
  const ro = region === 'saturation' && p.lambda > 0 ? 1 / (p.lambda * 0.5 * beta * vov * vov) : Infinity;
  const ron = vov > 0 ? 1 / (beta * vov) : Infinity;
  const ronOp = idM > 0 ? Math.abs(vdsM) / idM : Infinity;
  return { vov, gm, ro, ron, ronOp, vdsSat: vov };
}

/** Output characteristics: Id vs Vds for a family of |Vgs| values. Axes negated for PMOS. */
export function outputFamily(p: MosParams, vgsList: number[], vdsMax: number, n = 161) {
  const s = sgn(p.type);
  const x = Array.from({ length: n }, (_, i) => s * vdsMax * i / (n - 1));
  return vgsList.map(vg => ({ vgs: s * vg, x, y: x.map(vd => drainCurrent(p, s * vg, vd).id) }));
}

/** Locus of the triode/saturation boundary Vds = Vov: Id = ½β·Vov²(1+λVov). */
export function satBoundary(p: MosParams, vdsMax: number, n = 81) {
  const s = sgn(p.type); const beta = p.k * p.wl;
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < n; i++) { const v = vdsMax * i / (n - 1); x.push(s * v); y.push(s * 0.5 * beta * v * v * (1 + p.lambda * v)); }
  return { x, y };
}

/** Transfer curve Id vs Vgs at fixed Vds. */
export function transferCurve(p: MosParams, vds: number, vgsMax: number, n = 161) {
  const s = sgn(p.type);
  const x = Array.from({ length: n }, (_, i) => s * vgsMax * i / (n - 1));
  return { x, y: x.map(vg => drainCurrent(p, vg, vds).id) };
}

/**
 * Resistive-load operating point. NMOS: VDD → RD → drain, source at ground (common source).
 * PMOS: source at VDD, drain → RD → ground (Vgs = VG − VDD is passed in directly).
 * Solves VDD − |Id|·RD = |Vds| by bisection (the left side falls monotonically with |Vds|).
 */
export function loadLinePoint(p: MosParams, vgs: number, vdd: number, rd: number) {
  const s = sgn(p.type);
  const f = (vdsM: number) => vdd - rd * Math.abs(drainCurrent(p, vgs, s * vdsM).id) - vdsM;
  let lo = 0, hi = Math.max(0, vdd);
  if (f(hi) >= 0) lo = hi; // cut-off: no drop across RD
  for (let i = 0; i < 80 && hi - lo > 1e-13; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  const vds = s * (lo + hi) / 2;
  const { id, region } = drainCurrent(p, vgs, vds);
  return { vds, id, region, vrd: Math.abs(id) * rd, pd: Math.abs(id * vds) };
}

/** Load line itself: |Id| = (VDD − |Vds|)/RD, signed for the device polarity. */
export function loadLine(p: MosParams, vdd: number, rd: number) {
  const s = sgn(p.type);
  return { x: [0, s * vdd], y: [s * vdd / Math.max(rd, 1e-12), 0] };
}

/**
 * |Vgs| at which a resistively-loaded switch crosses from saturation into triode (Vds = Vov):
 * VDD − RD·½β·Vov²(1+λVov) = Vov. Solved by bisection on Vov.
 */
export function triodeEdgeVgs(p: MosParams, vdd: number, rd: number) {
  const beta = p.k * p.wl;
  const g = (v: number) => vdd - rd * 0.5 * beta * v * v * (1 + p.lambda * v) - v;
  let lo = 0, hi = vdd;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
  return Math.abs(p.vt) + (lo + hi) / 2;
}

/** Switch view: Ron vs gate drive and conduction loss at the operating point. */
export function switchSweep(p: MosParams, vdd: number, rd: number, vgMax: number, n = 121) {
  const s = sgn(p.type);
  const x: number[] = [], ron: number[] = [], vds: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = vgMax * i / (n - 1);
    const op = loadLinePoint(p, s * v, vdd, rd);
    x.push(v); vds.push(Math.abs(op.vds)); ron.push(Math.abs(op.id) > 0 ? Math.abs(op.vds / op.id) : NaN);
  }
  return { x, ron, vds };
}
