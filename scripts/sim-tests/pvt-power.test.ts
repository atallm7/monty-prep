import assert from 'node:assert/strict';
import { pdyn, leakage, fmax, power, steadyTj, throttle, dvfsTable, vt } from '../../src/sims/models/pvt-power.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// P = αCV²f
close(pdyn(0.15, 15e-9, 0.9, 2e9), 0.15 * 15e-9 * 0.81 * 2e9);
close(pdyn(0.1, 1e-9, 1, 2e9) / pdyn(0.1, 1e-9, 1, 1e9), 2);         // ∝ f
close(pdyn(0.1, 1e-9, 1.2, 1e9) / pdyn(0.1, 1e-9, 0.6, 1e9), 4);     // ∝ V²
// calibration points
close(fmax(0.9, 25, 'tt'), 2.6e9, 1e-9);
close(leakage(0.9, 25, 'tt').iSub, 0.30, 1e-9);
// Vt drops with temperature; FF has lower Vt than SS
assert.ok(vt(100, 'tt') < vt(25, 'tt')); assert.ok(vt(25, 'ff') < vt(25, 'tt') && vt(25, 'tt') < vt(25, 'ss'));
// leakage grows ~exponentially with T (factor 3-10 per 60 K) and is ordered by corner
const l25 = leakage(0.9, 25, 'tt').p, l85 = leakage(0.9, 85, 'tt').p;
assert.ok(l85 / l25 > 3 && l85 / l25 < 10, `ratio ${l85 / l25}`);
assert.ok(leakage(0.9, 25, 'ff').p > l25 && l25 > leakage(0.9, 25, 'ss').p);
// f_max rises with V; corners ordered; zero below threshold
assert.ok(fmax(1.0, 25, 'tt') > fmax(0.8, 25, 'tt'));
assert.ok(fmax(0.9, 25, 'ff') > fmax(0.9, 25, 'tt') && fmax(0.9, 25, 'tt') > fmax(0.9, 25, 'ss'));
assert.equal(fmax(0.3, 25, 'tt'), 0);
// temperature inversion: at high V hot is slower, at low V hot is faster
assert.ok(fmax(1.0, 125, 'tt') < fmax(1.0, -40, 'tt'));
assert.ok(fmax(0.55, 125, 'tt') > fmax(0.55, -40, 'tt'));
// steady-state Tj solves Tj = Ta + θ·P(Tj)
const op = { v: 0.9, f: 2e9, alpha: 0.15, c: 15e-9, corner: 'tt' as const };
const tj = steadyTj(op, 25, 10)!; close(tj, 25 + 10 * power(op, tj).total, 1e-6);
assert.ok(tj > 25 + 10 * power(op, 25).total); // leakage feedback raises Tj above the cold estimate
assert.equal(steadyTj(op, 25, 30), null);       // positive feedback with no root: thermal runaway
assert.equal(steadyTj({ ...op, f: 0, v: 0 }, 40, 10), 40);
// throttling: unthrottled at θ = 16 runs away; the governor holds Tj near the limit and lowers average f
const base = { op, ta: 25, theta: 16, cth: 0.5, tLimit: 95, hyst: 5, tEnd: 40 };
const free = throttle({ ...base, enabled: false }); assert.ok(free.runaway || free.peakTj > 150);
const gov = throttle({ ...base, enabled: true });
assert.ok(!gov.runaway && gov.peakTj < 100, `peak ${gov.peakTj}`); assert.ok(gov.avgF < op.f);
// thermal RC: with leakage off (v tiny f fixed) Tj after one τ reaches 63.2% of the rise -> check with a constant-power case
const rc = throttle({ op: { v: 0.9, f: 2e9, alpha: 0.15, c: 15e-9, corner: 'ss' }, ta: 25, theta: 2, cth: 1, tLimit: 200, hyst: 5, enabled: false, tEnd: 2, dt: 0.0005 });
const k = rc.t.findIndex(t => t >= 2 - 1e-9); const rise = rc.tj[k] - 25; const final = 2 * power({ v: 0.9, f: 2e9, alpha: 0.15, c: 15e-9, corner: 'ss' }, rc.tj[k]).total;
assert.ok(Math.abs(rise / final - 0.632) < 0.02, `rise ratio ${rise / final}`);
// DVFS: energy per operation falls as V is lowered (≈ αCV² + leakage/f)
const tab = dvfsTable('tt', 25, 0.15, 15e-9);
for (let i = 1; i < tab.length; i++) assert.ok(tab[i].energy > tab[i - 1].energy);
console.log('pvt-power model: all tests passed');
