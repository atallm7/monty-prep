// Oscilloscope trigger model: a long, sampled, noisy repetitive signal and a trigger engine that decides
// where each acquisition (sweep) starts. A stable display requires every sweep to start at the same point
// of the waveform: the trigger condition (level + slope, glitch width, runt thresholds), hysteresis
// (noise reject) and holdoff (re-arm delay) make that happen; free-run / auto acquisitions start at
// arbitrary times and the overlaid sweeps "roll" or smear.
//
// Edge trigger with hysteresis h (Schmitt): arm when v < L − h, fire on the first sample with v ≥ L (rising).
// Glitch (pulse-width) trigger: positive pulse whose width (rising L-crossing → falling L-crossing) < W; fires on the trailing edge.
// Runt trigger: a pulse that crosses the low threshold but returns below it without reaching the high threshold.
// Holdoff: the trigger cannot re-arm until t_trig + holdoff (and not before the previous record is captured).

export const P = 1e-3;        // signal period, s (1 kHz)
export const DT = 2e-6;       // sample interval, s (500 Sa/s per period → 500 kSa/s)

export type SigKind = 'sine' | 'square' | 'burst' | 'glitch' | 'runt';
export type TrigType = 'edge' | 'glitch' | 'runt';
export type Slope = 'rising' | 'falling';
export type TrigCfg = { type: TrigType; level: number; slope: Slope; hyst: number; width: number; runtLo: number; runtHi: number };

const trap = (ph: number, start: number, width: number, tr: number, amp = 1) => {
  const x = ph - start;
  if (x < 0 || x > width + tr) return 0;
  if (x < tr) return amp * x / tr;
  if (x < width) return amp;
  return amp * (1 - (x - width) / tr);
};

/** Noise-free signal at time t (seconds). */
export function clean(kind: SigKind, t: number): number {
  const n = Math.floor(t / P), ph = t - n * P;
  switch (kind) {
    case 'sine': return Math.sin(2 * Math.PI * t / P);
    case 'square': return trap(ph, 0, P / 2, 10e-6);
    case 'burst': return trap(ph, 0, 0.1e-3, 5e-6) + trap(ph, 0.2e-3, 0.1e-3, 5e-6) + trap(ph, 0.4e-3, 0.1e-3, 5e-6);
    case 'glitch': return trap(ph, 0, P / 2, 10e-6) + (((n % 7) + 7) % 7 === 3 ? trap(ph, 0.75e-3, 16e-6, 4e-6) : 0);
    case 'runt': return trap(ph, 0, 0.3e-3, 10e-6, ((n % 5) + 5) % 5 === 2 ? 0.45 : 1);
  }
}

// Deterministic Gaussian noise per sample index (hash → Box–Muller), so the record is reproducible.
function hash(x: number) {
  let h = (x | 0) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function gaussAt(k: number, seed = 0) {
  const u1 = Math.max(1e-12, hash(k * 2 + seed * 7919)), u2 = hash(k * 2 + 1 + seed * 7919);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
export const sample = (kind: SigKind, k: number, noise: number, seed = 0) => clean(kind, k * DT) + (noise > 0 ? noise * gaussAt(k, seed) : 0);

/** First trigger sample index in [from, to), or −1. */
export function findTrigger(kind: SigKind, noise: number, cfg: TrigCfg, from: number, to: number, seed = 0): number {
  const v = (k: number) => sample(kind, k, noise, seed);
  const h = Math.max(0, cfg.hyst);
  if (cfg.type === 'edge') {
    const rising = cfg.slope === 'rising';
    let armed = false;
    for (let k = from; k < to; k++) {
      const x = v(k);
      if (rising) { if (armed && x >= cfg.level) return k; if (x < cfg.level - h) armed = true; }
      else { if (armed && x <= cfg.level) return k; if (x > cfg.level + h) armed = true; }
    }
    return -1;
  }
  if (cfg.type === 'glitch') {
    // positive pulses: rising crossing of level → falling crossing; fire on trailing edge if width < W
    let armed = false, high = false, tRise = 0;
    for (let k = from; k < to; k++) {
      const x = v(k);
      if (!high) { if (x < cfg.level - h) armed = true; if (armed && x >= cfg.level) { high = true; tRise = k; } }
      else if (x < cfg.level - h) { high = false; armed = true; if ((k - tRise) * DT < cfg.width) return k; }
    }
    return -1;
  }
  // runt: crosses runtLo upward, falls back below runtLo without having crossed runtHi
  let state: 'low' | 'mid' | 'high' | 'unknown' = 'unknown';
  for (let k = from; k < to; k++) {
    const x = v(k);
    if (x < cfg.runtLo - h) { if (state === 'mid') return k; state = 'low'; }
    else if (x >= cfg.runtHi) state = 'high';
    else if (x >= cfg.runtLo && state === 'low') state = 'mid';
  }
  return -1;
}

export type Mode = 'auto' | 'normal' | 'single';
export type AcqCfg = { kind: SigKind; noise: number; trig: TrigCfg; enabled: boolean; mode: Mode; holdoff: number; tdiv: number; seed?: number };
export type AcqState = { ptr: number; lastTrig: number; records: { start: number; trig: boolean; trigAt: number }[]; status: 'Trig\'d' | 'Auto' | 'Ready' | 'Stop' | 'Roll'; count: number; acq: number };

export const recordLen = (tdiv: number) => Math.round(10 * tdiv / DT);   // 10 divisions
export const initAcq = (): AcqState => ({ ptr: 1000, lastTrig: -Infinity, records: [], status: 'Ready', count: 0, acq: 0 });

/** One acquisition cycle of the scope. Deterministic given the state. */
export function acquire(st: AcqState, c: AcqCfg, keep = 8): AcqState {
  if (st.status === 'Stop') return st;
  const n = recordLen(c.tdiv), pre = Math.floor(n / 2);
  // re-arm (dead) time of the acquisition system: 20–60 µs, varies each sweep (incommensurate with the signal)
  const dead = Math.round((20e-6 + 40e-6 * hash(st.acq * 31 + 5)) / DT);
  const hold = Math.round(c.holdoff / DT);
  const armAt = Math.max(st.ptr + dead, isFinite(st.lastTrig) ? st.lastTrig + hold : 0);
  const push = (rec: { start: number; trig: boolean; trigAt: number }) => [...st.records, rec].slice(-keep);
  if (!c.enabled) {
    // untriggered free-run: each sweep starts wherever the previous one ended plus the processing time
    // (here 130–170 µs, unrelated to the signal period) → the waveform appears to roll across the screen
    const start = st.ptr + Math.round((130e-6 + 40e-6 * hash(st.acq * 17 + 3)) / DT);
    return { ...st, ptr: start + n, records: push({ start, trig: false, trigAt: start + pre }), status: 'Roll', acq: st.acq + 1 };
  }
  const timeout = Math.max(n * 2, Math.round(20e-3 / DT));
  const k = findTrigger(c.kind, c.noise, c.trig, armAt + pre, armAt + pre + timeout, c.seed ?? 0);
  if (k >= 0) {
    const rec = { start: k - pre, trig: true, trigAt: k };
    return { ...st, ptr: k - pre + n, lastTrig: k, records: push(rec), status: c.mode === 'single' ? 'Stop' : 'Trig\'d', count: st.count + 1, acq: st.acq + 1 };
  }
  if (c.mode === 'auto') {
    const start = armAt + timeout;  // auto-trigger after the timeout: arbitrary start time
    return { ...st, ptr: start + n, records: push({ start, trig: false, trigAt: start + pre }), status: 'Auto', acq: st.acq + 1 };
  }
  return { ...st, ptr: armAt + timeout, status: 'Ready', acq: st.acq + 1 };   // normal/single: wait, keep old display
}

/** Min/max decimation of a record for display: returns [t (s, relative to trigger), v] pairs. */
export function traceOf(kind: SigKind, noise: number, rec: { start: number; trigAt: number }, n: number, cols = 400, seed = 0) {
  const per = Math.max(1, Math.floor(n / cols)); const out: [number, number][] = [];
  for (let i = 0; i < n; i += per) {
    let lo = Infinity, hi = -Infinity, ilo = i, ihi = i;
    for (let j = i; j < Math.min(n, i + per); j++) { const x = sample(kind, rec.start + j, noise, seed); if (x < lo) { lo = x; ilo = j; } if (x > hi) { hi = x; ihi = j; } }
    const t0 = (rec.start - rec.trigAt) * DT;
    if (ilo <= ihi) { out.push([t0 + ilo * DT, lo]); if (per > 1) out.push([t0 + ihi * DT, hi]); }
    else { out.push([t0 + ihi * DT, hi]); if (per > 1) out.push([t0 + ilo * DT, lo]); }
  }
  return out;
}

/** RMS difference between the noise-free content of the last two records: ≈ 0 when the display is stable. */
export function instability(kind: SigKind, recs: { start: number }[], n: number) {
  if (recs.length < 2) return 0;
  let worst = 0;
  for (let r = Math.max(1, recs.length - 4); r < recs.length; r++) {
    let s2 = 0; const a = recs[r].start, b = recs[r - 1].start, step = Math.max(1, Math.floor(n / 300)); let m = 0;
    for (let j = 0; j < n; j += step) { const d = clean(kind, (a + j) * DT) - clean(kind, (b + j) * DT); s2 += d * d; m++; }
    worst = Math.max(worst, Math.sqrt(s2 / m));
  }
  return worst;
}
