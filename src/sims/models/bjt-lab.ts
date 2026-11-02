// BJT large-signal model: Ebers–Moll (transport form) with the Early effect, driven by a base current.
//
// NPN, VT = kT/q (Sedra/Smith §6.?, Gray–Meyer §1.3):
//   I_CC = Is·(e^{Vbe/VT} − e^{Vbc/VT})·(1 + Vce/VA)          (transport current, Early effect)
//   Ic   = I_CC − (Is/βR)·(e^{Vbc/VT} − 1)
//   Ib   = (Is/βF)·(e^{Vbe/VT} − 1) + (Is/βR)·(e^{Vbc/VT} − 1)
// Forward-active (B–E forward, B–C reverse): Ic ≈ βF·Ib·(1 + Vce/VA); the Ic–Vce curves extrapolate to Vce = −VA.
// Saturation (both junctions forward): Ic < β·Ib, Vce(sat) ≈ VT·ln(…) ≈ 0.05–0.2 V.
// Cut-off: Ib = 0 → Ic = 0 (both junctions off).
// For a given Ib and Vce the base–emitter voltage is found by bisection (Ib is monotonic in Vbe).
// PNP: same equations with every voltage and current negated (Veb, Vec, Ic flows OUT of the collector).
//
// Region rule used for the label: saturation when the collector junction is forward-biased by more than
// 0.4 V (Vbc > 0.4 V, i.e. Vce below ≈ Vbe − 0.4 ≈ 0.3 V), which is where Ic visibly departs from β·Ib.

export type BjtType = 'npn' | 'pnp';
export type BjtParams = { type: BjtType; beta: number; va: number; is?: number; betaR?: number; vt?: number };
export type BjtRegion = 'cutoff' | 'active' | 'saturation';

const VT_300K = 0.025852;
const SAT_VBC = 0.4;

const ex = (x: number) => Math.exp(Math.min(x, 80));
const earlyF = (vce: number, va: number) => (Number.isFinite(va) && va > 0 ? 1 + vce / va : 1);

/** NPN currents (magnitude convention) for given Vbe, Vce. */
export function emCurrents(p: BjtParams, vbe: number, vce: number) {
  const is = p.is ?? 1e-14, br = p.betaR ?? 1, vt = p.vt ?? VT_300K;
  const vbc = vbe - vce;
  const eBE = ex(vbe / vt), eBC = ex(vbc / vt);
  const icc = is * (eBE - eBC) * earlyF(Math.max(vce, 0), p.va);
  const ic = icc - (is / br) * (eBC - 1);
  const ib = (is / p.beta) * (eBE - 1) + (is / br) * (eBC - 1);
  return { ic, ib, vbc };
}

/** Solve Vbe for a given (positive) Ib at a fixed Vce ≥ 0 (NPN magnitudes). */
export function vbeForIb(p: BjtParams, ib: number, vce: number) {
  if (ib <= 0) return 0;
  let lo = -0.2, hi = 1.2;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (emCurrents(p, m, vce).ib < ib) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

function region(ib: number, vbc: number): BjtRegion { return ib <= 0 ? 'cutoff' : vbc > SAT_VBC ? 'saturation' : 'active'; }

/** Magnitude-domain operating point at a given Ib and Vce (NPN sense). */
function pointMag(p: BjtParams, ib: number, vce: number) {
  if (ib <= 0) return { ic: 0, vbe: 0, vbc: -vce, region: 'cutoff' as BjtRegion };
  const vbe = vbeForIb(p, ib, vce); const c = emCurrents(p, vbe, vce);
  return { ic: c.ic, vbe, vbc: c.vbc, region: region(ib, c.vbc) };
}

const sg = (t: BjtType) => (t === 'npn' ? 1 : -1);

/**
 * Collector current for signed Ib / Vce (real polarity). For PNP pass Ib ≤ 0 (out of the base) and Vce ≤ 0.
 * Returns signed Ic (into the collector) and Vbe.
 */
export function collector(p: BjtParams, ib: number, vce: number) {
  const s = sg(p.type);
  const r = pointMag(p, s * ib, Math.max(0, s * vce));
  return { ic: s * r.ic, vbe: s * r.vbe, vbc: s * r.vbc, region: r.region };
}

/** Ic–Vce family for a list of |Ib| values (signed axes). */
export function outputFamily(p: BjtParams, ibList: number[], vceMax: number, n = 181) {
  const s = sg(p.type);
  // denser near the origin so the saturation knee is resolved
  const x = Array.from({ length: n }, (_, i) => { const u = i / (n - 1); return s * vceMax * (u < 0.25 ? u * u * 4 * 0.06 / 0.25 : 0.06 + (u - 0.25) / 0.75 * 0.94); });
  return ibList.map(ib => ({ ib: s * ib, x, y: x.map(v => collector(p, s * ib, v).ic) }));
}

/**
 * Load-line operating point: Vcc → Rc → collector, emitter at ground (PNP: emitter at Vcc, collector → Rc → ground).
 * Solves Vcc − |Ic|·Rc = |Vce| by bisection (Ic grows monotonically with Vce at fixed Ib).
 */
export function loadLinePoint(p: BjtParams, ibMag: number, vcc: number, rc: number) {
  const s = sg(p.type);
  const f = (v: number) => vcc - rc * pointMag(p, ibMag, v).ic - v;
  let lo = 0, hi = Math.max(vcc, 0);
  if (ibMag <= 0 || f(hi) >= 0) lo = hi;
  for (let i = 0; i < 70 && hi - lo > 1e-12; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  const vce = (lo + hi) / 2;
  const r = pointMag(p, ibMag, vce);
  const ic = Math.max(0, r.ic);
  return {
    vce: s * vce, ic: s * ic, ib: s * ibMag, vbe: s * r.vbe, region: r.region,
    forcedBeta: ibMag > 0 ? ic / ibMag : 0, pd: ic * vce + ibMag * r.vbe,
  };
}

/** Base current needed to just saturate the transistor on this load line (textbook edge-of-saturation estimate). */
export function ibEdgeOfSat(beta: number, vcc: number, rc: number, vceSat = 0.2) { return Math.max(0, vcc - vceSat) / (beta * rc); }

/** Base drive from a source VBB through RB: (VBB − Vbe)/RB = Ib, solved jointly with the load line. */
export function ibFromVbb(p: BjtParams, vbb: number, rb: number, vcc: number, rc: number) {
  if (vbb <= 0) return 0;
  let lo = 0, hi = vbb / Math.max(rb, 1e-9);
  const h = (ib: number) => vbb - rb * ib - Math.abs(loadLinePoint(p, ib, vcc, rc).vbe);
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (h(m) > 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** Transfer: Ic and Vce vs |Ib| on the load line (shows the switch: off → linear → saturated). */
export function ibSweep(p: BjtParams, vcc: number, rc: number, ibMax: number, n = 121) {
  const ib: number[] = [], ic: number[] = [], vce: number[] = [];
  for (let i = 0; i < n; i++) { const b = ibMax * i / (n - 1); const o = loadLinePoint(p, b, vcc, rc); ib.push(b); ic.push(Math.abs(o.ic)); vce.push(Math.abs(o.vce)); }
  return { ib, ic, vce };
}

/** Small-signal parameters in forward-active: gm = Ic/VT, rπ = β/gm, ro = (VA + Vce)/Ic. */
export function smallSignal(p: BjtParams, icMag: number, vceMag: number) {
  const vt = p.vt ?? VT_300K;
  const gm = icMag / vt;
  return { gm, rpi: gm > 0 ? p.beta / gm : Infinity, ro: icMag > 0 && Number.isFinite(p.va) ? (p.va + vceMag) / icMag : Infinity };
}
