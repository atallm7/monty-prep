// Single-cell Li-ion / LiPo model (NMC or LCO cathode, graphite anode).
//
// Equivalent circuit: first-order Thevenin model (Plett, "Battery Management Systems Vol. 1", ch. 2):
//   Vt = OCV(SoC) − I·R0 − V1,      dV1/dt = I/C1 − V1/(R1·C1),      dSoC/dt = −I/Q
// with I > 0 for discharge. The RC branch is discretised exactly (zero-order hold on I):
//   V1[k+1] = V1[k]·a + I·R1·(1 − a),   a = exp(−Δt/τ1)
// which is unconditionally stable for any Δt.
//
// Temperature: ohmic/charge-transfer resistance follows an Arrhenius law
//   R(T) = R(25 °C)·exp(Ea/R_gas·(1/T − 1/T_ref)),   Ea/R_gas ≈ 3000 K (≈ 25 kJ/mol)
// so R roughly ×2.5 at 0 °C and ×6 at −20 °C, and the accessible capacity drops a little in the cold
// (diffusion-limited). Isothermal: self-heating is reported but not fed back.
//
// Charging: CC/CV (constant current to Vmax, then constant voltage until I < I_term), the standard
// Li-ion algorithm (e.g. TI bq2407x / MCP73831 datasheets).

export type Pt = [number, number];

/** Rested OCV vs SoC for a typical NMC/graphite cell at 25 °C (V). */
export const OCV_TABLE: Pt[] = [
  [0.00, 3.00], [0.05, 3.40], [0.10, 3.50], [0.15, 3.56], [0.20, 3.61], [0.30, 3.67], [0.40, 3.72],
  [0.50, 3.77], [0.60, 3.84], [0.70, 3.92], [0.80, 4.00], [0.90, 4.09], [0.95, 4.14], [1.00, 4.20],
];

// Monotone cubic (Fritsch–Carlson PCHIP) so OCV is smooth and strictly increasing => invertible.
const XS = OCV_TABLE.map(p => p[0]), YS = OCV_TABLE.map(p => p[1]);
const SLOPES: number[] = (() => {
  const n = XS.length, d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((YS[i + 1] - YS[i]) / (XS[i + 1] - XS[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) { m[i] = 0; continue; }
    const h0 = XS[i] - XS[i - 1], h1 = XS[i + 1] - XS[i];
    const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return m;
})();

export function ocv(soc: number): number {
  const n = XS.length;
  if (soc <= 0) return YS[0] + SLOPES[0] * soc;          // linear extrapolation (never NaN)
  if (soc >= 1) return YS[n - 1] + SLOPES[n - 1] * (soc - 1);
  let i = 0; while (i < n - 2 && soc > XS[i + 1]) i++;
  const h = XS[i + 1] - XS[i], t = (soc - XS[i]) / h;
  const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
  return h00 * YS[i] + h10 * h * SLOPES[i] + h01 * YS[i + 1] + h11 * h * SLOPES[i + 1];
}
/** dOCV/dSoC (V per unit SoC), central difference. */
export function ocvSlope(soc: number): number { const h = 1e-4; return (ocv(soc + h) - ocv(soc - h)) / (2 * h); }
/** Inverse OCV lookup: the SoC whose rested voltage is v (bisection, clamped to [0,1]). */
export function socFromOcv(v: number): number {
  if (v <= YS[0]) return 0; if (v >= YS[YS.length - 1]) return 1;
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (ocv(mid) < v) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export const T_REF = 298.15, EA_R = 3000;
/** Arrhenius resistance multiplier vs 25 °C. */
export function arrhenius(tempC: number) { return Math.exp(EA_R * (1 / (tempC + 273.15) - 1 / T_REF)); }
/** Accessible capacity fraction vs temperature (empirical, diffusion-limited in the cold). */
export function capFactor(tempC: number) { return tempC < 25 ? Math.max(0.6, 1 - 0.004 * (25 - tempC)) : Math.min(1.02, 1 + 0.001 * (tempC - 25)); }

export type CellParams = { capacity: number; rint: number; temp: number };
export const TAU1 = 40;           // s, polarisation (charge-transfer + diffusion) time constant
export const R1_FRAC = 0.6;       // R1 = 0.6·R0
/** Ohmic resistance at a given SoC and temperature: rises at low SoC (anode/cathode kinetics). */
export function r0(p: CellParams, soc: number) { return p.rint * arrhenius(p.temp) * (1 + 0.6 * Math.exp(-Math.max(0, soc) / 0.1)); }
export function r1(p: CellParams, soc: number) { return R1_FRAC * r0(p, soc); }

export type DischargeResult = {
  t: number[]; ah: number[]; v: number[]; soc: number[]; ocvTrace: number[];
  ahOut: number; whOut: number; heatJ: number; chemJ: number; c1EndJ: number; tEnd: number; vAvg: number;
  v0: number; drop0: number; qEff: number; hitCutoff: boolean; i: number;
};

/** Constant-current discharge from a rested full cell until Vt ≤ vcut. */
export function discharge(p: CellParams, crate: number, vcut = 3.0, n = 1500): DischargeResult {
  const qEff = p.capacity * capFactor(p.temp);         // Ah actually accessible at this temperature
  const I = Math.max(1e-6, crate * p.capacity);        // C-rate is defined against nominal capacity
  const dt = (3600 * qEff / I) / n;
  const a = Math.exp(-dt / TAU1);
  let soc = 1, v1 = 0, t = 0, ah = 0, wh = 0, heat = 0, chem = 0;
  const R0 = r0(p, 1);
  const v0 = ocv(1) - I * R0;                           // instantaneous IR step at t = 0+
  const out = { t: [0], ah: [0], v: [ocv(1)], soc: [1], ocvTrace: [ocv(1)] };
  let hit = false;
  for (let k = 0; k < n * 3; k++) {
    const R0k = r0(p, soc), R1k = r1(p, soc);
    const vt = ocv(soc) - I * R0k - v1;
    if (k > 0 && vt <= vcut) { hit = true; break; }
    const v1n = v1 * a + I * R1k * (1 - a);
    const socN = soc - I * dt / 3600 / qEff;
    const ocvMid = ocv((soc + socN) / 2), v1m = (v1 + v1n) / 2;
    const vtMid = ocvMid - I * R0k - v1m;
    // Energy bookkeeping (midpoint rule): chemical = terminal + I²R0 + I·V1
    chem += ocvMid * I * dt; wh += vtMid * I * dt; heat += (I * I * R0k + v1m * v1m / R1k) * dt;
    soc = socN; v1 = v1n; t += dt; ah += I * dt / 3600;
    const vtn = ocv(soc) - I * r0(p, soc) - v1;
    out.t.push(t); out.ah.push(ah); out.v.push(Math.max(vtn, vcut - 0.3)); out.soc.push(soc); out.ocvTrace.push(ocv(soc));
    if (vtn <= vcut) { hit = true; break; }
    if (soc <= -0.02) break;
  }
  const c1End = 0.5 * (TAU1 / r1(p, soc)) * v1 * v1;   // energy still parked in C1 (returns as heat on rest)
  return { ...out, ahOut: ah, whOut: wh / 3600, heatJ: heat, chemJ: chem, c1EndJ: c1End, tEnd: t, vAvg: ah > 0 ? wh / 3600 / ah : 0, v0, drop0: ocv(1) - v0, qEff, hitCutoff: hit, i: I };
}

export type ChargeResult = {
  t: number[]; i: number[]; v: number[]; soc: number[];
  tCC: number; tTotal: number; socAtCV: number; ahIn: number; whIn: number; chemJ: number; heatJ: number; finalSoc: number; iEnd: number; terminated: boolean;
};

/** CC/CV charge from a rested empty cell. crate sets I_CC; iterm = termination current as a fraction of C. */
export function charge(p: CellParams, crate: number, vmax = 4.2, iterm = 0.05, soc0 = 0): ChargeResult {
  const qEff = p.capacity * capFactor(p.temp);
  const Icc = Math.max(1e-6, crate * p.capacity);
  const Iterm = Math.max(1e-6, iterm * p.capacity);
  const dt = Math.min(20, Math.max(0.25, (3600 * qEff / Icc) / 1500));
  const a = Math.exp(-dt / TAU1);
  let soc = soc0, v1 = 0, t = 0, ahIn = 0, whIn = 0, chem = 0, heat = 0, tCC = NaN, socAtCV = NaN, cv = false, term = false;
  const out = { t: [0] as number[], i: [0] as number[], v: [ocv(soc0)] as number[], soc: [soc0] as number[] };
  let iLast = Icc;
  const tMax = 12 * 3600;
  while (t < tMax) {
    const R0 = r0(p, soc), R1 = r1(p, soc);
    // Discharge-positive convention: charging current is I = −Ichg.
    let I = -Icc;
    const vtCC = ocv(soc - I * dt / 3600 / qEff) - I * R0 - (v1 * a + I * R1 * (1 - a));
    if (cv || vtCC >= vmax) {
      if (!cv) { cv = true; tCC = t; socAtCV = soc; }
      // CV: choose I so that the end-of-step terminal voltage equals vmax
      // (fixed-point on the end-of-step OCV so the recorded Vt sits exactly on vmax)
      for (let it = 0; it < 4; it++) {
        const socN = soc - I * dt / 3600 / qEff;
        I = (ocv(socN) - v1 * a - vmax) / (R0 + R1 * (1 - a));
        I = Math.max(-Icc, Math.min(0, I));
      }
    }
    const ichg = -I;
    if (cv && ichg < Iterm) { term = true; break; }
    const v1n = v1 * a + I * R1 * (1 - a);
    const socN = Math.min(1.05, soc - I * dt / 3600 / qEff);
    const ocvMid = ocv((soc + socN) / 2), v1m = (v1 + v1n) / 2;
    const vt = ocvMid - I * R0 - v1m;
    whIn += vt * ichg * dt; chem += ocvMid * ichg * dt; heat += (I * I * R0 + v1m * v1m / R1) * dt;
    ahIn += ichg * dt / 3600; soc = socN; v1 = v1n; t += dt; iLast = ichg;
    out.t.push(t); out.i.push(ichg); out.v.push(ocv(soc) - I * R0 - v1); out.soc.push(soc);
  }
  return { ...out, tCC: isNaN(tCC) ? t : tCC, tTotal: t, socAtCV: isNaN(socAtCV) ? soc : socAtCV, ahIn, whIn: whIn / 3600, chemJ: chem, heatJ: heat, finalSoc: soc, iEnd: iLast, terminated: term };
}
