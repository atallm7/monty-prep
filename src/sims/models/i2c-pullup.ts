// I²C pull-up sizing (NXP UM10204 §7.1).
//   Rp(min) = (VDD − VOL(max)) / IOL            VOL = 0.4 V @ IOL = 3 mA (Sm/Fm), 20 mA (Fm+); VDD ≤ 2 V → VOL = 0.2·VDD
//   Rp(max) = tr / (0.8473 · Cb)                 0.8473 = ln(0.7/0.3): time from 30 % to 70 % of VDD on an RC rise
//   tr(max) = 1000 ns (Sm), 300 ns (Fm), 120 ns (Fm+);  Cb(max) = 400 pF (Sm/Fm), 550 pF (Fm+)
// Rising edge (all drivers released):  v(t) = VDD·(1 − e^(−t/(Rp·Cb)))
// Falling edge: the open-drain driver is modelled as Ron = VOL/IOL (so it meets VOL exactly at IOL),
//   in parallel with Rp:  v(∞) = VDD·Ron/(Ron + Rp),  τ_fall = (Ron‖Rp)·Cb.
// Thresholds: VIL = 0.3·VDD, VIH = 0.7·VDD.

export type I2cMode = 'standard' | 'fast' | 'fastplus';
export const SPEC: Record<I2cMode, { f: number; tr: number; tf: number; cbMax: number; iol: number; thigh: number; tlow: number; label: string }> = {
  standard: { f: 100e3, tr: 1000e-9, tf: 300e-9, cbMax: 400e-12, iol: 3e-3, thigh: 4.0e-6, tlow: 4.7e-6, label: 'Standard-mode (100 kHz)' },
  fast: { f: 400e3, tr: 300e-9, tf: 300e-9, cbMax: 400e-12, iol: 3e-3, thigh: 0.6e-6, tlow: 1.3e-6, label: 'Fast-mode (400 kHz)' },
  fastplus: { f: 1e6, tr: 120e-9, tf: 120e-9, cbMax: 550e-12, iol: 20e-3, thigh: 0.26e-6, tlow: 0.5e-6, label: 'Fast-mode Plus (1 MHz)' },
};
export const LN_73 = Math.log(0.7 / 0.3); // 0.8473

export type PullIn = { vdd: number; cb: number; rp: number; mode: I2cMode };

export function vol(vdd: number) { return vdd > 2 ? 0.4 : 0.2 * vdd; }

export function pullup({ vdd, cb, rp, mode }: PullIn) {
  const sp = SPEC[mode];
  const VOL = vol(vdd);
  const rpMin = (vdd - VOL) / sp.iol;
  const rpMax = sp.tr / (LN_73 * cb);
  const tr = LN_73 * rp * cb;               // 30 %→70 % rise time
  const ron = VOL / sp.iol;
  const vLow = vdd * ron / (ron + rp);       // actual low level with this Rp
  const iLow = (vdd - vLow) / rp;            // current the driver sinks
  const tauF = (ron * rp / (ron + rp)) * cb;
  // 70 % → 30 % fall time with exponential toward vLow
  const tf = vLow < 0.3 * vdd ? tauF * Math.log((0.7 * vdd - vLow) / (0.3 * vdd - vLow)) : Infinity;
  const pStatic = vdd * vdd / rp;            // power while the line is held low (worst case, ≈ VDD·I)
  // highest SCL frequency where the high time after the rise still meets tHIGH and the bus still reaches VIH:
  // SCL high phase = T/2 (50 % duty); it must contain the 0→70 % rise (Rp·Cb·ln(1/0.3)) plus tHIGH.
  const t0to70 = rp * cb * Math.log(1 / 0.3);
  const fMaxRise = 1 / (2 * (t0to70 + sp.thigh));
  const status = rp < rpMin ? 'strong' : rp > rpMax ? 'weak' : 'ok';
  return { sp, VOL, rpMin, rpMax, tr, ron, vLow, iLow, tauF, tf, pStatic, fMaxRise, status: status as 'strong' | 'weak' | 'ok', cbOk: cb <= sp.cbMax, window: rpMin <= rpMax };
}

/** One SCL period (or n periods) of bus voltage at the spec frequency: driver releases at t = 0 for T/2, pulls low for T/2. */
export function busWave(p: PullIn, periods = 2, n = 400, f?: number) {
  const r = pullup(p);
  const fr = f ?? r.sp.f; const T = 1 / fr;
  const tauR = p.rp * p.cb;
  const t: number[] = [], v: number[] = [];
  let vv = r.vLow;
  const dt = periods * T / n;
  for (let i = 0; i <= n; i++) {
    const tt = i * dt; t.push(tt); v.push(vv);
    const phase = (tt % T) / T;
    const target = phase < 0.5 ? p.vdd : r.vLow;
    const tau = phase < 0.5 ? tauR : r.tauF;
    vv = target + (vv - target) * Math.exp(-dt / tau); // exact first-order update
  }
  return { t, v, T };
}
