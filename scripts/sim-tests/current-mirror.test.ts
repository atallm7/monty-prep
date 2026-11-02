import assert from 'node:assert/strict';
import { operatingPoint, mosVgs, textbookIout, sweep, type MirrorIn } from '../../src/sims/models/current-mirror.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} != ${b}`);
const mos: MirrorIn = { type: 'mos', iref: 1e-3, ratio: 1, lambda: 0, kp: 8e-3, vt: 0.5, beta: 100, va: 50, is: 1e-15 };
// λ = 0: VOV = √(2I/β) = √(2e-3/8e-3) = 0.5 V → VGS = 1.0 V; perfect copy in saturation
close(mosVgs(mos), 1.0, 1e-9, 'VGS'); close(operatingPoint(mos, 2).iout, 1e-3, 1e-9, 'λ=0 copy');
// sizing ratio 4 → 4 mA
close(operatingPoint({ ...mos, ratio: 4 }, 2).iout, 4e-3, 1e-9, 'ratio');
// with λ: exact copy only at Vout = VGS; Iout = Iref(1+λVout)/(1+λVGS) in saturation
const ml = { ...mos, lambda: 0.05 };
const vgs = mosVgs(ml); close(operatingPoint(ml, vgs).iout, 1e-3, 1e-9, 'Vout = VGS');
close(operatingPoint(ml, 3).iout, textbookIout(ml, 3), 1e-9, 'λ formula');
close(operatingPoint(ml, 3).rout, 1 / (0.05 * operatingPoint(ml, 3).iout), 1e-12, 'ro = 1/(λI)');
// compliance: below VOV the output device is in triode and the current collapses
const op = operatingPoint(ml, 0.2); assert.ok(!op.saturated && op.iout < 0.7e-3, 'triode below VOV');
close(operatingPoint(ml, 1).compliance, vgs - 0.5, 1e-12);
// BJT: β error  Iout/Iref ≈ 1/(1 + 2/β) at VCE = VBE (β = 100 → 0.9804)
const b: MirrorIn = { ...mos, type: 'bjt', va: 1e6, beta: 100 };
const vbe = operatingPoint(b, 0.7).vctl; const ob = operatingPoint(b, vbe);
close(ob.iout / 1e-3, 1 / (1 + 2 / 100), 1e-3, 'beta error');
// ratio 4 BJT mirror: m/(1 + (1+m)/β) = 4/1.05 = 3.81
const ob4 = operatingPoint({ ...b, ratio: 4 }, operatingPoint({ ...b, ratio: 4 }, 0.7).vctl);
close(ob4.iout / 1e-3, 4 / 1.05, 2e-3, 'ratio-4 beta error');
// VBE ≈ VT·ln(I/Is) ≈ 0.714 V for 1 mA, Is = 1e-15
close(vbe, 0.025852 * Math.log(1e-3 / 1e-15 / (1 + 2 / 100)), 2e-3, 'VBE');
// Early effect: slope ≈ Iout/VA
const be = { ...b, va: 50 }; const i1 = operatingPoint(be, 2).iout, i2 = operatingPoint(be, 4).iout;
close((i2 - i1) / 2, i1 / (50 + 2), 0.02, 'Early slope');
// saturation of Q2 near 0 V: the current drops well below the mirrored value
assert.ok(operatingPoint(be, 0.02).iout < 0.2e-3 && operatingPoint(be, 0.3).iout > 0.95e-3, 'BJT saturation below ~0.1 V');
const sw = sweep(be, 5); assert.ok(sw.i.every(Number.isFinite));
console.log('current-mirror model: all tests passed');
