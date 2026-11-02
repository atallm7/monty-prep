import assert from 'node:assert/strict';
import { loading, rsForError, burden, RANGES, fourWire } from '../../src/sims/models/dmm-lab.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-15, Math.abs(b)), `${a} != ${b}`);
// 10 MOhm meter on a 10 MOhm source reads half
close(loading(5, 10e6, 10e6).vread, 2.5); close(loading(5, 10e6, 10e6).err, -0.5);
// 1 MOhm source on 10 MOhm: 90.9 %
close(loading(1, 1e6, 10e6).vread, 10 / 11); close(loading(3.3, 100, 10e6).err, -100 / (10e6 + 100));
// error of 1 % reached at Rs = Rin/99
close(loading(1, rsForError(10e6, 0.01), 10e6).err, -0.01, 1e-12);
// 10 GOhm input: 1 MOhm source is fine
assert.ok(Math.abs(loading(1, 1e6, 10e9).err) < 1.1e-4);
// burden: 1 kOhm shunt in a 5 V / 10 kOhm circuit -> 0.4545 mA vs 0.5 mA (-9.1 %), burden 0.4545 V
const b = burden(5, 10e3, 0, 1000, 200e-6);
close(b.i0, 0.5e-3); close(b.im, 5 / 11e3); close(b.err, -1000 / 11000, 1e-12); close(b.vb, 5 / 11);
// power of the meter shunt, and overrange flag only when current exceeds the range
assert.equal(b.over, true); assert.equal(burden(5, 100e3, 0, 1000, 200e-6).over, false);
// the 10 A range has tiny burden: 12 V, 1.2 ohm -> 10 A approx, Vb ~ 0.3 V
const ten = RANGES.find(r => r.id === '10a')!; const bb = burden(12, 1.17, 0, ten.rsh, ten.full); close(bb.vb, 10 * 0.03, 1e-12);
// 4-wire: 2-wire reads DUT + 2*leads ; 100 mOhm DUT with 0.5 ohm leads reads 1.1 ohm (+1000 %)
const w = fourWire(0.1, 0.5, 0, 1e-3, 10e9, 0.5);
close(w.r2, 1.1); close(w.e2, 10, 1e-9); assert.ok(Math.abs(w.e4) < 1e-9, `${w.e4}`); close(w.r4, 0.1, 1e-9);
// finite sense input resistance only causes ~ Rsense/Rin error
const w2 = fourWire(1, 10, 0.1, 1e-3, 10e6, 10); close(w2.e4, -20 / (10e6 + 20), 1e-9);
close(w2.v2, 1e-3 * (1 + 20 + 0.2));
console.log('dmm-lab model: all tests passed');
