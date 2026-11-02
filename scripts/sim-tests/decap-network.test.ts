import assert from 'node:assert/strict';
import { zPdn, zGroup, magC, srfOf, extremes, violations, meetsUpTo, preset, hfInductance, totalC } from '../../src/sims/models/decap-network.ts';
import type { Group, Pdn } from '../../src/sims/models/decap-network.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} != ${b} (tol ${tol})`);

const g = (c: number, n: number, esr: number, esl: number, lmnt = 0): Group => ({ name: 'x', c, n, esr, esl, lmnt, on: true });
const only = (...groups: Group[]): Pdn => ({ vrm: { r: 1e-3, l: 20e-9, on: false }, groups });

// Single 100 nF, 0.4 nH + 0.6 nH mounting: SRF = 1/(2π√(1 nH·100 nF)) = 15.9 MHz, |Z(SRF)| = ESR
const one = g(100e-9, 1, 0.02, 0.4e-9, 0.6e-9);
close(srfOf(one), 15.915e6, 1e-4);
close(magC(zPdn(only(one), srfOf(one))), 0.02, 1e-6);
// mounting inductance moves the SRF: with 0.4 nH only → √(1/0.4) higher
close(srfOf(g(100e-9, 1, 0.02, 0.4e-9)) / srfOf(one), Math.sqrt(1 / 0.4), 1e-9);

// N identical caps in parallel: impedance divides by N at every frequency
for (const f of [1e4, 1e6, 15.9e6, 1e8]) close(magC(zPdn(only(g(100e-9, 10, 0.02, 1e-9)), f)), magC(zGroup(g(100e-9, 1, 0.02, 1e-9), f)) / 10, 1e-9);

// Anti-resonance between 100 µF (L1 = 5 nH) and 10 nF (L2 = 0.2 nH):
// f_ar ≈ 1/(2π√(L1·C2)) = 22.5 MHz (well-separated values so the approximation holds)
const big = g(100e-6, 1, 0.005, 5e-9), small = g(10e-9, 1, 0.005, 0.2e-9);
const pk = extremes(only(big, small), 1e4, 1e9).peaks;
assert.equal(pk.length, 1, 'one anti-resonance');
const far = 1 / (2 * Math.PI * Math.sqrt(5e-9 * 10e-9));
close(pk[0].f, far, 0.05);
close(pk[0].z, (5e-9 / 10e-9) / (0.005 + 0.005), 0.1); // (L1/C2)/(R1+R2) = 50 Ω
// The combined impedance there is far higher than either cap alone
assert.ok(pk[0].z > 10 * magC(zGroup(big, pk[0].f)));

// Below every SRF the network is the total capacitance; above, the parallel inductance
const p = only(g(1e-6, 2, 0.01, 1e-9), g(100e-9, 4, 0.02, 1e-9));
close(totalC(p), 2.4e-6, 1e-12);
close(magC(zPdn(p, 100)), 1 / (2 * Math.PI * 100 * 2.4e-6), 1e-3);
close(hfInductance(p), 1e-9 / 6, 1e-12);
close(magC(zPdn(p, 5e9)), 2 * Math.PI * 5e9 * 1e-9 / 6, 1e-2);

// Presets: mixed values meet 50 mΩ from 10 kHz to >100 MHz; single cap and far placement don't
const zt = 0.05;
assert.ok(meetsUpTo(preset('mixed'), zt, 1e4, 1e9) > 100e6);
assert.ok(violations(preset('single'), zt, 1e4, 1e9).length >= 1);
assert.ok(meetsUpTo(preset('far-placement'), zt, 1e4, 1e9) < 20e6);
assert.ok(hfInductance(preset('far-placement')) > 2.5 * hfInductance(preset('mixed')));
// VRM alone at DC = R_vrm
close(magC(zPdn({ vrm: { r: 1e-3, l: 20e-9, on: true }, groups: [] }, 1e-3)), 1e-3, 1e-6);
// No NaN with everything off
assert.ok(!Number.isNaN(magC(zPdn({ vrm: { r: 1e-3, l: 1e-9, on: false }, groups: [] }, 1e6))));
console.log('decap-network model: all tests passed');
