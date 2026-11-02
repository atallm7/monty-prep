// LDO regulator: PMOS pass device + error amplifier + feedback divider (Vout = Vref·(1 + R1/R2)).
//   Regulation:  Vout = Vset while Vin − Iout·Ron ≥ Vset
//   Dropout:     the pass FET is fully on (triode, ≈ resistor Ron) ⇒ Vout = Vin − Iout·Ron.
//                Ron is chosen so the dropout at the present load equals Vdo (PMOS dropout scales ∝ Iout).
//   Input current  Iin = Iout + Iq;  efficiency η = Vout·Iout / (Vin·Iin) ≈ Vout/Vin
//   Dissipation    Pd = (Vin − Vout)·Iout + Vin·Iq;  junction temperature Tj = Ta + θJA·Pd   (TI SLVA118)
//   PSRR sketch:   vout/vin = Hff(jω)/(1 + T(jω)),
//                  Hff = Zo/(rds + Zo) (pass-device rds against the output impedance Zo = RL ∥ (ESR + 1/jωC)),
//                  T = T0/(1 + jf/fa) the loop gain; T0 collapses in dropout (error amp saturated, FET in triode).
export type LdoIn = { vin: number; vout: number; iout: number; vdo: number; iq: number; theta: number; ta: number };
export const VREF = 0.8;
export const LOOP = { T0: 1000, fa: 1e3, lambda: 0.05, cout: 1e-6, esr: 0.01 };

export const ron = (p: LdoIn) => p.vdo / Math.max(1e-6, p.iout);

export function outputAt(p: LdoIn, vin: number, iout: number) {
  const vmax = vin - iout * ron(p);
  const vo = Math.max(0, Math.min(p.vout, vmax));
  return { vo, dropout: vmax < p.vout };
}

export function operatingPoint(p: LdoIn) {
  const { vo, dropout } = outputAt(p, p.vin, p.iout);
  const iin = p.iout + p.iq;
  const pout = vo * p.iout, pin = p.vin * iin;
  const pd = (p.vin - vo) * p.iout + p.vin * p.iq;
  const tj = p.ta + p.theta * pd;
  const r2 = 100e3, r1 = r2 * (Math.max(VREF, p.vout) / VREF - 1);
  return { vo, dropout, iin, eff: pin > 0 ? pout / pin : 0, effApprox: vo / p.vin, pd, pPass: (p.vin - vo) * p.iout, tj, r1, r2, headroom: p.vin - p.vout, vinMin: p.vout + p.vdo, ron: ron(p) };
}

/** Max load current before Tj reaches tjMax */
export function maxCurrentThermal(p: LdoIn, tjMax = 125) {
  const pdMax = (tjMax - p.ta) / p.theta; const dv = Math.max(1e-6, p.vin - p.vout);
  return Math.max(0, (pdMax - p.vin * p.iq) / dv);
}

type C = { re: number; im: number };
const c = (re: number, im = 0): C => ({ re, im });
const add = (a: C, b: C) => c(a.re + b.re, a.im + b.im);
const mul = (a: C, b: C) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a: C, b: C) => { const d = b.re * b.re + b.im * b.im; return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const abs = (a: C) => Math.hypot(a.re, a.im);

/** PSRR in dB (positive = rejection) at frequency f */
export function psrr(p: LdoIn, f: number) {
  const op = operatingPoint(p);
  const w = 2 * Math.PI * f;
  const rl = op.vo / Math.max(1e-9, p.iout);
  const zc = add(c(LOOP.esr), div(c(1), c(0, w * LOOP.cout)));
  const zo = div(mul(c(rl), zc), add(c(rl), zc));
  // headroom above dropout sets how much loop gain survives (pass FET leaving saturation)
  const margin = p.vin - p.iout * op.ron - p.vout;
  const k = Math.min(1, Math.max(1e-3, margin / 0.15));
  const T0 = LOOP.T0 * k;
  const rds = op.dropout ? op.ron : Math.max(op.ron, 1 / (LOOP.lambda * Math.max(1e-6, p.iout)) * Math.max(k, 0.02));
  const hff = div(zo, add(c(rds), zo));
  const T = div(c(T0), c(1, f / LOOP.fa));
  const h = div(hff, add(c(1), T));
  return -20 * Math.log10(abs(h));
}
