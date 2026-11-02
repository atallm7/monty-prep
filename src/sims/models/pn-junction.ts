// Abrupt silicon PN junction in the depletion approximation (Sze, Physics of Semiconductor Devices ch. 2;
// Pierret, Semiconductor Device Fundamentals ch. 5). x = 0 is the metallurgical junction, p-side at x < 0.
//
//   Vbi  = (kT/q)·ln(Na·Nd / ni²)                                  built-in potential
//   W    = sqrt( 2εs(Vbi − Va)/q · (1/Na + 1/Nd) )                  total depletion width
//   xn   = W·Na/(Na + Nd),  xp = W·Nd/(Na + Nd)                     charge neutrality Na·xp = Nd·xn
//   Emax = q·Nd·xn/εs = q·Na·xp/εs = 2(Vbi − Va)/W                  peak field at x = 0
//   ρ(x) = −q·Na (−xp<x<0), +q·Nd (0<x<xn)
//   E(x) = −qNa(x+xp)/εs (p side), −qNd(xn−x)/εs (n side)          (field points n → p, i.e. −x)
//   φ(x) = qNa(x+xp)²/(2εs) (p side), (Vbi−Va) − qNd(xn−x)²/(2εs) (n side), φ(−xp) = 0
//   Cj'  = εs/W   (small-signal depletion capacitance per area)
// Bands (eV, referenced to p-side Fermi level for Va = 0): Ei(x) = −φ(x) + const; Ec = Ei + Eg/2, Ev = Ei − Eg/2 (midgap Ei approx).
// The depletion approximation fails when Va → Vbi (high injection); we cap Va at Vbi − 2kT/q.

export const Q = 1.602176634e-19;     // C
export const EPS0 = 8.8541878128e-14; // F/cm
export const EPS_SI = 11.7 * EPS0;    // F/cm
export const NI_SI = 1.0e10;          // cm^-3 at 300 K
export const EG_SI = 1.12;            // eV
export const VT300 = (1.380649e-23 * 300) / Q;
export const E_CRIT = 4e5;            // V/cm, rough avalanche critical field for Si at moderate doping

export type PnIn = { na: number; nd: number; va: number };

export function pn({ na, nd, va }: PnIn) {
  const vt = VT300;
  const NA = Math.max(na, 1e10), ND = Math.max(nd, 1e10);
  const vbi = vt * Math.log((NA * ND) / (NI_SI * NI_SI));
  const vaMax = vbi - 2 * vt;
  const vaEff = Math.min(va, vaMax);
  const vj = vbi - vaEff; // total potential drop across the depletion region
  const W = Math.sqrt(((2 * EPS_SI * vj) / Q) * (1 / NA + 1 / ND)); // cm
  const xn = (W * NA) / (NA + ND), xp = (W * ND) / (NA + ND);
  const emax = (Q * ND * xn) / EPS_SI; // V/cm
  const cj = EPS_SI / W; // F/cm²
  const ldn = Math.sqrt((EPS_SI * vt) / (Q * ND)), ldp = Math.sqrt((EPS_SI * vt) / (Q * NA)); // Debye lengths
  return { vbi, vaEff, clamped: va > vaMax, vj, W, xn, xp, emax, cj, ldn, ldp, NA, ND, vt, breakdownRisk: emax > E_CRIT };
}
export type PnOut = ReturnType<typeof pn>;

/** Charge density ρ/q [cm^-3], field E [V/cm], potential φ [V] at position x [cm]. */
export function profile(r: PnOut, x: number) {
  const { xp, xn, NA, ND, vj } = r;
  if (x <= -xp) return { rho: 0, e: 0, phi: 0 };
  if (x >= xn) return { rho: 0, e: 0, phi: vj };
  if (x < 0) return { rho: -NA, e: (-Q * NA * (x + xp)) / EPS_SI, phi: (Q * NA * (x + xp) ** 2) / (2 * EPS_SI) };
  return { rho: ND, e: (-Q * ND * (xn - x)) / EPS_SI, phi: vj - (Q * ND * (xn - x) ** 2) / (2 * EPS_SI) };
}

/** Band edges [eV] at x, referenced to the p-side Fermi level = 0. Quasi-Fermi levels flat across the depletion region. */
export function bands(r: PnOut, x: number) {
  const { vt, NA, ND } = r;
  const eiP = r.vt * Math.log(NA / NI_SI); // Ei − EF on the neutral p side
  const ei = eiP - profile(r, x).phi;
  return { ec: ei + EG_SI / 2, ev: ei - EG_SI / 2, ei, efp: 0, efn: eiP - r.vj + vt * Math.log(ND / NI_SI) };
}

export function sweep(r: PnOut, n = 401) {
  const span = r.xp + r.xn;
  const x0 = -r.xp - 0.45 * span, x1 = r.xn + 0.45 * span;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) xs.push(x0 + ((x1 - x0) * i) / (n - 1));
  // make sure the corners are sampled exactly
  xs.push(-r.xp, 0, r.xn, -r.xp - 1e-12, r.xn + 1e-12, -1e-15, 1e-15);
  xs.sort((a, b) => a - b);
  return { xs, x0, x1 };
}
