import assert from 'node:assert/strict';
import { resistances, steady, transient, maxPower, overridesFromParams, PKGS } from '../../src/sims/models/package-thermal.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const base = { P: 2, Ta: 40, pkg: 'qfn' as const, heatsink: false, airflow: 0 };
// Tj = Ta + P·θJA, θJA = parallel of the two paths
const R = resistances(base);
close(R.ja, R.top * R.board / (R.top + R.board));
const s = steady(base);
close(s.Tj, 40 + 2 * R.ja);
// heat split conserves power and is inversely proportional to path resistance
close(s.Qtop + s.Qb, 2);
close(s.Qtop / s.Qb, R.board / R.top);
// QFN is board-dominated
assert.ok(s.Qb > s.Qtop);
// Adding a heatsink and airflow lowers θJA and Tj
const hs = steady({ ...base, pkg: 'to220', heatsink: true });
const bare = steady({ ...base, pkg: 'to220' });
assert.ok(hs.Tj < bare.Tj);
assert.ok(steady({ ...base, heatsink: true, airflow: 5 }).Tj < steady({ ...base, heatsink: true }).Tj);
// TO-220 on a heatsink is top-dominated
assert.ok(hs.Qtop > 0.9 * hs.P);
// node temperatures: Tj > Tcase > Tsink > Ta
assert.ok(hs.Tj > hs.Tcase && hs.Tcase > hs.Tsink && hs.Tsink > 40);
// zero power -> ambient
close(steady({ ...base, P: 0 }).Tj, 40);
// max power at Tjmax gives Tj = Tjmax
close(steady({ ...base, P: maxPower(base, 125) }).Tj, 125, 1e-9);
// Transient: converges to the steady state; starts at Ta; monotonic rising
const tr = transient({ ...base, pkg: 'bga', heatsink: true });
const end = tr.Tj[tr.Tj.length - 1];
close(end, steady({ ...base, pkg: 'bga', heatsink: true }).Tj, 5e-3);
assert.equal(tr.Tj[0], 40);
for (let k = 1; k < tr.Tj.length; k++) assert.ok(tr.Tj[k] >= tr.Tj[k - 1] - 1e-9);
// very early: die heats adiabatically, ΔT ≈ P·t/Cj
const k5 = tr.t.findIndex(t => t > 2e-3);
close((tr.Tj[k5] - 40), 2 * tr.t[k5] / PKGS.bga.cj, 0.05);
// Lumped θJA override: Tj = Ta + P·θJA (1.5 W, 40 K/W, 50 °C -> 110 °C), no split
const lump = { P: 1.5, Ta: 50, pkg: 'qfn' as const, heatsink: false, airflow: 0, ...overridesFromParams({ thetaJA: 40 }) };
close(steady(lump).Tj, 110); close(steady(lump).Qtop, 1.5); close(steady(lump).Qb, 0); assert.equal(resistances(lump).lumped, true);
const trl = transient(lump); close(trl.Tj[trl.Tj.length - 1], 110, 5e-3);
// Datasheet-style heatsink: Tj = Ta + P(θJC+θCS+θSA) = 50 + 3·20 = 110 (board path open)
const ds = { P: 3, Ta: 50, pkg: 'to220' as const, heatsink: true, airflow: 0, ...overridesFromParams({ thetaJC: 1.5, thetaCS: 0.5, thetaSA: 18 }) };
close(steady(ds).Tj, 110); close(resistances(ds).ja, 20); close(steady(ds).Qtop, 3);
close(steady(ds).Tcase, 110 - 3 * 1.5); close(steady(ds).Tsink, 50 + 3 * 18);
const trd = transient(ds); close(trd.Tj[trd.Tj.length - 1], 110, 5e-3);
// supplying thetaJB/thetaBA keeps the board path in parallel
const both = { ...ds, ...overridesFromParams({ thetaJC: 1.5, thetaCS: 0.5, thetaSA: 18, thetaJB: 40, thetaBA: 60 }) };
close(resistances(both).ja, 20 * 100 / 120);
// no overrides -> defaults unchanged
close(steady({ ...base, ...overridesFromParams({}) }).Tj, steady(base).Tj);
// airflow-based θSA is replaced by an explicit thetaSA
close(resistances({ ...ds, airflow: 10 }).sa, 18);
console.log('package-thermal model: all tests passed');
