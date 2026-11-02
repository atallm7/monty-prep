import assert from 'node:assert/strict';
import { design, simulate, errorResponse, type PllIn } from '../../src/sims/models/pll-lab.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} != ${b}`);
const base: PllIn = { fref: 10e6, n: 10, bw: 100e3, zeta: 0.707, kvco: 50e6, icp: 100e-6, offset: -0.001, phaseStep: 0 };
const d = design(base);
// ω3dB/ωn = 2.058 for ζ = 0.707
close(2 * Math.PI * base.bw / d.wn, 2.058, 2e-3, 'bw/ωn');
// loop equations: ωn² = K/C and 2ζωn = K·R
close(d.wn * d.wn, d.K / d.C, 1e-12); close(2 * 0.707 * d.wn, d.K * d.R, 1e-12);
// closed-loop error response at t = 0 is 1, and settles to 0
close(errorResponse(0.707, 1, 0), 1, 1e-12); assert.ok(Math.abs(errorResponse(0.707, 1, 20)) < 1e-5);

// locks to N·fref
let o = simulate(base);
assert.ok(o.locked, 'locks'); close(o.f[o.f.length - 1], 100e6, 1e-6, 'f = N·fref'); assert.equal(o.slips, 0);
// matches the continuous-time type-II response Δf(t) = Δf0·g(t) while bw ≪ fref (sampling adds ~Tref/2 delay)
const df0 = o.ftarget - o.f0;
for (const tt of [2e-6, 5e-6, 10e-6, 20e-6]) {
  const k = Math.round(tt * base.fref);
  const pred = o.ftarget - df0 * errorResponse(d.zeta, d.wn, o.t[k]);
  assert.ok(Math.abs(o.f[k] - pred) < 0.04 * Math.abs(df0), `f(${tt}) ${o.f[k]} vs ${pred}`);
}
// frequency overshoot for ζ = 0.707 type-II loop (error response g(t) min ≈ −0.21 → ~21%)
let gmin = 0; for (let t = 0; t < 20; t += 1e-3) gmin = Math.min(gmin, errorResponse(0.707, 1, t));
close(o.overshootPct, -100 * gmin, 0.15, 'overshoot');
// control voltage settles to (N·fref − f0)/Kvco
close(o.vcFinal, df0 / base.kvco, 1e-3, 'Vc final');
// reference phase step of 30°: phase error jumps then decays to zero (type-II: zero static phase error)
o = simulate({ ...base, offset: 0, phaseStep: 30 });
const kS = Math.round(o.tStep * base.fref);
close(o.phaseErrDeg[kS], 30, 1e-6, 'step applied'); assert.ok(Math.abs(o.finalPhaseDeg) < 0.1, 'zero static phase error');
// slower loop → slower lock; bigger zeta → less overshoot
const slow = simulate({ ...base, bw: 30e3 }); assert.ok(slow.lockTime > simulate(base).lockTime, 'narrower loop locks slower');
assert.ok(simulate({ ...base, zeta: 1.5 }).overshootPct < simulate({ ...base, zeta: 0.4 }).overshootPct);
// loop bandwidth too close to fref: the sampled loop goes unstable (Gardner limit)
const fast = simulate({ ...base, bw: 5e6 }); assert.ok(!fast.locked, 'bw = fref/2 is unstable');
assert.ok(simulate({ ...base, bw: 1e6 }).locked, 'bw = fref/10 is fine');
// big offset: PFD saturates, cycle slips while acquiring, but it still locks
const big = simulate({ ...base, offset: -0.2 }); assert.ok(big.locked, 'acquires 20% offset'); close(big.f[big.f.length - 1], 100e6, 1e-6);
console.log('pll-lab model: all tests passed');
import { linearPrediction } from '../../src/sims/models/pll-lab.ts';
{ // linear prediction of phase error tracks the event model for a small offset
  const o2 = simulate(base); const k = Math.round(3e-6 * base.fref);
  const lp = linearPrediction(base, o2, o2.t[k]);
  assert.ok(Math.abs(lp.phaseDeg - o2.phaseErrDeg[k]) < 0.06 * Math.max(...o2.phaseErrDeg.map(Math.abs)), `phase ${lp.phaseDeg} vs ${o2.phaseErrDeg[k]}`);
  console.log('pll-lab linear prediction: ok');
}
