import assert from 'node:assert/strict';
import { ocv, socFromOcv, ocvSlope, arrhenius, discharge, charge, r0, TAU1, R1_FRAC } from '../../src/sims/models/lipo-lab.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b} (±${tol})`);

// OCV table endpoints and monotonicity / invertibility
close(ocv(0), 3.0, 1e-9); close(ocv(1), 4.2, 1e-9); close(ocv(0.5), 3.77, 1e-9);
for (let s = 0; s < 1; s += 0.01) assert.ok(ocv(s + 0.01) > ocv(s), 'OCV monotonic');
for (const s of [0.07, 0.33, 0.5, 0.81]) close(socFromOcv(ocv(s)), s, 1e-6, 'inverse OCV');
assert.ok(ocvSlope(0.5) < ocvSlope(0.02), 'plateau is flatter than the knee');

// Arrhenius: 1 at 25 °C, ~2.5x at 0 °C
close(arrhenius(25), 1, 1e-12); close(arrhenius(0), Math.exp(3000 * (1 / 273.15 - 1 / 298.15)), 1e-12);
assert.ok(arrhenius(0) > 2.3 && arrhenius(0) < 2.7);

const p = { capacity: 2, rint: 0.05, temp: 25 };
// Instantaneous IR drop at 1C = I·R0
const d1 = discharge(p, 1);
close(d1.drop0, 2 * r0(p, 1), 1e-12, 'IR step');
close(d1.v0, 4.2 - 2 * r0(p, 1), 1e-12);

// Near-zero rate & resistance: delivers ~full capacity and energy = Q·mean(OCV)
const slow = discharge({ capacity: 2, rint: 1e-4, temp: 25 }, 0.01);
close(slow.ahOut, 2, 0.02, 'C/100 capacity');
let mean = 0; for (let k = 0; k < 10000; k++) mean += ocv((k + 0.5) / 10000) / 10000;
close(slow.whOut, 2 * mean, 0.03, 'C/100 energy');

// Higher C-rate => less capacity and lower average voltage (Peukert-like rate capacity effect)
const caps = [0.2, 0.5, 1, 2, 3].map(c => discharge(p, c));
for (let k = 1; k < caps.length; k++) { assert.ok(caps[k].ahOut < caps[k - 1].ahOut); assert.ok(caps[k].vAvg < caps[k - 1].vAvg); }
// Cold => less capacity
assert.ok(discharge({ ...p, temp: 0 }, 1).ahOut < d1.ahOut);
assert.ok(discharge({ ...p, temp: -20 }, 1).ahOut < discharge({ ...p, temp: 0 }, 1).ahOut);

// Energy balance: chemical = delivered + I²R heat + energy still stored on C1
for (const d of [d1, caps[3]]) {
  const lhs = d.chemJ, rhs = d.whOut * 3600 + d.heatJ + d.c1EndJ;
  assert.ok(Math.abs(lhs - rhs) / lhs < 0.005, `energy balance ${lhs} vs ${rhs}`);
}
// Charge counted = ΔSoC·Q
close(d1.ahOut, (1 - d1.soc[d1.soc.length - 1]) * d1.qEff, 1e-9);

// CC/CV charge: reaches Vmax, terminates below I_term, ends nearly full, Vt never exceeds Vmax
const c = charge(p, 1, 4.2, 0.05);
assert.ok(c.terminated, 'charge terminates');
assert.ok(c.iEnd < 0.05 * 2 * 1.05, 'term current');
assert.ok(Math.max(...c.v) <= 4.2 + 1e-6, 'CV holds Vmax');
assert.ok(c.finalSoc > 0.97 && c.finalSoc < 1.01, 'full at end ' + c.finalSoc);
assert.ok(c.socAtCV > 0.6 && c.socAtCV < 0.9, 'CV starts around 70-85% at 1C: ' + c.socAtCV);
// The CV phase delivers ~20-30% of charge but takes a disproportionate share of time
const cvFracQ = 1 - c.socAtCV, cvFracT = (c.tTotal - c.tCC) / c.tTotal;
assert.ok(cvFracT > cvFracQ * 1.5, 'last part is slow');
close(c.ahIn, c.finalSoc * 2, 1e-6, 'coulomb count');
// Lower charge rate enters CV later
assert.ok(charge(p, 0.5).socAtCV > c.socAtCV);
// Charge energy balance: in = chemical + heat (+ residual in C1, small)
assert.ok(Math.abs(c.whIn * 3600 - c.chemJ - c.heatJ) / (c.whIn * 3600) < 0.01);
void TAU1; void R1_FRAC;
console.log('lipo-lab model: all tests passed', { ah1C: d1.ahOut.toFixed(3), wh1C: d1.whOut.toFixed(2), socAtCV: c.socAtCV.toFixed(3), tTotal_min: (c.tTotal / 60).toFixed(1), tCC_min: (c.tCC / 60).toFixed(1) });
