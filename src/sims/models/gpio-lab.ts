// GPIO lab models: output stages, floating/pulled inputs, driver contention, switch debouncing.
// All circuit maths is first-order (single node + capacitance) solved with exact exponentials between events.

export type Drive = 'weak' | 'medium' | 'strong';
/** Driver models: triode on-resistance Ron and saturation current Isat (typical MCU pin, 3.3 V).
 *  Square-law FET: I = Isat·(2x − x²), x = Vds/Vdsat (x<1), I = Isat·(1 + λ(Vds − Vdsat)) beyond;
 *  small-signal Ron = Vdsat/(2·Isat) ⇒ Vdsat = 2·Isat·Ron. */
export const DRIVES: Record<Drive, { ronP: number; ronN: number; isatP: number; isatN: number; label: string }> = {
  weak: { ronP: 160, ronN: 120, isatP: 8e-3, isatN: 10e-3, label: 'low speed / 2 mA' },
  medium: { ronP: 60, ronN: 45, isatP: 22e-3, isatN: 28e-3, label: 'medium / 8 mA' },
  strong: { ronP: 28, ronN: 22, isatP: 45e-3, isatN: 55e-3, label: 'high speed / 20 mA' },
};
const LAMBDA = 0.05; // 1/V

/** FET current vs Vds (Vds ≥ 0) for given Ron, Isat. */
export function fetI(vds: number, ron: number, isat: number) {
  if (vds <= 0) return 0;
  const vdsat = 2 * isat * ron; const x = vds / vdsat;
  return x < 1 ? isat * (2 * x - x * x) : isat * (1 + LAMBDA * (vds - vdsat));
}
/** Inverse: Vds needed to carry current I. */
export function fetV(i: number, ron: number, isat: number) {
  if (i <= 0) return 0;
  const vdsat = 2 * isat * ron;
  if (i < isat) return vdsat * (1 - Math.sqrt(1 - i / isat));
  return vdsat + (i / isat - 1) / LAMBDA;
}

// ---------------------------------------------------------------- output view
export type OutIn = { vdd: number; mode: 'pushpull' | 'opendrain'; level: 0 | 1; rpu: number; usePu: boolean; rl: number; useRl: boolean; cl: number; drive: Drive; otherLow: boolean };

/** DC operating point by nodal analysis using the linear (triode) on-resistances; fine for logic levels. */
export function outputDC(p: OutIn) {
  const d = DRIVES[p.drive];
  const pOn = p.mode === 'pushpull' && p.level === 1;
  const nOn = p.level === 0;
  const gUp = (pOn ? 1 / d.ronP : 0) + (p.usePu ? 1 / p.rpu : 0);
  const gDn = (nOn ? 1 / d.ronN : 0) + (p.useRl ? 1 / p.rl : 0) + (p.otherLow ? 1 / d.ronN : 0);
  const floating = gUp + gDn === 0;
  const v = floating ? NaN : p.vdd * gUp / (gUp + gDn);
  const iP = pOn ? (p.vdd - v) / d.ronP : 0;
  const iN = nOn ? v / d.ronN : 0;
  const iPu = p.usePu ? (p.vdd - v) / p.rpu : 0;
  const iL = p.useRl ? v / p.rl : 0;
  const iOther = p.otherLow ? v / d.ronN : 0;
  const tau = floating ? Infinity : p.cl / (gUp + gDn);
  const contention = pOn && p.otherLow;
  return { pOn, nOn, v, iP, iN, iPu, iL, iOther, tau, floating, contention, gUp, gDn };
}

/** Square-wave toggling of the output at frequency f: exact RC response of the pin node.
 *  Returns v(t) for both push-pull and open-drain so they can be compared. */
export function outputWave(p: OutIn, f: number, periods = 2, n = 600) {
  const res: Record<'pushpull' | 'opendrain', number[]> = { pushpull: [], opendrain: [] };
  const t: number[] = []; const T = 1 / f; const dt = periods * T / n;
  for (const mode of ['pushpull', 'opendrain'] as const) {
    const lo = outputDC({ ...p, mode, level: 0, otherLow: false }), hi = outputDC({ ...p, mode, level: 1, otherLow: false });
    let v = lo.v;
    for (let i = 0; i <= n; i++) {
      const tt = i * dt; if (mode === 'pushpull') t.push(tt);
      res[mode].push(v);
      const high = (tt % T) / T < 0.5;
      const st = high ? hi : lo;
      const target = isFinite(st.v) ? st.v : v;
      v = isFinite(st.tau) ? target + (v - target) * Math.exp(-dt / st.tau) : v;
    }
  }
  return { t, pp: res.pushpull, od: res.opendrain, T };
}

// ---------------------------------------------------------------- input view
export type InIn = { vdd: number; pull: 'none' | 'up' | 'down'; rpull: number; ileak: number; cin: number; cc: number; fagg: number; v0: number; periods: number };

/** CMOS input-buffer crowbar current when both devices conduct (square law, Vt = 0.6 V, k = 50 µA/V²). */
export function crowbar(v: number, vdd: number) {
  const vt = 0.6, k = 50e-6;
  if (v <= vt || v >= vdd - vt) return 0;
  return k * Math.min((v - vt) ** 2, (vdd - vt - v) ** 2);
}

/** Input pin node: C·dV/dt = I_leak + (V_pull − V)/R_pull, plus charge injection ΔV = ΔV_agg·Cc/(Cc+Cin) at each
 *  aggressor edge. ESD diodes clamp to [−0.3 V, VDD + 0.3 V]. Schmitt input: VIH = 0.7·VDD, VIL = 0.3·VDD. */
export function inputSim(p: InIn) {
  const C = p.cin + p.cc;
  const R = p.pull === 'none' ? Infinity : p.rpull;
  const vp = p.pull === 'up' ? p.vdd : 0;
  const T = 1 / p.fagg;
  const tEnd = p.periods * T;
  const kick = p.vdd * p.cc / C;
  const clamp = (v: number) => Math.max(-0.3, Math.min(p.vdd + 0.3, v));
  const vInf = isFinite(R) ? vp + p.ileak * R : NaN;
  const tau = R * C;
  const t: number[] = [], v: number[] = [], rd: number[] = [], agg: number[] = [];
  let vv = p.v0; let state = vv > p.vdd / 2 ? 1 : 0; let toggles = 0; let q = 0; // q: ∫crowbar dt
  const step = (from: number, to: number, aggLevel: number) => {
    const span = to - from;
    const pts: number[] = [];
    if (isFinite(tau) && tau < span) { for (let k = 0; k <= 24; k++) pts.push(Math.min(span, tau * (Math.pow(1.35, k) - 1) / 4)); }
    for (let k = 0; k <= 40; k++) pts.push(span * k / 40);
    pts.sort((a, b) => a - b);
    const v0 = vv; let prevT = 0, prevV = v0;
    for (const dtt of pts) {
      let x: number;
      if (isFinite(R)) x = vInf + (v0 - vInf) * Math.exp(-dtt / tau);
      else x = v0 + p.ileak * dtt / C;
      x = clamp(x);
      if (state === 1 && x < 0.3 * p.vdd) { state = 0; toggles++; }
      else if (state === 0 && x > 0.7 * p.vdd) { state = 1; toggles++; }
      q += 0.5 * (crowbar(prevV, p.vdd) + crowbar(x, p.vdd)) * (dtt - prevT); prevT = dtt; prevV = x;
      t.push(from + dtt); v.push(x); rd.push(state * p.vdd); agg.push(aggLevel);
    }
    vv = prevV;
  };
  let a = 0;
  for (let k = 0; k < 2 * p.periods; k++) {
    const from = k * T / 2, to = (k + 1) * T / 2;
    if (k > 0) { const dA = (k % 2 === 1 ? 1 : -1) * p.vdd; a = k % 2; vv = clamp(vv + Math.sign(dA) * kick); }
    else a = 0;
    step(from, to, a * p.vdd);
  }
  return { t, v, rd, agg, toggles, iAvg: q / tEnd, kick, tau, vInf, tEnd };
}

// ---------------------------------------------------------------- contention view
export type ContIn = { vdd: number; aHigh: boolean; bHigh: boolean; driveA: Drive; driveB: Drive; rs: number };

/** Two push-pull outputs tied together (through Rs). If they disagree, current flows VDD → P(A) → Rs → N(B) → GND.
 *  Solve VDD = Vds_P(I) + I·Rs + Vds_N(I) for I by bisection (monotonic). */
export function contention(p: ContIn) {
  if (p.aHigh === p.bHigh) {
    const v = p.aHigh ? p.vdd : 0;
    return { fight: false, i: 0, vA: v, vB: v, pP: 0, pN: 0, pRs: 0, vdsP: 0, vdsN: 0 };
  }
  const hi = DRIVES[p.aHigh ? p.driveA : p.driveB], lo = DRIVES[p.aHigh ? p.driveB : p.driveA];
  const total = (i: number) => fetV(i, hi.ronP, hi.isatP) + i * p.rs + fetV(i, lo.ronN, lo.isatN);
  let a = 0, b = 1;
  while (total(b) < p.vdd) b *= 2;
  for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (total(m) < p.vdd) a = m; else b = m; }
  const i = (a + b) / 2;
  const vdsP = fetV(i, hi.ronP, hi.isatP), vdsN = fetV(i, lo.ronN, lo.isatN);
  const vHiPin = p.vdd - vdsP, vLoPin = vdsN; // pin of the driver driving high / low
  return { fight: true, i, vA: p.aHigh ? vHiPin : vLoPin, vB: p.aHigh ? vLoPin : vHiPin, pP: i * vdsP, pN: i * vdsN, pRs: i * i * p.rs, vdsP, vdsN };
}

// ---------------------------------------------------------------- debounce view
/** Deterministic pseudo-random (mulberry32) so the same bounce pattern is shown each time. */
export function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Contact bounce: list of times the switch toggles, starting open. Press at tPress, release at tRelease,
 *  each followed by bounces lasting ~tb with decaying gaps. Closed state is returned by switchClosed(). */
export function bounceEdges(tPress: number, tRelease: number, tb: number, seed = 7) {
  const r = rng(seed); const edges: number[] = [];
  for (const [t0, finalClosed] of [[tPress, true], [tRelease, false]] as const) {
    if (tb <= 0) { edges.push(t0); continue; }
    let t = t0; let closed = !finalClosed; const ev: number[] = [];
    // alternate contact/separation with gaps shrinking towards the end of the bounce period
    while (true) {
      ev.push(t); closed = !closed;
      const remaining = t0 + tb - t;
      const gap = (0.08 + 0.3 * r()) * Math.max(remaining, tb * 0.05) * (closed === finalClosed ? 1.4 : 0.6);
      if (t + gap > t0 + tb) break;
      t += gap;
    }
    if (closed !== finalClosed) ev.push(t0 + tb);
    edges.push(...ev);
  }
  return edges;
}

export type DebIn = { vdd: number; tb: number; method: 'none' | 'rc' | 'sw'; r1: number; r2: number; c: number; schmitt: boolean; tsamp: number; nstable: number; noise: number };

export function debounce(p: DebIn, tPress = 2e-3, tRelease = 22e-3, tEnd = 42e-3) {
  const edges = bounceEdges(tPress, tRelease, p.tb);
  const closedAt = (t: number) => { let c = false; for (const e of edges) { if (e <= t) c = !c; else break; } return c; };
  const N = 4000; const dt = tEnd / N;
  const t: number[] = [], raw: number[] = [], node: number[] = [], out: number[] = [];
  const r = rng(99);
  let vc = p.vdd; let outState = 1; let rawPrev = 1; let rawEdges = 0, outEdges = 0;
  let stable = 0, lastSample = -Infinity, swState = 1;
  const vtp = p.schmitt ? 0.6 * p.vdd : 0.5 * p.vdd, vtn = p.schmitt ? 0.35 * p.vdd : 0.5 * p.vdd;
  let lastOutChange = NaN;
  for (let i = 0; i <= N; i++) {
    const tt = i * dt; const closed = closedAt(tt);
    const vraw = closed ? 0 : p.vdd;
    if ((vraw > 0 ? 1 : 0) !== rawPrev) { rawEdges++; rawPrev = vraw > 0 ? 1 : 0; }
    let o = outState;
    if (p.method === 'rc') {
      // closed: C discharges through R2 to 0 V; open: charges through R1+R2 to VDD (Ganssle RC debouncer)
      const tau = closed ? p.r2 * p.c : (p.r1 + p.r2) * p.c; const tgt = closed ? 0 : p.vdd;
      if (i > 0) vc = tgt + (vc - tgt) * Math.exp(-dt / Math.max(tau, 1e-12));
      const vin = vc + p.noise * (r() * 2 - 1); // small additive noise seen by the input
      if (outState === 1 && vin < vtn) o = 0; else if (outState === 0 && vin > vtp) o = 1;
      node.push(vc);
    } else if (p.method === 'sw') {
      // sample raw input every tsamp; output changes after nstable consecutive identical samples
      if (tt - lastSample >= p.tsamp - 1e-12) {
        lastSample = tt; const s = vraw > 0 ? 1 : 0;
        if (s !== swState) { stable++; if (stable >= p.nstable) { swState = s; stable = 0; } } else stable = 0;
      }
      o = swState; node.push(vraw);
    } else { o = vraw > 0 ? 1 : 0; node.push(vraw); }
    if (o !== outState) { outEdges++; outState = o; lastOutChange = tt; }
    t.push(tt); raw.push(vraw); out.push(outState * p.vdd);
  }
  const settlePress = Math.max(...edges.filter(e => e < tRelease));
  // delay from the final (settled) press contact to the debounced falling edge
  const iFall = out.findIndex((v, k) => t[k] >= tPress && v === 0);
  const delay = iFall >= 0 ? t[iFall] - tPress : NaN;
  return { t, raw, node, out, rawEdges, outEdges, edges, settlePress, delay, vtp, vtn, lastOutChange };
}
