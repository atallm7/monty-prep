// Two-transistor current mirror (MOSFET or BJT), reference device diode-connected.
//
// MOSFET (square law with channel-length modulation, Sedra & Smith §5 / Razavi ch. 5):
//   saturation (VDS ≥ VOV): ID = ½·k'·(W/L)·VOV²·(1 + λVDS),  VOV = VGS − Vt
//   triode     (VDS < VOV): ID = k'·(W/L)·(VOV·VDS − VDS²/2)·(1 + λVDS)
//   M1 diode-connected (VDS1 = VGS) sets VGS from Iref; M2 copies it:
//   Iout = (W/L)2/(W/L)1 · Iref · (1 + λVout)/(1 + λVGS)  →  exact only when Vout = VGS.
//   Rout = 1/(λ·Iout) (≈ ro), compliance Vout,min = VOV.
// BJT (Ebers–Moll transport model with Early effect, Gray & Meyer §4.2):
//   IC = Is·A·(e^{VBE/VT} − e^{VBC/VT})·(1 + VCE/VA) − (Is·A/βR)(e^{VBC/VT} − 1)
//   IB = (Is·A/βF)(e^{VBE/VT} − 1) + (Is·A/βR)(e^{VBC/VT} − 1)
//   KCL at the reference collector/base node: Iref = IC1 + IB1 + IB2
//   ⇒ Iout/Iref ≈ m/(1 + (1 + m)/βF) at VCE2 = VBE (m = area ratio), compliance ≈ VCE(sat) ≈ 0.2 V.
export type MirrorType = 'bjt' | 'mos';
export type MirrorIn = {
  type: MirrorType; iref: number; ratio: number;
  lambda: number;   // 1/V (MOS)
  kp: number;       // k'·(W/L)1 in A/V² (MOS)
  vt: number;       // threshold (MOS)
  beta: number;     // βF (BJT)
  va: number;       // Early voltage (BJT)
  is: number;       // saturation current of Q1 (BJT)
};
export const VT = 0.025852; // kT/q at 300 K

// ---------- MOS ----------
export function mosId(beta: number, vt: number, lambda: number, vgs: number, vds: number) {
  const vov = vgs - vt; if (vov <= 0 || vds <= 0) return 0;
  return vds >= vov ? 0.5 * beta * vov * vov * (1 + lambda * vds) : beta * (vov * vds - vds * vds / 2) * (1 + lambda * vds);
}
export function mosVgs(p: MirrorIn): number {
  // solve ½β(V−Vt)²(1 + λV) = Iref for V by bisection (monotone for V > Vt)
  let lo = p.vt, hi = p.vt + 20;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (mosId(p.kp, p.vt, p.lambda, m, m) < p.iref) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------- BJT ----------
function bjt(is: number, beta: number, va: number, vbe: number, vce: number) {
  const vbc = vbe - vce; const ef = Math.exp(vbe / VT), er = Math.exp(Math.min(vbc / VT, 80)); const betaR = 1;
  const ic = is * (ef - er) * (1 + Math.max(vce, 0) / va) - (is / betaR) * (er - 1);
  const ib = (is / beta) * (ef - 1) + (is / betaR) * (er - 1);
  return { ic, ib };
}
export function bjtSolve(p: MirrorIn, vout: number) {
  const m = p.ratio;
  const kcl = (vbe: number) => { const q1 = bjt(p.is, p.beta, p.va, vbe, vbe); const q2 = bjt(p.is * m, p.beta, p.va, vbe, vout); return q1.ic + q1.ib + q2.ib - p.iref; };
  let lo = 0, hi = 1.2;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (kcl(mid) < 0) lo = mid; else hi = mid; }
  const vbe = (lo + hi) / 2; const q2 = bjt(p.is * m, p.beta, p.va, vbe, vout); const q1 = bjt(p.is, p.beta, p.va, vbe, vbe);
  return { vbe, iout: q2.ic, ib2: q2.ib, ic1: q1.ic, ib1: q1.ib };
}

export function operatingPoint(p: MirrorIn, vout: number) {
  if (p.type === 'mos') {
    const vgs = mosVgs(p); const vov = vgs - p.vt;
    const iout = mosId(p.kp * p.ratio, p.vt, p.lambda, vgs, vout);
    const sat = vout >= vov;
    return { vctl: vgs, vov, iout, compliance: vov, saturated: sat, rout: 1 / (p.lambda * Math.max(1e-15, iout)), baseErr: 0 };
  }
  const r = bjtSolve(p, vout);
  const vcesat = 0.2;
  // small-signal output resistance ro = (VA + VCE)/IC
  return { vctl: r.vbe, vov: NaN, iout: r.iout, compliance: vcesat, saturated: vout >= vcesat, rout: (p.va + vout) / Math.max(1e-15, r.iout), baseErr: (r.ib1 + r.ib2) / p.iref };
}

/** Iout vs Vout sweep */
export function sweep(p: MirrorIn, vmax: number, n = 241) {
  const v: number[] = [], i: number[] = [];
  for (let k = 0; k < n; k++) { const x = vmax * k / (n - 1); v.push(x); i.push(operatingPoint(p, x).iout); }
  return { v, i };
}

/** Ideal-approximation formula for the copied current (saturation, used for comparison) */
export function textbookIout(p: MirrorIn, vout: number) {
  if (p.type === 'mos') { const vgs = mosVgs(p); return p.ratio * p.iref * (1 + p.lambda * vout) / (1 + p.lambda * vgs); }
  const vbe = bjtSolve(p, vout).vbe;
  return p.ratio * p.iref / (1 + (1 + p.ratio) / p.beta) * (1 + vout / p.va) / (1 + vbe / p.va);
}
