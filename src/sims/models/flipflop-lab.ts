// Latches, flip-flops, setup/hold and metastability. Time is normalised to the clock period T = 1;
// waveforms are sampled on a grid of `spp` slots per period, transitions happen on slot boundaries.
//
// D latch (positive level): transparent while EN/CLK = 1 (Q follows D after t_dq), holds while 0. It captures on
// the CLOSING (falling) edge, so setup/hold apply around that edge.
// D flip-flop (rising edge): Q takes the value D had at the edge, after t_cq. Requirement:
//   setup slack = t_edge − t_lastDchange − t_su ≥ 0,   hold slack = t_nextDchange − t_edge − t_h ≥ 0.
// If violated, the master latch is left near its metastable point; the regenerative loop resolves exponentially:
//   P(still unresolved after t) = e^(−t/τ)  ->  sample t_res = −τ·ln(u), u ~ U(0,1), final value random.
// Synchroniser MTBF (classic Veendrick/Dally form): MTBF = e^(t_r/τ) / (T_0 · f_clk · f_data),
//   t_r = resolution time available before the next stage samples.
// SR latch (cross-coupled NOR): S=1 sets, R=1 resets, S=R=0 holds, S=R=1 forces Q = Q̄ = 0 (invalid);
// releasing S and R simultaneously from 1,1 is a race -> metastable, random outcome.

export type L = 0 | 1 | 'x';
export type Seg = { t0: number; t1: number; v: L };
export type EdgeInfo = { t: number; setupSlack: number; holdSlack: number; violated: boolean; value: L; resolveAt?: number; failure?: boolean };

/** Deterministic PRNG (mulberry32) so a given seed always resolves the same way. */
export function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function transitions(w: number[], spp: number): number[] {
  const out: number[] = []; for (let k = 1; k < w.length; k++) if (w[k] !== w[k - 1]) out.push(k / spp); return out;
}
export function risingEdges(clk: number[], spp: number) { const out: number[] = []; for (let k = 1; k < clk.length; k++) if (clk[k] && !clk[k - 1]) out.push(k / spp); return out; }
export function fallingEdges(clk: number[], spp: number) { const out: number[] = []; for (let k = 1; k < clk.length; k++) if (!clk[k] && clk[k - 1]) out.push(k / spp); return out; }

const EPS = 1e-9;
export function slacks(dTrans: number[], te: number, tsu: number, th: number) {
  const before = dTrans.filter(t => t < te - EPS); const after = dTrans.filter(t => t >= te - EPS);
  const setupSlack = before.length ? te - before[before.length - 1] - tsu : Infinity;
  const holdSlack = after.length ? after[0] - te - th : Infinity;
  return { setupSlack, holdSlack, violated: setupSlack < -EPS || holdSlack < -EPS };
}

/** Build piecewise segments from time-ordered events (later events at equal time win). */
export function toSegs(events: { t: number; v: L }[], tEnd: number, init: L): Seg[] {
  const ev = [...events].filter(e => e.t < tEnd).sort((a, b) => a.t - b.t);
  const segs: Seg[] = []; let cur = init, t0 = 0;
  for (const e of ev) { if (e.v === cur) continue; if (e.t > t0) segs.push({ t0, t1: e.t, v: cur }); cur = e.v; t0 = Math.max(t0, e.t); }
  segs.push({ t0, t1: tEnd, v: cur });
  return segs.filter(s => s.t1 > s.t0 + 1e-12);
}
export const valueAt = (segs: Seg[], t: number): L => (segs.find(s => t >= s.t0 && t < s.t1) ?? segs[segs.length - 1]).v;

export type Timing = { spp: number; tsu: number; th: number; tcq: number; tau: number; seed: number };

/** Positive-edge D flip-flop. */
export function simulateFF(clk: number[], d: number[], o: Timing) {
  const tEnd = clk.length / o.spp; const dT = transitions(d, o.spp); const r = rng(o.seed);
  const edges = risingEdges(clk, o.spp); const events: { t: number; v: L }[] = []; const info: EdgeInfo[] = [];
  edges.forEach((te, i) => {
    const s = slacks(dT, te, o.tsu, o.th); const k = Math.round(te * o.spp);
    const sampled = d[k - 1] as 0 | 1; // value present just before the edge
    if (!s.violated) { events.push({ t: te + o.tcq, v: sampled }); info.push({ t: te, ...s, value: sampled }); return; }
    const tres = -o.tau * Math.log(Math.max(1e-12, r())); const v: 0 | 1 = r() < 0.5 ? 0 : 1;
    const resolveAt = te + o.tcq + tres; const next = edges[i + 1] ?? Infinity;
    events.push({ t: te + o.tcq, v: 'x' }, { t: resolveAt, v });
    info.push({ t: te, ...s, value: v, resolveAt, failure: resolveAt > next - o.tsu });
  });
  return { q: toSegs(events, tEnd, 'x'), edges: info };
}

/** Positive-level D latch (transparent while clk = 1), with closing-edge setup/hold check. */
export function simulateLatch(clk: number[], d: number[], o: Timing) {
  const tEnd = clk.length / o.spp; const dT = transitions(d, o.spp); const r = rng(o.seed ^ 0x9e3779b9);
  const events: { t: number; v: L }[] = [];
  for (let k = 0; k < clk.length; k++) {
    if (!clk[k]) continue;
    const opening = k === 0 || !clk[k - 1]; const dChange = k > 0 && d[k] !== d[k - 1];
    if (opening || dChange) events.push({ t: k / o.spp + o.tcq, v: d[k] as 0 | 1 });
  }
  const closes = fallingEdges(clk, o.spp); const info: EdgeInfo[] = [];
  closes.forEach(tf => {
    const s = slacks(dT, tf, o.tsu, o.th); const k = Math.round(tf * o.spp); const held = d[k - 1] as 0 | 1;
    if (!s.violated) { info.push({ t: tf, ...s, value: held }); return; }
    // D moved too close to the closing edge: the storage loop may be left mid-transition
    const tres = -o.tau * Math.log(Math.max(1e-12, r())); const v: 0 | 1 = r() < 0.5 ? 0 : 1;
    events.push({ t: tf + o.tcq + 1e-6, v: 'x' }, { t: tf + o.tcq + tres, v });
    info.push({ t: tf, ...s, value: v, resolveAt: tf + o.tcq + tres });
  });
  return { q: toSegs(events, tEnd, 'x'), closes: info };
}

/** Cross-coupled NOR SR latch with propagation delay tpd. */
export function simulateSR(s: number[], rr: number[], o: { spp: number; tpd: number; tau: number; seed: number }) {
  const tEnd = s.length / o.spp; const r = rng(o.seed ^ 0x51ed);
  const qe: { t: number; v: L }[] = [], qne: { t: number; v: L }[] = []; const notes: { t: number; kind: 'set' | 'reset' | 'invalid' | 'race' }[] = [];
  let state: L = 'x';
  for (let k = 0; k < s.length; k++) {
    const S = s[k], R = rr[k], pS = k ? s[k - 1] : 0, pR = k ? rr[k - 1] : 0; const t = k / o.spp + o.tpd;
    if (k > 0 && S === pS && R === pR) continue;
    if (S && R) { qe.push({ t, v: 0 }); qne.push({ t, v: 0 }); if (!(pS && pR)) notes.push({ t: k / o.spp, kind: 'invalid' }); state = 'x'; continue; }
    if (S) { state = 1; qe.push({ t, v: 1 }); qne.push({ t, v: 0 }); notes.push({ t: k / o.spp, kind: 'set' }); continue; }
    if (R) { state = 0; qe.push({ t, v: 0 }); qne.push({ t, v: 1 }); notes.push({ t: k / o.spp, kind: 'reset' }); continue; }
    // S = R = 0: hold. Coming from 1,1 simultaneously is a race.
    if (pS && pR) {
      const tres = -o.tau * Math.log(Math.max(1e-12, r())); const v: 0 | 1 = r() < 0.5 ? 0 : 1;
      qe.push({ t, v: 'x' }, { t: t + tres, v }); qne.push({ t, v: 'x' }, { t: t + tres, v: v ? 0 : 1 }); state = v; notes.push({ t: k / o.spp, kind: 'race' });
    } else if (k === 0) { /* power-up unknown */ }
    else if (pS && !pR) { state = 1; } // was set: hold 1 (Q already 1)
    else if (pR && !pS) { state = 0; }
  }
  return { q: toSegs(qe, tEnd, 'x'), qn: toSegs(qne, tEnd, 'x'), notes, state };
}

export function mtbf(tr: number, tau: number, t0: number, fclk: number, fdata: number) { return Math.exp(tr / tau) / (t0 * fclk * fdata); }

// ---------- default waveforms ----------
export function clockWave(nPer: number, spp: number, duty = 0.5) { return Array.from({ length: nPer * spp }, (_, k) => ((k % spp) >= spp * (1 - duty) ? 1 : 0)); } // low first, rising mid-period
export function fromRuns(spp: number, nPer: number, changes: number[], init = 0) {
  // changes: times (in periods) at which the level toggles
  const n = nPer * spp; const w: number[] = []; let v = init; const ch = changes.map(t => Math.round(t * spp));
  for (let k = 0; k < n; k++) { if (ch.includes(k)) v = 1 - v; w.push(v); }
  return w;
}
