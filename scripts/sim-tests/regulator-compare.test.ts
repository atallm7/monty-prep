import assert from 'node:assert/strict';
import { ldo, buck, crossovers, solveViio, solveEff, LDO_DEF, BUCK_DEF } from '../../src/sims/models/regulator-compare.ts';
const close = (a: number, b: number, tol = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} ${a} != ${b}`);
// LDO efficiency → Vout/Vin when Iout ≫ Iq; 3.3 from 5 V = 66%
close(ldo(5, 3.3, 1, { iq: 0, vdo: 0.2 }).eff, 0.66);
close(ldo(5, 3.3, 1e-3, { iq: 1e-3, vdo: 0.2 }).eff, 0.33, 1e-9, 'Iq halves efficiency at Iout=Iq');
// LDO dissipation (12→5 V at 0.5 A = 3.5 W)
close(ldo(12, 5, 0.5, { iq: 0, vdo: 0.3 }).pdiss, 3.5);
// dropout
const dd = ldo(3.4, 3.3, 0.1, { iq: 0, vdo: 0.2 }); assert.ok(!dd.inReg); close(dd.vo, 3.2);
// Buck: loss budget sums and efficiency peak at I* = √(Pfixed/Rcond)
const b = buck(12, 3.3, 1, BUCK_DEF);
close(b.pin, b.pout + b.parts.quiescent + b.parts.gateCoss + b.parts.conduction + b.parts.switching);
close(b.parts.conduction, 0.08); close(b.parts.switching, 0.5 * 12 * 1 * 10e-9 * 1e6);
// efficiency peak where conduction = fixed (switching ∝ I doesn't move the optimum)
let best = 0, bi = 0; for (let k = 0; k < 4000; k++) { const i = 1e-3 * 10 ** (k / 1000); const e = buck(12, 3.3, i).eff; if (e > best) { best = e; bi = i; } }
close(bi, b.iPeak, 0.01, 'peak eff current');
// LDO wins at low dropout (5→3.3 at light load), buck wins at 12→3.3 heavy load
assert.ok(ldo(3.6, 3.3, 0.01).eff > buck(3.6, 3.3, 0.01).eff);
assert.ok(buck(12, 3.3, 1).eff > ldo(12, 3.3, 1).eff);
const xs = crossovers(5, 3.3, LDO_DEF, BUCK_DEF); assert.ok(xs.length >= 1);
for (const x of xs) close(ldo(5, 3.3, x).eff, buck(5, 3.3, x).eff, 1e-6, 'crossover');
// PFM improves light-load efficiency
assert.ok(buck(5, 3.3, 1e-3, { ...BUCK_DEF, pfm: true }).eff > buck(5, 3.3, 1e-3).eff);
// calculators: 12 V in, 5 V 2 A out, 90% ⇒ Iin = 0.926 A
const v = solveViio('iin', { vin: 12, iin: 0, vout: 5, iout: 2, eff: 0.9 }); close(v.iin, 10 / 10.8); close(v.ploss, 10 / 0.9 - 10);
close(solveViio('eff', { vin: 12, iin: 1, vout: 5, iout: 2, eff: 0 }).eff, 10 / 12);
close(solveViio('iout', { vin: 3.7, iin: 1, vout: 5, iout: 0, eff: 0.9 }).iout, 3.7 * 0.9 / 5);
assert.ok(!solveViio('eff', { vin: 5, iin: 1, vout: 5, iout: 2, eff: 0 }).valid, 'η > 1 is invalid');
close(solveEff('pin', { pin: 0, pout: 9, eff: 0.9 }).pin, 10); close(solveEff('pin', { pin: 0, pout: 9, eff: 0.9 }).ploss, 1);
close(solveEff('eff', { pin: 20, pout: 17, eff: 0 }).eff, 0.85);
console.log('regulator-compare model: all tests passed');
