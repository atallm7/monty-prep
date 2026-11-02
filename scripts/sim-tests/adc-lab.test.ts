import assert from 'node:assert/strict';
import { quantize, sar, flash, codeToV, lsb, toBin } from '../../src/sims/models/adc-lab.ts';
const close = (a: number, b: number, t = 1e-9) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
// 10-bit, 3.3 V: LSB = 3.223 mV; 1.234 V -> code 382
close(lsb(10, 3.3), 3.3 / 1024); const q = quantize(10, 3.3, 1.234); assert.equal(q.code, 382); assert.ok(q.err >= 0 && q.err < q.lsb);
// 12-bit 5 V: 1.2207 mV
close(lsb(12, 5), 5 / 4096);
// full scale: Vin = Vref clips to top code 2^N-1; error never exceeds one LSB in range
assert.equal(quantize(8, 3.3, 3.3).code, 255); assert.equal(quantize(8, 3.3, 3.3).clipped, 'high'); assert.equal(quantize(8, 3.3, -1).code, 0);
assert.equal(quantize(8, 3.3, 3.3 - 1e-6).clipped, null);
for (let i = 0; i < 2000; i++) { const v = Math.random() * 3.29, r = quantize(6, 3.3, v); assert.ok(r.err >= -1e-12 && r.err < r.lsb + 1e-12); const rr = quantize(6, 3.3, v, true); assert.ok(Math.abs(rr.err) <= rr.lsb / 2 + 1e-12 || rr.clipped); }
close(quantize(10, 3.3, 1).sqnr, 61.96); close(quantize(16, 3.3, 1).sqnr, 98.08);
// SAR = flash = quantize for all inputs/bit-depths; SAR takes exactly N decisions, MSB first
for (const bits of [1, 3, 4, 8, 10]) for (let i = 0; i < 400; i++) {
  const v = Math.random() * 3.3 * 1.05, ref = quantize(bits, 3.3, v).code;
  const s = sar(bits, 3.3, Math.min(v, 3.3)); assert.equal(s.steps.length, bits);
  assert.equal(s.code, quantize(bits, 3.3, Math.min(v, 3.3)).code);
  if (bits <= 8) assert.equal(flash(bits, 3.3, v).code, ref);
}
// SAR walkthrough: 4-bit, Vref 16 V (LSB 1 V), Vin 10.3 V: trial 8 keep, 12 drop, 10 keep, 11 drop -> 1010
{ const s = sar(4, 16, 10.3); assert.deepEqual(s.steps.map(x => x.trial), [8, 12, 10, 11]); assert.deepEqual(s.steps.map(x => x.keep), [true, false, true, false]); assert.equal(toBin(s.code, 4), '1010'); }
// flash: 2^N-1 comparators; thermometer code is monotone
{ const f = flash(3, 8, 4.5); assert.equal(f.comparators, 7); assert.deepEqual(f.therm, [1, 1, 1, 1, 0, 0, 0]); assert.equal(f.resistors, 8); assert.equal(flash(10, 3.3, 1).comparators, 1023); }
// conversion convention note: top code reads Vref-LSB with 2^N, Vref with 2^N-1
close(codeToV(1023, 10, 3.3), 3.3 - 3.3 / 1024); close(codeToV(1023, 10, 3.3, 'pow2m1'), 3.3); close(codeToV(512, 10, 3.3), 1.65);
console.log('adc-lab model: all tests passed');
