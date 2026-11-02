// UART (asynchronous serial) framing and 16× oversampling receiver model.
//
// Frame (line idles high = mark):  start bit (0) · data bits LSB first · optional parity · 1 or 2 stop bits (1).
// Even parity: parity bit chosen so the total number of 1s in data+parity is even; odd parity → odd.
// Bit time Tb = 1/baud. Frame bits = 1 + 8 + (parity?1:0) + stop. Throughput = baud/frameBits bytes/s.
// Receiver (16550 / STM32 style, checks only the first stop bit): samples the line at 16× its own baud rate, detects the falling start edge
// on the first low tick, then samples each bit at ticks 7, 8, 9 after (16·j) ticks with a 3-sample majority vote.
// Because the RX clock differs from TX by `mismatch`, sample points drift by mismatch·(j + ½) bits per bit j.
// The frame fails once the drift on the last (stop) bit exceeds ~½ bit minus the start-edge detection
// uncertainty (up to 1/16 bit):  |Δf/f| ≲ (½ − 1/16)/(Nbits − ½) ≈ 4.6 % total for 10-bit 8N1 frames.

export type Parity = 'none' | 'even' | 'odd';
export type UartCfg = { code: number; parity: Parity; stop: 1 | 2; dataBits?: number };
export type FrameBit = { kind: 'start' | 'data' | 'parity' | 'stop'; idx: number; v: 0 | 1; name: string };

export function popcount(x: number) { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; }

export function parityBit(code: number, parity: Parity, dataBits = 8): 0 | 1 {
  const ones = popcount(code & ((1 << dataBits) - 1));
  if (parity === 'even') return (ones % 2) as 0 | 1;
  if (parity === 'odd') return (1 - (ones % 2)) as 0 | 1;
  return 0;
}

export function buildFrame({ code, parity, stop, dataBits = 8 }: UartCfg): FrameBit[] {
  const bits: FrameBit[] = [{ kind: 'start', idx: 0, v: 0, name: 'Start' }];
  for (let i = 0; i < dataBits; i++) bits.push({ kind: 'data', idx: i, v: ((code >> i) & 1) as 0 | 1, name: 'D' + i });
  if (parity !== 'none') bits.push({ kind: 'parity', idx: 0, v: parityBit(code, parity, dataBits), name: 'P' });
  for (let i = 0; i < stop; i++) bits.push({ kind: 'stop', idx: i, v: 1, name: stop > 1 ? 'Stop' + (i + 1) : 'Stop' });
  return bits;
}

export type RxSample = { bit: number; tick: number; t: number; v: 0 | 1; txBit: number; ok: boolean };
export type RxResult = {
  tDetect: number; samples: RxSample[]; votes: (0 | 1)[]; offsets: number[]; // offsets: centre-sample error in bit periods
  code: number; parityOk: boolean; framingOk: boolean; startOk: boolean; noise: boolean; timingOk: boolean; ok: boolean;
};

/** Simulate the receiver. Times in seconds; frame starts (start-bit falling edge) at tStart.
 *  mismatch: RX baud = TX baud·(1 + mismatch) (fraction, e.g. 0.03).
 *  phase ∈ [0,1): where the RX 16× tick grid sits relative to the start edge (0 → a tick right at the edge). */
export function receive(cfg: UartCfg, baud: number, mismatch: number, phase = 0.5, tStart = 0): RxResult {
  const frame = buildFrame(cfg);
  const Tb = 1 / baud;
  const Ts = 1 / (baud * (1 + mismatch)) / 16;
  const line = (t: number): { v: 0 | 1; bit: number } => {
    const k = Math.floor((t - tStart) / Tb + 1e-12);
    if (k < 0 || k >= frame.length) return { v: 1, bit: k < 0 ? -1 : frame.length }; // idle
    return { v: frame[k].v, bit: k };
  };
  // first tick at or after the edge where the line reads low
  const tDetect = tStart + ((1 - phase) % 1) * Ts;
  const samples: RxSample[] = []; const votes: (0 | 1)[] = []; const offsets: number[] = [];
  let noise = false, timingOk = true;
  // the receiver samples up to and including the FIRST stop bit only (16550 behaviour); a 2nd stop bit is just
  // extra idle time that gives the receiver margin to re-synchronise on the next start edge.
  const nRx = frame.findIndex(b => b.kind === 'stop') + 1;
  for (let j = 0; j < nRx; j++) {
    const vs: number[] = [];
    for (const k of [7, 8, 9]) {
      const tick = 16 * j + k; const t = tDetect + tick * Ts; const l = line(t);
      const ok = l.bit === j; if (!ok) timingOk = false;
      samples.push({ bit: j, tick, t, v: l.v, txBit: l.bit, ok }); vs.push(l.v);
    }
    const sum = vs[0] + vs[1] + vs[2];
    if (sum !== 0 && sum !== 3) noise = true;
    votes.push(sum >= 2 ? 1 : 0);
    offsets.push((tDetect + (16 * j + 8) * Ts - tStart) / Tb - (j + 0.5));
  }
  const db = cfg.dataBits ?? 8;
  let code = 0;
  for (let i = 0; i < db; i++) code |= votes[1 + i] << i;
  let p = 1 + db;
  let parityOk = true;
  if (cfg.parity !== 'none') { parityOk = votes[p] === parityBit(code, cfg.parity, db); p++; }
  const framingOk = votes[p] === 1;
  const startOk = votes[0] === 0;
  const ok = startOk && parityOk && framingOk && code === (cfg.code & ((1 << db) - 1));
  return { tDetect, samples, votes, offsets, code, parityOk, framingOk, startOk, noise, timingOk, ok };
}

/** Largest |mismatch| (fraction) at which every sample of every bit still lands in the right bit,
 *  worst case over the start-edge detection phase. Found by bisection. */
export function tolerance(cfg: UartCfg, sign: 1 | -1) {
  const good = (m: number) => { for (let ph = 0; ph < 1; ph += 1 / 32) if (!receive(cfg, 1, sign * m, ph).timingOk) return false; return true; };
  let lo = 0, hi = 0.3;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (good(mid)) lo = mid; else hi = mid; }
  return lo;
}

/** Baud generator: USARTDIV = fclk/(16·baud) rounded to an integer (classic 16550 / AVR UBRR+1). */
export function baudGen(fclk: number, baud: number) {
  const div = Math.max(1, Math.round(fclk / (16 * baud)));
  const actual = fclk / (16 * div);
  return { div, actual, err: actual / baud - 1 };
}

export function frameStats(cfg: UartCfg, baud: number) {
  const nbits = buildFrame(cfg).length;
  return { nbits, tbit: 1 / baud, tframe: nbits / baud, bytesPerSec: baud / nbits, efficiency: (cfg.dataBits ?? 8) / nbits };
}
