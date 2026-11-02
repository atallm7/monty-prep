import assert from 'node:assert/strict';
import { simulateSoc, driveCycleC, T_TOTAL } from '../../src/sims/models/soc-estimator.ts';
import { ocv } from '../../src/sims/models/lipo-lab.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} != ${b} (±${tol})`);

// Perfect sensors: coulomb counting tracks truth exactly; OCV lookup at power-up is exact
const ideal = simulateSoc({ offset: 0, gainErr: 0, vErr: 0 });
close(ideal.final.cc, ideal.final.true, 1e-6, 'ideal CC');
close(ideal.cc[0], 0.9, 1e-6, 'ideal start');
close(ideal.final.blend, ideal.final.true, 2e-3, 'ideal blend');

// Net Ah equals integral of the drive cycle
let ah = 0; for (let t = 0; t < T_TOTAL; t++) ah += driveCycleC(t) * 2 / 3600;
close(ideal.ahNet, ah, 1e-9, 'net Ah');
assert.ok(ideal.final.true > 0.2 && ideal.final.true < 0.5, 'cycle spans the flat plateau: ' + ideal.final.true);

// Offset only: CC error = −I_off·t/(3600·Q)  (2.33 h × 10 mA / 2 Ah = −1.17 %)
const off = simulateSoc({ offset: 0.01, gainErr: 0, vErr: 0 });
const expOff = -0.01 * T_TOTAL / 3600 / 2;
close(off.final.cc - off.final.true, expOff, 1e-6, 'offset drift');
close(off.predictedCcErr, expOff, 1e-12);
// Gain only: CC error = −ε·Ah_net/Q
const g = simulateSoc({ offset: 0, gainErr: 0.03, vErr: 0 });
close(g.final.cc - g.final.true, -0.03 * g.ahNet / 2, 1e-6, 'gain drift');

// OCV lookup: correct after a long rest, badly wrong under a 2C load
const lastRest = ideal.rests[ideal.rests.length - 1];
assert.ok(lastRest && lastRest.to - lastRest.from >= 600, 'final park is a detected rest');
close(ideal.final.ocv, ideal.final.true, 0.01, 'OCV at rest');
const k2C = ideal.i.findIndex(i => i > 3.9);   // 2C pulse (Q = 2 Ah)
assert.ok(Math.abs(ideal.ocvEst[k2C] - ideal.trueSoc[k2C]) > 0.08, 'OCV lookup under load is far off');
// and the error has the sign predicted by δSoC ≈ −I·R/slope (reads LOW under discharge)
assert.ok(ideal.ocvEst[k2C] < ideal.trueSoc[k2C]);

// Blended estimator beats pure coulomb counting with a big offset, and corrections happened at rests
const bad = simulateSoc({ offset: 0.03, gainErr: 0.02, vErr: 0.003 });
assert.ok(bad.corrections.length >= 4, 'corrections at each park');
assert.ok(Math.abs(bad.final.blend - bad.final.true) < Math.abs(bad.final.cc - bad.final.true) / 2, `blend ${bad.final.blend - bad.final.true} vs cc ${bad.final.cc - bad.final.true}`);
for (const c of bad.corrections) assert.ok(c.k > 0 && c.k <= 1);
// Rest detection fails if the offset exceeds the rest threshold (C/50 = 40 mA): no OCV corrections
assert.ok(simulateSoc({ offset: 0.06, gainErr: 0 }).corrections.length === 0);
// A voltage bias costs more SoC in the flat region: 5 mV / slope
const vb = simulateSoc({ offset: 0, gainErr: 0, vErr: 0.005 });
assert.ok(vb.final.ocv - vb.final.true > 0.004, 'bias on plateau');
void ocv;
console.log('soc-estimator model: all tests passed', { ccErrOffset: expOff.toFixed(4), blendBad: (bad.final.blend - bad.final.true).toFixed(4), ccBad: (bad.final.cc - bad.final.true).toFixed(4), finalSoc: ideal.final.true.toFixed(3) });
