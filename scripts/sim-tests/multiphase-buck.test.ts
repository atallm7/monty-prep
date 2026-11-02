import assert from 'node:assert/strict';
import { multiphase, rippleRatio, transient, losses, mpDefaults } from '../../src/sims/models/multiphase-buck.ts';
const close = (a: number, b: number, tol = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} ${a} != ${b}`);
const p = mpDefaults();
// 2-phase textbook: K = (1−2D)/(1−D) for D < 0.5
close(rippleRatio(2, 0.25), 0.5 / 0.75); close(rippleRatio(2, 0.5), 0); close(rippleRatio(4, 0.25), 0); close(rippleRatio(1, 0.3), 1);
close(rippleRatio(3, 1 / 3), 0); close(rippleRatio(6, 0.5), 0);
// numeric sum of shifted triangles matches the closed form for many N, D
for (const N of [1, 2, 3, 4, 5, 6]) for (const vout of [0.6, 1.2, 2.5, 3.3, 5, 7, 9.5]) {
  const r = multiphase({ ...p, phases: N, vout });
  close(r.dIsum, r.K * r.dIph, 1e-6, `N=${N} D=${r.D}`);
  // DC of the sum equals Iout; each phase carries Iout/N
  const avg = r.sum.reduce((a, b) => a + b, 0) / r.sum.length; close(avg, p.iout, 2e-3, 'avg');
}
const one = multiphase({ ...p, phases: 1 });
close(one.dIph, (12 - 1.2) * 0.1 / (470e-9 * 500e3)); close(one.dIsum, one.dIph, 1e-9);
close(one.dVcap, one.dIph / (8 * 470e-6 * 500e3));
const four = multiphase({ ...p, phases: 4 }); close(four.fEff, 2e6);
// conduction loss scales as 1/N (DC part)
close(losses(p, 4).condDcOnly, losses(p, 1).condDcOnly / 4);
close(losses(p, 2).cond, 2 * ((20) ** 2 + one.dIph ** 2 / 12) * 0.004);
// transient: with ESR = 0 the undershoot is exactly ΔI·td/C + (L/N)·ΔI²/(2C(Vin−Vout))
const q = { ...p, esr: 0 };
for (const N of [1, 3]) {
  const tr = transient(q, N, 20);
  close(tr.undershoot, 20 * tr.td / q.c + q.l / N * 400 / (2 * q.c * 10.8), 1e-6, 'undershoot N=' + N);
}
assert.ok(transient(p, 4, 20).undershoot < transient(p, 1, 20).undershoot / 2, 'more phases → less undershoot');
// charge-balance recovery: Vout returns exactly to the set point and Σi_L settles at ΔI
for (const N of [1, 4]) { const t = transient(p, N, 20); close(t.v[t.v.length - 1], p.vout, 1e-9, 'recovered'); close(t.i[t.i.length - 1], 20); }
console.log('multiphase-buck model: all tests passed');
