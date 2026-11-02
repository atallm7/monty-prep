// LDO vs buck efficiency and simple power-conversion calculators.
//
// LDO (series pass element): Iin = Iout + Iq, so η = Vout·Iout / (Vin·(Iout + Iq)) ≤ Vout/Vin.
//   Dissipation P = (Vin − Vout)·Iout + Vin·Iq; junction temperature Tj = Ta + θJA·P.
//   Regulates only while Vin ≥ Vout + Vdropout; below that Vout ≈ Vin − Vdropout (pass device fully on).
// Buck loss model (standard first-order loss budget):
//   P_fixed = Vin·Iq + Qg·Vdrv·f + ½·Coss·Vin²·f          (independent of load)
//   P_cond  = Iout²·R_cond  (R_cond ≈ D·Rds,hi + (1−D)·Rds,lo + DCR)
//   P_sw    = ½·Vin·Iout·(tr + tf)·f                       (V·I overlap)
//   η = Pout / (Pout + P_fixed + P_cond + P_sw); peak η where P_cond = P_fixed (d/dI of loss/I = 0 ⇒ I* = √(P_fixed/R_cond)).
//   Optional PFM / pulse skipping: below the DCM boundary current I_pfm = ΔI/2 the effective switching frequency
//   falls ∝ load, so the frequency-dependent fixed losses scale by Iout/I_pfm.
// Conservation: Pin = Pout + Ploss, η = Pout/Pin, Vin·Iin·η = Vout·Iout.

export type LdoP = { iq: number; vdo: number };
export type BuckP = { fsw: number; rcond: number; tsw: number; qg: number; vdrv: number; coss: number; iq: number; l: number; pfm: boolean };

export const LDO_DEF: LdoP = { iq: 50e-6, vdo: 0.2 };
export const BUCK_DEF: BuckP = { fsw: 1e6, rcond: 0.08, tsw: 5e-9, qg: 3e-9, vdrv: 5, coss: 100e-12, iq: 300e-6, l: 2.2e-6, pfm: false };

export function ldo(vin: number, vout: number, iout: number, p: LdoP = LDO_DEF) {
  const inReg = vin >= vout + p.vdo;
  const vo = inReg ? vout : Math.max(0, vin - p.vdo);
  const pout = vo * iout;
  const pin = vin * (iout + p.iq);
  const pdiss = pin - pout;
  return { vo, pout, pin, pdiss, eff: pin > 0 ? pout / pin : 0, inReg, iin: iout + p.iq };
}

export function buck(vin: number, vout: number, iout: number, p: BuckP = BUCK_DEF) {
  const D = Math.min(1, vout / vin);
  const ipfm = (vin - vout) * D / (p.l * p.fsw) / 2;
  const fScale = p.pfm && iout < ipfm ? Math.max(iout / ipfm, 0) : 1;
  const pfixedF = (p.qg * p.vdrv + 0.5 * p.coss * vin * vin) * p.fsw * fScale;
  const pq = vin * p.iq * (p.pfm ? Math.min(1, 0.1 + fScale) : 1); // controller sleeps between bursts in PFM
  const pcond = iout * iout * p.rcond;
  const psw = 0.5 * vin * iout * (2 * p.tsw) * p.fsw; // ½·Vin·I·(tr+tf)·f with tr = tf = tsw (kept at full f: a first-order bound)
  const pout = vout * iout;
  const ploss = pq + pfixedF + pcond + psw;
  return { pout, ploss, pin: pout + ploss, eff: pout > 0 ? pout / (pout + ploss) : 0, parts: { quiescent: pq, gateCoss: pfixedF, conduction: pcond, switching: psw }, D, ipfm, pfmActive: fScale < 1, iPeak: Math.sqrt((pq + pfixedF) / p.rcond) };
}

/** Load currents where the two efficiency curves cross (sign change of ηLDO − ηbuck), log-scanned. */
export function crossovers(vin: number, vout: number, lp: LdoP, bp: BuckP, lo = 1e-6, hi = 10) {
  const out: number[] = []; const N = 400;
  const g = (i: number) => ldo(vin, vout, i, lp).eff - buck(vin, vout, i, bp).eff;
  let pi = lo, pg = g(lo);
  for (let k = 1; k <= N; k++) {
    const i = lo * (hi / lo) ** (k / N), gi = g(i);
    if (pg * gi < 0) { let a = pi, b = i, ga = pg; for (let it = 0; it < 60; it++) { const m = Math.sqrt(a * b), gm = g(m); if (gm * ga > 0) { a = m; ga = gm; } else b = m; } out.push(Math.sqrt(a * b)); }
    pi = i; pg = gi;
  }
  return out;
}

export type ViioKey = 'vin' | 'iin' | 'vout' | 'iout' | 'eff';
/** Given four of Vin, Iin, Vout, Iout, η solve the fifth from Vin·Iin·η = Vout·Iout. */
export function solveViio(unknown: ViioKey, v: Record<ViioKey, number>) {
  const r = { ...v };
  switch (unknown) {
    case 'vin': r.vin = v.vout * v.iout / (v.iin * v.eff); break;
    case 'iin': r.iin = v.vout * v.iout / (v.vin * v.eff); break;
    case 'vout': r.vout = v.vin * v.iin * v.eff / v.iout; break;
    case 'iout': r.iout = v.vin * v.iin * v.eff / v.vout; break;
    case 'eff': r.eff = v.vout * v.iout / (v.vin * v.iin); break;
  }
  const pin = r.vin * r.iin, pout = r.vout * r.iout;
  return { ...r, pin, pout, ploss: pin - pout, valid: isFinite(r[unknown]) && r[unknown] > 0 && r.eff <= 1 + 1e-12 };
}

export type EffKey = 'pin' | 'pout' | 'eff';
export function solveEff(unknown: EffKey, v: Record<EffKey, number>) {
  const r = { ...v };
  if (unknown === 'pin') r.pin = v.pout / v.eff;
  else if (unknown === 'pout') r.pout = v.pin * v.eff;
  else r.eff = v.pout / v.pin;
  return { ...r, ploss: r.pin - r.pout, valid: isFinite(r[unknown]) && r[unknown] > 0 && r.eff <= 1 + 1e-12 };
}
