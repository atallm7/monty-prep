import assert from 'node:assert/strict';
import { outputDC, outputWave, inputSim, contention, fetI, fetV, debounce, bounceEdges, DRIVES } from '../../src/sims/models/gpio-lab.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);

// ---- output stage
const base = { vdd: 3.3, mode: 'pushpull' as const, level: 1 as const, rpu: 4700, usePu: false, rl: 1000, useRl: true, cl: 50e-12, drive: 'medium' as const, otherLow: false };
const d = DRIVES.medium;
// push-pull high into 1 kΩ: divider VDD·RL/(RL+RonP)
close(outputDC(base).v, 3.3 * 1000 / (1000 + d.ronP));
// open-drain high with 4.7k pull-up into 1k load: 3.3·1k/5.7k = 0.579 V → open-drain can't drive loads high
const od = outputDC({ ...base, mode: 'opendrain', usePu: true });
close(od.v, 3.3 * 1000 / 5700); assert.equal(od.pOn, false);
// open-drain high with no pull-up and no load = floating
assert.ok(outputDC({ ...base, mode: 'opendrain', useRl: false }).floating);
// open-drain low with pull-up: VOL = VDD·(RonN‖RL)/(Rpu + RonN‖RL)
const odl = outputDC({ ...base, mode: 'opendrain', usePu: true, level: 0 });
const par = (a: number, b: number) => a * b / (a + b);
close(odl.v, 3.3 * par(d.ronN, 1000) / (4700 + par(d.ronN, 1000)));
// rise time: OD τ = (Rpu‖RL)·C vs PP τ = (RonP‖RL)·C
close(outputDC({ ...base, mode: 'opendrain', usePu: true, useRl: false }).tau, 4700 * 50e-12);
// wired-AND contention: push-pull driving high while another device pulls low
assert.ok(outputDC({ ...base, otherLow: true }).contention);
assert.ok(!outputDC({ ...base, mode: 'opendrain', usePu: true, otherLow: true }).contention);
const w = outputWave({ ...base, useRl: false, usePu: true }, 1e6, 1, 1000);
// after T/2 = 500 ns the push-pull edge (τ = 3 ns) is fully high; open drain (τ = 235 ns) is at 1−e^(−2.13) ≈ 88 %
assert.ok(w.pp[499] > 3.29); assert.ok(Math.abs(w.od[500] / 3.3 - (1 - Math.exp(-500e-9 / 235e-9))) < 0.01);

// ---- FET model: small-signal Ron at the origin, saturation current
close((fetI(1e-4, 50, 0.02)) / 1e-4, 1 / 50, 1e-3);
close(fetI(2 * 0.02 * 50, 50, 0.02), 0.02);
close(fetV(fetI(0.7, 50, 0.02), 50, 0.02), 0.7, 1e-9);

// ---- contention: equal-strength fight with Rs = 0 lands mid-ish and draws ~Isat-level current
const c = contention({ vdd: 3.3, aHigh: true, bHigh: false, driveA: 'strong', driveB: 'strong', rs: 0 });
assert.ok(c.fight && c.i > 0.03 && c.i < 0.08, String(c.i));
close(c.vdsP + c.vdsN, 3.3, 1e-9);
// KVL with a 330 Ω series resistor: current ≈ VDD/(Rs + RonP + RonN) when both FETs stay in triode
const cr = contention({ vdd: 3.3, aHigh: true, bHigh: false, driveA: 'strong', driveB: 'strong', rs: 330 });
close(cr.vdsP + cr.i * 330 + cr.vdsN, 3.3, 1e-9);
assert.ok(Math.abs(cr.i - 3.3 / (330 + 28 + 22)) / cr.i < 0.03);
assert.equal(contention({ vdd: 3.3, aHigh: true, bHigh: true, driveA: 'weak', driveB: 'weak', rs: 0 }).i, 0);
// energy balance: VDD·I = P_P + P_N + P_Rs
close(3.3 * cr.i, cr.pP + cr.pN + cr.pRs, 1e-9);

// ---- floating input: leakage ramp rate = Ileak/C, coupling kick = VDD·Cc/(Cc+Cin)
const f = inputSim({ vdd: 3.3, pull: 'none', rpull: 40e3, ileak: 10e-9, cin: 5e-12, cc: 1e-12, fagg: 1e3, v0: 1.0, periods: 1 });
close(f.kick, 3.3 * 1 / 6);
// first half-period: linear ramp 10 nA / 6 pF = 1667 V/s, clamped at VDD + 0.3
const k = f.t.findIndex(t => t >= 0.2e-3);
close(f.v[k], Math.min(3.6, 1.0 + 10e-9 / 6e-12 * f.t[k]), 1e-6);
assert.ok(f.toggles >= 1);
// pulled-up input: settles at VDD + Ileak·R and rejects small coupling (no toggles)
const pu = inputSim({ vdd: 3.3, pull: 'up', rpull: 40e3, ileak: 0, cin: 5e-12, cc: 0.5e-12, fagg: 1e3, v0: 3.3, periods: 3 });
assert.equal(pu.toggles, 0); close(pu.tau, 40e3 * 5.5e-12);
// but a big coupling cap glitches even a pulled-up input: kick = 3.3·5/10 = 1.65 V < VIL? 3.3 − 1.65 = 1.65 > 0.99 → no; 10 pF: 2.2 V kick → 1.1 V… still above
const big = inputSim({ vdd: 3.3, pull: 'up', rpull: 40e3, ileak: 0, cin: 5e-12, cc: 30e-12, fagg: 1e3, v0: 3.3, periods: 2 });
assert.ok(big.toggles >= 2, String(big.toggles));

// ---- debounce: bounce produces many raw edges; RC+Schmitt and software counter produce exactly 2 (press + release)
const edges = bounceEdges(2e-3, 22e-3, 2e-3);
assert.ok(edges.length > 4 && edges.length % 2 === 0);
const dbBase = { vdd: 3.3, tb: 2e-3, r1: 10e3, r2: 1e3, c: 1e-6, schmitt: true, tsamp: 1e-3, nstable: 5, noise: 0.03 };
const none = debounce({ ...dbBase, method: 'none' });
assert.ok(none.rawEdges > 4); assert.equal(none.outEdges, none.rawEdges);
assert.equal(debounce({ ...dbBase, method: 'rc' }).outEdges, 2);
assert.equal(debounce({ ...dbBase, method: 'sw' }).outEdges, 2);
console.log('gpio-lab model: all tests passed');
