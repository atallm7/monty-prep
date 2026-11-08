import assert from 'node:assert/strict';
import { williamsBrown, totalCoverage, yieldModel } from '../../src/sims/models/yield-coverage.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);
// DL = 1 − Y^(1−T): no test -> DL = 1 − Y, perfect test -> 0
close(williamsBrown(0.95, 0), 0.05); close(williamsBrown(0.95, 1), 0); close(williamsBrown(1, 0.5), 0);
// textbook: Y=0.5, T=0.9 -> 1 − 0.5^0.1 = 0.06697
close(williamsBrown(0.5, 0.9), 1 - Math.pow(0.5, 0.1)); assert.ok(Math.abs(williamsBrown(0.5, 0.9) - 0.0670) < 1e-3);
// Y=0.95, T=0.9 -> 5126 DPPM
assert.ok(Math.abs(williamsBrown(0.95, 0.9) * 1e6 - 5116) < 15);
// total coverage of independent stages
close(totalCoverage([0.6, 0.8, 0.9]), 1 - 0.4 * 0.2 * 0.1);
const m = yieldModel({ Y: 0.95, aoi: 0.6, ict: 0.8, fct: 0.9, burnin: false, fieldCost: 200 });
close(m.T, 0.992); close(m.DL, 1 - Math.pow(0.95, 0.008));
// stage catches sum to start − escapes (conservation of boards)
close(m.rows.reduce((a, r) => a + r.caught, 0), m.startDefective - m.escapes, 1e-9);
assert.ok(m.rows.every(r => r.caught >= 0)); assert.equal(m.rows[3].caught, 0);
// rule of ten: repair cost at each later stage is 10x
close(m.rows[2].repairCostEach, 20); close(m.rows[1].repairCostEach, 2); close(m.rows[0].repairCostEach, 0.2);
// adding burn-in reduces escapes
const b = yieldModel({ Y: 0.95, aoi: 0.6, ict: 0.8, fct: 0.9, burnin: true, fieldCost: 200 }); assert.ok(b.escapes < m.escapes && b.T > m.T);
// no testing: all defects escape
const n = yieldModel({ Y: 0.9, aoi: 0, ict: 0, fct: 0, burnin: false, fieldCost: 100 });
close(n.DL, 0.1); close(n.escapes, 1000); close(n.testCost, 0); close(n.total, n.noTestField);
// more coverage never increases DL; edge Y values are finite
assert.ok(yieldModel({ Y: 0.8, aoi: 0.9, ict: 0, fct: 0, burnin: false, fieldCost: 1 }).DL < yieldModel({ Y: 0.8, aoi: 0.5, ict: 0, fct: 0, burnin: false, fieldCost: 1 }).DL);
assert.ok(Number.isFinite(yieldModel({ Y: 0, aoi: 1, ict: 1, fct: 1, burnin: true, fieldCost: 0 }).total));
console.log('yield-coverage model: all tests passed');
