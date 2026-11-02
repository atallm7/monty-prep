import assert from 'node:assert/strict';
import { pn, profile, bands, EPS_SI, Q } from '../../src/sims/models/pn-junction.ts';
const near = (a: number, b: number, rel: number, msg = '') => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg} ${a} vs ${b}`);

// Textbook example: Na = 1e17, Nd = 1e16, Si 300 K, ni = 1e10 → Vbi = 0.0259·ln(1e13) ≈ 0.774 V, W ≈ 0.33 µm
const r = pn({ na: 1e17, nd: 1e16, va: 0 });
near(r.vbi, 0.774, 0.005, 'Vbi');
near(r.W * 1e4, 0.332, 0.01, 'W µm');
// depletion extends mostly into the lightly doped side: xn/xp = Na/Nd = 10
near(r.xn / r.xp, 10, 1e-9, 'xn/xp');
// charge neutrality
near(r.NA * r.xp, r.ND * r.xn, 1e-12, 'neutrality');
// Emax: triangle area = potential drop → Emax·W/2 = Vbi − Va
near(r.emax * r.W / 2, r.vbi, 1e-9, 'triangle');
near(r.emax, 4.66e4, 0.02, 'Emax V/cm');
// Cj = εs/W
near(r.cj, EPS_SI / r.W, 1e-12, 'Cj');

// Reverse bias widens W ∝ sqrt(Vbi − Va); forward narrows
const rr = pn({ na: 1e17, nd: 1e16, va: -10 });
near(rr.W / r.W, Math.sqrt((r.vbi + 10) / r.vbi), 1e-9, 'W scaling');
assert.ok(pn({ na: 1e17, nd: 1e16, va: 0.5 }).W < r.W);
// Forward bias beyond Vbi is clamped (depletion approximation invalid)
const rf = pn({ na: 1e17, nd: 1e16, va: 2 }); assert.ok(rf.clamped && rf.W > 0 && isFinite(rf.emax));

// Profiles: field peak at x = 0, continuity of φ at x = 0, φ(xn) = Vbi − Va, E = 0 outside
const pL = profile(r, -1e-15), pR = profile(r, 1e-15);
near(Math.abs(pL.e), r.emax, 1e-6, 'E(0-)'); near(Math.abs(pR.e), r.emax, 1e-6, 'E(0+)');
near(pL.phi, pR.phi, 1e-6, 'phi continuous');
near(profile(r, r.xn).phi, r.vbi, 1e-9, 'phi(xn)'); assert.equal(profile(r, -2 * r.xp).e, 0);
// Gauss: dE/dx = ρ/εs
const h = 1e-9; const x = 0.5 * r.xn;
near((profile(r, x + h).e - profile(r, x - h).e) / (2 * h), Q * r.ND / EPS_SI, 1e-6, 'Gauss');

// Bands: at equilibrium Fermi level is flat (EFn = EFp = 0); under bias split by qVa
near(bands(r, r.xn * 2).efn + 1, 1, 1e-9, 'EF flat');
near(bands(pn({ na: 1e17, nd: 1e16, va: 0.4 }), 0).efn, 0.4, 1e-9, 'qVa split');
// band bending equals q(Vbi − Va)
near(bands(r, -3 * r.xp).ec - bands(r, 3 * r.xn).ec, r.vbi, 1e-9, 'bending');

// Symmetric junction splits W equally
const s = pn({ na: 1e16, nd: 1e16, va: 0 }); near(s.xn, s.xp, 1e-12);
console.log('pn-junction model: all tests passed', { vbi: r.vbi.toFixed(4), W_um: (r.W * 1e4).toFixed(4), emax: r.emax.toExponential(3) });
