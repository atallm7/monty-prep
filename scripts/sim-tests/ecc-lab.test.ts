import assert from 'node:assert/strict';
import { encode74, encodeSecded, decode, wordFailure, majority, rTMR, rSimplex, TMR_CROSSOVER_LT, pk } from '../../src/sims/models/ecc-lab.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// Textbook example: data 1011 -> code word 0110011 (p1 p2 d1 p4 d2 d3 d4)
assert.deepEqual(encode74([1, 0, 1, 1]), [0, 1, 1, 0, 0, 1, 1]);
const words = Array.from({ length: 16 }, (_, v) => [(v >> 3) & 1, (v >> 2) & 1, (v >> 1) & 1, v & 1]);
for (const d of words) {
  const c = encode74(d); assert.equal(decode(c, false).syndrome, 0);
  // every single upset: syndrome = position, corrected
  for (let i = 0; i < 7; i++) { const r = c.slice(); r[i] ^= 1; const dec = decode(r, false); assert.equal(dec.syndrome, i + 1); assert.deepEqual(dec.data, d); assert.deepEqual(dec.corrected, c); }
  // every double upset: Hamming(7,4) sees a non-zero syndrome and MIS-corrects (result is not the original word)
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) { const r = c.slice(); r[i] ^= 1; r[j] ^= 1; const dec = decode(r, false); assert.equal(dec.status, 'corrected'); assert.notDeepEqual(dec.corrected, c); }
  // SECDED: singles corrected (incl. p0), all 28 doubles detected
  const s = encodeSecded(d); assert.equal(s.reduce((a, b) => a ^ b, 0), 0);
  for (let i = 0; i < 8; i++) { const r = s.slice(); r[i] ^= 1; const dec = decode(r, true); assert.deepEqual(dec.data, d); assert.equal(dec.status, i === 0 ? 'p0' : 'corrected'); }
  let doubles = 0;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const r = s.slice(); r[i] ^= 1; r[j] ^= 1; assert.equal(decode(r, true).status, 'double'); doubles++; }
  assert.equal(doubles, 28);
}
// failure probabilities: Hamming fails ~ 21 p² for small p, unprotected ~ 4p
const p = 1e-4; const wf = wordFailure(p);
close(wf.none / (4 * p), 1, 1e-3); close(wf.ham / (21 * p * p), 1, 1e-2); assert.ok(wf.secSilent < wf.secUncorr);
close(pk(7, 0, 0.1) + pk(7, 1, 0.1) + wordFailure(0.1).ham, 1);

// TMR majority voter truth table
for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) assert.equal(majority(a, b, c), a + b + c >= 2 ? 1 : 0);
assert.equal(majority(0b1010, 0b1110, 0b0011), 0b1010); // bitwise vote masks a fault in any one module
close(rTMR(0.5), 0.5); close(rTMR(0.9), 0.972); assert.ok(rTMR(0.3) < 0.3);
close(rSimplex(TMR_CROSSOVER_LT), 0.5);
// MTTF_TMR = 5/(6λ): integrate R_TMR(e^{-t}) numerically with λ = 1
let m = 0; const dt = 1e-3; for (let t = 0; t < 40; t += dt) m += rTMR(Math.exp(-(t + dt / 2))) * dt;
close(m, 5 / 6, 1e-4);
console.log('ecc-lab model: all tests passed');
