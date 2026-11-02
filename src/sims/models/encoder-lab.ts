// Quadrature (incremental) encoder model.
//
// Disk with `cpr` lines (cycles per revolution per channel). Channel A and B are square waves of the same period,
// offset by 90° electrical (¼ cycle). Rotating "forward" (positive rpm), A leads B: the 2-bit Gray sequence (A,B) is
//   00 → 10 → 11 → 01 → 00 …   (reverse rotation walks it backwards).
// Decoding:
//   1×: count on rising edges of A only (direction = B level at that edge)  → cpr counts/rev
//   2×: count on both edges of A                                            → 2·cpr counts/rev
//   4×: count on every edge of A and B (state-transition table)            → 4·cpr counts/rev
// Speed estimation (counts per rev Nc = k·cpr):
//   M-method (count edges in a fixed window Tw):  rpm = 60·n/(Nc·Tw),   resolution Δrpm = 60/(Nc·Tw)  (±1 count)
//   T-method (time one edge period with a timer clock fclk): rpm = 60·fclk/(Nc·m),  m = clocks per edge period;
//     relative quantization ≈ 1/m = rpm·Nc/(60·fclk)  → good at low speed, poor at high speed.
//   The two relative errors are equal at rpm* = 60·√(fclk/Tw)/Nc  (crossover).

export type Decode = 1 | 2 | 4;

/** Ideal channel levels at mechanical angle θ (revolutions, any real). */
export function channels(rev: number, cpr: number): { a: 0 | 1; b: 0 | 1 } {
  const ph = rev * cpr; const f = ph - Math.floor(ph); // fraction of an electrical cycle
  // A high for f in [0, 0.5); B lags A by 0.25 cycle → high for f in [0.25, 0.75)
  const a = f < 0.5 ? 1 : 0; const b = f >= 0.25 && f < 0.75 ? 1 : 0;
  return { a: a as 0 | 1, b: b as 0 | 1 };
}

/** 4× state-transition: returns +1, −1, 0 (no change) or NaN (illegal double transition = missed edge). */
const SEQ = [0b00, 0b10, 0b11, 0b01]; // forward order of (A<<1 | B)
export function step4x(prev: number, cur: number): number {
  if (prev === cur) return 0;
  const i = SEQ.indexOf(prev), j = SEQ.indexOf(cur);
  const d = (j - i + 4) % 4;
  return d === 1 ? 1 : d === 3 ? -1 : NaN;
}

/** Count change between two consecutive samples for a given decoding mode. */
export function decodeStep(prevA: number, prevB: number, a: number, b: number, mode: Decode): number {
  if (mode === 4) return step4x((prevA << 1) | prevB, (a << 1) | b);
  if (prevA === a) return 0;
  const rising = a === 1;
  // On an A edge, direction comes from B: forward (A leads) → on A rising B is 0, on A falling B is 1.
  const fwd = rising ? b === 0 : b === 1;
  if (mode === 1) return rising ? (fwd ? 1 : 0) : (fwd ? 0 : -1); // 1×: count A↑ forward, A↓ in reverse (same physical edge)
  return fwd ? 1 : -1;
}

/** Decode a list of (a,b) samples. */
export function decodeSequence(samples: { a: number; b: number }[], mode: Decode) {
  let count = 0, errors = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = decodeStep(samples[i - 1].a, samples[i - 1].b, samples[i].a, samples[i].b, mode);
    if (Number.isNaN(d)) errors++; else count += d;
  }
  return { count, errors };
}

/** Waveforms over a time window starting at t=0, angle 0. Returns step-plot friendly arrays. */
export function waveforms(rpm: number, cpr: number, mode: Decode, tWin: number, n = 1200) {
  const t: number[] = [], A: number[] = [], B: number[] = [], C: number[] = [];
  const rps = rpm / 60;
  let prev = channels(1e-9 * Math.sign(rps || 1), cpr), count = 0;
  for (let i = 0; i <= n; i++) {
    const ti = tWin * i / n; const rev = rps * ti + 1e-9;
    const c = channels(rev, cpr);
    const d = decodeStep(prev.a, prev.b, c.a, c.b, mode); if (!Number.isNaN(d)) count += d;
    prev = c; t.push(ti); A.push(c.a); B.push(c.b); C.push(count);
  }
  return { t, A, B, C };
}

export function speedMetrics(rpm: number, cpr: number, mode: Decode, tw: number, fclk: number) {
  const Nc = cpr * mode;                       // counts per revolution
  const rps = Math.abs(rpm) / 60;
  const fEdge = rps * Nc;                      // counted edges per second
  const fA = rps * cpr;                        // channel A frequency
  // M-method with window starting on an edge-aligned phase 0 (worst case is ±1 count)
  const nCount = Math.floor(fEdge * tw + 1e-9);
  const rpmM = 60 * nCount / (Nc * tw);
  const resM = 60 / (Nc * tw);                 // rpm per count
  // T-method: measure one edge-to-edge period with timer clock fclk
  const tEdge = fEdge > 0 ? 1 / fEdge : Infinity;
  const m = Math.floor(tEdge * fclk);          // whole clock ticks counted
  const rpmT = m > 0 && isFinite(m) ? 60 * fclk / (Nc * m) : 0;
  const relM = rps > 0 ? resM / Math.abs(rpm) : Infinity;
  const relT = m > 0 && isFinite(m) ? 1 / m : Infinity;
  const crossover = 60 * Math.sqrt(fclk / tw) / Nc;
  // 4× with uneven A/B quadrature still yields Nc edges/rev; T-method with 4× is sensitive to phase error between channels
  return { Nc, fEdge, fA, nCount, rpmM, resM, tEdge, m, rpmT, relM, relT, crossover, degPerCount: 360 / Nc };
}

/** Relative quantization error vs speed for both methods (for log-log plot). */
export function errorCurves(cpr: number, mode: Decode, tw: number, fclk: number, rpmLo = 1, rpmHi = 1e5, n = 160) {
  const Nc = cpr * mode; const x: number[] = [], eM: number[] = [], eT: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = rpmLo * (rpmHi / rpmLo) ** (i / (n - 1)); x.push(r);
    eM.push(60 / (Nc * tw) / r);                         // ±1 count out of n = r·Nc·Tw/60
    eT.push(r * Nc / (60 * fclk));                       // ±1 tick out of m = 60·fclk/(r·Nc)
  }
  return { x, eM, eT };
}
