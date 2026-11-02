import assert from 'node:assert/strict';
import { simulateGate, deviceFromQg, gateCharge, floatingGate, idOf } from '../../src/sims/models/gate-drive.ts';
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} != ${b} ±${tol}`);
const rel = (a: number, b: number, tol: number, msg = '') => near(a / b, 1, tol, msg);

// Device scaling reproduces the specified Qg at the datasheet test condition
const d = deviceFromQg(20e-9, 1.5);
rel(gateCharge(d), 20e-9, 1e-9, 'Qg scaling');
// Rds(on) = 1/(2K·Vov) in triode at small Vds
near(1 / idOf(d, 4.5, 1e-4).gds, 1 / (2 * 20 * 3), 1e-4, 'Rds(on)');

const base = { vdrive: 10, rg: 10, rsrc: 2, lg: 10e-9, qg: 20e-9, vth: 1.5, vdd: 15, il: 5, rpd: Infinity };
const s = simulateGate(base);
// Miller plateau: Vgs while Vds is falling = Vth + √(IL/K) (+ small IR from gate current through Lg: none at plateau)
// With strong drive the channel also discharges Coss, so Id = IL + (Cds+Cgd)|dVds/dt| and Vgs sits slightly higher.
near(s.vplSim, 1.5 + Math.sqrt(5 / 20), 0.12, 'Miller plateau (fast)');
const slow = simulateGate({ ...base, rg: 200 });
near(slow.vplSim, 1.5 + Math.sqrt(5 / 20), 0.02, 'Miller plateau (slow drive)');
// Exact relation at the plateau instant: Vgs = Vth + √(Id/K)
{ const k = slow.vds.findIndex((v, i) => slow.t[i] > slow.tOn && v <= 7.5); near(slow.vgs[k], 1.5 + Math.sqrt(slow.id[k] / 20), 1e-6, 'square law'); assert.ok(slow.id[k] >= 5); }
// Gate charge delivered during turn-on equals Qg at Vgs = 10 V, Vds 15 V → Rds·IL (≈ datasheet Qg)
rel(s.qIn, 20e-9, 0.03, 'Qg from simulation');
assert.ok(s.fullyOn, 'fully enhanced');
// Plateau duration ≈ Qgd / Igate with Igate = (Vdrive − Vpl)/R
const ig = (10 - s.vplTheory) / 12;
rel(s.tfv, 0.8 * s.qgd / ig, 0.35, 'Vds fall time ~ Qgd/Ig');
// Switching energy of a clamped inductive load ≈ ½·Vdd·IL·(tri + tfv) (within 30 %, the triangle approximation)
rel(s.eOn, 0.5 * 15 * 5 * (s.tri / 0.8 + s.tfv / 0.8), 0.3, 'Eon triangle estimate');

// Pure series RLC check: FET kept off (Vdrive < Vth), Cgd = 0 → linear RLC step; overshoot = exp(−πζ/√(1−ζ²))
const lin = { cgs: 1e-9, cgd0: 1e-18, vj: 1, cds: 1e-10, vth: 100, K: 1 };
const r = simulateGate({ ...base, rg: 0, rsrc: 1, vdrive: 5, device: lin });
const z = (1 / 2) * Math.sqrt(1e-9 / 10e-9);
near(r.zeta, z, 1e-3);
const mp = Math.exp(-Math.PI * z / Math.sqrt(1 - z * z));
rel(r.overshoot / 5, mp, 0.03, 'RLC overshoot');
// Overdamped first-order limit: L→0, Vgs(τ) = 63.2 %
const rc = simulateGate({ ...base, rg: 100, rsrc: 0, lg: 1e-12, vdrive: 5, device: lin }, { tHalf: 2e-6 });
const tau = 100 * 1e-9; const k = rc.t.findIndex(t => t >= rc.tOn + tau);
near(rc.vgs[k] / 5, 1 - Math.exp(-1), 0.01, 'RC at τ');

// Floating gate with fast rail ramp and no pull-down: Vgs ≈ charge divider ∫Cgd dV/(Cgs+Cgd)
const f = floatingGate(d, 12, 1e-6, Infinity);
assert.ok(f.peak > 1.5, 'floating gate gets pulled above Vth by dV/dt');
// Without pull-down the result is independent of ramp speed (pure capacitive divider)
const f2 = floatingGate(d, 12, 1e-3, Infinity); near(f2.peak, f.peak, 0.02, 'divider independent of ramp time');
// With 10 kΩ pull-down and a 1 ms ramp (τ = Rpd·Ciss ≈ 16 µs ≪ tr): Vgs ≈ Rpd·Cgd·dV/dt, tens of mV
const g = floatingGate(d, 12, 1e-3, 1e4);
assert.ok(g.peak < 0.1, 'pull-down holds gate low: ' + g.peak);
// Same pull-down with a 1 µs ramp (tr ≪ τ) barely helps
assert.ok(floatingGate(d, 12, 1e-6, 1e4).peak > 0.8 * f.peak, 'pull-down too slow for fast dV/dt');
console.log('gate-drive model: all tests passed');
