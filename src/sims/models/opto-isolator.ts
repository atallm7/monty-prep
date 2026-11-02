// Opto-isolator (LED + phototransistor) design model, PC817-class.
//
// LED:    If = (Vdrive − Vf(If))/Rled, with Vf(If) = Vf20 + n·Vt·ln(If/20 mA)  (IR LED, n ≈ 2, Vf20 = 1.2 V) → solved by bisection.
// CTR:    Ic,max = CTR·If; CTR(If) = CTR5·g(If)·aging·temp  where CTR5 is the nominal CTR at If = 5 mA, 25 °C, new, and
//         g = exp(−a·ln²(If/5 mA)) (peaks near 5 mA, falls toward very low and very high drive; a = 0.12 low side, 0.05 high side)
//         aging = 1 − loss (LED output decays with time/current), temp = 1 − 0.004·(T − 25) above 25 °C, 1 − 0.002·(25 − T) below.
// Output: pull-up Rpull to Vcc. The phototransistor is a current source up to saturation:
//         Ic,req = (Vcc − Vcesat)/Rpull;  Ic,max ≥ Ic,req → saturated, Vol = Vcesat; otherwise Vol = Vcc − Ic,max·Rpull (linear/active region).
//         Saturation depth = Ic,max/Ic,req (design for ≥ 2 to cover CTR spread).
// Speed:  the phototransistor current follows the LED with a first-order lag τpt (base charge). Saturated operation adds storage delay:
//         t_off_delay = τpt·ln(depth)  (output stays low until Ic,max·e^{-t/τ} falls to Ic,req), then the pull-up RC rise
//         t_rise (10–90 %) = 2.2·Rpull·(Cload + Cce). Turn-on: t_on_delay = −τpt·ln(1 − 1/depth), fall t_fall ≈ 2.2·(Vcc/Ic,max)·C.
//         simulate() integrates Cl·dVo/dt = (Vcc − Vo)/Rpull − Ice(t)·s(Vo) (backward Euler) to show these effects directly.
export type OptoIn = {
  vgpio: number; rled: number; ctr: number; rpull: number; vcc: number;
  aging?: number; temp?: number; cload?: number; vcesat?: number; vf20?: number; tauPt?: number; vil?: number;
};
export const OPTO_DEFAULTS = { aging: 0, temp: 25, cload: 20e-12, vcesat: 0.2, vf20: 1.2, tauPt: 2.5e-6, vil: 0 };
const VT = 0.02585, NF = 2, I_REF = 5e-3;
const cfg = (p: OptoIn) => ({ ...OPTO_DEFAULTS, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as Required<OptoIn>);

export const vfOf = (iF: number, vf20 = 1.2) => (iF <= 0 ? 0 : vf20 + NF * VT * Math.log(iF / 20e-3));
export function ledCurrent(vdrive: number, rled: number, vf20 = 1.2) {
  if (vdrive <= 0) return 0;
  let lo = 0, hi = vdrive / Math.max(rled, 1e-3);                      // If is between 0 and the short-circuit current
  for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); const f = vdrive - vfOf(Math.max(m, 1e-12), vf20) - m * rled; if (f > 0) lo = m; else hi = m; }
  const iF = 0.5 * (lo + hi);
  return vfOf(iF, vf20) < 0.5 ? 0 : iF;                                 // below the LED knee nothing flows
}
export function ctrShape(iF: number) {
  if (iF <= 0) return 0;
  const l = Math.log(iF / I_REF);
  return Math.exp(-(l < 0 ? 0.12 : 0.05) * l * l);
}
export const tempFactor = (T: number) => (T >= 25 ? 1 - 0.004 * (T - 25) : 1 - 0.002 * (25 - T));
export function ctrEff(p: OptoIn, iF: number) { const c = cfg(p); return Math.max(0, p.ctr * ctrShape(iF) * (1 - c.aging) * tempFactor(c.temp)); }

export function design(p: OptoIn) {
  const c = cfg(p);
  const iF = ledCurrent(p.vgpio, p.rled, c.vf20), vf = vfOf(iF, c.vf20);
  const ctr = ctrEff(p, iF), icMax = ctr * iF;
  const icReq = Math.max(0, (p.vcc - c.vcesat) / p.rpull);
  const depth = icReq > 0 ? icMax / icReq : Infinity;
  const saturated = icMax >= icReq && iF > 0;
  const vol = iF <= 0 ? p.vcc : saturated ? c.vcesat : Math.max(c.vcesat, p.vcc - icMax * p.rpull);
  const vilLimit = c.vil > 0 ? c.vil : 0.3 * p.vcc;       // CMOS input low threshold (0.3·Vcc default)
  const ic = iF <= 0 ? 0 : saturated ? icReq : icMax;
  // speed: pull-up RC rise, storage delay, phototransistor lag
  const ctot = c.cload + 5e-12;                         // Cce ≈ 5 pF (typ.)
  const tr = 2.2 * p.rpull * ctot;
  const tOffDelay = saturated && iF > 0 ? c.tauPt * Math.log(Math.max(1, depth)) : 0;
  const tOnDelay = iF > 0 && icMax > icReq ? -c.tauPt * Math.log(1 - 1 / depth) : Infinity;
  const tf = iF > 0 ? 2.2 * (p.vcc / Math.max(icMax, 1e-9)) * ctot : 0;
  const rMinSat = icMax > 0 ? (p.vcc - c.vcesat) / icMax : Infinity;   // smallest pull-up that still reaches saturation (depth = 1)
  const rMinDepth2 = rMinSat * 2;
  const iFmax = 50e-3;
  const pLed = iF * vf, pTr = ic * vol;
  const fMax = isFinite(tOnDelay) ? 1 / (2 * Math.max(tOnDelay + tf, tOffDelay + tr)) : 0;
  return { iF, vf, ctr, icMax, icReq, depth, saturated, vol, vilLimit, volOk: vol <= vilLimit, ic, tr, tf, rMinSat, rMinDepth2, ledOk: iF <= iFmax, pLed, pTr, fMax, ctot, tOffDelay, tOnDelay, c };
}

/** Pull-up resistor sweep: Vol, saturation depth and rise time. */
export function sweepRpull(p: OptoIn, rs: number[]) {
  return rs.map(r => { const d = design({ ...p, rpull: r }); return { r, vol: d.vol, depth: d.depth, tr: d.tr, ic: d.ic }; });
}
/** LED current ↔ CTR curve for the plot. */
export function ctrCurve(p: OptoIn, ifs: number[]) { return ifs.map(i => ctrEff(p, i)); }

/** Time-domain output for a square-wave LED drive (fraction duty, period). First-order phototransistor + RC at the output. */
export function simulate(p: OptoIn, fsig: number, cycles = 2, duty = 0.5, n = 1600) {
  const c = cfg(p), d = design(p), T = 1 / fsig, tEnd = cycles * T, dt = tEnd / n, cl = d.ctot, vk = 0.1, vce = c.vcesat, sub = 8, h = dt / sub;
  let vo = p.vcc, ipt = 0;
  const t: number[] = [], led: number[] = [], out: number[] = [], ic: number[] = [];
  const cg = cl / h, gR = 1 / p.rpull;
  for (let k = 0; k <= n; k++) {
    const tt = k * dt, on = (tt % T) < duty * T;
    t.push(tt); led.push(on ? 1 : 0); out.push(vo); ic.push(ipt);
    for (let s = 0; s < sub; s++) {
      const target = on ? d.icMax : 0;
      ipt = target + (ipt - target) * Math.exp(-h / c.tauPt);
      // Ice = ipt·clamp((vo − vce)/vk, 0, 1): pick the consistent branch of the piecewise-linear implicit equation
      let v = (cg * vo + p.vcc * gR - ipt) / (cg + gR);
      if (v < vce + vk) {
        v = (cg * vo + p.vcc * gR + (ipt * vce) / vk) / (cg + gR + ipt / vk);
        if (v < vce) v = (cg * vo + p.vcc * gR) / (cg + gR);
      }
      vo = Math.min(p.vcc, v);
    }
  }
  return { t, led, out, ic, d };
}
