import assert from 'node:assert/strict';
import { makeL, ramp, fluxLinkage, storedEnergy, CORES, type Core } from '../../src/sims/models/inductor-saturation.ts';
const near = (a: number, b: number, rel: number, m = '') => assert.ok(Math.abs(a - b) <= rel * Math.abs(b) + 1e-15, `${m}: ${a} vs ${b} (±${rel * 100}%)`);
const L0 = 10e-6, IS = 3;
// L(0) = L0 and L(Isat) = 0.7·L0 (30%-drop definition) for every magnetic core; air core is constant
for (const c of ['ferrite', 'powder', 'nano'] as Core[]) {
  const L = makeL(c, L0, IS);
  near(L(0), L0, 1e-12, c + ' L(0)'); near(L(IS), 0.7 * L0, 1e-12, c + ' L(Isat)');
  assert.ok(L(10 * IS) < 0.15 * L0, c + ' collapses deep in saturation');
  near(L(1e6), CORES[c].floor * L0, 0.01, c + ' floor (air-coil value)');
}
near(makeL('air', L0, IS)(100), L0, 1e-12, 'air never saturates');
// hard vs soft: at 0.5·Isat ferrite has barely moved, powder has already dropped noticeably
assert.ok(makeL('ferrite', L0, IS)(1.5) > 0.98 * L0);
assert.ok(makeL('powder', L0, IS)(1.5) < 0.92 * L0);
// beyond Isat ferrite falls off a cliff faster than powder
assert.ok(makeL('ferrite', L0, IS)(2 * IS) < makeL('powder', L0, IS)(2 * IS));
// Air core: exact RL step response I = V/R(1 − e^{−tR/L})
{
  const r = ramp({ core: 'air', l0: L0, isat: IS, v: 12, r: 0.5, tp: 40e-6 });
  near(r.ipk, (12 / 0.5) * (1 - Math.exp(-40e-6 * 0.5 / L0)), 1e-6, 'RL step');
}
// Linear region: ferrite follows V·t/L0 well below saturation (R = 0)
{
  const r = ramp({ core: 'ferrite', l0: L0, isat: IS, v: 12, r: 0, tp: 1e-6 });   // ideal 1.2 A = 0.4·Isat
  near(r.ipk, 12 * 1e-6 / L0, 0.005, 'V·t/L0 below saturation');
  // time to reach Isat ideal = L0·Isat/V = 2.5 µs; the real ferrite gets there a bit sooner (L already 30% down)
  const s = ramp({ core: 'ferrite', l0: L0, isat: IS, v: 12, r: 0, tp: 5e-6 });
  near(s.tSatIdeal, 2.5e-6, 1e-12, 'ideal t_sat');
  assert.ok(s.tSat < 2.5e-6 && s.tSat > 2.2e-6, 'real t_sat slightly earlier');
  assert.ok(s.ipk > 4 * 12 * 5e-6 / L0, 'runaway: far above the ideal 6 A');
  assert.ok(s.slopeEnd > 10 * s.slope0, 'slope explodes once L collapses');
  // volt-seconds: λ = ∫V dt = V·t when R = 0 (Faraday's law)
  near(s.lambda, 12 * s.tOff, 0.003, 'λ = V·t');
}
// Energy balance: ∫V I dt = ∫ I dλ + ∫ I²R dt
for (const c of ['ferrite', 'powder', 'nano', 'air'] as Core[]) {
  const r = ramp({ core: c, l0: L0, isat: IS, v: 12, r: 0.2, tp: 4e-6 });
  near(r.ein, r.estored + r.eloss, 0.003, c + ' energy');
}
near(storedEnergy(makeL('air', L0, IS), 2), 0.5 * L0 * 4, 1e-9, '½LI²');
near(fluxLinkage(makeL('air', L0, IS), 2), L0 * 2, 1e-9, 'λ = L·I');
// Current limit with comparator delay: overshoot = slope × delay (in the saturated region the slope is large)
{
  const r = ramp({ core: 'ferrite', l0: L0, isat: IS, v: 12, r: 0, tp: 20e-6, ilim: 2, td: 100e-9 });
  assert.ok(r.limited); near(r.ipk, 2 + 12 / makeL('ferrite', L0, IS)(2) * 100e-9, 0.02, 'overshoot below sat');
  const h = ramp({ core: 'ferrite', l0: L0, isat: IS, v: 12, r: 0, tp: 20e-6, ilim: 6, td: 100e-9 });
  assert.ok(h.ipk - 6 > 5 * (r.ipk - 2), 'same delay → much bigger overshoot when saturated');
}
console.log('inductor-saturation model: all tests passed');
