import assert from 'node:assert/strict';
import { buildTxn, waveform, txnStats, addrByte, reserved } from '../../src/sims/models/i2c-bus.ts';

// address byte on the wire: 0x48 → 0x90 (write) / 0x91 (read)
assert.equal(addrByte(0x48, false), 0x90); assert.equal(addrByte(0x48, true), 0x91);
assert.ok(reserved(0x00) && reserved(0x7f) && !reserved(0x48));

const base = { address: 0x48, data: [0x12, 0x34], reg: 0x00, stretch: false, stretchBits: 3, present: true };
// write of 2 bytes: 9 clocks per byte incl. address → 27 SCL pulses
const w = buildTxn({ ...base, mode: 'write' });
assert.equal(txnStats(w, 100e3).clocks, 27);
assert.equal(w[0].field, 'start'); assert.equal(w[w.length - 1].field, 'stop');
// address bits 1001000 then W̄=0, ACK by target (0)
assert.deepEqual(w.slice(1, 10).map(s => s.value), [1, 0, 0, 1, 0, 0, 0, 0, 0]);
assert.equal(w[9].driver, 'T');
// data ACKs come from the target in a write
assert.ok(w.filter(s => s.field === 'ack').every(s => s.driver === 'T' && s.value === 0));
// read 2 bytes: data driven by target, controller ACKs first byte and NACKs the last
const r = buildTxn({ ...base, mode: 'read' });
const acks = r.filter(s => s.field === 'ack');
assert.deepEqual(acks.map(a => [a.driver, a.value]), [['T', 0], ['C', 0], ['C', 1]]);
assert.ok(r.filter(s => s.field === 'data').every(s => s.driver === 'T'));
// write-register-then-read uses a repeated start and two address phases: 9·(1+1) + 9·(1+2) = 45 clocks
const wr = buildTxn({ ...base, mode: 'wr', reg: 0x05 });
assert.equal(wr.filter(s => s.field === 'rstart').length, 1);
assert.equal(txnStats(wr, 400e3).clocks, 45);
assert.equal(wr.filter(s => s.field === 'rw').map(s => s.value).join(''), '01');
// absent target → NACK on the address, then STOP immediately
const nk = buildTxn({ ...base, mode: 'write', present: false });
assert.equal(txnStats(nk, 100e3).clocks, 9); assert.equal(nk[9].nack, true); assert.equal(nk[10].field, 'stop');
// duration at 100 kHz: START 1 + 27 bits + STOP 1.5 = 29.5 bit periods = 295 µs
assert.ok(Math.abs(txnStats(w, 100e3).duration - 295e-6) < 1e-12);
// clock stretching only adds time, never clocks
const ws = buildTxn({ ...base, mode: 'write', stretch: true });
assert.equal(txnStats(ws, 100e3).clocks, 27); assert.ok(Math.abs(txnStats(ws, 100e3).stretchTime - 2 * 3 / 100e3) < 1e-12);
// waveform: SDA only changes while SCL is low, except at START/STOP/Sr
const wv = waveform(w);
for (let i = 1; i < wv.t.length; i++) {
  if (wv.sda[i] !== wv.sda[i - 1] && wv.scl[i] === 1 && wv.scl[i - 1] === 1) {
    const seg = w[wv.segStart.findLastIndex(s => s <= wv.t[i])];
    assert.ok(['start', 'stop', 'rstart'].includes(seg.field), `SDA changed with SCL high in ${seg.field}`);
  }
}
// START = SDA falls while SCL high; STOP = SDA rises while SCL high
assert.equal(wv.sda[2], 0); assert.equal(wv.scl[2], 1);
assert.equal(wv.sda[wv.sda.length - 3], 1); assert.equal(wv.scl[wv.scl.length - 3], 1);
console.log('i2c-bus model: all tests passed');
