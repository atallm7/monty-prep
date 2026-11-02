import assert from 'node:assert/strict';
import { slopes, alphaOf, steadyState, simulate, mapStep, cyclesToDecay } from '../../src/sims/models/subharmonic.ts';
const close = (a: number, b: number, tol = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} ${a} != ${b}`);
const base = { vin: 12, l: 10e-6, fsw: 200e3, iavg: 2, dI: 0.01, cycles: 30 };

// Textbook ratio α = −D/(1−D) with no compensation
close(alphaOf(0.6, 0), -1.5, 1e-12, 'alpha D=0.6');
close(alphaOf(0.4, 0), -2 / 3, 1e-12, 'alpha D=0.4');
close(alphaOf(0.5, 0), -1, 1e-12, 'alpha D=0.5 marginal');
// Slopes for a buck: m1 = (Vin−Vout)/L, m2 = Vout/L
const s = slopes({ d: 0.6, ma: 0, vin: 12, l: 10e-6 });
close(s.m1, 4.8 / 10e-6, 1e-12); close(s.m2, 7.2 / 10e-6, 1e-12); close(s.alpha, -1.5, 1e-12);
// Critical compensation ma = (m2−m1)/2 → |α| = 1; at D=0.6 that is (2D−1)/(2D) = 1/6 of m2
close(s.maCritFrac, 1 / 6, 1e-12);
close(alphaOf(0.6, 1 / 6), -1, 1e-12);
// Dead-beat: ma = m2 → α = 0
close(alphaOf(0.8, 1), 0, 1e-12);
// Steady state: the map is a fixed point at duty D
{
  const ss = steadyState({ ...base, d: 0.6, ma: 0 });
  const st = mapStep(ss.valley, ss.ic, ss.m1, ss.m2, ss.ma, ss.T);
  close(st.ton / ss.T, 0.6, 1e-9, 'duty'); close(st.i1, ss.valley, 1e-9, 'fixed point');
  close(ss.ripple, (12 - 7.2) * 0.6 / (10e-6 * 200e3), 1e-9, 'ripple ΔI=(Vin−Vout)D/(Lf)');
}
// Nonlinear map reproduces α for small perturbations
for (const [d, ma] of [[0.3, 0], [0.6, 0], [0.6, 0.5], [0.75, 0.3]]) {
  const r = simulate({ ...base, d, ma, dI: 1e-6, cycles: 3 });
  close(r.errs[1] / r.errs[0], alphaOf(d, ma), 1e-6, `ratio d=${d} ma=${ma}`);
}
// D<0.5 decays, D>0.5 grows (until it saturates into a bounded period-2 orbit), compensation fixes it
{
  const dec = simulate({ ...base, d: 0.4, ma: 0, dI: 0.1, cycles: 30 });
  assert.ok(Math.abs(dec.errs[30]) < 1e-4, 'decays at D=0.4');
  const grow = simulate({ ...base, d: 0.6, ma: 0, dI: 0.01, cycles: 40 });
  assert.ok(Math.abs(grow.errs[6]) > 0.1, 'grows at D=0.6');
  const e = grow.errs; // period-2: alternating sign, bounded
  assert.ok(Math.sign(e[38]) !== Math.sign(e[39]) && Math.abs(e[39]) < 10, 'bounded subharmonic');
  const comp = simulate({ ...base, d: 0.6, ma: 0.5, dI: 0.1, cycles: 30 });
  assert.ok(Math.abs(comp.errs[30]) < 1e-6, 'compensated decays');
  const db = simulate({ ...base, d: 0.7, ma: 1, dI: 0.2, cycles: 3 });
  assert.ok(Math.abs(db.errs[1]) < 1e-12, 'dead-beat in one cycle');
}
close(cyclesToDecay(0.5, 0.01), Math.log(0.01) / Math.log(0.5), 1e-12);
assert.equal(cyclesToDecay(-1.5), Infinity);
console.log('subharmonic model: all tests passed');
