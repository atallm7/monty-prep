// Return current under a microstrip trace and the effect of a plane slot.
// Return-current density (Holloway/Johnson): J(x) = I/(π·h) · 1/(1+(x/h)²)   (integrates to I over x ∈ ±∞)
//   fraction inside ±a:  F(a) = (2/π)·atan(a/h)   → 50% within ±h, 90% within ±6.31h
// Solid-plane loop inductance per length: L' = μ0·h / w_eff (Hammerstad effective width, air-dielectric field limit).
// Slot crossing the trace (slot length S perpendicular to the trace, centered): current inside ±S/2 is forced around
// the slot ends; detour = lateral leg d = S/2 each way. Added inductance (partial self inductance of a straight
// segment, Grover): ΔL = 2e-7·d·(ln(2d/r) − 0.75) H (d, r in m), weighted by the blocked fraction F(S/2).
// Fixes: stitching cap in parallel with the detour reactance (cap = C, ESL), via-bridge = low-L jumper in parallel.
// Radiation / crosstalk: differential-mode emission E ∝ f²·A_loop·I, A_loop ∝ L_loop → penalty = 20·log10(L/L_solid).
// Common-impedance noise across the slot: V = ω·ΔL_eff·I_pk.
export const MU0 = 4e-7 * Math.PI;
export type Fix = 'none' | 'stitch-cap' | 'via-bridge';

/** Normalized return-current density J(x)·h·π/I = 1/(1+(x/h)²) (peak = 1 at x = 0). */
export const returnShape = (x: number, h: number) => 1 / (1 + (x / h) * (x / h));
/** Current density in A/mm per mm of trace for total current I (A): I/(πh)/(1+(x/h)²), x,h in mm. */
export const returnDensity = (x: number, h: number, I = 1) => (I / (Math.PI * h)) * returnShape(x, h);
/** Fraction of return current within ±a of the trace centre. */
export const fractionWithin = (a: number, h: number) => (2 / Math.PI) * Math.atan(Math.max(0, a) / h);
/** Half-width containing the given fraction (0..<1) of return current. */
export const widthForFraction = (frac: number, h: number) => h * Math.tan((Math.PI / 2) * Math.min(Math.max(frac, 0), 0.999999));

/** Hammerstad effective width (mm). */
export const wEff = (w: number, h: number) => w + 1.393 * h + 0.667 * h * Math.log(w / h + 1.444);
/** Solid-plane loop inductance per mm (H/mm). */
export const lPerMm = (w: number, h: number) => (MU0 * (h * 1e-3)) / (wEff(w, h) * 1e-3) * 1e-3;

/** Partial inductance of a straight segment (H), d and r in mm. */
export function partialL(dMm: number, rMm: number) {
  const d = dMm * 1e-3, r = rMm * 1e-3;
  if (!(d > r)) return 0;
  return 2e-7 * d * (Math.log((2 * d) / r) - 0.75);
}

export type RPIn = { h: number; slot: boolean; slotLen: number; fix: Fix; fMHz: number; w?: number; len?: number; C?: number; esl?: number; ipk?: number };
export function returnPath(p: RPIn) {
  const w = p.w ?? 0.3, len = p.len ?? 50, C = p.C ?? 100e-9, esl = p.esl ?? 1.5e-9, ipk = p.ipk ?? 0.01;
  const f = p.fMHz * 1e6, om = 2 * Math.PI * f;
  const Lsolid = lPerMm(w, p.h) * len; // H
  const half = p.slotLen / 2;
  const blocked = p.slot ? fractionWithin(half, p.h) : 0;
  const dLraw = p.slot ? partialL(half, w / 2 + 0.0) * 2 /* out and back */ : 0;
  const dL = dLraw * blocked; // unfixed detour inductance
  // impedance of detour (inductive) and of the fix in parallel
  let zr = 0, zi = om * dL; // detour impedance (re, im)
  if (p.slot && p.fix !== 'none') {
    let fr = 0, fi = 0;
    if (p.fix === 'stitch-cap') { fr = 0.02; fi = om * esl - 1 / (om * C); }  // C with ESL + 20 mΩ ESR
    else { fr = 0.005; fi = om * 1.2e-9; }                                       // via bridge ≈ 1.2 nH loop, ~5 mΩ
    // parallel of (zr + j zi) and (fr + j fi), only the blocked fraction of current is helped
    const nr = zr * fr - zi * fi, ni = zr * fi + zi * fr; // product
    const dr = zr + fr, di = zi + fi;
    const dd = dr * dr + di * di;
    const pr = (nr * dr + ni * di) / dd, pi = (ni * dr - nr * di) / dd;
    zr = pr; zi = pi;
  }
  const zmag = Math.hypot(zr, zi);
  const dLeff = p.slot ? zmag / om : 0; // effective (magnitude) added inductance
  const Ltot = Lsolid + dLeff;
  const loopAreaRel = Ltot / Lsolid;
  const emiPenaltyDb = 20 * Math.log10(loopAreaRel);
  const noiseV = om * dLeff * ipk;
  // also: a capacitor is capacitive (below SRF) -> sign
  return { Lsolid, dL, dLeff, Ltot, blocked, loopAreaRel, emiPenaltyDb, noiseV, zmag, lPerMmSolid: lPerMm(w, p.h), r50: widthForFraction(0.5, p.h), r90: widthForFraction(0.9, p.h) };
}

/** Magnitude (Ω) of the extra impedance across the slot vs frequency (Hz). */
export function slotImpedance(p: RPIn, fHz: number) {
  const r = returnPath({ ...p, fMHz: fHz / 1e6 });
  return r.zmag;
}
