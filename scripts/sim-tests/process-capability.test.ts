import assert from 'node:assert/strict';
import { capability, Phi, erfc, subgroupZ, xbarLimits, normals } from '../../src/sims/models/process-capability.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
close(Phi(0), 0.5, 1e-7); close(Phi(1.96), 0.975, 1e-4); close(Phi(-3), 0.0013499, 1e-3); close(erfc(0), 1, 1e-7);
// centred ±4σ spec: Cp = Cpk = 1.333, 63 ppm (two-sided 6.33e-5)
let c = capability({ mu: 0, sigma: 1, lsl: -4, usl: 4, shift: 0 });
close(c.cp, 8 / 6); close(c.cpk, 4 / 3); close(c.sigmaLevel, 4);
assert.ok(Math.abs(c.ppm - 63.3) < 0.5, `${c.ppm}`);
// off-centre by 1σ: Cp unchanged, Cpk = 1.0, ppm ≈ 1350 + 0.03
c = capability({ mu: 1, sigma: 1, lsl: -4, usl: 4, shift: 0 });
close(c.cp, 8 / 6); close(c.cpk, 1); assert.ok(Math.abs(c.ppm - 1350) < 5, `${c.ppm}`);
// 3σ centred: 2700 ppm
c = capability({ mu: 0, sigma: 1, lsl: -3, usl: 3, shift: 0 }); assert.ok(Math.abs(c.ppm - 2699.8) < 1);
// Six sigma: Cp 2, 0.002 ppm short term (two-sided 1.97e-9); 1.5σ shifted gives 3.4 ppm
c = capability({ mu: 0, sigma: 1, lsl: -6, usl: 6, shift: 1.5 });
close(c.cp, 2); close(c.cpk, 2); assert.ok(c.ppm < 0.01); assert.ok(Math.abs(c.ppmLT - 3.4) < 0.1, `${c.ppmLT}`);
// Cpk <= Cp always; a wider sigma lowers both
assert.ok(capability({ mu: 2, sigma: 1, lsl: -4, usl: 4, shift: 0 }).cpk <= 8 / 6);
// mean on the limit => Cpk 0, 50% out
c = capability({ mu: 4, sigma: 1, lsl: -4, usl: 4, shift: 0 }); close(c.cpk, 0); close(c.stFrac, 0.5, 1e-6);
// X-bar: limits = ±3σ/√n; sample means have ~ unit variance·(1/n) and reproducible
const L = xbarLimits(10, 2, 4); close(L.ucl, 13); close(L.lcl, 7);
assert.equal(subgroupZ(5, 3, 5), subgroupZ(5, 3, 5));
let s = 0, s2 = 0; const N = 4000; for (let k = 0; k < N; k++) { const z = subgroupZ(1, k, 5); s += z; s2 += z * z; }
assert.ok(Math.abs(s / N) < 0.05); assert.ok(Math.abs(s2 / N - 0.2) < 0.02, `${s2 / N}`);
const nz = normals(3, 20000); assert.ok(Math.abs(nz.reduce((a, b) => a + b) / 20000) < 0.03);
console.log('process-capability model: all tests passed');
