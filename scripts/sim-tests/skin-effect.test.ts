import assert from 'node:assert/strict';
import { skinDepth, MATERIALS, wireRatio, wireProfile, analyze, besselJ01 } from '../../src/sims/models/skin-effect.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);
// textbook skin depths: Cu 66 um @1 MHz (rho 1.72e-8), 8.5 mm @60 Hz; ours uses rho 1.68e-8 (65 um)
close(skinDepth(MATERIALS.cu.rho, 1e6), 65.2e-6, 0.01);
close(skinDepth(1.72e-8, 1e6), 66e-6, 0.01); close(skinDepth(1.72e-8, 60), 8.5e-3, 0.01);
close(skinDepth(MATERIALS.al.rho, 1e6), 81.9e-6, 0.01);
close(skinDepth(MATERIALS.ag.rho, 1e6), 63.4e-6, 0.01);
// delta ~ 1/sqrt(f): 100x frequency -> delta/10
close(skinDepth(MATERIALS.cu.rho, 1e8) * 10, skinDepth(MATERIALS.cu.rho, 1e6), 1e-9);
// silver < copper < gold < aluminium in delta (rho order)
assert.ok(skinDepth(MATERIALS.ag.rho, 1e6) < skinDepth(MATERIALS.cu.rho, 1e6) && skinDepth(MATERIALS.cu.rho, 1e6) < skinDepth(MATERIALS.au.rho, 1e6) && skinDepth(MATERIALS.au.rho, 1e6) < skinDepth(MATERIALS.al.rho, 1e6));
// Bessel sanity: J0(0)=1, J0(1)=0.7651976866, J1(1)=0.4400505857
const b = besselJ01([1, 0]); close(b.j0[0], 0.7651976866, 1e-9); close(b.j1[0], 0.4400505857, 1e-9);
// DC limit and monotonic growth; known value Rac/Rdc ~ 1.0 for a/delta ->0, ~1.0258 at a/delta=1
close(wireRatio(0.01), 1, 1e-4);
assert.ok(Math.abs(wireRatio(1) - 1.0208) < 0.001, `${wireRatio(1)}`);
// exact vs asymptote continuity at the switch, and asymptote a/(2 delta)+1/4 at large x
close(wireRatio(6.999), wireRatio(7.001), 2e-3);
close(wireRatio(20), 10.25, 5e-3);
let prev = 0; for (const x of [0.1, 0.5, 1, 2, 4, 7, 10, 30]) { const r = wireRatio(x); assert.ok(r >= prev); prev = r; }
// wire AWG-ish: 1 mm diameter copper at 1 MHz: a/delta = 7.67 -> Rac/Rdc ~ 4.1
const w = analyze({ material: 'cu', f: 1e6, shape: 'wire', diam: 1e-3, w: 0, t: 0, len: 1 });
close(w.rdc, 1.68e-8 / (Math.PI * 0.25e-6), 1e-9); assert.ok(w.ratio > 3.9 && w.ratio < 4.3, `${w.ratio}`);
// profile: surface = 1, centre smaller for skin-dominated wire; phase lags with depth
close(wireProfile(1, 3).mag, 1, 1e-9); assert.ok(wireProfile(0, 3).mag < 0.3); close(Math.cos(wireProfile(0.5, 6.99).phase), Math.cos(wireProfile(0.5, 7.01).phase), 2e-2);
assert.ok(Math.abs(wireProfile(0, 0.01).mag - 1) < 1e-3);
// large a/delta: centre is finite and tiny, profile continuous across the exact/asymptotic switch (u*x = 7)
assert.ok(wireProfile(0, 20).mag < 1e-6 && isFinite(wireProfile(0, 20).mag));
close(wireProfile(6.99 / 20, 20).mag, wireProfile(7.01 / 20, 20).mag, 0.03);
close(wireProfile(0.5, 7.01).mag, wireProfile(0.5, 6.99).mag, 0.03);
close(wireProfile(1 - 1 / 20, 20).mag, Math.exp(-1) / Math.sqrt(0.95), 0.03);
// trace: 1 oz (35 um) copper, 1 mm wide: no change at 1 MHz (delta 65 um > t/2), large at 1 GHz
const t1 = analyze({ material: 'cu', f: 1e6, shape: 'trace', diam: 0, w: 1e-3, t: 35e-6, len: 0.1 });
close(t1.ratio, 1, 1e-9); close(t1.rdc, 1.68e-8 * 0.1 / (1e-3 * 35e-6), 1e-9);
const t2 = analyze({ material: 'cu', f: 1e9, shape: 'trace', diam: 0, w: 1e-3, t: 35e-6, len: 0.1 });
assert.ok(t2.ratio > 3 && t2.ratio < 10);
close(t2.areaEff, 2 * t2.delta * (1e-3 + 35e-6) - 4 * t2.delta ** 2, 1e-9);
console.log('skin-effect model: all tests passed');
