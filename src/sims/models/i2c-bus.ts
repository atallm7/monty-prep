// I²C transaction model (NXP UM10204).
// Frame: START (SDA ↓ while SCL high) · 7-bit address MSB first · R/W̄ (0 = write, 1 = read) · ACK from target ·
//        data bytes (MSB first) each followed by an ACK from the RECEIVER · STOP (SDA ↑ while SCL high).
// Open-drain: a '1' is never driven, the driver releases SDA and the pull-up makes it high; '0' is pulled low.
// The receiver acknowledges by pulling SDA low during the 9th clock. In a read the controller ACKs every byte
// except the last, which it NACKs to tell the target to release SDA before the STOP.
// Repeated START (Sr) switches direction without releasing the bus (write register pointer, then read).
// Clock stretching: the target may hold SCL low after the ACK to buy time; the controller waits.
// Data changes only while SCL is low, and is sampled while SCL is high.

export type Driver = 'C' | 'T';
export type Field = 'start' | 'rstart' | 'stop' | 'addr' | 'rw' | 'ack' | 'data' | 'reg' | 'stretch';
export type Seg = {
  field: Field; len: number;          // len in bit periods
  value?: 0 | 1; driver?: Driver;     // for bit fields
  bitName?: string; byte?: number;    // label, which byte (0 = address byte)
  nack?: boolean;
};

export type TxnIn = { address: number; mode: 'write' | 'read' | 'wr'; data: number[]; reg: number; stretch: boolean; stretchBits: number; present: boolean };

export const addrByte = (addr: number, read: boolean) => ((addr & 0x7f) << 1) | (read ? 1 : 0);
export const reserved = (a: number) => a <= 0x07 || a >= 0x78;

export function buildTxn(p: TxnIn): Seg[] {
  const out: Seg[] = [];
  let byteNo = 0;
  const sendByte = (v: number, field: 'data' | 'reg', driver: Driver, name: string) => {
    for (let i = 7; i >= 0; i--) out.push({ field, len: 1, value: ((v >> i) & 1) as 0 | 1, driver, bitName: `${name}${i}`, byte: byteNo });
  };
  const address = (read: boolean): boolean => {
    for (let i = 6; i >= 0; i--) out.push({ field: 'addr', len: 1, value: ((p.address >> i) & 1) as 0 | 1, driver: 'C', bitName: 'A' + i, byte: byteNo });
    out.push({ field: 'rw', len: 1, value: read ? 1 : 0, driver: 'C', bitName: read ? 'R' : 'W̄', byte: byteNo });
    if (!p.present) { out.push({ field: 'ack', len: 1, value: 1, driver: 'T', bitName: 'NACK', nack: true, byte: byteNo }); return false; }
    out.push({ field: 'ack', len: 1, value: 0, driver: 'T', bitName: 'ACK', byte: byteNo });
    if (p.stretch) out.push({ field: 'stretch', len: p.stretchBits, driver: 'T' });
    byteNo++;
    return true;
  };
  out.push({ field: 'start', len: 1 });
  if (p.mode === 'write' || p.mode === 'wr') {
    if (address(false)) {
      const bytes = p.mode === 'wr' ? [p.reg] : p.data;
      bytes.forEach((b, k) => {
        sendByte(b, p.mode === 'wr' ? 'reg' : 'data', 'C', 'D');
        out.push({ field: 'ack', len: 1, value: 0, driver: 'T', bitName: 'ACK', byte: byteNo });
        if (p.stretch && k < bytes.length - 1) out.push({ field: 'stretch', len: p.stretchBits, driver: 'T' });
        byteNo++;
      });
      if (p.mode === 'wr') {
        out.push({ field: 'rstart', len: 1.5 });
        if (address(true)) readBytes();
      }
    }
  } else if (address(true)) readBytes();
  out.push({ field: 'stop', len: 1.5 });
  return out;

  function readBytes() {
    const n = Math.max(1, p.data.length);
    for (let k = 0; k < n; k++) {
      sendByte(p.data[k] ?? 0xff, 'data', 'T', 'D');
      const last = k === n - 1;
      out.push({ field: 'ack', len: 1, value: last ? 1 : 0, driver: 'C', bitName: last ? 'NACK' : 'ACK', nack: last, byte: byteNo });
      if (p.stretch && !last) out.push({ field: 'stretch', len: p.stretchBits, driver: 'T' });
      byteNo++;
    }
  }
}

export type Wave = { t: number[]; scl: number[]; sda: number[]; sdaDriver: ('C' | 'T' | 'R')[]; segStart: number[] };

/** Piecewise-constant SCL/SDA levels. Each bit: SCL low for the first half (SDA changes at ¼), high for the
 *  second half (SDA stable, sampled). Returns breakpoint arrays (time in bit periods). */
export function waveform(segs: Seg[]): Wave {
  const t: number[] = [], scl: number[] = [], sda: number[] = [], drv: ('C' | 'T' | 'R')[] = [], segStart: number[] = [];
  let now = 0; let sdaNow = 1; let drvNow: 'C' | 'T' | 'R' = 'R';
  const push = (tt: number, c: number, d: number, who: 'C' | 'T' | 'R') => { t.push(tt); scl.push(c); sda.push(d); drv.push(who); sdaNow = d; drvNow = who; };
  push(-1, 1, 1, 'R'); // idle
  for (const s of segs) {
    segStart.push(now);
    if (s.field === 'start') { push(now, 1, 1, 'R'); push(now + 0.5, 1, 0, 'C'); }
    else if (s.field === 'rstart') { push(now, 0, sdaNow, drvNow); push(now + 0.25, 0, 1, 'R'); push(now + 0.5, 1, 1, 'R'); push(now + 1.0, 1, 0, 'C'); }
    else if (s.field === 'stop') { push(now, 0, sdaNow, drvNow); push(now + 0.25, 0, 0, 'C'); push(now + 0.5, 1, 0, 'C'); push(now + 1.0, 1, 1, 'R'); }
    else if (s.field === 'stretch') { push(now, 0, sdaNow, drvNow); }
    else {
      const who: 'C' | 'T' | 'R' = s.value === 1 ? 'R' : s.driver!;
      push(now, 0, sdaNow, drvNow); push(now + 0.25, 0, s.value!, who); push(now + 0.5, 1, s.value!, who);
    }
    now += s.len;
  }
  push(now, 1, 1, 'R'); push(now + 1, 1, 1, 'R');
  return { t, scl, sda, sdaDriver: drv, segStart };
}

export function txnStats(segs: Seg[], fscl: number) {
  const clocks = segs.filter(s => s.len === 1 && s.value !== undefined).length;
  const bits = segs.reduce((a, s) => a + s.len, 0);
  const dataBytes = segs.filter(s => (s.field === 'data' || s.field === 'reg') && s.bitName?.endsWith('0')).length;
  const stretchBits = segs.filter(s => s.field === 'stretch').reduce((a, s) => a + s.len, 0);
  const acked = segs.filter(s => s.field === 'ack' && !s.nack).length;
  return { clocks, duration: bits / fscl, dataBytes, stretchTime: stretchBits / fscl, acked, efficiency: dataBytes * 8 / bits, payloadRate: dataBytes / (bits / fscl) };
}
