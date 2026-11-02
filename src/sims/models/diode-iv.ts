// Diode I–V model: Shockley equation + series resistance + reverse breakdown + temperature.
//
// Junction current (SPICE-style diode, junction voltage Vj):
//   I(Vj) = Is(T)·(exp(Vj/(n·Vt)) − 1) − Ibv·exp(−(Vj + BV)/(nbv·Vt))      [Shockley + breakdown term]
//   Vt = k·T/q                                                              [thermal voltage, 25.85 mV at 300 K]
//   Is(T) = Is0·(T/T0)^(XTI/n)·exp((Eg/(n·Vt))·(T/T0 − 1))                  [SPICE Is temperature law]
// External terminal voltage: Vd = Vj + I·Rs.
// Load-line circuit: Vs = I·R + Vd  →  solve g(Vj) = Vj + I(Vj)·(R+Rs) − Vs = 0.
//   g is strictly increasing in Vj, and the root is bracketed by [min(0,Vs), max(0,Vs)],
//   so a safeguarded Newton–bisection hybrid always converges.

export const K_B = 1.380649e-23;
export const Q_E = 1.602176634e-19;
export const T0 = 300.15; // reference temperature (27 °C, SPICE TNOM)

export type DeviceId = 'si' | 'schottky' | 'ge' | 'led-red' | 'led-blue' | 'zener';
export type Device = {
  id: DeviceId; name: string;
  is: number;   // saturation current at T0 [A]
  n: number;    // ideality factor
  rs: number;   // series resistance [Ω]
  bv: number;   // reverse breakdown voltage magnitude [V]
  ibv: number;  // current at V = −BV [A]
  nbv: number;  // breakdown "ideality" (sharpness)
  eg: number;   // bandgap / barrier for Is(T) [eV]
  xti: number;  // Is temperature exponent
  note: string;
};

// Parameters are representative fits (1N4148, BAT54, 1N34A, typical 5 mm LEDs, BZX 5V1).
export const DEVICES: Record<DeviceId, Device> = {
  si: { id: 'si', name: 'Silicon (1N4148-like)', is: 2.52e-9, n: 1.752, rs: 0.568, bv: 100, ibv: 100e-6, nbv: 1, eg: 1.11, xti: 3, note: 'Vf ≈ 0.6–0.7 V at mA currents, BV ≈ 100 V' },
  schottky: { id: 'schottky', name: 'Schottky (BAT54-like)', is: 2e-7, n: 1.05, rs: 1.2, bv: 30, ibv: 10e-6, nbv: 1.5, eg: 0.69, xti: 2, note: 'Metal–semiconductor barrier: low Vf (~0.25 V) but much higher leakage' },
  ge: { id: 'ge', name: 'Germanium (1N34A-like)', is: 2e-7, n: 1.1, rs: 5, bv: 60, ibv: 100e-6, nbv: 2, eg: 0.67, xti: 3, note: 'Narrow bandgap: Vf ≈ 0.25–0.3 V, high leakage, very temperature sensitive' },
  'led-red': { id: 'led-red', name: 'Red LED (AlGaInP)', is: 2.2e-18, n: 2.0, rs: 2.0, bv: 5, ibv: 10e-6, nbv: 1.5, eg: 1.9, xti: 3, note: 'Vf ≈ 1.9–2.0 V at 20 mA; photon energy ≈ Eg ≈ 1.9 eV (λ ≈ 650 nm)' },
  'led-blue': { id: 'led-blue', name: 'Blue LED (InGaN)', is: 1.3e-19, n: 3.0, rs: 6.0, bv: 5, ibv: 10e-6, nbv: 1.5, eg: 2.7, xti: 3, note: 'Vf ≈ 3.0–3.2 V at 20 mA; Eg ≈ 2.7 eV (λ ≈ 460 nm)' },
  zener: { id: 'zener', name: 'Zener 5.1 V (BZX-like)', is: 1e-12, n: 1.5, rs: 0.5, bv: 5.1, ibv: 5e-3, nbv: 1.2, eg: 1.11, xti: 3, note: 'Heavily doped junction designed to break down at a precise reverse voltage' },
};

export const thermalVoltage = (T: number) => (K_B * T) / Q_E;

export function isAtT(d: Device, T: number) {
  const vt = thermalVoltage(T);
  return d.is * Math.pow(T / T0, d.xti / d.n) * Math.exp((d.eg / (d.n * vt)) * (T / T0 - 1));
}

const EXP_MAX = 700;
const sexp = (x: number) => Math.exp(Math.min(EXP_MAX, x));

/** Junction current and its derivative at junction voltage vj. */
export function junction(d: Device, vj: number, T: number) {
  const vt = thermalVoltage(T); const is = isAtT(d, T);
  const ef = sexp(vj / (d.n * vt));
  const eb = sexp(-(vj + d.bv) / (d.nbv * vt));
  const iFwd = is * (ef - 1);
  const iBd = -d.ibv * eb;
  return { i: iFwd + iBd, di: (is * ef) / (d.n * vt) + (d.ibv * eb) / (d.nbv * vt), iFwd, iBd };
}

/** Solve Vs = Vj + I(Vj)·Rt for the junction voltage (Rt = R + Rs). */
export function solveSeries(d: Device, vs: number, rt: number, T: number) {
  let lo = Math.min(0, vs), hi = Math.max(0, vs);
  const g = (vj: number) => vj + junction(d, vj, T).i * rt - vs;
  // rtsafe (Numerical Recipes §9.4): Newton step when it stays inside the bracket and converges fast
  // enough, otherwise bisection. Plain Newton crawls n·Vt per step on the steep side of an exponential.
  let vj = vs >= 0 ? Math.min(hi, 0.5) : Math.max(lo, -0.5 * Math.min(Math.abs(vs), d.bv));
  let dxOld = hi - lo, dx = dxOld;
  let iter = 0;
  for (; iter < 300; iter++) {
    const j = junction(d, vj, T);
    const gv = vj + j.i * rt - vs, dg = 1 + j.di * rt;
    if (gv === 0) break;
    if (gv > 0) hi = vj; else lo = vj;
    const newtonOut = ((vj - hi) * dg - gv) * ((vj - lo) * dg - gv) > 0;
    if (!isFinite(gv) || !isFinite(dg) || newtonOut || Math.abs(2 * gv) > Math.abs(dxOld * dg)) {
      dxOld = dx; dx = 0.5 * (hi - lo); vj = lo + dx;
    } else {
      dxOld = dx; dx = gv / dg; vj -= dx;
    }
    if (Math.abs(dx) < 1e-13 * Math.max(1, Math.abs(vj)) || hi - lo < 1e-14) { iter++; break; }
  }
  const j = junction(d, vj, T);
  return { vj, i: j.i, iFwd: j.iFwd, iBd: j.iBd, iter, residual: g(vj) };
}

export type Region = 'forward' | 'reverse' | 'breakdown';

export type OpIn = { device: DeviceId; vs: number; r: number; tC: number };
/** Operating point of source Vs + resistor R + diode. */
export function operatingPoint({ device, vs, r, tC }: OpIn) {
  const d = DEVICES[device]; const T = tC + 273.15;
  const rr = Math.max(0, r);
  const s = solveSeries(d, vs, rr + d.rs, T);
  const vd = s.vj + s.i * d.rs;
  const vt = thermalVoltage(T);
  const region: Region = vd >= 0 ? 'forward' : (Math.abs(s.iBd) > 1e-6 && Math.abs(s.iBd) > Math.abs(s.iFwd) ? 'breakdown' : 'reverse');
  const jj = junction(d, s.vj, T);
  const rd = 1 / Math.max(jj.di, 1e-30) + d.rs; // small-signal resistance
  return { ...s, vd, vr: s.i * rr, pd: vd * s.i, pr: s.i * s.i * rr, rd, region, T, vt, isT: isAtT(d, T), d };
}

/** Diode terminal current at an applied terminal voltage V (includes Rs). */
export function currentAt(device: DeviceId, v: number, tC: number) {
  const d = DEVICES[device];
  return solveSeries(d, v, d.rs, tC + 273.15).i;
}

/** Terminal voltage needed for forward current I (inverse Shockley + I·Rs). */
export function forwardVoltage(device: DeviceId, i: number, tC: number) {
  const d = DEVICES[device]; const T = tC + 273.15;
  return d.n * thermalVoltage(T) * Math.log(i / isAtT(d, T) + 1) + i * d.rs;
}

/** I–V curve sampled on a uniform terminal-voltage grid. */
export function ivCurve(device: DeviceId, v0: number, v1: number, nPts: number, tC: number) {
  const x: number[] = [], y: number[] = [];
  for (let k = 0; k < nPts; k++) { const v = v0 + (v1 - v0) * k / (nPts - 1); x.push(v); y.push(currentAt(device, v, tC)); }
  return { x, y };
}
