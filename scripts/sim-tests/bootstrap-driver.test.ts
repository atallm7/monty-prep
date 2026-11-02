import assert from 'node:assert/strict';
import { metrics, run, waveforms, BOOT_DEFAULTS } from '../../src/sims/models/bootstrap-driver.ts';
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} != ${b} ±${tol}`);

const base = { vin: 24, vdrv: 12, cboot: 100e-9, d: 0.5, fsw: 100e3 };
const m = metrics(base);
const Cg = BOOT_DEFAULTS.qg / 10, Vc = 12 - BOOT_DEFAULTS.vf;
assert.ok(m.steady, 'reaches steady state');
// Long off-time (5 µs ≫ τ = Rb·Cb = 200 ns): Cboot refills to Vdrv − Vf − Iq·Rb
near(m.Vss, Vc - BOOT_DEFAULTS.iq * BOOT_DEFAULTS.rb, 1e-6, 'steady Vboot');
// Charge sharing at HS turn-on: ΔV = V·Cg/(Cb+Cg)  (≈ Qg/Cb)
near(m.share, m.Vss * Cg / (100e-9 + Cg), 1e-9, 'charge sharing');
near(m.share, 30e-9 / 100e-9 * 11.3 / 10, 0.08, '≈ Qg/Cb');
// Droop during 5 µs on-time ≈ (Iq + V/Rgs)·ton/(Cb+Cg)
const Vs = m.cy.Vs; near(m.droopOn, (150e-6 + Vs / 100e3) * 5e-6 / (100e-9 + Cg), 0.002, 'on-time droop');
// HS gate drive voltage = Vboot − Vsw during on
const w = waveforms(base, m.Vss, 1);
const k = w.t.findIndex(t => t > 1e-6); near(w.vgs[k], w.vb[k] - w.sw[k], 1e-12); near(w.sw[k], 24, 1e-12);
// Diode reverse voltage when HS on = Vin + Vboot − Vdrv
near(m.vDiodeRev, 24 + m.Vss - 12, 1e-12);
// 100 % duty: hold time from full cap to UVLO with Iq and Rgs: t = τ·ln((Vs+IqR)/(Vuvlo+IqR))
const C = 100e-9 + Cg, Vfull = Vc - 150e-6 * 2, Vs100 = Vfull * 100e-9 / C, a = 150e-6 * 100e3;
near(m.tHold, 100e3 * C * Math.log((Vs100 + a) / (8 + a)), 1e-12, 'hold time');
// Without Rgs, linear droop: t = C·ΔV/Iq
const m2 = metrics({ ...base, rgs: Infinity });
near(m2.tHold, C * (Vfull * 100e-9 / C - 8) / 150e-6, 1e-12, 'linear hold');
// Max duty is below 100 % and grows with Cboot and with lower frequency
assert.ok(m.dMax > 0.5 && m.dMax < 1, 'dMax in range ' + m.dMax);
assert.ok(metrics({ ...base, cboot: 1e-6 }).dMax > m.dMax, 'bigger Cboot → higher Dmax');
assert.ok(metrics({ ...base, fsw: 10e3 }).dMax < m.dMax, 'lower fsw (longer on-time) → lower Dmax, more droop');
// Above Dmax the steady state trips UVLO
const over = run({ ...base, d: Math.min(0.9999, m.dMax + 0.02) });
assert.ok(!over.steady || over.last.tripped || !over.last.enabled, 'above Dmax → UVLO');
// Cold start: first cycles cannot enable the HS (V < UVLO + hysteresis)
assert.ok(run(base).cyclesToCharge >= 1);
console.log('bootstrap-driver model: all tests passed');
