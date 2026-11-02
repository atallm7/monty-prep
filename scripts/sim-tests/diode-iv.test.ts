import assert from 'node:assert/strict';
import { operatingPoint, forwardVoltage, currentAt, thermalVoltage, DEVICES, solveSeries } from '../../src/sims/models/diode-iv.ts';
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (±${tol})`);

// Thermal voltage kT/q at 300 K = 25.85 mV
near(thermalVoltage(300), 0.025852, 2e-6, 'Vt');

// Load line: 5 V, 1 kΩ, silicon → Vd ≈ 0.6–0.7 V, I = (Vs − Vd)/R, KVL satisfied
const op = operatingPoint({ device: 'si', vs: 5, r: 1000, tC: 27 });
assert.equal(op.region, 'forward');
assert.ok(op.vd > 0.58 && op.vd < 0.72, 'si Vd ' + op.vd);
near(op.i, (5 - op.vd) / 1000, 1e-12, 'KVL');
assert.ok(Math.abs(op.residual) < 1e-9, 'residual');

// 1N4148 datasheet-ish: Vf(10 mA) ≈ 0.7–0.75 V
const vf10 = forwardVoltage('si', 10e-3, 27); assert.ok(vf10 > 0.68 && vf10 < 0.78, 'Vf(10mA) ' + vf10);

// Ideality: ΔV per decade of current = n·Vt·ln10 (≈ 60 mV for n = 1) at low current where Rs is negligible
const d = DEVICES.si; const T = 300.15;
const dv = forwardVoltage('si', 1e-5, 27) - forwardVoltage('si', 1e-6, 27);
near(dv, d.n * thermalVoltage(T) * Math.LN10, 1e-4, 'decade slope');

// Temperature coefficient of Vf at constant current ≈ −1.5 … −2.5 mV/°C
const tc = (forwardVoltage('si', 1e-3, 75) - forwardVoltage('si', 1e-3, 25)) / 50;
assert.ok(tc < -1.2e-3 && tc > -2.6e-3, 'tempco ' + tc);

// Device ordering of forward voltage at 20 mA: Schottky/Ge < Si < red LED < blue LED
const vf = (id: any) => forwardVoltage(id, 20e-3, 25);
assert.ok(vf('schottky') < vf('si') && vf('ge') < vf('si') && vf('si') < vf('led-red') && vf('led-red') < vf('led-blue'));
near(vf('led-red'), 1.95, 0.1, 'red LED Vf'); near(vf('led-blue'), 3.1, 0.15, 'blue LED Vf');

// Reverse bias: silicon blocks, current ≈ −Is
const rev = operatingPoint({ device: 'si', vs: -10, r: 1000, tC: 27 });
assert.equal(rev.region, 'reverse'); assert.ok(Math.abs(rev.i) < 1e-7); near(rev.vd, -10, 1e-3);

// Zener regulator: −12 V through 1 kΩ → Vd ≈ −5.1…−5.2 V, I ≈ −6.9 mA
const z = operatingPoint({ device: 'zener', vs: -12, r: 1000, tC: 25 });
assert.equal(z.region, 'breakdown'); assert.ok(z.vd < -5.05 && z.vd > -5.25, 'Vz ' + z.vd); near(z.i, (-12 - z.vd) / 1000, 1e-12);

// Solver robustness: R = 0 (only Rs limits current), huge and negative sources, no NaN
for (const vs of [-200, -5.1, 0, 1e-6, 0.3, 30, 200]) for (const r of [0, 1, 1e6]) for (const id of Object.keys(DEVICES)) {
  const o = operatingPoint({ device: id as any, vs, r, tC: 25 });
  assert.ok(isFinite(o.i) && isFinite(o.vd), `finite ${id} ${vs} ${r}`);
  assert.ok(Math.abs(o.vd + o.i * r - vs) < 1e-6 * Math.max(1, Math.abs(vs)), `KVL ${id} ${vs} ${r}`);
}
assert.equal(currentAt('si', 0, 25), 0);
console.log('diode-iv model: all tests passed', { vd: op.vd.toFixed(4), vf10: vf10.toFixed(3), tc: (tc * 1e3).toFixed(2) + ' mV/K', vz: z.vd.toFixed(3), red: vf('led-red').toFixed(3), blue: vf('led-blue').toFixed(3), sch: vf('schottky').toFixed(3), ge: vf('ge').toFixed(3), iters: op.iter });
void solveSeries;
