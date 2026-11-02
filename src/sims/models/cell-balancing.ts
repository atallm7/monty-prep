// Series-cell pack charging with and without passive (bleed-resistor) balancing.
//
// Each cell i: capacity Q_i, state of charge s_i, terminal voltage V_i = OCV(s_i) + I_i·R0 (charging positive).
// In a series string every cell carries the same charger current I_c; a passive balancer switches a bleed
// resistor R_bal across a cell, diverting I_b,i = V_i/R_bal, so the cell sees I_i = I_c − I_b,i and
//   ds_i/dt = (I_c − I_b,i)/(3600·Q_i).        Bleed heat P_i = V_i²/R_bal.
// Charger: CC at I_cc until the HIGHEST cell reaches V_max, then it tapers I_c so that cell stays at V_max
// (a per-cell-monitoring CC/CV charger: I_c = I_b,max + (V_max − OCV_max)/R0). It terminates when
// I_c < C/20 (and, with balancing, when the cells are within the balance window).
// Balancer: top-balancing, bleed cell i when V_i > 3.9 V and V_i − V_min > 10 mV (off below 3 mV: hysteresis).
// Usable pack capacity at low rate = min_i(s_i·Q_i): the first cell to empty ends the discharge, so the
// weakest cell limits it even in a perfectly balanced pack (ideal = min Q_i, all cells full).
// @ts-ignore TS5097: node needs the .ts extension; tsconfig lacks allowImportingTsExtensions (types still resolve)
import { ocv } from './lipo-lab.ts';

export type BalIn = {
  cells: number; mismatch: number; balance: 'none' | 'passive';
  socSpread?: number;   // spread of initial SoC (max − min), default 0.1
  soc0?: number;        // mean initial SoC, default 0.3
  qnom?: number;        // Ah, default 2
  crate?: number;       // charge C-rate, default 0.5
  rbal?: number;        // Ω, default 33
  r0?: number;          // Ω per cell, default 0.03
  vmax?: number;        // V, default 4.2
};
export const BAL_START_V = 3.9, BAL_ON = 0.010, BAL_OFF = 0.003;

/** Deterministic per-cell spread: capacity rank ascending with index, SoC ranks rotated so they are not correlated. */
export function cellSet(n: number, mismatch: number, socSpread: number, soc0: number, qnom: number) {
  const q: number[] = [], s: number[] = [];
  for (let i = 0; i < n; i++) {
    const pc = n > 1 ? i / (n - 1) : 0.5;
    const ps = n > 1 ? ((i + Math.floor(n / 2)) % n) / (n - 1) : 0.5;
    q.push(qnom * (1 + mismatch * (pc - 0.5)));
    s.push(Math.min(0.99, Math.max(0, soc0 + socSpread * (ps - 0.5))));
  }
  return { q, s };
}

export type BalResult = {
  t: number[]; v: number[][]; ic: number[]; ib: number[][]; soc: number[][];
  q: number[]; s0: number[]; sEnd: number[]; vEnd: number[];
  tFirstFull: number; firstCell: number; tEnd: number; finished: boolean;
  usableAh: number; idealAh: number; lostAh: number; nominalAh: number;
  heatJ: number[]; heatTotalJ: number; bleedAh: number[]; peakBleedA: number; peakBleedW: number;
  chargeInAh: number; packCvMaxV: number; packCvCell: number;
};

export function simulateBalance(p: BalIn, dt = 5): BalResult {
  const n = Math.max(2, Math.min(6, Math.round(p.cells)));
  const qnom = p.qnom ?? 2, crate = p.crate ?? 0.5, rbal = Math.max(1, p.rbal ?? 33), R0 = p.r0 ?? 0.03, vmax = p.vmax ?? 4.2;
  const { q, s: s0 } = cellSet(n, Math.max(0, p.mismatch), p.socSpread ?? 0.1, p.soc0 ?? 0.3, qnom);
  const s = s0.slice();
  const Icc = crate * qnom, Iterm = qnom / 20;
  const bal = p.balance === 'passive';
  const on = new Array(n).fill(false);
  const out: BalResult = { t: [], v: Array.from({ length: n }, () => []), soc: Array.from({ length: n }, () => []), ic: [], ib: Array.from({ length: n }, () => []), q, s0: s0.slice(), sEnd: [], vEnd: [], tFirstFull: NaN, firstCell: -1, tEnd: 0, finished: false, usableAh: 0, idealAh: 0, lostAh: 0, nominalAh: qnom, heatJ: new Array(n).fill(0), heatTotalJ: 0, bleedAh: new Array(n).fill(0), peakBleedA: 0, peakBleedW: 0, chargeInAh: 0, packCvMaxV: 0, packCvCell: 0 };
  const tMax = 24 * 3600; let t = 0, ic = Icc, cv = false, k = 0;
  const decim = Math.max(1, Math.round(30 / dt));
  while (true) {
    // balancer decisions from the present voltages (cell voltage under the previous current)
    const vNow = s.map(si => ocv(si) + ic * R0);
    const vMin = Math.min(...vNow);
    if (bal) for (let i = 0; i < n; i++) {
      const d = vNow[i] - vMin;
      if (!on[i] && vNow[i] > BAL_START_V && d > BAL_ON) on[i] = true; else if (on[i] && (d < BAL_OFF || vNow[i] < BAL_START_V - 0.02)) on[i] = false;
    }
    // bleed currents (V/R with the cell voltage at its own net current; solve V = OCV + (Ic − V/R)·R0)
    const ib = (icx: number) => s.map((si, i) => on[i] ? (ocv(si) + icx * R0) / (rbal + R0) : 0);
    // charger: CC, or taper so that the highest cell sits at vmax
    let ibs = ib(Icc);
    const vAt = (icx: number, b: number[]) => s.map((si, i) => ocv(si) + (icx - b[i]) * R0);
    let vs = vAt(Icc, ibs), jmax = 0; for (let i = 1; i < n; i++) if (vs[i] > vs[jmax]) jmax = i;
    if (cv || vs[jmax] >= vmax) {
      if (!cv) { cv = true; out.tFirstFull = t; out.firstCell = jmax; }
      // Ic such that max_i(OCV_i + (Ic − Ib_i)R0) = vmax  =>  Ic = min_i( Ib_i + (vmax − OCV_i)/R0 )
      let best = Infinity;
      for (let it = 0; it < 2; it++) { ibs = ib(Number.isFinite(best) ? best : Icc); best = Infinity; for (let i = 0; i < n; i++) best = Math.min(best, ibs[i] + (vmax - ocv(s[i])) / R0); }
      ic = Math.max(0, Math.min(Icc, best)); ibs = ib(ic); vs = vAt(ic, ibs);
    } else ic = Icc;
    const spreadV = Math.max(...s.map(ocv)) - Math.min(...s.map(ocv));
    const anyBleed = on.some(Boolean);
    const done = cv && ic < Iterm && (!bal || (!anyBleed && spreadV < 0.012));
    if (k % decim === 0 || done || t >= tMax) {
      out.t.push(t); out.ic.push(ic); for (let i = 0; i < n; i++) { out.v[i].push(vs[i]); out.ib[i].push(ibs[i]); out.soc[i].push(s[i]); }
    }
    if (done || t >= tMax) { out.finished = done; break; }
    for (let i = 0; i < n; i++) {
      const net = ic - ibs[i];
      s[i] += net * dt / 3600 / q[i];
      const pw = ibs[i] * ibs[i] * rbal;
      out.heatJ[i] += pw * dt; out.bleedAh[i] += ibs[i] * dt / 3600;
      out.peakBleedA = Math.max(out.peakBleedA, ibs[i]); out.peakBleedW = Math.max(out.peakBleedW, pw);
    }
    out.chargeInAh += ic * dt / 3600; t += dt; k++;
  }
  out.tEnd = t; out.sEnd = s.slice(); out.vEnd = s.map(ocv);
  out.usableAh = Math.min(...s.map((si, i) => Math.max(0, si) * q[i]));
  out.idealAh = Math.min(...q);
  out.lostAh = Math.max(0, out.idealAh - out.usableAh);
  out.heatTotalJ = out.heatJ.reduce((a, b) => a + b, 0);
  if (isNaN(out.tFirstFull)) out.tFirstFull = t;
  // What a "dumb" pack-level CC/CV charger (V_pack = N·vmax, no per-cell monitoring, no balancing) would do
  const pc = packLevelCv(q, s0, Icc, Iterm, R0, vmax, dt);
  out.packCvMaxV = pc.vmaxCell; out.packCvCell = pc.cell;
  return out;
}

/** Pack-level CC/CV at N·vmax: the sum of the cell voltages is regulated, not each cell. Returns the highest cell OCV reached. */
export function packLevelCv(q: number[], s0: number[], Icc: number, Iterm: number, R0: number, vmax: number, dt = 5) {
  const n = q.length, s = s0.slice(); let t = 0, cv = false;
  while (t < 24 * 3600) {
    const sumOcv = s.reduce((a, si) => a + ocv(si), 0);
    let ic = Icc;
    if (cv || sumOcv + Icc * n * R0 >= n * vmax) { cv = true; ic = Math.min(Icc, Math.max(0, (n * vmax - sumOcv) / (n * R0))); }
    if (cv && ic < Iterm) break;
    for (let i = 0; i < n; i++) s[i] = Math.min(1.15, s[i] + ic * dt / 3600 / q[i]);
    t += dt;
  }
  let cell = 0; for (let i = 1; i < n; i++) if (s[i] > s[cell]) cell = i;
  return { vmaxCell: ocv(s[cell]), cell, s };
}
