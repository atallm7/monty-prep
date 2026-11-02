// SPI mode model (Motorola SPI convention).
//   CPOL = idle level of SCLK.  CPHA = 0: data is SAMPLED on the leading (first) edge and shifted on the
//   trailing edge, so the first bit must already be valid when CS falls. CPHA = 1: data is SHIFTED on the
//   leading edge and SAMPLED on the trailing edge.
//   mode = 2·CPOL + CPHA:  0 → idle low,  sample ↑ ;  1 → idle low,  sample ↓ ;
//                          2 → idle high, sample ↓ ;  3 → idle high, sample ↑.
// Time is measured in half SCLK periods: CS falls at t = 0, clock edges at t = 1 … 16, CS rises at t = 17.

export type Mode = 0 | 1 | 2 | 3;
export const cpol = (m: Mode) => (m >> 1) as 0 | 1;
export const cpha = (m: Mode) => (m & 1) as 0 | 1;
/** Edge on which a device in this mode samples data. */
export const sampleEdge = (m: Mode): 'rising' | 'falling' => (cpol(m) ^ cpha(m)) ? 'falling' : 'rising';

export type Edge = { t: number; dir: 'rising' | 'falling'; leading: boolean; n: number };

/** SCLK edges (8 cycles) for a mode. n = bit number (0 = first bit). */
export function clockEdges(m: Mode, nbits = 8): Edge[] {
  const out: Edge[] = [];
  for (let k = 1; k <= 2 * nbits; k++) {
    const leading = k % 2 === 1;
    // CPOL 0: leading edges rise. CPOL 1: leading edges fall.
    const rising = (cpol(m) === 0) === leading;
    out.push({ t: k, dir: rising ? 'rising' : 'falling', leading, n: Math.floor((k - 1) / 2) });
  }
  return out;
}

export function sclkLevel(m: Mode, t: number, nbits = 8): 0 | 1 {
  const idle = cpol(m);
  if (t < 1 || t >= 2 * nbits + 1) return idle;
  const k = Math.floor(t); // number of edges passed
  return ((idle + k) % 2) as 0 | 1;
}

/** Bits in transmission order. */
export function bitsOf(byte: number, msbFirst = true, nbits = 8): (0 | 1)[] {
  const out: (0 | 1)[] = [];
  for (let i = 0; i < nbits; i++) out.push(((byte >> (msbFirst ? nbits - 1 - i : i)) & 1) as 0 | 1);
  return out;
}

/** Data-line transitions for the transmitting device: list of {t, bit index} where bit i becomes valid.
 *  CPHA 0: bit 0 valid at CS fall (t=0), bit i at trailing edge t = 2i.
 *  CPHA 1: bit i valid at leading edge t = 2i+1. Line is released (high-Z) after the last bit / when CS high. */
export function dataWindows(m: Mode, nbits = 8) {
  const w: { from: number; to: number; i: number }[] = [];
  for (let i = 0; i < nbits; i++) {
    const from = cpha(m) === 0 ? 2 * i : 2 * i + 1;
    const to = cpha(m) === 0 ? 2 * i + 2 : 2 * i + 3;
    w.push({ from, to: Math.min(to, 2 * nbits + 1), i });
  }
  // CPHA 0: the last bit stays valid until CS rises (t = 2n+1)
  w[nbits - 1].to = 2 * nbits + 1;
  return w;
}

/** Sample instants (in half periods) at which a device in mode m captures data. */
export function sampleTimes(m: Mode, nbits = 8) {
  return clockEdges(m, nbits).filter(e => e.leading === (cpha(m) === 0)).map(e => e.t);
}

/** What a receiver configured as `rxMode` captures when the master drives SCLK/MOSI in `txMode`.
 *  The receiver simply clocks its shift register on its sampling edge polarity (rising for modes 0/3,
 *  falling for 1/2), which is what real shift-register peripherals do. If its sampling edge coincides
 *  with an edge where the transmitter changes data, the result is a hold-time race: we return both
 *  outcomes (old value = got lucky with hold time, new value = data already changed). */
export function crossReceive(txMode: Mode, rxMode: Mode, byte: number, msbFirst = true, nbits = 8) {
  const bits = bitsOf(byte, msbFirst, nbits);
  const win = dataWindows(txMode, nbits);
  const want = sampleEdge(rxMode);
  const edges = clockEdges(txMode, nbits).filter(e => e.dir === want);
  const valAt = (t: number) => { for (const w of win) if (t >= w.from && t < w.to) return bits[w.i]; return null; };
  const changeTimes = new Set(win.map(w => w.from).filter(t => t > 0));
  const early: (0 | 1 | null)[] = [], late: (0 | 1 | null)[] = [];
  let race = false;
  for (const e of edges) {
    if (changeTimes.has(e.t)) { race = true; early.push(valAt(e.t - 0.01)); late.push(valAt(e.t + 0.01)); }
    else { const v = valAt(e.t); early.push(v); late.push(v); }
  }
  const pack = (a: (0 | 1 | null)[]) => a.reduce<number>((acc, b, i) => acc | ((b ?? 1) << (msbFirst ? nbits - 1 - i : i)), 0);
  return { race, valueIfHoldOk: pack(early), valueIfLate: pack(late), edges: edges.map(e => e.t), sameEdge: want === sampleEdge(txMode) };
}

/** Daisy chain of `n` 8-bit shift registers: MOSI → S1 → S2 → … → Sn → MISO.
 *  The master shifts `tx` bytes (first byte first, MSB first). Returns register contents and bits seen
 *  on MISO after `clocks` SCLK cycles. After 8·n clocks the FIRST byte sent sits in the LAST device. */
export function daisyChain(initial: number[], tx: number[], clocks: number) {
  const n = initial.length;
  const regs = initial.map(v => v & 0xff);
  const txBits: number[] = []; for (const b of tx) txBits.push(...bitsOf(b, true));
  const miso: number[] = [];
  for (let c = 0; c < clocks; c++) {
    miso.push((regs[n - 1] >> 7) & 1);               // MSB of last device appears on MISO
    let carry = txBits[c] ?? 0;
    for (let k = 0; k < n; k++) { const out = (regs[k] >> 7) & 1; regs[k] = ((regs[k] << 1) | carry) & 0xff; carry = out; }
  }
  return { regs, miso };
}
