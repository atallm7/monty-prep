import assert from 'node:assert/strict';
import { zReal, zIdeal, srf, mag, phaseDeg, usefulUpTo, behaviour } from '../../src/sims/models/impedance-explorer.ts';
import type { ImpIn } from '../../src/sims/models/impedance-explorer.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);
const near = (a: number, b: number, eps: number) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} ±${eps}`);

const base: ImpIn = { part: 'capacitor', c: 100e-9, l: 10e-6, r: 1000, esr: 0.02, esl: 1e-9, cp: 5e-12, rcore: 20e3 };

// Capacitor: 100 nF + 1 nH → SRF = 1/(2π√(LC)) = 15.915 MHz; |Z(SRF)| = ESR exactly
const c = { ...base };
close(srf(c), 1 / (2 * Math.PI * Math.sqrt(1e-9 * 100e-9)));
close(srf(c), 15.9155e6, 1e-4);
close(mag(zReal(c, srf(c))), 0.02, 1e-6);
near(phaseDeg(zReal(c, srf(c))), 0, 1e-6);
// well below SRF it is an ideal capacitor: |Z| = 1/(2πfC) = 1591.5 Ω at 1 kHz
close(mag(zReal(c, 1e3)), 1 / (2 * Math.PI * 1e3 * 100e-9), 1e-4);
close(mag(zIdeal(c, 1e3)), 1591.549, 1e-5);
// well above SRF it looks like the ESL: |Z| ≈ 2πf·ESL
close(mag(zReal(c, 1e9)), 2 * Math.PI * 1e9 * 1e-9, 1e-3);
assert.equal(behaviour(zReal(c, 1e9)), 'inductive');
assert.equal(behaviour(zReal(c, 1e3)), 'capacitive');
// stops behaving like a C before the SRF (10% deviation at f ≈ SRF/√11 for the ESL term)
const fu = usefulUpTo(c, 1e2, 1e10);
assert.ok(fu < srf(c) && fu > srf(c) / 5, `useful-up-to ${fu}`);

// Inductor: 10 µH, DCR 50 mΩ, Cp 5 pF → parallel SRF ≈ 1/(2π√(LCp)) = 22.5 MHz
const l: ImpIn = { ...base, part: 'inductor', esr: 0.05 };
close(srf(l), Math.sqrt(1 / (10e-6 * 5e-12) - (0.05 / 10e-6) ** 2) / (2 * Math.PI));
close(srf(l), 22.508e6, 1e-3);
// at the SRF the parallel tank impedance is real: Rcore ∥ (L/(Cp·DCR))  (high-Q approximation)
const zl = zReal(l, srf(l));
near(phaseDeg(zl), 0, 1e-4);
const rTank = 10e-6 / (5e-12 * 0.05);
close(mag(zl), (rTank * 20e3) / (rTank + 20e3), 1e-3);
// DC: inductor = DCR (∥ Rcore)
close(mag(zReal(l, 1e-3)), (0.05 * 20e3) / (0.05 + 20e3), 1e-6);
// above SRF it is capacitive
assert.equal(behaviour(zReal(l, 1e9)), 'capacitive');

// Resistor 1 kΩ with 1 nH + 0.2 pF: R > √(L/C) = 70.7 Ω → no resonance, rolls off at 1/(2πRC)
const r: ImpIn = { ...base, part: 'resistor', r: 1000, esl: 1e-9, cp: 0.2e-12 };
assert.equal(srf(r), Infinity);
close(mag(zReal(r, 10)), 1000, 1e-9);
const fc = 1 / (2 * Math.PI * 1000 * 0.2e-12);
assert.ok(mag(zReal(r, fc)) < 800 && mag(zReal(r, fc)) > 650, `|Z(fc)| ${mag(zReal(r, fc))}`);
// low-value resistor 1 Ω: inductive, |Z| doubles-ish at f = R/(2πL)
const r1: ImpIn = { ...r, r: 1 };
close(mag(zReal(r1, 1 / (2 * Math.PI * 1e-9))), Math.SQRT2, 1e-3);
assert.ok(isFinite(srf(r1)));

// No NaN on edge cases
for (const p of [c, l, r, { ...c, esl: 0 }, { ...l, cp: 0 }, { ...r, cp: 0, esl: 0 }]) for (const f of [1e-3, 1, 1e6, 1e11]) assert.ok(!Number.isNaN(mag(zReal(p, f))));
console.log('impedance-explorer model: all tests passed');
