import assert from 'node:assert/strict';
import { position, sequence, holdingTorque, torqueVsDisplacement, staticDeflection, dynamics, resonanceHz, modeStepsPerFull, NR, DEFAULT_TH } from '../../src/sims/models/stepper-lab.ts';
const near = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`);
// sequence sizes: 4 positions per electrical cycle in full step, 8 in half, 4N in micro
assert.equal(sequence('full', 1).length, 4); assert.equal(sequence('half', 1).length, 8); assert.equal(sequence('micro', 8).length, 32);
// full step is two-phase-on: |Ia|=|Ib|=1; consecutive positions are 90° apart
const f = sequence('full', 1); f.forEach(p => { assert.equal(Math.abs(p.ia), 1); assert.equal(Math.abs(p.ib), 1); });
near(f[1].phi - f[0].phi, Math.PI / 2, 1e-12);
// half step: alternates 1 and 2 phases; 45° per step; torque ratio 1/√2
const h = sequence('half', 1); near(h[1].phi - h[0].phi, Math.PI / 4, 1e-12);
near(h[0].mag, 1, 1e-12); near(h[1].mag, Math.SQRT2, 1e-12); assert.deepEqual([h[0].ia, h[0].ib], [1, 0]); assert.deepEqual([h[2].ia, h[2].ib], [0, 1]);
const ht = holdingTorque('half', 1); near(ht[0] / ht[1], 1 / Math.SQRT2, 1e-12, 'half-step torque dip');
// microstep: Ia² + Ib² = 1, constant torque = Th/√2; Ia = cos, Ib = sin
const m = sequence('micro', 16); m.forEach((p, k) => { near(p.ia ** 2 + p.ib ** 2, 1, 1e-12); near(p.phi, (2 * Math.PI * k) / 64, 1e-12); });
near(holdingTorque('micro', 16)[3], DEFAULT_TH / Math.SQRT2, 1e-12);
near(holdingTorque('full', 1)[0], DEFAULT_TH, 1e-12, 'full-step = datasheet holding torque');
assert.equal(modeStepsPerFull('micro', 16), 16);
// microstep 1/8: step angle = 1.8°/8, current ratio at k=1: Ia/Ib = cot(90°/8)
near(position('micro', 8, 1).ib / position('micro', 8, 1).ia, Math.tan(Math.PI / 16), 1e-12);
// torque curve: zero at the commanded position, restoring, peak at 1 full step, T = −Tpk·sin(90°·d)
const tc = torqueVsDisplacement('full', 1, 0); const mid = (tc.x.length - 1) / 2;
near(tc.y[mid], 0, 1e-12); assert.ok(tc.y[mid + 5] < 0 && tc.y[mid - 5] > 0, 'restoring'); near(Math.max(...tc.y.map(Math.abs)), tc.peak, 1e-3);
// static deflection under load: sin δ = Tload/Tpk → at half of peak: 30° electrical = 0.6° mech·(1/NR)
const sd = staticDeflection('full', 1, 0, DEFAULT_TH / 2); near(sd.elec, Math.PI / 6, 1e-12); near(sd.mechDeg, 30 / NR, 1e-9); assert.equal(sd.stalled, false);
assert.equal(staticDeflection('full', 1, 0, DEFAULT_TH * 1.1).stalled, true);
// dynamics: slow stepping with a light load moves exactly steps·1.8° and ends in sync
{
  const d = dynamics({ mode: 'full', micro: 1, rate: 50, tload: 0.05, steps: 10 });
  near(d.actDeg, 18, 0.15, '10 full steps = 18°'); assert.ok(Math.abs(d.lostFullSteps) < 0.1, 'in sync ' + d.lostFullSteps);
  const half = dynamics({ mode: 'half', micro: 1, rate: 50, tload: 0.05, steps: 20 }); near(half.actDeg, 18, 0.15, 'half-step 20 = 18°');
  const mic = dynamics({ mode: 'micro', micro: 8, rate: 20, tload: 0.02, steps: 80 }); near(mic.actDeg, 18, 0.15, 'micro 80 = 18°');
}
// a load above the available torque never moves the rotor; too-fast stepping loses steps
{
  const stuck = dynamics({ mode: 'full', micro: 1, rate: 50, tload: 0.5, steps: 5 }); assert.ok(stuck.lostFullSteps > 3, 'stalled ' + stuck.lostFullSteps);
  const fast = dynamics({ mode: 'full', micro: 1, rate: 8000, tload: 0.15, steps: 60 }); assert.ok(fast.lostFullSteps > 1, 'lost steps at high rate ' + fast.lostFullSteps);
}
// resonance ≈ √(Th·Nr/J)/(2π)
near(resonanceHz(0.4, 57e-7), Math.sqrt((0.4 * 50) / 57e-7) / (2 * Math.PI), 1e-9);
console.log('stepper-lab model: all tests passed');
