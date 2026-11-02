// Inductor saturation model: differential inductance vs DC current for several core materials, and the current
// ramp under an applied voltage pulse (with optional peak-current limit and comparator delay).
//
// Differential (incremental) inductance  L(I) = dλ/dI, with λ the flux linkage (N·Φ).
// Empirical roll-off fitted to datasheet "L vs I_DC" curves (normalised x = |I|/Isat):
//   L(I) = L_f + (L0 − L_f) / (1 + k·x^p)
// L_f   : fully saturated floor. Once the core saturates (μ_r → 1) the winding behaves like an air coil, so
//         L_f ≈ L0/μ_eff (gapped ferrite μ_eff ~ 30–100 → a few %, ungapped nanocrystalline far less).
// p     : sharpness. Ferrite/nanocrystalline saturate abruptly ("hard"); powder iron has a distributed air gap
//         so its permeability rolls off gradually ("soft").
// k     : chosen so L(Isat) = 0.7·L0, i.e. Isat is defined as the current at which L has fallen by 30%
//         (a common datasheet definition; some vendors use 10–20%).
// Air core: L(I) = L0, no saturation.
//
// Current ramp: V = I·R + L(I)·dI/dt  →  dI/dt = (V − I·R)/L(I)     (R = DCR + switch resistance)
// Integrated with RK4 and a step limited so that ΔI per step ≤ Isat/400 (the slope explodes when L collapses).
// Energy: W_in = ∫V·I dt = ∫I dλ (stored) + ∫I²R dt  (checked in the test).
export type Core = 'air' | 'ferrite' | 'powder' | 'nano';
export const CORES: Record<Core, { label: string; p: number; floor: number; info: string }> = {
  ferrite: { label: 'Ferrite (gapped)', p: 7, floor: 0.03, info: 'MnZn/NiZn ferrite: B_sat ≈ 0.35–0.5 T (drops with temperature), low core loss at 100 kHz–MHz, hard saturation.' },
  powder: { label: 'Powder iron / alloy powder', p: 1.6, floor: 0.08, info: 'Iron / MPP / Sendust / Kool Mµ powder: distributed gap, B_sat ≈ 0.8–1.5 T, soft roll-off: L drops early but never falls off a cliff.' },
  nano: { label: 'Nanocrystalline (ungapped)', p: 12, floor: 0.005, info: 'Nanocrystalline / amorphous tape: very high μ_r, B_sat ≈ 1.2 T, extremely sharp saturation. Common for CM chokes and current transformers.' },
  air: { label: 'Air core', p: 0, floor: 1, info: 'No magnetic material: μ_r = 1, never saturates, but needs many more turns for the same L (more DCR, more stray field).' },
};
export const ISAT_DROP = 0.7;

export function makeL(core: Core, l0: number, isat: number) {
  const c = CORES[core] ?? CORES.ferrite;
  if (core === 'air' || c.p === 0) return (_i: number) => l0;
  const lf = c.floor * l0;
  const k = (l0 - lf) / (ISAT_DROP * l0 - lf) - 1;
  const is = Math.max(1e-9, isat);
  return (i: number) => lf + (l0 - lf) / (1 + k * Math.pow(Math.abs(i) / is, c.p));
}

/** λ(I) = ∫0^I L(i) di, numerical (Simpson). */
export function fluxLinkage(L: (i: number) => number, I: number, n = 400) {
  if (I === 0) return 0;
  const h = I / n; let s = L(0) + L(I);
  for (let j = 1; j < n; j++) s += (j % 2 ? 4 : 2) * L(j * h);
  return (s * h) / 3;
}

export type RampIn = { core: Core; l0: number; isat: number; v: number; r: number; tp: number; ilim?: number; td?: number };
export type RampOut = {
  t: number[]; i: number[]; tIdeal: number[]; iIdeal: number[];
  ipk: number; tSat: number; tSatIdeal: number; tOff: number; ein: number; estored: number; lambda: number; eloss: number;
  slope0: number; slopeEnd: number; lEnd: number; limited: boolean;
};

function rk(f: (i: number) => number, i: number, h: number) {
  const k1 = f(i), k2 = f(i + h * k1 / 2), k3 = f(i + h * k2 / 2), k4 = f(i + h * k3);
  return i + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
}

/** Apply V for tp (switch on). If ilim is set the switch turns off td after I first reaches ilim. */
export function ramp(p: RampIn, maxSteps = 60000): RampOut {
  const L = makeL(p.core, p.l0, p.isat);
  const R = Math.max(0, p.r), V = p.v, tp = Math.max(0, p.tp);
  const didt = (i: number) => (V - i * R) / L(i);
  const t: number[] = [0], ia: number[] = [0];
  let tt = 0, i = 0, ein = 0, eloss = 0, tSat = NaN, tOff = tp, limited = false, tTrip = NaN;
  const hMax = tp / 1500 || 1e-9;
  let steps = 0;
  while (tt < tOff - 1e-15 && steps < maxSteps) {
    const s = Math.abs(didt(i)) || 1e-30;
    let h = Math.min(hMax, (p.isat / 400) / s, tOff - tt);
    if (h <= 0) break;
    const i1 = rk(didt, i, h);
    // energy (trapezoid): input V·I, loss I²R
    ein += V * (i + i1) / 2 * h; eloss += R * (i * i + i * i1 + i1 * i1) / 3 * h;
    if (isNaN(tSat) && i < p.isat && i1 >= p.isat) tSat = tt + h * (p.isat - i) / (i1 - i);
    if (p.ilim !== undefined && isNaN(tTrip) && i < p.ilim && i1 >= p.ilim) {
      tTrip = tt + h * (p.ilim - i) / (i1 - i); limited = true; tOff = Math.min(tp, tTrip + Math.max(0, p.td ?? 0));
    }
    i = i1; tt += h; steps++;
    t.push(tt); ia.push(i);
  }
  // ideal (no saturation) reference with the same R: I = V/R·(1 − e^{−tR/L0}) or V·t/L0 when R = 0
  const tIdeal: number[] = [], iIdeal: number[] = [];
  const n = 200;
  for (let k = 0; k <= n; k++) {
    const tk = (tp * k) / n; tIdeal.push(tk);
    iIdeal.push(R > 0 ? (V / R) * (1 - Math.exp((-tk * R) / p.l0)) : (V * tk) / p.l0);
  }
  const tSatIdeal = R > 0 ? (p.isat * R < V ? (-p.l0 / R) * Math.log(1 - (p.isat * R) / V) : Infinity) : (p.l0 * p.isat) / V;
  return {
    t, i: ia, tIdeal, iIdeal, ipk: i, tSat, tSatIdeal, tOff: tt, ein, estored: storedEnergy(L, i), lambda: fluxLinkage(L, i), eloss,
    slope0: V / p.l0, slopeEnd: didt(i), lEnd: L(i), limited,
  };
}

/** Stored magnetic energy W = ∫0^I i·L(i) di  ( = ∫ i dλ ). */
export function storedEnergy(L: (i: number) => number, I: number, n = 400) {
  if (I === 0) return 0;
  const h = I / n; let s = 0 + I * L(I);
  for (let j = 1; j < n; j++) s += (j % 2 ? 4 : 2) * (j * h) * L(j * h);
  return (s * h) / 3;
}
