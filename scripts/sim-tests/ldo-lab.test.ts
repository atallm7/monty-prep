import assert from 'node:assert/strict';
import { operatingPoint, outputAt, psrr, maxCurrentThermal, type LdoIn } from '../../src/sims/models/ldo-lab.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} != ${b}`);
const p: LdoIn = { vin: 5, vout: 3.3, iout: 0.2, vdo: 0.2, iq: 50e-6, theta: 60, ta: 25 };
let o = operatingPoint(p);
close(o.vo, 3.3, 1e-12, 'regulates'); assert.ok(!o.dropout);
// efficiency ≈ Vout/Vin = 66 %
close(o.eff, 3.3 * 0.2 / (5 * 0.20005), 1e-12); close(o.eff, 0.66, 1e-3, 'η ≈ Vout/Vin');
// Pd = 1.7 V·0.2 A + 5 V·50 µA = 0.34025 W; Tj = 25 + 60·0.34025 = 45.4 °C
close(o.pd, 0.34025, 1e-9, 'Pd'); close(o.tj, 25 + 60 * 0.34025, 1e-9, 'Tj');
// dropout: Vin = 3.4 V < 3.3 + 0.2 → Vout = 3.4 − 0.2 = 3.2 V
o = operatingPoint({ ...p, vin: 3.4 }); assert.ok(o.dropout); close(o.vo, 3.2, 1e-9, 'dropout tracking');
close(o.vinMin, 3.5, 1e-12, 'Vin,min = Vout + Vdo');
// PMOS dropout scales with load: half the load → half the dropout
close(outputAt(p, 3.4, 0.1).vo, 3.3, 1e-12); close(outputAt(p, 3.3, 0.1).vo, 3.2, 1e-9);
// divider: Vref = 0.8 V, R2 = 100k → R1 = 312.5k for 3.3 V
close(operatingPoint(p).r1, 312.5e3, 1e-9, 'R1');
// thermal limit: Pd,max = (125−25)/60 = 1.667 W → Imax ≈ 1.667/1.7 ≈ 0.98 A
close(maxCurrentThermal(p), (100 / 60 - 5 * 50e-6) / 1.7, 1e-9);
// PSRR: high at low frequency (≈ loop gain + divider), falls around the loop crossover, collapses in dropout
const lo = psrr(p, 10), mid = psrr(p, 300e3);
assert.ok(lo > 60, `low-f PSRR ${lo}`); assert.ok(mid < lo - 20, `mid-f PSRR dips ${mid}`);
assert.ok(psrr({ ...p, vin: 3.45 }, 10) < 25, 'dropout kills PSRR');
console.log('ldo-lab model: all tests passed');
