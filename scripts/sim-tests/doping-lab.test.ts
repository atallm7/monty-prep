import assert from 'node:assert/strict';
import { doping, niAt, MATERIALS, nVsP, intrinsicTemp, egAt, carriers } from '../../src/sims/models/doping-lab.ts';
const near = (a: number, b: number, rel: number, msg = '') => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg} ${a} vs ${b}`);

// ni at 300 K equals the anchored textbook values; Eg(300) from Varshni
near(niAt(MATERIALS.si, 300), 1e10, 1e-9, 'ni Si');
near(egAt(MATERIALS.si, 300), 1.1245, 0.002, 'Eg Si');
near(egAt(MATERIALS.gaas, 300), 1.422, 0.002, 'Eg GaAs');
// Si ni roughly doubles every ~8–10 K near room temperature (d ln ni/dT ≈ 3/(2T) + Eg0/(2kT²)), and is ~1e15 by ~600 K
const r10 = niAt(MATERIALS.si, 310) / niAt(MATERIALS.si, 300); assert.ok(r10 > 2.0 && r10 < 2.6, 'doubling ' + r10);
const ni600 = niAt(MATERIALS.si, 600); assert.ok(ni600 > 1e15 && ni600 < 1e16, 'ni600 ' + ni600);
// ordering of ni follows bandgap
assert.ok(niAt(MATERIALS.ge, 300) > niAt(MATERIALS.si, 300) && niAt(MATERIALS.si, 300) > niAt(MATERIALS.gaas, 300) && niAt(MATERIALS.gaas, 300) > niAt(MATERIALS.sic, 300));

// n-type Si, Nd = 1e16: n ≈ 1e16, p = ni²/n = 1e4, mass-action law
const a = doping({ material: 'si', nd: 1e16, na: 0, t: 300 });
near(a.n, 1e16, 1e-9); near(a.p, 1e4, 1e-6); near(a.n * a.p, a.ni ** 2, 1e-9, 'mass action');
// Irvin curve: ρ(n, 1e16) ≈ 0.5 Ω·cm, ρ(p, 1e16) ≈ 1.4 Ω·cm
near(a.rho, 0.5, 0.1, 'rho n 1e16');
const b = doping({ material: 'si', nd: 0, na: 1e16, t: 300 }); near(b.rho, 1.45, 0.1, 'rho p 1e16');
// lightly doped mobility → lattice limited 1414 / 470
near(doping({ material: 'si', nd: 1e13, na: 0, t: 300 }).un, 1414, 0.01, 'µn max');
// intrinsic Si: σ = q·ni·(µn+µp) → ρ ≈ 3.3e5 Ω·cm (with ni = 1e10)
const i = doping({ material: 'si', nd: 0, na: 0, t: 300 }); near(i.n, 1e10, 1e-9); near(i.rho, 1 / (1.602e-19 * 1e10 * (1414 + 470.5)), 1e-3, 'intrinsic rho');
assert.equal(i.type, 'i');
// compensation: Nd = 3e16, Na = 1e16 → n ≈ 2e16, but mobility uses Ntot = 4e16 (lower than for 2e16 alone)
const c = doping({ material: 'si', nd: 3e16, na: 1e16, t: 300 }); near(c.n, 2e16, 1e-9); assert.ok(c.un < doping({ material: 'si', nd: 2e16, na: 0, t: 300 }).un);
// n vs p at equal doping: n-type lower resistance, ratio ≈ µn/µp ≈ 2.8 at 1e16 for Si, ≫ for GaAs
const cmp = nVsP('si', 1e16, 300); assert.ok(cmp.ratio > 2.3 && cmp.ratio < 3.3, 'ratio ' + cmp.ratio);
assert.ok(nVsP('gaas', 1e16, 300).ratio > 10);
// higher T reduces lattice mobility → resistivity of a doped sample rises (until intrinsic carriers take over)
assert.ok(doping({ material: 'si', nd: 1e16, na: 0, t: 400 }).rho > a.rho);
// intrinsic onset temperature for 1e15 Si is ~ 550–620 K, and is much lower for Ge
const ti = intrinsicTemp('si', 1e15); assert.ok(ti > 520 && ti < 640, 'Ti ' + ti);
assert.ok(intrinsicTemp('ge', 1e15) < 400);
// stable numerics: tiny ni (SiC) with no NaN
const s = doping({ material: 'sic', nd: 1e16, na: 0, t: 300 }); assert.ok(isFinite(s.p) && s.p > 0 && s.p < 1e-20);
const cc = carriers(1e18, 1e18, 1e10); near(cc.n, 1e10, 1e-9);
console.log('doping-lab model: all tests passed', { rhoN: a.rho.toFixed(3), rhoP: b.rho.toFixed(3), ratio: cmp.ratio.toFixed(2), Ti: ti.toFixed(0), ni600: ni600.toExponential(2) });
