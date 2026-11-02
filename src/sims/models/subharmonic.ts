// Peak-current-mode (PCM) control: iterated inductor-current map, subharmonic oscillation and slope compensation.
//
// Buck converter, fixed frequency, switch turned on by the clock at the start of each period T and turned
// off when the sensed inductor current plus the compensation ramp reaches the control current Ic:
//   on-time  : i(t) = i_n + m1·t,          m1 = (Vin − Vout)/L
//   off when : i_n + m1·t_on + ma·t_on = Ic    →  t_on = (Ic − i_n)/(m1 + ma)   (clamped to [0, T])
//   off-time : falls with m2 = Vout/L for T − t_on (diode/low-side FET; clamped at 0 A = DCM)
//   map      : i_{n+1} = i_n + m1·t_on − m2·(T − t_on)
// Linearising about the steady state gives the classic perturbation ratio (Ridley; Erickson & Maksimović §12.1):
//   δi_{n+1}/δi_n = α = −(m2 − ma)/(m1 + ma)
// With ma = 0 and m2/m1 = D/(1−D) this is α = −D/(1−D): unstable (|α| > 1) for D > 0.5.
// Stability needs ma > (m2 − m1)/2; ma = m2 gives α = 0 (dead-beat: the error vanishes in one cycle).
export type SubIn = {
  d: number;        // steady-state duty (sets Vout = D·Vin)
  ma: number;       // compensation slope as a fraction of m2
  vin: number; l: number; fsw: number; iavg: number;
  dI: number;       // perturbation added to the valley current at the start of cycle 0 (A)
  cycles: number;
};

export function slopes(p: Pick<SubIn, 'd' | 'ma' | 'vin' | 'l'>) {
  const d = Math.min(0.98, Math.max(0.02, p.d));
  const vout = d * p.vin;
  const m1 = (p.vin - vout) / p.l, m2 = vout / p.l, ma = Math.max(0, p.ma) * m2;
  const alpha = -(m2 - ma) / (m1 + ma);
  return { d, vout, m1, m2, ma, alpha, maCrit: (m2 - m1) / 2, maCritFrac: Math.max(0, (m2 - m1) / 2 / m2) };
}

/** Perturbation ratio α(D) for a given compensation fraction (of m2). Independent of Vin, L (only slope ratios matter). */
export function alphaOf(d: number, maFrac: number) {
  const m1 = 1 - d, m2 = d, ma = maFrac * m2;
  return -(m2 - ma) / (m1 + ma);
}

export function steadyState(p: SubIn) {
  const s = slopes(p), T = 1 / p.fsw;
  const ripple = s.m1 * s.d * T;                         // peak-to-peak inductor ripple
  const valley = p.iavg - ripple / 2;
  const ic = valley + (s.m1 + s.ma) * s.d * T;           // control current that yields exactly duty D
  return { ...s, T, ripple, valley, peak: valley + ripple, ic };
}

export type Cycle = { i0: number; ton: number; ipk: number; err: number; clamped: boolean };

/** One period of the nonlinear map. */
export function mapStep(i0: number, ic: number, m1: number, m2: number, ma: number, T: number) {
  let ton = (ic - i0) / (m1 + ma);
  let clamped = false;
  if (!(ton > 0)) { ton = 0; clamped = true; }
  if (ton > T) { ton = T; clamped = true; }
  const ipk = i0 + m1 * ton;
  let i1 = ipk - m2 * (T - ton);
  if (i1 < 0) { i1 = 0; clamped = true; }                // diode blocks: discontinuous conduction
  return { ton, ipk, i1, clamped };
}

export function simulate(p: SubIn) {
  const ss = steadyState(p);
  const { m1, m2, ma, T, ic, valley } = ss;
  const cyc: Cycle[] = [];
  const t: number[] = [], i: number[] = [], tRamp: number[] = [], ramp: number[] = [];
  let i0 = valley + p.dI;
  const n = Math.max(1, Math.round(p.cycles));
  for (let k = 0; k < n; k++) {
    const st = mapStep(i0, ic, m1, m2, ma, T);
    cyc.push({ i0, ton: st.ton, ipk: st.ipk, err: i0 - valley, clamped: st.clamped });
    const t0 = k * T;
    // inductor current: exact piecewise-linear waveform (vertices + extra samples for hover)
    t.push(t0); i.push(i0);
    t.push(t0 + st.ton); i.push(st.ipk);
    const offEnd = st.ipk - m2 * (T - st.ton);
    if (offEnd < 0) { const tz = st.ton + st.ipk / m2; t.push(t0 + tz); i.push(0); }
    // control threshold seen by the current signal: Ic − ma·t (sawtooth)
    tRamp.push(t0, t0 + T); ramp.push(ic, ic - ma * T);
    tRamp.push(NaN); ramp.push(NaN);
    i0 = st.i1;
  }
  t.push(n * T); i.push(i0);
  // ideal steady-state waveform for comparison
  const tRef: number[] = [], iRef: number[] = [];
  for (let k = 0; k <= n; k++) { tRef.push(k * T); iRef.push(valley); if (k < n) { tRef.push(k * T + ss.d * T); iRef.push(ss.peak); } }
  const errs = cyc.map(c => c.err);
  errs.push(i0 - valley);
  return { ss, cycles: cyc, t, i, tRamp, ramp, tRef, iRef, errs, final: i0 };
}

/** Cycles for |δi| to fall to `frac` of its initial value (Infinity if |α| ≥ 1). */
export function cyclesToDecay(alpha: number, frac = 0.01) {
  const a = Math.abs(alpha);
  if (a >= 1) return Infinity;
  if (a < 1e-12) return 1;
  return Math.log(frac) / Math.log(a);
}
