import assert from 'node:assert/strict';
import { simulate, dataBits, nrz } from '../../src/sims/models/diff-signaling.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-9, Math.abs(b)), `${a} != ${b}`);
const base = { noise: 0.5, skew: 0, fn: 0.15, kind: 'sine' as const, vgnd: 0, cmrr: 60 };
// PRBS7 bit pattern is balanced-ish, NRZ is +/-1 mid-bit
const bits = dataBits(127); const ones = bits.reduce((a, b) => a + b, 0); assert.ok(ones >= 60 && ones <= 67, `${ones}`);
close(nrz([1, 0], 0.5, 0.2), 1); close(nrz([1, 0], 1.5, 0.2), -1); assert.ok(Math.abs(nrz([1, 0], 1.0, 0.2)) < 1e-9);
// no noise: both receivers perfect, differential swing = 2a, no mode conversion
const q = simulate({ ...base, noise: 0 }); assert.equal(q.seErr, 0); assert.equal(q.dErr, 0); close(Math.max(...q.D), 0.4, 1e-9);
// large common-mode noise (> signal amplitude) destroys the single-ended link but the differential one is untouched
const n = simulate(base); assert.ok(n.seErr > 3, `se errors ${n.seErr}`); assert.equal(n.dErr, 0);
close(Math.max(...n.D), 0.4, 2e-3);
// differential output rejects CM by the CMRR: residual ~ noise * 10^(-60/20)
const resid = Math.max(...n.D.map((d, i) => Math.abs(d - (n.P[i] - n.N[i])))); assert.ok(resid <= 0.5 * 1e-3 * 1.01);
// ground offset: single-ended threshold shifts (error), differential immune until the CM range is violated
const g = simulate({ ...base, noise: 0, vgnd: 0.3 }); assert.ok(g.seErr > 0); assert.equal(g.dErr, 0);
const g2 = simulate({ ...base, noise: 0, vgnd: 1.5 }); assert.ok(g2.dErr > 0, 'CM range exceeded');
// skew converts common-mode to differential: amplitude 2*Vn*sin(pi f tau)
const sk = simulate({ ...base, skew: 0.2 }); close(sk.convAmp, 2 * 0.5 * Math.sin(Math.PI * 0.15 * 0.2), 1e-12);
assert.ok(Math.max(...sk.D) > Math.max(...n.D)); // noise now leaks into the differential signal
// worse CMRR -> more leakage
assert.ok(Math.max(...simulate({ ...base, cmrr: 20 }).D) - 0.4 > Math.max(...n.D) - 0.4);
console.log('diff-signaling model: all tests passed');
