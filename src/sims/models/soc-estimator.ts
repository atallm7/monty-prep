// State-of-charge estimation on a simulated drive cycle.
//
// "True" cell: 1-RC Thevenin model (see lipo-lab.ts):  Vt = OCV(SoC) − I·R0 − V1,  dSoC/dt = −I/(3600·Q)
// Sensors:  I_meas = I·(1 + ε_gain) + I_offset,     V_meas = Vt + V_bias
// Estimators:
//  1. Coulomb counting:  SoĈ[k+1] = SoĈ[k] − I_meas·Δt/(3600·Q).  Error grows without bound:
//       e(t) = −(I_offset·t + ε_gain·∫I dt)/(3600·Q)          (pure integration of the sensor error)
//  2. OCV lookup:  SoĈ = OCV⁻¹(V_meas).  Correct only at rest (I = 0, V1 relaxed). Under load the I·R drop
//       maps through the flat OCV curve into a huge SoC error: δSoC ≈ −(I·R0 + V1)/(dOCV/dSoC).
//  3. Blended (scalar Kalman-style): coulomb count between rests, tracking its own 1-σ uncertainty
//       u_cc (grows with assumed offset·t and gain·|Ah|). After the cell has rested for t_rest, take an
//       OCV reading with uncertainty u_ocv = σ_V/(dOCV/dSoC) and fuse:
//       K = u_cc²/(u_cc² + u_ocv²),  SoĈ ← SoĈ + K·(SoC_ocv − SoĈ),  u_cc² ← (1 − K)·u_cc²
//     so it trusts OCV strongly on steep parts of the curve and weakly on the flat plateau.
// @ts-ignore TS5097: node needs the .ts extension; tsconfig lacks allowImportingTsExtensions (types still resolve)
import { ocv, socFromOcv, ocvSlope } from './lipo-lab.ts';

export type SocIn = {
  offset: number;     // A, current-sensor offset
  gainErr: number;    // fraction, current-sensor gain error
  capacity?: number;  // Ah (default 2)
  vErr?: number;      // V, voltage-sensor bias (default 0.005)
  initErr?: number;   // initial SoC error of the counting estimators, on top of the OCV power-up reading (fraction)
  tRest?: number;     // s, rest time before an OCV correction is trusted (default 300)
  soc0?: number;      // true initial SoC (default 0.9)
  r0?: number; r1?: number; tau1?: number;
};

/** Drive-cycle current in C (discharge positive) at time t (s): 4 × (20 min urban driving + 15 min parked). */
export const BLOCK_DRIVE = 1200, BLOCK_PARK = 900, N_BLOCKS = 4;
export const T_TOTAL = N_BLOCKS * (BLOCK_DRIVE + BLOCK_PARK);
export function driveCycleC(t: number): number {
  const tb = t % (BLOCK_DRIVE + BLOCK_PARK);
  if (t >= T_TOTAL || tb >= BLOCK_DRIVE) return 0;               // parked
  const tm = tb % 120;                                            // 120-s micro-cycle
  if (tm < 15) return 2.0;                                        // accelerate
  if (tm < 65) return 0.5;                                        // cruise
  if (tm < 75) return -0.8;                                       // regenerative braking (charging)
  if (tm < 100) return 0.3;                                       // slow cruise
  return 0;                                                       // traffic light
}

export const ASSUMED_OFFSET = 0.02;   // A, estimator's design assumption (datasheet worst case)
export const ASSUMED_GAIN = 0.02;     // fraction
export const ASSUMED_SIGMA_V = 0.005; // V
export const REST_THRESH_C = 0.02;    // |I_meas| below C/50 counts as rest

export type SocResult = {
  t: number[]; i: number[]; v: number[]; trueSoc: number[]; cc: number[]; ocvEst: number[]; blend: number[]; ucc: number[];
  corrections: { t: number; k: number; socOcv: number; before: number; after: number }[];
  rests: { from: number; to: number }[];
  final: { true: number; cc: number; ocv: number; blend: number };
  maxErr: { cc: number; ocv: number; blend: number }; rmsErr: { cc: number; ocv: number; blend: number };
  ahNet: number; predictedCcErr: number; capacity: number;
};

export function simulateSoc(p: SocIn, dt = 1, decim = 10): SocResult {
  const Q = Math.max(0.05, p.capacity ?? 2), vErr = p.vErr ?? 0.005, tRest = p.tRest ?? 300;
  const R0 = p.r0 ?? 0.06, R1 = p.r1 ?? 0.04, tau = p.tau1 ?? 40, a = Math.exp(-dt / tau);
  let soc = p.soc0 ?? 0.9, v1 = 0;
  const V0 = ocv(soc) + vErr;                                  // power-up voltage reading at rest
  const start = Math.min(1, Math.max(0, socFromOcv(V0) + (p.initErr ?? 0)));
  let cc = start, bl = start;
  // initial uncertainty of the blended estimate = that of the OCV power-up reading (+ any known init error)
  let ucc = Math.hypot(ASSUMED_SIGMA_V / Math.max(0.05, ocvSlope(start)), p.initErr ?? 0);
  let restT = 0, lastCorrAt = -1, ahNet = 0;
  const out: SocResult = { t: [], i: [], v: [], trueSoc: [], cc: [], ocvEst: [], blend: [], ucc: [], corrections: [], rests: [], final: { true: 0, cc: 0, ocv: 0, blend: 0 }, maxErr: { cc: 0, ocv: 0, blend: 0 }, rmsErr: { cc: 0, ocv: 0, blend: 0 }, ahNet: 0, predictedCcErr: 0, capacity: Q };
  let se = { cc: 0, ocv: 0, blend: 0 }, n = 0, restStart = -1;
  const N = Math.round(T_TOTAL / dt);
  for (let k = 0; k <= N; k++) {
    const t = k * dt;
    const I = driveCycleC(t) * Q;                                 // true current (A), constant over [t, t+dt)
    const Im = I * (1 + p.gainErr) + p.offset;                    // what the BMS measures
    const vt = ocv(soc) - I * R0 - v1;                            // true terminal voltage at the start of the step
    const vm = vt + vErr;
    const socO = socFromOcv(vm);                                  // naive OCV lookup on the measured voltage
    // rest detection (on measured current, like a real BMS)
    if (Math.abs(Im) < REST_THRESH_C * Q) { if (restT === 0) restStart = t; restT += dt; } else { if (restT >= tRest) out.rests.push({ from: restStart, to: t }); restT = 0; lastCorrAt = -1; }
    // OCV correction once per tRest of continuous rest
    if (restT >= tRest && (lastCorrAt < 0 || t - lastCorrAt >= tRest)) {
      const uO = ASSUMED_SIGMA_V / Math.max(0.02, ocvSlope(socO));
      const K = ucc * ucc / (ucc * ucc + uO * uO);
      const before = bl; bl = bl + K * (socO - bl); ucc = Math.sqrt((1 - K)) * ucc;
      out.corrections.push({ t, k: K, socOcv: socO, before, after: bl }); lastCorrAt = t;
    }
    if (k % decim === 0 || k === N) {
      out.t.push(t); out.i.push(I); out.v.push(vt); out.trueSoc.push(soc); out.cc.push(cc); out.ocvEst.push(socO); out.blend.push(bl); out.ucc.push(ucc);
    }
    const e = { cc: cc - soc, ocv: socO - soc, blend: bl - soc };
    for (const key of ['cc', 'ocv', 'blend'] as const) { se[key] += e[key] ** 2; out.maxErr[key] = Math.max(out.maxErr[key], Math.abs(e[key])); }
    n++;
    if (k === N) { out.final = { true: soc, cc, ocv: socO, blend: bl }; break; }
    // advance true cell (exact ZOH for the RC branch) and the counting estimators
    v1 = v1 * a + I * R1 * (1 - a);
    soc -= I * dt / 3600 / Q; ahNet += I * dt / 3600;
    cc -= Im * dt / 3600 / Q; bl -= Im * dt / 3600 / Q;
    ucc += (ASSUMED_OFFSET + ASSUMED_GAIN * Math.abs(Im)) * dt / 3600 / Q;
  }
  if (restT >= tRest) out.rests.push({ from: restStart, to: T_TOTAL });
  out.rmsErr = { cc: Math.sqrt(se.cc / n), ocv: Math.sqrt(se.ocv / n), blend: Math.sqrt(se.blend / n) };
  out.ahNet = ahNet;
  // Closed-form coulomb-counting drift (relative to its starting error)
  out.predictedCcErr = -(p.offset * T_TOTAL / 3600 + p.gainErr * ahNet) / Q;
  return out;
}
