// Power-sequencing timeline model: rails with enable chains, soft-start ramps, power-good (PG) comparators,
// discharge on power-down, and sequencing-rule checks.
//
// Per rail (a regulator with EN, soft-start and PG output, e.g. TPS6xxxx-style point-of-load converters):
//  • Enable: from the master EN (at t = 0 + delay) or from another rail's PG (PG rising edge + delay).
//  • Soft-start: the reference ramps linearly 0 → Vnom over t_ss, so V(t) = Vnom·(t − t_en)/t_ss.
//    A regulator only sources current: a pre-biased output is not pulled down, it decays toward the ramp.
//    → PG asserts at t_PG = t_en + th·t_ss  (th = PG threshold as a fraction of Vnom, typically 90–95%).
//  • PG = EN ∧ (V ≥ th·Vnom): most PG pins are pulled low when the regulator is disabled.
//  • Disabled: the output capacitance is discharged by the load / active-discharge FET:
//    V(t) = V0·e^{−t/τ_off}  (τ_off = C_out·R_load_effective). Time to fall from V0 to Vx is τ·ln(V0/Vx).
//  • A fault can stall the soft-start at 60% of Vnom (e.g. short / over-current hiccup): PG never asserts.
// Power-down modes:
//  • 'reverse': master EN falls → rails with no dependents disable immediately; every other rail disables
//    `delay` after all rails it enables have fallen below 10% of their nominal value (reverse of power-up).
//  • 'simultaneous': every rail is disabled at once; the fall order is set by each τ_off (uncontrolled).
// Rules:
//  • 'before' a→b : rail b may be above 10% of Vnom_b only while PG_a is asserted (a up before b rises,
//                   and b gone before a drops). Covers both power-up order and reverse power-down order.
//  • 'maxdiff' a,b,lim : V_b − V_a ≤ lim at all times (e.g. I/O must not exceed core by more than lim,
//                   otherwise ESD/protection diodes between domains forward-bias and back-power the lower rail).
export type Rail = { name: string; vnom: number; src: number; delay: number; tss: number; th: number; tau: number; fault?: boolean };
export type Rule = { kind: 'before'; a: number; b: number; label: string } | { kind: 'maxdiff'; a: number; b: number; lim: number; label: string };
export type DownMode = 'none' | 'reverse' | 'simultaneous';
export type SeqIn = { rails: Rail[]; rules: Rule[]; down: DownMode; tOff: number; tEnd: number; dt?: number };

export const MASTER = -1;
export const OFF_FRAC = 0.1;     // "off" level used by power-down chaining and 'before' rule
export const FAULT_FRAC = 0.6;

export const PRESETS: Record<'soc' | 'fpga', { label: string; rails: Rail[]; rules: Rule[]; tOff: number }> = {
  soc: {
    label: 'SoC (core → SRAM → DDR → I/O)',
    rails: [
      { name: 'VDD_CORE', vnom: 0.8, src: MASTER, delay: 1e-3, tss: 1.5e-3, th: 0.9, tau: 0.5e-3 },
      { name: 'VDD_SRAM', vnom: 0.9, src: 0, delay: 0.5e-3, tss: 1e-3, th: 0.9, tau: 1e-3 },
      { name: 'VDD_DDR', vnom: 1.1, src: 1, delay: 0.5e-3, tss: 2e-3, th: 0.9, tau: 3e-3 },
      { name: 'VDD_IO', vnom: 1.8, src: 2, delay: 1e-3, tss: 2e-3, th: 0.9, tau: 5e-3 },
    ],
    rules: [
      { kind: 'before', a: 0, b: 3, label: 'Core before I/O (VDD_IO up only while PG_CORE)' },
      { kind: 'before', a: 0, b: 1, label: 'Core before SRAM (VDD_SRAM up only while PG_CORE)' },
      { kind: 'maxdiff', a: 0, b: 3, lim: 1.2, label: 'VDD_IO − VDD_CORE ≤ 1.2 V at all times' },
    ],
    tOff: 22e-3,
  },
  fpga: {
    label: 'FPGA (VCCINT → VCCBRAM → VCCAUX → VCCO)',
    rails: [
      { name: 'VCCINT', vnom: 1.0, src: MASTER, delay: 1e-3, tss: 1e-3, th: 0.9, tau: 1e-3 },
      { name: 'VCCBRAM', vnom: 1.0, src: 0, delay: 0.2e-3, tss: 1e-3, th: 0.9, tau: 1e-3 },
      { name: 'VCCAUX', vnom: 1.8, src: 1, delay: 0.5e-3, tss: 1.5e-3, th: 0.9, tau: 2e-3 },
      { name: 'VCCO', vnom: 3.3, src: 2, delay: 0.5e-3, tss: 2e-3, th: 0.9, tau: 6e-3 },
    ],
    rules: [
      { kind: 'before', a: 0, b: 2, label: 'VCCINT before VCCAUX' },
      { kind: 'before', a: 2, b: 3, label: 'VCCAUX before VCCO' },
      { kind: 'maxdiff', a: 2, b: 3, lim: 2.625, label: 'VCCO − VCCAUX ≤ 2.625 V at all times' },
    ],
    tOff: 22e-3,
  },
};

export type RuleResult = { ok: boolean; intervals: { from: number; to: number }[]; first: number; worst: number };
export type SeqOut = {
  t: number[]; v: number[][]; pg: boolean[][];
  tEn: number[]; tPg: number[]; tDis: number[]; tOffReached: number[];
  rules: RuleResult[]; allPg: number; nOk: number;
};

export function simulate(p: SeqIn): SeqOut {
  const R = p.rails, n = R.length;
  const dt = p.dt ?? Math.max(1e-6, p.tEnd / 6000);
  const steps = Math.ceil(p.tEnd / dt);
  const V = new Array(n).fill(0), en = new Array(n).fill(false), pg = new Array(n).fill(false);
  const tEn = new Array(n).fill(NaN), tPg = new Array(n).fill(NaN), tDis = new Array(n).fill(NaN), tOffR = new Array(n).fill(NaN);
  const enAt = new Array(n).fill(NaN), disAt = new Array(n).fill(NaN);
  const dependents = R.map((_, i) => R.map((r, j) => (r.src === i ? j : -1)).filter(j => j >= 0));
  const pdActive = p.down !== 'none';
  const t: number[] = [], vv: number[][] = R.map(() => []), pgs: boolean[][] = R.map(() => []);
  const rr: RuleResult[] = p.rules.map(() => ({ ok: true, intervals: [], first: NaN, worst: 0 }));
  const vOpen = p.rules.map(() => -1);
  let allPg = NaN;
  for (let k = 0; k <= steps; k++) {
    const tk = k * dt;
    const down = pdActive && tk >= p.tOff;
    // --- schedule enables (power-up), using PG from previous step
    if (!down) for (let i = 0; i < n; i++) {
      if (!isNaN(enAt[i])) continue;
      const s = R[i].src;
      if (s === MASTER || s < 0 || s >= n || s === i) enAt[i] = Math.max(0, R[i].delay);
      else if (!isNaN(tPg[s])) enAt[i] = tPg[s] + Math.max(0, R[i].delay);
    }
    // --- schedule disables (power-down)
    if (down) for (let i = 0; i < n; i++) {
      if (!isNaN(disAt[i])) continue;
      if (p.down === 'simultaneous') { disAt[i] = p.tOff; continue; }
      const deps = dependents[i];
      if (deps.length === 0) disAt[i] = p.tOff;
      else if (deps.every(j => !isNaN(tOffR[j]) || (!en[j] && V[j] < OFF_FRAC * R[j].vnom))) {
        const last = Math.max(p.tOff, ...deps.map(j => (isNaN(tOffR[j]) ? tk : tOffR[j])));
        disAt[i] = last + Math.max(0, R[i].delay);
      }
    }
    for (let i = 0; i < n; i++) {
      const r = R[i];
      const wasEn = en[i];
      en[i] = !isNaN(enAt[i]) && tk >= enAt[i] && !(!isNaN(disAt[i]) && tk >= disAt[i]);
      if (en[i] && !wasEn && isNaN(tEn[i])) tEn[i] = enAt[i];
      if (!en[i] && wasEn && !isNaN(disAt[i]) && isNaN(tDis[i])) tDis[i] = disAt[i];
      const decay = Math.exp(-dt / Math.max(1e-7, r.tau));
      if (en[i]) {
        const tss = Math.max(1e-7, r.tss);
        let ref = r.vnom * Math.min(1, (tk - enAt[i]) / tss);
        if (r.fault) ref = Math.min(ref, FAULT_FRAC * r.vnom);
        V[i] = Math.max(ref, V[i] * decay);         // sources only: pre-bias decays down to the ramp
      } else V[i] = V[i] * decay;
      const was = pg[i];
      pg[i] = en[i] && V[i] >= r.th * r.vnom - 1e-12;
      if (pg[i] && !was && isNaN(tPg[i])) tPg[i] = tk;
      if (pdActive && tk >= p.tOff && isNaN(tOffR[i]) && !en[i] && V[i] < OFF_FRAC * r.vnom) tOffR[i] = tk;
    }
    if (isNaN(allPg) && pg.every(Boolean)) allPg = tk;
    // --- rules
    p.rules.forEach((ru, q) => {
      if (ru.a < 0 || ru.a >= n || ru.b < 0 || ru.b >= n) return;
      let bad = false, val = 0;
      if (ru.kind === 'before') { val = V[ru.b]; bad = V[ru.b] > OFF_FRAC * R[ru.b].vnom && !pg[ru.a]; }
      else { val = V[ru.b] - V[ru.a]; bad = val > ru.lim; }
      const res = rr[q];
      if (bad) {
        res.ok = false; if (isNaN(res.first)) res.first = tk;
        res.worst = Math.max(res.worst, ru.kind === 'before' ? val : val - ru.lim);
        if (vOpen[q] < 0) vOpen[q] = tk;
      } else if (vOpen[q] >= 0) { res.intervals.push({ from: vOpen[q], to: tk }); vOpen[q] = -1; }
    });
    t.push(tk); for (let i = 0; i < n; i++) { vv[i].push(V[i]); pgs[i].push(pg[i]); }
  }
  p.rules.forEach((_, q) => { if (vOpen[q] >= 0) rr[q].intervals.push({ from: vOpen[q], to: steps * dt }); });
  return { t, v: vv, pg: pgs, tEn, tPg, tDis, tOffReached: tOffR, rules: rr, allPg, nOk: rr.filter(r => r.ok).length };
}

/** Closed-form PG time for a master-enabled rail: t_PG = delay + th·t_ss (used by tests and the UI equation). */
export const pgTime = (r: Rail, tEnable: number) => tEnable + r.th * r.tss;
/** Time for an exponential discharge from Vnom to OFF_FRAC·Vnom: τ·ln(1/0.1). */
export const offTime = (r: Rail) => r.tau * Math.log(1 / OFF_FRAC);
