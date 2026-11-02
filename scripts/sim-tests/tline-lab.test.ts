import assert from 'node:assert/strict';
import { simulate, lattice, network, gamma, type TlIn } from '../../src/sims/models/tline-lab.ts';
const close = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} != ${b} (±${tol})`);
const base: TlIn = { vs: 1, rs: 10, z0: 50, td: 1e-9, tr: 1e-12, load: 'open', rl: 50, cl: 10e-12, term: 'none', cac: 100e-12, tEnd: 12e-9 };
const at = (r: ReturnType<typeof simulate>, t: number, key: 'vLoad' | 'vSrc') => { let k = 0; while (k < r.t.length - 1 && r.t[k] < t) k++; return r[key][k]; };
// Γ formulas
close(gamma(10, 50), -2 / 3, 1e-12); close(gamma(Infinity, 50), 1, 0); close(gamma(0, 50), -1, 0);
// Open load, Rs = 10 Ω: launch 50/60 V, doubles at the load → 1.667 V at td, then 1.667·(1 + Γs) after 3td
const r = simulate(base);
close(at(r, 0.5e-9, 'vSrc'), 50 / 60, 1e-3, 'launch');
close(at(r, 0.5e-9, 'vLoad'), 0, 1e-6, 'nothing before td');
close(at(r, 1.5e-9, 'vLoad'), 100 / 60, 2e-3, 'first arrival');
close(at(r, 3.5e-9, 'vLoad'), (100 / 60) * (1 - 2 / 3), 2e-3, 'second arrival');
close(at(r, 5.5e-9, 'vLoad'), (100 / 60) * (1 - 2 / 3 + 4 / 9), 2e-3, 'third arrival');
close(r.vFinal, 1, 1e-9, 'final');
// Lattice agrees with the transient
const L = lattice(base);
close(L.segs[0].vAfter, 100 / 60, 1e-12); close(L.segs[2].vAfter, (100 / 60) * (1 / 3), 1e-12);
// Matched load: Vs/2 after td, no reflection at source
const m = simulate({ ...base, rs: 50, load: 'R', rl: 50 });
close(at(m, 1.5e-9, 'vLoad'), 0.5, 1e-3); close(at(m, 4.5e-9, 'vSrc'), 0.5, 1e-3, 'source flat');
// Series termination with open load: full Vs at the load at td, source sits at Vs/2 until 2td
const st = simulate({ ...base, term: 'series' });
close(network({ ...base, term: 'series' }).rser, 40, 1e-12);
close(at(st, 1.5e-9, 'vLoad'), 1, 1e-3, 'series term load'); close(at(st, 1.5e-9, 'vSrc'), 0.5, 1e-3, 'series term source half');
close(at(st, 2.5e-9, 'vSrc'), 1, 1e-3, 'source after 2td'); close(at(st, 6e-9, 'vLoad'), 1, 1e-3);
// Parallel termination: load sees Vs·Z0/(Rs+Z0) with no ringing
const pt = simulate({ ...base, term: 'parallel' });
close(at(pt, 1.5e-9, 'vLoad'), 50 / 60, 1e-3); close(at(pt, 8e-9, 'vLoad'), 50 / 60, 1e-3); close(pt.vFinal, 50 / 60, 1e-9);
// Thevenin (2Z0 to Vs ‖ 2Z0 to gnd): DC idle level Vs/2 · Rs/(Rs+Z0), final = (Vs/Rs + 0.5/Z0)/(1/Rs + 1/Z0)
const th = simulate({ ...base, term: 'thevenin' });
close(th.v0, 0.5 * 10 / 60, 1e-9, 'thevenin idle'); close(th.vFinal, (1 / 10 + 0.5 / 50) / (1 / 10 + 1 / 50), 1e-9);
close(at(th, 0.5e-9, 'vLoad'), th.v0, 1e-6, 'thevenin idle held');
close(at(th, 1.5e-9, 'vLoad'), th.vFinal, 2e-3, 'thevenin matched step');
// Short: load stays at 0, source sees launch then −Γ cancel → Vs·0 after 2td
const sh = simulate({ ...base, load: 'short', rs: 50 });
close(at(sh, 1.5e-9, 'vLoad'), 0, 1e-6); close(at(sh, 2.5e-9, 'vSrc'), 0, 1e-3);
// Capacitive load, matched source: VL = 2a(1 − e^{−t/(Z0 C)}), τ = 500 ps (step at td)
const cp = simulate({ ...base, rs: 50, load: 'C', cl: 10e-12, tEnd: 6e-9 });
close(at(cp, 1e-9 + 500e-12, 'vLoad'), 1 * (1 - Math.exp(-1)), 0.01, 'RC charge at τ');
// AC termination: initially looks like Z0 (no reflection), DC final = Vs (open)
const ac = simulate({ ...base, rs: 50, tr: 10e-12, term: 'ac', cac: 100e-12, tEnd: 100e-9 });
close(at(ac, 1.2e-9, 'vLoad'), 0.5, 0.01, 'AC term edge'); close(ac.vLoad[ac.vLoad.length - 1], 1, 0.01, 'AC term DC');
console.log('tline-lab model: all tests passed');
