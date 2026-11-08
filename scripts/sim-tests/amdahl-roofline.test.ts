import assert from 'node:assert/strict';
import { amdahl, gustafson, amdahlLimit, efficiency, coresForFraction, attainable, ridge, bound, KERNELS } from '../../src/sims/models/amdahl-roofline.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
// Amdahl: p=0.9, N=16 -> 1/(0.1+0.05625) = 6.4
close(amdahl(0.9, 16), 6.4);
close(amdahl(0.9, 1), 1);
close(amdahlLimit(0.9), 10); close(amdahlLimit(0.5), 2);
assert.ok(amdahl(0.9, 1e9) < 10 && amdahl(0.9, 1e9) > 9.999);
close(efficiency(0.9, 16), 0.4);
// p = 0.5 -> speedup of 2 only at infinity; at N=2 it's 4/3
close(amdahl(0.5, 2), 4 / 3);
// Gustafson: p=0.9, N=16 -> 16 − 0.1·15 = 14.5
close(gustafson(0.9, 16), 14.5);
assert.ok(gustafson(0.9, 64) > amdahl(0.9, 64));
close(gustafson(0.9, 1), 1);
// cores for half the limit = p/(1-p) = 9; check
close(coresForFraction(0.9, 0.5), 9);
close(amdahl(0.9, 9), 5);
// Roofline
close(attainable(1000, 100, 1), 100);
close(attainable(1000, 100, 50), 1000);
close(ridge(1000, 100), 10);
assert.equal(bound(1000, 100, 9.99), 'memory'); assert.equal(bound(1000, 100, 10), 'compute');
// ridge point: both roofs equal
close(attainable(1000, 100, ridge(1000, 100)), 1000);
// vector add is memory-bound on a CPU, matmul compute-bound
assert.equal(bound(1000, 100, KERNELS[0].ai), 'memory'); assert.equal(bound(1000, 100, KERNELS[4].ai), 'compute');
console.log('amdahl-roofline model: all tests passed');
