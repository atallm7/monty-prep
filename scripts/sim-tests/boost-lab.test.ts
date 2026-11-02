import assert from 'node:assert/strict';
import { simulateBoost, boostDefaults } from '../../src/sims/models/boost-lab.ts';
const rel = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} ${a} vs ${b}`);
const ideal = { ...boostDefaults(), esr: 0, dcr: 0, rds: 0, vf: 0, tr: 0, tf: 0, coss: 0, qg: 0 };

// Lossless CCM: Vout = Vin/(1−D), IL = Iout/(1−D), ΔI = Vin·D/(L·f), ΔV = Iout·D/(C·f)
let t0 = performance.now();
const a = simulateBoost({ ...ideal, d: 0.3, iout: 0.5 });
console.log('sim ms', (performance.now() - t0).toFixed(1));
assert.equal(a.mode, 'CCM'); assert.ok(a.converged);
rel(a.voutAvg, 3.7 / 0.7, 1e-3, 'Vout ideal');
rel(a.iLavg, 0.5 / 0.7, 1e-3, 'IL avg');
rel(a.iin, 0.5 / 0.7, 1e-3, 'Iin = IL');
rel(a.dI, 3.7 * 0.3 / (2.2e-6 * 1e6), 2e-3, 'ΔI');
rel(a.dV, 0.5 * 0.3 / (22e-6 * 1e6), 0.02, 'ΔV');
rel(a.eff, 1, 1e-4, 'lossless');
// power balance Pin = Pout
rel(3.7 * a.iin, a.pout, 1e-3, 'power balance');

// DCM: Vout = Vin + Vin²D²T/(2·L·Iout)
const b = simulateBoost({ ...ideal, d: 0.2, iout: 0.05 });
assert.equal(b.mode, 'DCM');
rel(b.voutAvg, 3.7 + 3.7 * 3.7 * 0.04 * 1e-6 / (2 * 2.2e-6 * 0.05), 3e-3, 'DCM Vout');
rel(b.voutAvg, b.vDcm, 3e-3, 'DCM helper');
// boundary current
assert.ok(a.iCrit < 0.5);

// With losses: matches averaged model Vout = (Vin − IL(DCR + D·Rds))/(1−D) − Vf (ESR adds a tiny bit)
const c = simulateBoost({ ...boostDefaults(), d: 0.3, iout: 0.5 });
rel(c.voutAvg, c.vAvgModel, 3e-3, 'lossy averaged');
assert.ok(c.voutAvg < c.vIdeal);
assert.ok(c.eff > 0.85 && c.eff < 0.97, 'eff ' + c.eff);
// diode current is pulsed: peak ≥ IL valley, average = Iout
assert.ok(c.idPk > 0.5 / 0.7);
// energy balance (conduction only)
const L = c.losses; rel(c.pin - L.sw - L.gate, c.pout + L.fet + L.diode + L.dcr + L.esr, 3e-3, 'energy balance');
// heavy load at high D collapses the gain: Vout(D=0.9) < Vout(D=0.8) with 3 A load and 100 mΩ DCR
const hi = { ...boostDefaults(), dcr: 0.1, iout: 3 };
const v8 = simulateBoost({ ...hi, d: 0.8 }), v9 = simulateBoost({ ...hi, d: 0.9 });
console.log('D=0.8', v8.voutAvg.toFixed(2), 'D=0.9', v9.voutAvg.toFixed(2), v9.collapsed);
assert.ok(v9.collapsed || v9.voutAvg < v8.voutAvg, 'gain droops at high D');
console.log('boost-lab model: all tests passed');
