import assert from 'node:assert/strict';
import { resistances, steady, transient, maxPower, PKGS } from '../../src/sims/models/package-thermal.ts';
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
console.log('package-thermal model: all tests passed');
