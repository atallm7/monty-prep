// Maximum power transfer.
// Source Vs (DC, or RMS phasor in AC mode) with internal impedance Zs = Rs + jXs drives ZL = RL + jXL.
//   I = Vs / (Zs + ZL),  |I|² = Vs² / ((Rs+RL)² + (Xs+XL)²)
//   P_L = |I|²·RL,  P_s(total) = |I|²·(Rs+RL),  η = P_L/P_total = RL/(Rs+RL)
// Real case: dP/dRL = 0 → RL = Rs, P_max = Vs²/(4Rs), η = 50 %.
// Complex case: conjugate match ZL = Zs* (RL = Rs, XL = −Xs) gives the same P_max = Vs²/(4Rs).
// If only RL is adjustable (XL fixed): RL_opt = |Rs + j(Xs+XL)| = √(Rs² + (Xs+XL)²) (magnitude match).
// If only XL is adjustable: XL_opt = −Xs for any RL.

export type MptIn = { vs: number; rs: number; rl: number; xs: number; xl: number };

export function solve({ vs, rs, rl, xs, xl }: MptIn) {
  const rt = rs + rl, xt = xs + xl;
  const z2 = rt * rt + xt * xt;
  const i = z2 > 0 ? vs / Math.sqrt(z2) : Infinity;
  const pl = z2 > 0 ? (vs * vs * rl) / z2 : 0;
  const ps = z2 > 0 ? (vs * vs * rs) / z2 : 0;     // dissipated in the source resistance
  const eff = rt > 0 ? rl / rt : 0;
  const pmax = rs > 0 ? (vs * vs) / (4 * rs) : Infinity;
  const vl = i * Math.hypot(rl, xl);                // |V_L|
  const phase = Math.atan2(-xt, rt) * 180 / Math.PI; // phase of I relative to Vs (deg)
  return { i, pl, ps, ptot: pl + ps, eff, pmax, vl, ratio: isFinite(pmax) ? pl / pmax : 0, phase };
}

/** Load resistance that maximises P_L when XL is fixed. */
export const rlOpt = (rs: number, xs: number, xl: number) => Math.hypot(rs, xs + xl);
/** Maximum power achievable with XL fixed (RL optimised): Vs²/(2(Rs + RL_opt)). */
export function pAtRlOpt(vs: number, rs: number, xs: number, xl: number) {
  const r = rlOpt(rs, xs, xl); return solve({ vs, rs, rl: r, xs, xl }).pl;
}
/** Mismatch loss in dB relative to the available power. */
export const mismatchDb = (pl: number, pmax: number) => (pl > 0 && isFinite(pmax) ? 10 * Math.log10(pl / pmax) : -Infinity);
