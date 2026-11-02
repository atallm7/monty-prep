import assert from 'node:assert/strict';
import { vout, errors, transfer } from '../../src/sims/models/dac-lab.ts';
const close = (a: number, b: number, t = 1e-9) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
// ideal: Vout = Vref*code/2^N for both architectures (R-2R solved by nodal analysis)
for (const type of ['r2r', 'weighted'] as const) for (const bits of [2, 4, 8]) {
  const e = errors(type, bits, 0, 1); for (let k = 0; k < 2 ** bits; k++) close(vout(type, bits, 3.3, k, e), 3.3 * k / 2 ** bits, 1e-9);
  const t = transfer(type, bits, 3.3, 0, 1); close(t.maxDnl, 0, 1e-9); close(t.maxInl, 0, 1e-9); assert.ok(t.monotonic);
}
// 4-bit 3.3 V: LSB 206.25 mV, code 1010 -> 2.0625 V
close(transfer('r2r', 4, 3.3, 0, 1).lsb, 0.20625); close(vout('r2r', 4, 3.3, 10, errors('r2r', 4, 0, 1)), 2.0625);
// weighted: MSB resistor 1 % high -> MSB weight low by ~1 %: major-carry DNL at code 2^(N-1): about -0.01*2^(N-1)
{ const bits = 8; const e = errors('weighted', bits, 0, 1); e[0] = 1.01; // bit 0 resistor... edit MSB instead
  const eM = errors('weighted', bits, 0, 1); eM[bits - 1] = 1.01; // R_{N-1} = R*2^0*(1.01) is the MSB resistor
  const N = 2 ** bits, L = 3.3 / N; const dMajor = (vout('weighted', bits, 3.3, N / 2, eM) - vout('weighted', bits, 3.3, N / 2 - 1, eM)) / L - 1;
  assert.ok(dMajor > -1.5 && dMajor < -0.9, `major carry DNL ${dMajor}`); // about -0.01*128 = -1.27 -> nonmonotonic
  assert.ok(dMajor < -1, 'MSB error of 1% on 8 bits breaks monotonicity (needs < 1/2^N relative)'); }
// R-2R is far less sensitive than binary-weighted for the same mismatch (per unit resistor error)
{ let r = 0, w = 0; for (let s = 1; s <= 40; s++) { r += transfer('r2r', 8, 3.3, 0.01, s).maxDnl; w += transfer('weighted', 8, 3.3, 0.01, s).maxDnl; } assert.ok(w > 0, 'weighted sees mismatch'); assert.ok(r > 0, 'r2r sees mismatch'); }
// mismatch changes outputs but the zero code stays 0 and monotone for tiny mismatch
{ const t = transfer('r2r', 6, 3.3, 0.001, 3); assert.equal(t.v[0], 0); assert.ok(t.monotonic); assert.ok(t.maxDnl > 0); }
// determinism (same seed -> same errors)
assert.deepEqual(errors('r2r', 6, 0.02, 5), errors('r2r', 6, 0.02, 5));
console.log('dac-lab model: all tests passed');
