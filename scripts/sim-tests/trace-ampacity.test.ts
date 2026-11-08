import assert from 'node:assert/strict';
import { ipcCurrent, ipcWidthMm, areaMil2, traceElectrical, viaCapacity, rhoCu } from '../../src/sims/models/trace-ampacity.ts';
const close = (a: number, b: number, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);
// 1 oz = 1.378 mil; 10 mm wide -> 393.7 mil -> A = 542.5 mil²
close(areaMil2(10, 1), 393.70 * 1.378, 1e-3);
// IPC-2221 direct: 1 oz external, 10 °C rise, 10 mil² ... hand calc: 0.048*10^0.44*A^0.725
const A = areaMil2(0.5, 1); // 19.685 mil * 1.378 = 27.13 mil²
close(ipcCurrent(0.5, 1, 'external', 10), 0.048 * Math.pow(10, 0.44) * Math.pow(A, 0.725), 1e-9);
assert.ok(Math.abs(ipcCurrent(0.5, 1, 'external', 10) - 1.43) < 0.05); // known: ~1.4 A for 0.5 mm / 1 oz / 10 °C
// internal layers carry exactly half the current for the same geometry (k halves)
close(ipcCurrent(0.5, 1, 'internal', 10), ipcCurrent(0.5, 1, 'external', 10) / 2, 1e-9);
// inverse round-trips
close(ipcWidthMm(ipcCurrent(0.8, 2, 'external', 20), 2, 'external', 20), 0.8, 1e-9);
// 5 A on 1 oz external, 10 °C needs ≈ 2.77 mm (~109 mil)
const w5 = ipcWidthMm(5, 1, 'external', 10); assert.ok(w5 > 2.6 && w5 < 2.9, String(w5));
// same current on inner layer needs (2^(1/0.725)) = 2.6x the area
close(ipcWidthMm(5, 1, 'internal', 10) / w5, Math.pow(2, 1 / 0.725), 1e-9);
// current rises with ΔT^0.44
close(ipcCurrent(1, 1, 'external', 40) / ipcCurrent(1, 1, 'external', 10), Math.pow(4, 0.44), 1e-9);
// zero / invalid inputs are safe
assert.equal(ipcCurrent(0, 1, 'external', 10), 0); assert.equal(ipcWidthMm(0, 1, 'external', 10), 0);
// resistance: 1 oz (34.99 µm), 1 mm wide, 1 m long at 20 °C ≈ 0.49 Ω  (≈ 0.49 mΩ/mm)
const e = traceElectrical(1, 1, 1000, 1, 0, 20); close(e.R, 1.724e-8 / (1e-3 * 34.99e-6), 2e-3); assert.ok(Math.abs(e.R - 0.4927) < 0.002);
close(e.p, e.R); close(rhoCu(120) / rhoCu(20), 1 + 0.393, 1e-9);
// via: 0.3 mm drill, 25 µm plating -> area π*0.025*(0.275)... = 0.0216 mm²
const v = viaCapacity(0.3, 25, 10); close(v.aMm2, Math.PI * 0.025 * 0.275, 1e-9); assert.ok(v.I > 0.8 && v.I < 2.0, String(v.I));
console.log('trace-ampacity model: all tests passed');
