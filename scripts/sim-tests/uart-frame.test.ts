import assert from 'node:assert/strict';
import { buildFrame, parityBit, receive, tolerance, baudGen, frameStats } from '../../src/sims/models/uart-frame.ts';

// 'A' = 0x41 = 0b0100_0001 → LSB first on the wire: 1,0,0,0,0,0,1,0
const f = buildFrame({ code: 0x41, parity: 'none', stop: 1 });
assert.deepEqual(f.map(b => b.v), [0, 1, 0, 0, 0, 0, 0, 1, 0, 1]);
assert.equal(f.length, 10);
// parity: 0x41 has two 1s → even parity bit 0, odd parity bit 1
assert.equal(parityBit(0x41, 'even'), 0); assert.equal(parityBit(0x41, 'odd'), 1);
assert.equal(parityBit(0x43, 'even'), 1);
assert.equal(buildFrame({ code: 0x41, parity: 'even', stop: 2 }).length, 12);

// 115200 8N1: bit 8.68 µs, frame 86.8 µs, 11520 bytes/s, 80 % efficiency
const st = frameStats({ code: 0x41, parity: 'none', stop: 1 }, 115200);
assert.ok(Math.abs(st.tbit - 8.6806e-6) < 1e-9); assert.ok(Math.abs(st.tframe - 86.806e-6) < 1e-8);
assert.equal(st.bytesPerSec, 11520); assert.equal(st.efficiency, 0.8);

// receiver: perfect match decodes; centre sample lands within ±1/16 bit of the bit centre
const cfg = { code: 0x41, parity: 'even' as const, stop: 1 as const };
const r0 = receive(cfg, 115200, 0, 0.5);
assert.ok(r0.ok && r0.timingOk && r0.parityOk && r0.framingOk); assert.equal(r0.code, 0x41);
for (const o of r0.offsets) assert.ok(Math.abs(o) <= 1 / 16 + 1e-9);
// drift grows linearly: offset(j) − offset(0) ≈ −m·(j) for rx faster by m
const r3 = receive(cfg, 115200, 0.03, 0.5);
assert.ok(r3.ok);
assert.ok(Math.abs((r3.offsets[9] - r3.offsets[0]) - (-(9 * 16 / 16) * (1 - 1 / 1.03))) < 1e-9);
// 8 % mismatch breaks the frame
const r8 = receive({ code: 0x41, parity: 'none', stop: 1 }, 115200, 0.08, 0.5);
assert.ok(!r8.timingOk && !r8.ok);
const r8n = receive({ code: 0x55, parity: 'none', stop: 1 }, 9600, -0.08, 0.5);
assert.ok(!r8n.ok);
// tolerance for 8N1 ≈ (0.5 − 2/16)/9.5…(0.5 − 1/16)/9.5 → roughly 4–4.7 %
const tolP = tolerance({ code: 0x41, parity: 'none', stop: 1 }, 1), tolN = tolerance({ code: 0x41, parity: 'none', stop: 1 }, -1);
assert.ok(tolP > 0.035 && tolP < 0.05, String(tolP)); assert.ok(tolN > 0.035 && tolN < 0.05, String(tolN));
// a 2nd stop bit does not change RX tolerance (only the first is sampled); a parity bit does (longer frame)
assert.equal(tolerance({ code: 0x41, parity: 'none', stop: 2 }, 1), tolP);
assert.ok(tolerance({ code: 0x41, parity: 'even', stop: 1 }, 1) < tolP);
// baud generator: 16 MHz / (16·115200) = 8.68 → 9 → 111111 baud, −3.5 %
const g = baudGen(16e6, 115200); assert.equal(g.div, 9); assert.ok(Math.abs(g.err + 0.0355) < 1e-3);
// 14.7456 MHz crystal is exact
assert.equal(baudGen(14.7456e6, 115200).err, 0);
console.log('uart-frame model: all tests passed');
