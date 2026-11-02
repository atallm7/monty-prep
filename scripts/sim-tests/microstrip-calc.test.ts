import assert from 'node:assert/strict';
import { microstrip, stripline, solve, widthFor, ipcMicrostrip } from '../../src/sims/models/microstrip-calc.ts';
const rel = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${m} ${a} != ${b} (±${tol * 100}%)`);
// Air microstrip, W/H = 1, t = 0: ≈ 126 Ω (Wheeler / Hammerstad)
rel(microstrip(1, 1, 0, 1).z0, 126.5, 0.01, 'air W/H=1');
rel(microstrip(1, 1, 0, 1).eeff, 1, 1e-9, 'air eeff');
// Pozar Ex. 3.7: alumina εr = 9.9, W/d = 0.95 → 50 Ω, εe ≈ 6.67
rel(microstrip(0.95, 1, 0, 9.9).z0, 50, 0.015, 'alumina 50 Ω');
rel(microstrip(0.95, 1, 0, 9.9).eeff, 6.665, 0.02, 'alumina eeff');
// FR-4 (εr = 4.3), H = 0.2 mm, 1 oz copper: a 50 Ω microstrip is ≈ 0.37 mm wide (≈1.9·H)
const w50 = widthFor(50, { type: 'microstrip', w: 0.3, h: 0.2, t: 0.035, er: 4.3, s: 0.2 });
assert.ok(w50 > 0.33 && w50 < 0.40, 'FR4 50 Ω width ' + w50);
// Thickness lowers impedance slightly
assert.ok(microstrip(0.3, 0.2, 0.035, 4.3).z0 < microstrip(0.3, 0.2, 0, 4.3).z0);
// Doubling the substrate height raises Z0 (≈ +30 to +40 % for this geometry)
const z1 = microstrip(0.3, 0.2, 0.035, 4.3).z0, z2 = microstrip(0.3, 0.4, 0.035, 4.3).z0;
assert.ok(z2 / z1 > 1.25 && z2 / z1 < 1.5, 'double height ' + z1 + ' ' + z2);
// IPC-2141 estimate is within ~10 % of Hammerstad–Jensen in its valid range
rel(ipcMicrostrip(0.3, 0.2, 0.035, 4.3), z1, 0.12, 'IPC vs HJ');
// Stripline, Pozar Ex. 3.5: εr = 2.2, b = 0.32 cm, W = 0.266 cm, t → 0 gives 50 Ω
rel(stripline(0.266, 0.16, 0, 2.2).z0, 50, 0.015, 'Pozar stripline');
// Stripline is TEM: εeff = εr, tpd = √εr / c (FR4 ≈ 6.9 ps/mm)
const sl = solve({ type: 'stripline', w: 0.15, h: 0.2, t: 0.017, er: 4.3, s: 0.2 });
rel(sl.eeff, 4.3, 1e-12); rel(sl.tpd_ps_mm, Math.sqrt(4.3) / 299792458 * 1e9, 1e-9, 'tpd');
// L'·C' = εeff/c² and √(L'/C') = Z0
const m = solve({ type: 'microstrip', w: 0.3, h: 0.2, t: 0.035, er: 4.3, s: 0.2 });
rel(Math.sqrt(m.L_nH_mm * 1e-9 / (m.C_pF_mm * 1e-12)), m.z0, 1e-9, 'sqrt(L/C)');
// Differential: tight coupling lowers Zdiff below 2·Z0; wide spacing → 2·Z0
const d1 = solve({ type: 'diff-microstrip', w: 0.3, h: 0.2, t: 0.035, er: 4.3, s: 0.1 });
const d2 = solve({ type: 'diff-microstrip', w: 0.3, h: 0.2, t: 0.035, er: 4.3, s: 10 });
assert.ok(d1.zdiff < 2 * d1.z0 * 0.8); rel(d2.zdiff, 2 * d2.z0, 1e-6, 'uncoupled');
rel(d1.zdiff, 2 * d1.z0 * (1 - 0.48 * Math.exp(-0.96 * 0.5)), 1e-12, 'IPC diff');
console.log('microstrip-calc model: all tests passed');
