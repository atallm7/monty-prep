import assert from 'node:assert/strict';
import { collector, loadLinePoint, ibEdgeOfSat, ibFromVbb, smallSignal, outputFamily, emCurrents } from '../../src/sims/models/bjt-lab.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const rel = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);
const VT = 0.025852;

// Forward active, no Early effect: Ic = β·Ib = 100 × 20 µA = 2 mA
const n0 = { type: 'npn' as const, beta: 100, va: Infinity };
let c = collector(n0, 20e-6, 5);
rel(c.ic, 2e-3, 1e-6, 'Ic = βIb'); assert.equal(c.region, 'active');
// Vbe = VT·ln(Ic/Is) ≈ 0.673 V for Is = 1e-14
close(c.vbe, VT * Math.log(2e-3 / 1e-14), 1e-4, 'Vbe');
// flat in Vce when VA = ∞
rel(collector(n0, 20e-6, 9).ic, c.ic, 1e-6, 'flat curves');

// Early effect: Ic = βIb(1 + Vce/VA), VA = 100 V → 2 mA·1.05 at Vce = 5; slope = Ic/(VA+Vce)
const n1 = { ...n0, va: 100 };
rel(collector(n1, 20e-6, 5).ic, 2.1e-3, 1e-5, 'Early Ic');
const slope = (collector(n1, 20e-6, 8).ic - collector(n1, 20e-6, 4).ic) / 4;
rel(slope, 2e-3 / 100, 1e-4, 'output conductance βIb/VA');
// Curves extrapolate to −VA: Ic(Vce) linear → zero crossing at Vce = −VA
const i4 = collector(n1, 50e-6, 4).ic, i8 = collector(n1, 50e-6, 8).ic;
close(4 - i4 / ((i8 - i4) / 4), -100, 1e-2, 'extrapolates to −VA');
rel(smallSignal(n1, 2.1e-3, 5).ro, 105 / 2.1e-3, 1e-12, 'ro = (VA+Vce)/Ic');
rel(smallSignal(n1, 2e-3, 5).gm, 2e-3 / VT, 1e-12, 'gm = Ic/VT');
rel(smallSignal(n1, 2e-3, 5).rpi, 100 * VT / 2e-3, 1e-12, 'rπ = β/gm');

// Load line Vcc = 10 V, Rc = 1 kΩ, Ib = 20 µA, VA = ∞: Ic = 2 mA, Vce = 8 V (active)
let op = loadLinePoint(n0, 20e-6, 10, 1000);
rel(op.ic, 2e-3, 1e-5, 'loadline Ic'); close(op.vce, 8, 1e-2, 'loadline Vce'); assert.equal(op.region, 'active');
// With VA = 100 V: Ic = 2 mA(1 + (10 − 1k·Ic)/100) → Ic = 2.2 mA/1.02
op = loadLinePoint(n1, 20e-6, 10, 1000);
rel(op.ic, 2.2e-3 / 1.02, 1e-4, 'loadline with Early');

// Saturation: Ib = 200 µA → βIb = 20 mA > Vcc/Rc = 10 mA, so Ic ≈ (Vcc − Vce,sat)/Rc and Vce,sat < 0.2 V
op = loadLinePoint(n0, 200e-6, 10, 1000);
assert.equal(op.region, 'saturation');
assert.ok(op.vce > 0.03 && op.vce < 0.2, 'Vce(sat) ' + op.vce);
rel(op.ic, (10 - op.vce) / 1000, 1e-6, 'sat on load line');
assert.ok(op.forcedBeta < 100 * 0.6, 'forced β < β');
// Ebers–Moll closed form: Vce,sat = VT·ln[(1/αR + βf/βR)/(1 − βf/βF)] with βR = 1 → αR = 0.5
const bf = op.ic / 200e-6;
close(op.vce, VT * Math.log((2 + bf) / (1 - bf / 100)), 2e-4, 'Vce,sat Ebers–Moll');
// edge of saturation: Ib = (Vcc − 0.2)/(βRc) = 98 µA
rel(ibEdgeOfSat(100, 10, 1000), 98e-6, 1e-12, 'Ib edge');
// Cut-off
op = loadLinePoint(n0, 0, 10, 1000); assert.equal(op.region, 'cutoff'); assert.equal(op.ic, 0); close(op.vce, 10, 1e-9, 'cutoff Vce');

// PNP mirror image: Ib = −20 µA (out of base), emitter at Vcc → Ic = −2 mA, Vce = −8 V
const p0 = { ...n0, type: 'pnp' as const };
op = loadLinePoint(p0, 20e-6, 10, 1000);
rel(op.ic, -2e-3, 1e-5, 'PNP Ic'); close(op.vce, -8, 1e-2, 'PNP Vce'); assert.ok(op.vbe < -0.6, 'PNP Vbe negative');
const fn = outputFamily(n1, [10e-6, 30e-6], 10), fp = outputFamily({ ...n1, type: 'pnp' }, [10e-6, 30e-6], 10);
fn.forEach((cv, i) => cv.y.forEach((y, j) => close(fp[i].y[j], -y, 1e-15, 'PNP family mirrored')));

// Base drive from VBB through RB: VBB = 2.7 V, RB = 100 kΩ → Ib = (2.7 − Vbe)/RB ≈ 20 µA
const ib = ibFromVbb(n0, 2.7, 100e3, 10, 1000);
const o2 = loadLinePoint(n0, ib, 10, 1000);
close(2.7 - ib * 100e3, o2.vbe, 1e-6, 'KVL base loop'); assert.ok(ib > 19e-6 && ib < 21e-6, 'Ib ≈ 20 µA');
// KCL: Ie = Ic + Ib with Ic ≈ βIb ⇒ α = β/(β+1)
const e = emCurrents(n0, c.vbe, 5); rel(e.ic / (e.ic + e.ib), 100 / 101, 1e-5, 'alpha');
for (const v of [loadLinePoint(n0, 1e-3, 0, 1000), loadLinePoint(n0, 1e-3, 10, 0), loadLinePoint(n0, 20e-6, 10, 1e9)])
  assert.ok(Number.isFinite(v.ic) && Number.isFinite(v.vce), 'finite');
console.log('bjt-lab: all tests passed');
