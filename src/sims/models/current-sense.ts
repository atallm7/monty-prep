// Current-sensing chain: shunt Rsense → current-sense amplifier (gain G) → N-bit ADC with reference Vref.
//
//   Vsense = I·Rs                       (Ohm's law)
//   P_Rs   = I²·Rs                      (Joule heating in the shunt)
//   Vamp   = G·(Vsense + Vos)           (offset Vos referred to input), limited to [Vomin, Vomax] by the output swing
//   LSB    = Vref / 2^N,   I_LSB = LSB / (G·Rs)   (current resolution)
//   code   = clamp(floor(Vamp / LSB), 0, 2^N − 1)
//   Full-scale current  I_FS = min(Vref, Vomax) / (G·Rs)  → clipping above it
//   Dead zone at low current: Vamp < Vomin  →  I < Vomin/(G·Rs) − Vos/Rs reads as zero (single-supply amp can't reach 0 V)
//   Error referred to current: quantization ±½·I_LSB, offset Vos/Rs, gain error ε·I.
// Common mode: low side → Vcm ≈ I·Rs ≈ 0 V (any amp), but load ground is lifted by I·Rs and a load short to ground
// is invisible. High side → Vcm ≈ Vbus; the amplifier's input common-mode range must include Vbus.

export type Side = 'low' | 'high';
export type AmpKind = 'ina180' | 'ina240' | 'opamp';
export const AMPS: Record<AmpKind, { name: string; cmMin: number; cmMax: (vcc: number) => number; vos: number; swingLo: number; swingHi: number }> = {
  ina180: { name: 'INA180-class CSA', cmMin: -0.2, cmMax: () => 26, vos: 150e-6, swingLo: 0.005, swingHi: 0.03 },
  ina240: { name: 'INA240-class CSA', cmMin: -4, cmMax: () => 80, vos: 25e-6, swingLo: 0.005, swingHi: 0.05 },
  opamp: { name: 'Op-amp difference amp', cmMin: 0, cmMax: (vcc: number) => vcc, vos: 1e-3, swingLo: 0.05, swingHi: 0.05 },
};

export type CsIn = {
  imax: number; imin: number; rsense: number; gain: number; bits: number; vref: number; side: Side;
  vbus?: number; vcc?: number; amp?: AmpKind; prating?: number; gainErr?: number; offsetCal?: boolean;
};

export const STD_GAINS = [10, 20, 25, 50, 100, 200, 500];
const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
/** Largest E24 value ≤ v (so a recommended shunt never pushes the amp into clipping). */
export function e24Below(v: number) {
  if (!(v > 0)) return 0;
  const dec = 10 ** Math.floor(Math.log10(v) + 1e-12); let best = E24[0] * dec / 10;
  for (const d of [dec / 10, dec]) for (const e of E24) { const c = e * d; if (c <= v * (1 + 1e-9) && c > best) best = c; }
  return best;
}

export function currentSense(p: CsIn) {
  const amp = AMPS[p.amp ?? 'ina180'];
  const vcc = p.vcc ?? p.vref; const vbus = p.vbus ?? 12; const vos = amp.vos; const vosErr = p.offsetCal ? 0 : vos; const ge = p.gainErr ?? 0.005;
  const Rs = Math.max(p.rsense, 1e-9), G = Math.max(p.gain, 1e-9), N = Math.round(p.bits);
  const lsb = p.vref / 2 ** N;
  const vomin = amp.swingLo, vomax = vcc - amp.swingHi;
  const vtop = Math.min(p.vref, vomax);              // whichever saturates first: ADC full scale or amp output swing
  const vsense = p.imax * Rs;
  const pRs = p.imax * p.imax * Rs;
  const vampIdeal = G * (vsense + vos);
  const clipped = vampIdeal > vtop;
  const ifs = vtop / (G * Rs) - vos / Rs;            // current at which output saturates
  const headroom = (vtop - vampIdeal) / p.vref;       // fraction of Vref left above imax (negative = clipping)
  const ilsb = lsb / (G * Rs);
  // below this the output is stuck at the bottom rail (worst case: offset of either sign, |Vos| working against us)
  const iDead = Math.max(0, vomin / (G * Rs) + vos / Rs);
  const iminLsb = p.imin / ilsb;
  const ioffset = vos / Rs;
  const codeAt = (i: number) => code(i, { Rs, G, vos, vomin, vtop, lsb, N, ge });
  const codesUsed = codeAt(p.imax) - codeAt(p.imin);
  // design helpers: put imax at 90 % of usable full scale
  const target = 0.9 * vtop;
  const gIdeal = target / (p.imax * Rs);
  const gRec = [...STD_GAINS].reverse().find(g => g <= gIdeal) ?? STD_GAINS[0];
  const rsIdeal = target / (p.imax * G);
  const rsRec = e24Below(rsIdeal);
  // common mode
  const vcm = p.side === 'high' ? vbus : p.imax * Rs;
  const cmOk = vcm >= amp.cmMin && vcm <= amp.cmMax(vcc);
  const cmMax = amp.cmMax(vcc);
  // relative error at imin from quantization (½ LSB), offset and gain error
  const errAt = (i: number) => errorAt(i, { Rs, G, vos: vosErr, ilsb, ge, iDead });
  return { amp, vsense, pRs, vamp: Math.min(Math.max(vampIdeal, vomin), vtop), vampIdeal, clipped, ifs, headroom, lsb, ilsb, iDead, iminLsb, ioffset, codesUsed,
    gIdeal, gRec, rsIdeal, rsRec, vcm, cmOk, cmMax, vtop, vomin, vomax, errMin: errAt(p.imin), errMax: errAt(p.imax), codeAt, errAt,
    groundShift: p.side === 'low' ? p.imax * Rs : 0, pRating: p.prating ?? 1, N };
}

type K = { Rs: number; G: number; vos: number; vomin: number; vtop: number; lsb: number; N: number; ge: number };
export function code(i: number, k: K) {
  const v = Math.min(Math.max(k.G * (1 + k.ge) * (i * k.Rs + k.vos), k.vomin), k.vtop);
  return Math.max(0, Math.min(2 ** k.N - 1, Math.floor(v / k.lsb)));
}
/** Worst-case relative error magnitude of the reading at current i (quantization ½ LSB + offset + gain error). */
export function errorAt(i: number, k: { Rs: number; G: number; vos: number; ilsb: number; ge: number; iDead: number }) {
  if (i <= 0) return Infinity;
  if (i < k.iDead) return 1; // reads 0 → 100 % error
  return (0.5 * k.ilsb + Math.abs(k.vos) / k.Rs) / i + k.ge;
}
