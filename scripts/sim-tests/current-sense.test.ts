import assert from 'node:assert/strict';
import { currentSense, e24Below } from '../../src/sims/models/current-sense.ts';
const close = (a: number, b: number, tol = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} != ${b}`);

// Defaults: 5 A, 10 mΩ, G = 50, 12-bit, 3.3 V
const r = currentSense({ imax: 5, imin: 0.01, rsense: 0.01, gain: 50, bits: 12, vref: 3.3, side: 'low', amp: 'ina180' });
close(r.vsense, 0.05, 1e-12, 'Vsense = I·R');
close(r.pRs, 0.25, 1e-12, 'P = I²R');
close(r.lsb, 3.3 / 4096, 1e-12, 'LSB');
close(r.ilsb, 3.3 / 4096 / 0.5, 1e-12, 'mA/LSB = 1.611 mA');
assert.ok(Math.abs(r.ilsb - 1.611e-3) < 1e-6);
assert.equal(r.clipped, false); // 2.5 V < 3.27 V
close(r.vampIdeal, 50 * (0.05 + 150e-6), 1e-12);
close(r.gIdeal, 0.9 * 3.27 / 0.05, 1e-9, 'gain for 90% FS');
assert.equal(r.gRec, 50);
close(r.iminLsb, 0.01 / r.ilsb, 1e-12); // ≈ 6.2 LSB
close(r.ioffset, 150e-6 / 0.01, 1e-12, 'offset referred to current = 15 mA');
// Low-side: common mode ≈ I·R (OK); ground shift 50 mV
assert.equal(r.cmOk, true); close(r.groundShift, 0.05);

// Clipping: G = 100 → 5 V > 3.27 V; full-scale current = Vtop/(G·R) − Vos/R
const c = currentSense({ imax: 5, imin: 0.01, rsense: 0.01, gain: 100, bits: 12, vref: 3.3, side: 'low', amp: 'ina180' });
assert.equal(c.clipped, true); close(c.ifs, 3.27 / 1 - 0.015, 1e-9);
assert.equal(c.codeAt(5), Math.floor(3.27 / c.lsb)); // amp output swing (Vcc − 30 mV) saturates before ADC full scale

// High side at 48 V bus exceeds INA180 26 V CM range but INA240 (80 V) is fine
assert.equal(currentSense({ imax: 5, imin: 0.01, rsense: 0.01, gain: 50, bits: 12, vref: 3.3, side: 'high', vbus: 48, amp: 'ina180' }).cmOk, false);
assert.equal(currentSense({ imax: 5, imin: 0.01, rsense: 0.01, gain: 50, bits: 12, vref: 3.3, side: 'high', vbus: 48, amp: 'ina240' }).cmOk, true);

// E24 helper never rounds up
close(e24Below(0.0118), 0.011); close(e24Below(4.7), 4.7); close(e24Below(0.0099), 0.0091);
// Codes are monotonic and ADC code at 2 A ≈ 2·0.5·1.005/LSB
const k = r.codeAt(2); assert.equal(k, Math.floor(50 * 1.005 * (0.02 + 150e-6) / r.lsb));
// Dead zone: output floor 5 mV and worst-case |Vos| → (5 mV/0.5 + 150 µV/0.01) = 25 mA
close(r.iDead, 0.005 / 0.5 + 0.015, 1e-9);
// Offset calibration removes the Vos term from the error: error at 1 A = (½·ILSB)/1 + 0.5 % gain error
const cal = currentSense({ imax: 5, imin: 0.01, rsense: 0.01, gain: 50, bits: 12, vref: 3.3, side: 'low', amp: 'ina180', offsetCal: true });
close(cal.errAt(1), 0.5 * cal.ilsb + 0.005, 1e-9);
console.log('current-sense model: all tests passed');
