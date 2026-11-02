import assert from 'node:assert/strict';
import { solve, rlOpt, pAtRlOpt, mismatchDb } from '../../src/sims/models/max-power-transfer.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// 10 V, 50 Ω source, 50 Ω load: P = Vs²/(4Rs) = 0.5 W, η = 50 %, VL = 5 V
const m = solve({ vs: 10, rs: 50, rl: 50, xs: 0, xl: 0 });
close(m.pl, 0.5); close(m.pmax, 0.5); close(m.eff, 0.5); close(m.vl, 5); close(m.i, 0.1); close(m.ps, 0.5);

// Numeric sweep: the maximum of P_L(RL) is at RL = Rs
let best = 0, bestR = 0;
for (let k = 0; k <= 40000; k++) { const rl = 10 ** (-1 + k * 5 / 40000); const p = solve({ vs: 10, rs: 50, rl, xs: 0, xl: 0 }).pl; if (p > best) { best = p; bestR = rl; } }
close(bestR, 50, 1e-3); close(best, 0.5, 1e-9);

// RL = 3·Rs: η = 75 %, P = Vs²·3Rs/(4Rs)² = 0.375 W (75 % of max)
const h = solve({ vs: 10, rs: 50, rl: 150, xs: 0, xl: 0 });
close(h.eff, 0.75); close(h.pl, 0.375); close(h.ratio, 0.75);

// Conjugate match: Zs = 50 + j30, ZL = 50 − j30 → P = Pmax
close(solve({ vs: 10, rs: 50, rl: 50, xs: 30, xl: -30 }).pl, 0.5);
// Not conjugate: XL = +30 → P lower
assert.ok(solve({ vs: 10, rs: 50, rl: 50, xs: 30, xl: 30 }).pl < 0.5);
// XL fixed at 0 with Xs = 40: best RL = √(50² + 40²) = 64.03 Ω
close(rlOpt(50, 40, 0), Math.hypot(50, 40));
best = 0; bestR = 0;
for (let k = 0; k <= 40000; k++) { const rl = 1 + k * 0.005; const p = solve({ vs: 10, rs: 50, rl, xs: 40, xl: 0 }).pl; if (p > best) { best = p; bestR = rl; } }
close(bestR, Math.hypot(50, 40), 1e-3); close(pAtRlOpt(10, 50, 40, 0), best, 1e-6);
assert.ok(best < 0.5);
// mismatch loss: half power = −3.01 dB
close(mismatchDb(0.25, 0.5), -3.0103, 1e-4);
// Edge cases: RL = 0 → P = 0, short-circuit current Vs/Rs
const sc = solve({ vs: 10, rs: 50, rl: 0, xs: 0, xl: 0 }); close(sc.pl, 0); close(sc.i, 0.2); close(sc.eff, 0);
assert.ok(!Number.isNaN(solve({ vs: 10, rs: 0, rl: 0, xs: 0, xl: 0 }).pl));
console.log('max-power-transfer model: all tests passed');
