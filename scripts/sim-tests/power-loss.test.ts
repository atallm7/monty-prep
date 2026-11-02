import assert from 'node:assert/strict';
import { transmit, lossScale } from '../../src/sims/models/power-loss.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// 100 W at 12 V through 0.5 Ω: I = 8.333 A, loss = 34.72 W, efficiency 74.2 %
let r = transmit({ p: 100, rw: 0.5, v: 12 });
close(r.i, 100 / 12); close(r.pLoss, (100 / 12) ** 2 * 0.5); close(r.eff, 100 / (100 + r.pLoss));
close(r.vSource, 12 + (100 / 12) * 0.5);
// loss = ΔV²/Rw = I²Rw (same thing), but NOT V²/Rw
close(r.pLoss, r.dv * r.dv / 0.5); close(r.wrongLoss, 288);
// 10x the voltage -> 1/100 the loss
const r10 = transmit({ p: 100, rw: 0.5, v: 120 });
close(r10.pLoss / r.pLoss, 0.01); close(lossScale(10), 0.01);
// 120 V household: 100 W -> 0.833 A
close(r10.i, 100 / 120);
// source convention: V·I − I²R = P. 12 V, 0.5 Ω, 50 W -> I = (12 − √(144 − 100))/1 = 5.367 A
const s = transmit({ p: 50, rw: 0.5, v: 12, mode: 'source' });
close(s.i, 12 - Math.sqrt(44)); close(s.vLoad * s.i, 50); close(s.vSource, 12);
// power balance in source mode
close(s.vSource * s.i, 50 + s.pLoss);
// infeasible: 100 W from 12 V through 0.5 Ω exceeds Pmax = 144/2 = 72 W
const bad = transmit({ p: 100, rw: 0.5, v: 12, mode: 'source' });
assert.equal(bad.feasible, false); close(bad.pMax, 72);
// at max power transfer efficiency = 50 %
close(bad.eff, 0.5);
// edge cases
const z = transmit({ p: 100, rw: 0, v: 12 }); close(z.pLoss, 0); close(z.eff, 1);
assert.ok(!Number.isNaN(transmit({ p: 0, rw: 0.5, v: 12 }).eff));
console.log('power-loss model: all tests passed');
