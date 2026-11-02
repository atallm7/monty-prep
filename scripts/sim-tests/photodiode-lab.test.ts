import assert from 'node:assert/strict';
import { photocurrent, pdTia, tiaPoly, tiaBandwidth, butterworthCf, step2, overshoot, riseTime, ldrR, ldr, ldrStep } from '../../src/sims/models/photodiode-lab.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-30), `${a} != ${b}`);

// 500 lux of 555 nm light = 500/683 W/m²; on 7.5 mm² with 0.35 A/W → 1.92 µA
const ph = photocurrent(500, 'green', 7.5e-6);
close(ph.Ee, 500 / 683); close(ph.iph, 0.35 * 500 / 683 * 7.5e-6);
const base = { lux: 500, source: 'green' as const, area: 7.5e-6, idark: 0, rf: 1e6, cf: 2e-12, cd: 70e-12, gbw: 10e6, vmax: 4.9 };
const r = pdTia(base);
close(r.vout, ph.iph * 1e6);              // V = I·R_f ≈ 1.92 V
assert.ok(!r.clipped);
assert.ok(pdTia({ ...base, rf: 10e6 }).clipped);   // 19 V → clips at the rail

// Feedback-cap dominated: f_3dB → 1/(2π R_f C_f) when the op-amp is much faster
close(tiaBandwidth(1e6, 100e-12, 70e-12, 1e9), 1 / (2 * Math.PI * 1e6 * 100e-12), 2e-3);
// Butterworth C_f gives ζ = 1/√2 exactly, and overshoot 4.32 %
const cfb = butterworthCf(1e6, 70e-12, 10e6);
close(tiaPoly(1e6, cfb, 70e-12, 10e6).zeta, Math.SQRT1_2, 1e-9);
close(overshoot(Math.SQRT1_2), 0.0432139, 1e-5);
// With ζ = 1/√2, |Z| at f_n is exactly −3 dB, so f_3dB = f_n
const pb = tiaPoly(1e6, cfb, 70e-12, 10e6);
close(tiaBandwidth(1e6, cfb, 70e-12, 10e6), pb.fn, 1e-6);
// No C_f: lightly damped (ζ small), GBW-limited f_n = √(GBW/(2π R_f C_d))
const p0 = tiaPoly(1e6, 0, 70e-12, 10e6);
close(p0.fn, Math.sqrt(10e6 / (2 * Math.PI * 1e6 * 70e-12)), 1e-9);
assert.ok(p0.zeta < 0.1);
// Step responses: final value 1, peak matches overshoot formula, first-order limit rise 2.2·RC
assert.ok(Math.abs(step2(1, pb.a, pb.b) - 1) < 1e-9);
let pk = 0; for (let i = 1; i < 20000; i++) pk = Math.max(pk, step2(i * 1e-8, pb.a, pb.b));
close(pk - 1, overshoot(pb.zeta), 1e-3);
const rc = tiaPoly(1e6, 100e-12, 70e-12, 1e10);
const ts = Array.from({ length: 20001 }, (_, i) => i * 5e-8), ys = ts.map(t => step2(t, rc.a, rc.b));
close(riseTime(ts, ys), 2.197 * 1e6 * 100e-12, 5e-3);

// LDR: R(10 lux) = R10 ‖ Rdark; slope γ on log–log: 10× light → R / 10^γ
close(ldrR(10, 15e3, 0.7, 1e12), 15e3, 1e-6);
close(ldrR(100, 15e3, 0.7, 1e12), 15e3 / 10 ** 0.7, 1e-6);
const L = { lux: 500, r10: 15e3, gamma: 0.7, rdark: 1e6, rfix: 10e3, vcc: 5, tauRise: 0.02, tauFall: 0.03 };
const lv = ldr(L); close(lv.vout, 5 * 10e3 / (lv.R + 10e3));
assert.ok(Math.abs(ldrStep(0, L)) < 1e-12); assert.ok(ldrStep(0.5, L) > 0.999);
console.log('photodiode-lab model: all tests passed', { iph: ph.iph, cfButter: cfb, f3: pb.fn });
