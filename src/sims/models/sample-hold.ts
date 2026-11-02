// Sample-and-hold model: switch (Ron) + hold capacitor Ch + unity buffer.
//
// Tracking (switch closed):   Ch·dVh/dt = (Vin − Vh)/Ron  → first-order RC, τ = Ron·Ch.
//   For a step of size ΔV the residual error after t is ΔV·e^(−t/τ).
//   Acquisition time to N-bit accuracy (error ≤ ½ LSB of a full-scale step):
//   e^(−t/τ) ≤ 2^−(N+1)  ⇒  t_acq = τ·ln(2^(N+1)) = (N+1)·ln2·τ        (≈ 9.0·τ for 12 bits)
// Tracking bandwidth f_−3dB = 1/(2π·Ron·Ch).
// Hold (switch open): leakage I_leak discharges Ch → droop rate dV/dt = I_leak/Ch.
// Charge injection: when the switch opens, part of its channel charge Q_inj dumps onto Ch
//   → pedestal ΔV = Q_inj/Ch (negative for an NMOS switch, electrons dumped).
// kT/C noise sampled onto the cap: v_n,rms = sqrt(k·T/Ch).

export const K_BOLTZ = 1.380649e-23;

export type ShIn = {
  ron: number; ch: number; tsample: number; ileak: number; bits: number;
  qinj: number;      // C, charge injected at switch-off (positive = pulls Vh down, NMOS-like)
  thold: number;     // s, hold phase length
  vfs: number;       // V, ADC full scale
  temp?: number;     // K
};

export function shMetrics(p: ShIn) {
  const tau = p.ron * p.ch;
  const N = Math.max(1, Math.round(p.bits));
  const lsb = p.vfs / 2 ** N;
  const tacq = tau * (N + 1) * Math.LN2;
  // worst case: full-scale step at the start of the sample window
  const settleErr = tau > 0 ? p.vfs * Math.exp(-p.tsample / tau) : 0;
  const droopRate = p.ch > 0 ? p.ileak / p.ch : Infinity;
  const droop = droopRate * p.thold;
  const pedestal = p.ch > 0 ? p.qinj / p.ch : Infinity;
  const ktc = Math.sqrt(K_BOLTZ * (p.temp ?? 300) * 1 / p.ch);
  const f3db = 1 / (2 * Math.PI * tau);
  // max hold time before droop reaches ½ LSB
  const tholdMax = droopRate > 0 ? (lsb / 2) / droopRate : Infinity;
  // settled bits: number of bits for which settling error ≤ ½ LSB
  const settledBits = tau > 0 ? Math.max(0, p.tsample / (tau * Math.LN2) - 1) : Infinity;
  const fs = 1 / (p.tsample + p.thold);
  return { tau, lsb, tacq, settleErr, droopRate, droop, pedestal, ktc, f3db, tholdMax, settledBits, fs, N };
}

export type ShWave = { t: number[]; vin: number[]; vh: number[]; sampling: boolean[]; cycle: number[]; held: { t: number; v: number; vin: number }[] };

/** Time-domain simulation over `cycles` sample/hold cycles.
 *  Input: 'step' alternates between 5% and 95% FS each cycle (worst-case large steps),
 *  'sine' is a sinusoid at fin with amplitude 0.45·FS around FS/2.
 *  Tracking uses the exact exponential update for a piecewise-constant input over dt
 *  (exact for a first-order system), so it is unconditionally stable. */
export function shSimulate(p: ShIn, input: 'step' | 'sine', fin: number, cycles = 3, ptsPerPhase = 160): ShWave {
  const tau = Math.max(1e-18, p.ron * p.ch);
  const T = p.tsample + p.thold;
  const vinAt = (t: number) => {
    if (input === 'sine') return p.vfs / 2 + 0.45 * p.vfs * Math.sin(2 * Math.PI * fin * t);
    const k = Math.floor(t / T + 1e-12);
    return (k % 2 === 0 ? 0.95 : 0.05) * p.vfs;
  };
  const t: number[] = [], vin: number[] = [], vh: number[] = [], sampling: boolean[] = [], cycle: number[] = [];
  const held: ShWave['held'] = [];
  let v = 0.05 * p.vfs; // cap starts at previous (low) value
  if (input === 'sine') v = vinAt(0);
  for (let c = 0; c < cycles; c++) {
    const t0 = c * T;
    // sample (track) phase
    const dts = p.tsample / ptsPerPhase;
    for (let i = 0; i <= ptsPerPhase; i++) {
      const tt = t0 + i * dts;
      if (i > 0) {
        const u = vinAt(tt - dts / 2);
        v = u + (v - u) * Math.exp(-dts / tau);
      }
      t.push(tt); vin.push(vinAt(tt)); vh.push(v); sampling.push(true); cycle.push(c);
    }
    // switch opens: pedestal
    const vinAtHold = vinAt(t0 + p.tsample);
    v -= p.ch > 0 ? p.qinj / p.ch : 0;
    held.push({ t: t0 + p.tsample, v, vin: vinAtHold });
    const dth = p.thold / ptsPerPhase;
    const rate = p.ch > 0 ? p.ileak / p.ch : 0;
    for (let i = 0; i <= ptsPerPhase; i++) {
      const tt = t0 + p.tsample + i * dth;
      const vv = v - rate * i * dth;
      t.push(tt); vin.push(vinAt(tt)); vh.push(vv); sampling.push(false); cycle.push(c);
    }
    v -= rate * p.thold;
  }
  return { t, vin, vh, sampling, cycle, held };
}

/** Settling error (V) of a full-scale step vs time during the sample phase. */
export function settleCurve(p: ShIn, n = 200) {
  const tau = Math.max(1e-18, p.ron * p.ch);
  const tmax = Math.max(p.tsample * 1.3, tau * (Math.round(p.bits) + 3) * Math.LN2);
  const t: number[] = [], e: number[] = [];
  for (let i = 0; i <= n; i++) { const tt = tmax * i / n; t.push(tt); e.push(Math.max(1e-12, p.vfs * Math.exp(-tt / tau))); }
  return { t, e, tmax };
}
