import assert from 'node:assert/strict';
import { simulate, openLoopBounce, openLoopDiDt, idealCurrent } from '../../src/sims/models/ground-bounce.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);
const base = { n: 8, l: 2e-9, cl: 15e-12, tr: 1e-9, vdd: 3.3 };
// open-loop di/dt of raised-cosine edge matches numeric derivative of idealCurrent
let mx = 0; const h = base.tr / 20000;
for (let t = 0; t < base.tr; t += h) mx = Math.max(mx, Math.abs((idealCurrent(base, t + h) - idealCurrent(base, t)) / h));
close(mx, openLoopDiDt(base), 1e-3);
close(openLoopBounce({ ...base, l: 4e-9, pins: 2 }), openLoopBounce(base), 1e-12);
const r = simulate(base);
// charge conservation: all load charge returns through the ground inductance
close(r.charge, r.expectedCharge, 0.02);
// outputs end low, ground returns to 0
assert.ok(Math.abs(r.vfinal) < 0.02 * base.vdd); assert.ok(Math.abs(r.vgfinal) < 0.02);
// bounce is bipolar (rises then undershoots) and feedback makes it lower than the open-loop N*L*di/dt estimate
assert.ok(r.peak > 0 && r.trough < 0); assert.ok(r.peak < r.openLoop);
// more simultaneous outputs -> more bounce; slower edge -> less; more ground pins -> less; smaller L -> less
assert.ok(simulate({ ...base, n: 16 }).peak > r.peak); assert.ok(simulate({ ...base, n: 2 }).peak < r.peak);
assert.ok(simulate({ ...base, tr: 3e-9 }).peak < r.peak);
assert.ok(simulate({ ...base, pins: 4 }).peak < 0.6 * r.peak);
assert.ok(simulate({ ...base, l: 0.5e-9 }).peak < r.peak);
// linear regime: tiny L, one output -> bounce proportional to L
const lo = { ...base, n: 1, cd: 0.5e-12, rl: 0 }; const a = simulate({ ...lo, l: 0.05e-9 }).peak, b = simulate({ ...lo, l: 0.1e-9 }).peak;
assert.ok(b / a > 1.85 && b / a < 2.05, `ratio ${b / a}`);
// and agrees with L*di/dt of the simulated current (peak of Vg ~ Leff * max di/dt, within 15%)
const lin = simulate({ ...lo, l: 0.1e-9 });
close(lin.pkpk / 2 > 0 ? Math.max(lin.peak, -lin.trough) : 0, 0.1e-9 * lin.didtPeak, 0.15);
// false-trigger flag follows the 0.3*Vdd threshold
assert.equal(simulate({ ...base, n: 1, l: 0.1e-9 }).falseTrigger, false);
assert.equal(simulate({ ...base, n: 32, l: 5e-9, tr: 0.5e-9 }).falseTrigger, true);
console.log('ground-bounce model: all tests passed');
