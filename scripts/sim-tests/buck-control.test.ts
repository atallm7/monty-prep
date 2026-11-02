import assert from 'node:assert/strict';
import { bcDefaults, designComp, margins, stepResponse, f0, fesr, loopGain, plant, cffCentered } from '../../src/sims/models/buck-control.ts';
const close = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${m} ${a} vs ${b}`);
const p = bcDefaults();
// LC double pole and ESR zero
close(f0(p), 1 / (2 * Math.PI * Math.sqrt(4.7e-6 * 47e-6)), 1e-12, 'f0');
close(fesr(p), 1 / (2 * Math.PI * 0.01 * 47e-6), 1e-12, 'fesr');
// plant DC gain = Vin·R/(R+DCR)
const R = 3.3; const g0 = plant(p, 0.01); close(Math.hypot(g0[0], g0[1]), 12 * R / (R + 0.02), 1e-6, 'Gvd(0)');
// K-factor design hits the target crossover and phase margin
for (const pm of [30, 45, 55, 70]) for (const fc of [20e3, 40e3, 80e3]) {
  const q = { ...p, pm, fc }; const cp = designComp(q); const m = margins(q, cp);
  const T = loopGain(q, cp, fc); close(Math.hypot(T[0], T[1]), 1, 1e-9, '|T(fc)|=1');
  if (!cp.limited) { close(m.fc, fc, 0.01, 'fc'); assert.ok(Math.abs(m.pm - pm) < 0.5, `PM ${m.pm} vs ${pm}`); }
}
// type II is chosen when little boost is needed (fc well below f0? no: crossover near f0 with the ESR zero helping)
assert.equal(designComp({ ...p, esr: 0.2, fc: 20e3, pm: 45 }).type, 'II');
assert.equal(designComp(p).type, 'III');
// closed loop: integral action restores Vout exactly; undershoot is near ΔI/(2π·fc·C)
const cp = designComp(p);
let t0 = performance.now();
const s = stepResponse(p, cp);
console.log('step sim ms', (performance.now() - t0).toFixed(1), 'undershoot', s.undershoot.toFixed(4), 'rule', s.rule.toFixed(4), 'settle', s.settle);
close(s.v[s.v.length - 1], 3.3, 2e-3, 'regulation');
assert.ok(s.undershoot > 0.4 * s.rule && s.undershoot < 2 * s.rule, 'ΔV ≈ ΔI/(2πfcC)');
assert.ok(!s.stillRinging);
// low phase margin → more ringing/overshoot on release; PM < 0 → unstable limit cycle
const lo = { ...p, pm: 6 }; const slo = stepResponse(lo, designComp(lo));
assert.ok(slo.overshoot > s.overshoot, 'larger peak'); assert.ok(slo.settle > 2.5 * s.settle, `ringing lasts longer: ${slo.settle} vs ${s.settle}`);
const neg = { ...p, pm: -10 }; const cn = designComp(neg); const mn = margins(neg, cn);
assert.ok(mn.pm < 0, 'negative PM'); assert.ok(stepResponse(neg, cn).stillRinging, 'unstable when PM < 0');
// feed-forward cap adds phase lead at fc
const ff = { ...p, cffOn: true, cff: cffCentered(p) };
const pmFF = margins(ff, cp).pm, pm0 = margins(p, cp).pm;
const a = 3.3 / 0.8; const lead = Math.asin((a - 1) / (a + 1)) * 180 / Math.PI;
const ang = (c: number[]) => Math.atan2(c[1], c[0]) * 180 / Math.PI;
close(ang(loopGain(ff, cp, p.fc)) - ang(loopGain(p, cp, p.fc)), lead, 1e-6, 'max lead asin((a−1)/(a+1)) at fc');
assert.ok(pmFF > pm0 + 5, `Cff raises PM (crossover also moves up): ${pm0} → ${pmFF}`);
console.log('buck-control model: all tests passed');
