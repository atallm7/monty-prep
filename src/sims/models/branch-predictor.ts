// Branch predictors on a single branch's outcome stream (Hennessy & Patterson CA:AQA §3.3, Smith 1981).
//  * Static always-taken / always-not-taken.
//  * 1-bit: predict the last outcome. A loop exit costs 2 mispredictions per loop execution
//    (the exit itself and the first iteration of the next execution).
//  * 2-bit saturating counter: states 0 SNT, 1 WNT, 2 WT, 3 ST; predict taken iff state >= 2;
//    increment on taken, decrement on not-taken, saturating at 0/3. Hysteresis means a loop
//    of n iterations costs only 1 misprediction per execution -> accuracy (n-1)/n (90% for n=10).
//  * Two-level local predictor (Yeh & Patt): a k-bit history of this branch's last outcomes
//    selects one of 2^k 2-bit counters, so any repeating pattern with period <= k+1 is learned.

export type Outcome = boolean; // true = taken
export type PredId = 'at' | 'ant' | 'one' | 'two' | 'local';
export const PRED_NAMES: Record<PredId, string> = { at: 'Always taken', ant: 'Always not-taken', one: '1-bit', two: '2-bit counter', local: 'Local history' };
export const STATE_NAMES = ['SNT', 'WNT', 'WT', 'ST'];

export type PatternId = 'loop' | 'alternating' | 'random' | 'custom';
export type PatternOpts = { n?: number; reps?: number; p?: number; len?: number; seed?: number; custom?: string };

function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function parseCustom(s: string): Outcome[] {
  const out: Outcome[] = [];
  for (const c of s.toUpperCase()) { if (c === 'T' || c === '1') out.push(true); else if (c === 'N' || c === '0') out.push(false); }
  return out;
}

export function makePattern(id: PatternId, o: PatternOpts = {}): Outcome[] {
  const reps = Math.max(1, Math.round(o.reps ?? 6));
  if (id === 'loop') {
    const n = Math.max(1, Math.round(o.n ?? 10)); const out: Outcome[] = [];
    for (let r = 0; r < reps; r++) { for (let i = 0; i < n - 1; i++) out.push(true); out.push(false); }
    return out; // loop-closing branch: taken n-1 times, falls through once
  }
  const len = Math.max(1, Math.round(o.len ?? 40));
  if (id === 'alternating') return Array.from({ length: len }, (_, i) => i % 2 === 0);
  if (id === 'random') { const rnd = mulberry32(Math.round(o.seed ?? 1)); const p = o.p ?? 0.5; return Array.from({ length: len }, () => rnd() < p); }
  const unit = parseCustom(o.custom ?? 'TTN'); if (!unit.length) return [];
  const out: Outcome[] = []; for (let r = 0; r < reps; r++) out.push(...unit); return out;
}

export type RunOpts = { init2?: number; init1?: boolean; histBits?: number };
export type PredRun = { id: PredId; pred: Outcome[]; correct: boolean[]; state: number[]; stateAfter: number[]; hist?: number[]; misses: number; accuracy: number; cumAcc: number[] };

export function run(id: PredId, seq: Outcome[], o: RunOpts = {}): PredRun {
  const pred: Outcome[] = [], correct: boolean[] = [], state: number[] = [], stateAfter: number[] = [], histArr: number[] = [];
  const k = Math.max(1, Math.min(6, Math.round(o.histBits ?? 2)));
  let s1 = (o.init1 ?? true) ? 1 : 0;
  let s2 = Math.max(0, Math.min(3, Math.round(o.init2 ?? 2)));
  let hist = 0; const pht = new Array(1 << k).fill(Math.max(0, Math.min(3, Math.round(o.init2 ?? 2))));
  for (const t of seq) {
    let p: boolean, st: number, sa: number;
    switch (id) {
      case 'at': p = true; st = sa = 0; break;
      case 'ant': p = false; st = sa = 0; break;
      case 'one': st = s1; p = s1 === 1; s1 = t ? 1 : 0; sa = s1; break;
      case 'two': st = s2; p = s2 >= 2; s2 = t ? Math.min(3, s2 + 1) : Math.max(0, s2 - 1); sa = s2; break;
      default: {
        histArr.push(hist); st = pht[hist]; p = st >= 2;
        pht[hist] = t ? Math.min(3, st + 1) : Math.max(0, st - 1); sa = pht[hist];
        hist = ((hist << 1) | (t ? 1 : 0)) & ((1 << k) - 1);
      }
    }
    pred.push(p); correct.push(p === t); state.push(st); stateAfter.push(sa);
  }
  let c = 0; const cumAcc = correct.map((ok, i) => { if (ok) c++; return c / (i + 1); });
  const misses = correct.filter(x => !x).length;
  return { id, pred, correct, state, stateAfter, hist: id === 'local' ? histArr : undefined, misses, accuracy: seq.length ? 1 - misses / seq.length : 0, cumAcc };
}

/** Accuracy over a window [from, to) e.g. to exclude warm-up. */
export function windowAccuracy(r: PredRun, from: number, to = r.correct.length) {
  let ok = 0, n = 0; for (let i = Math.max(0, from); i < to; i++) { n++; if (r.correct[i]) ok++; } return n ? ok / n : 0;
}

/** Cost of mispredictions in a pipeline: CPI = base + f_branch * missRate * penalty. */
export function branchCPI(baseCPI: number, branchFrac: number, missRate: number, penalty: number) {
  return baseCPI + branchFrac * missRate * penalty;
}
