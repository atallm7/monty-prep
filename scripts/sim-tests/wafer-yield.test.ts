import assert from 'node:assert/strict';
import { layoutDies, grossApprox, yPoisson, yMurphy, yNegBin, waferYield, scatterDefects } from '../../src/sims/models/wafer-yield.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
// yield models at A·D = 1
close(yPoisson(1, 1), Math.exp(-1));
close(yMurphy(1, 1), ((1 - Math.exp(-1)) / 1) ** 2);
close(yNegBin(1, 1, 2), Math.pow(1.5, -2));
close(yMurphy(1, 0), 1); close(yPoisson(2, 0), 1);
// negative binomial -> Poisson as alpha -> inf; clustering raises yield
assert.ok(Math.abs(yNegBin(1, 1, 1e6) - Math.exp(-1)) < 1e-5);
assert.ok(yNegBin(1, 1, 1) > yPoisson(1, 1));
// dies per wafer: all dies inside usable circle, count near analytic approximation
const lay = layoutDies(300, 10, 10, 3);
for (const d of lay.dies) for (const [x, y] of [[d.x0, d.y0], [d.x0 + d.w, d.y0], [d.x0, d.y0 + d.h], [d.x0 + d.w, d.y0 + d.h]]) assert.ok(Math.hypot(x, y) <= 147 + 1e-9);
const approx = grossApprox(300, 3, 100);
assert.ok(Math.abs(lay.dies.length - approx) / approx < 0.06, `${lay.dies.length} vs ${approx}`);
assert.ok(lay.dies.length > 560 && lay.dies.length < 660);
// smaller die => more dies; bigger die => much worse yield and cost
assert.ok(layoutDies(300, 2, 2, 3).dies.length > 10 * lay.dies.length);
const big = waferYield({ wafer: 300, dieW: 25, dieH: 24, D0: 0.1, alpha: 2, waferCost: 10000, edge: 3, seed: 1 });
const small = waferYield({ wafer: 300, dieW: 10, dieH: 10, D0: 0.1, alpha: 2, waferCost: 10000, edge: 3, seed: 1 });
assert.ok(big.costP > 10 * small.costP);
assert.ok(big.yP < small.yP);
// reproducibility
const a = scatterDefects(147, 0.5, 42), b = scatterDefects(147, 0.5, 42);
assert.deepEqual(a, b);
assert.notDeepEqual(a, scatterDefects(147, 0.5, 43));
// simulated yield approaches Poisson on average
let tot = 0; const N = 40;
for (let s = 1; s <= N; s++) tot += waferYield({ wafer: 300, dieW: 10, dieH: 10, D0: 0.5, alpha: 2, waferCost: 1, edge: 3, seed: s }).simYield;
assert.ok(Math.abs(tot / N - Math.exp(-0.5)) < 0.03, `${tot / N}`);
// no defects -> all good
assert.equal(waferYield({ wafer: 300, dieW: 10, dieH: 10, D0: 0, alpha: 2, waferCost: 1, edge: 3, seed: 1 }).good, lay.dies.length);
console.log('wafer-yield model: all tests passed');
