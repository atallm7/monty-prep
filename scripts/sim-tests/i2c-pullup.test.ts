import assert from 'node:assert/strict';
import { pullup, busWave, LN_73 } from '../../src/sims/models/i2c-pullup.ts';
const close = (a: number, b: number, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} != ${b}`);

close(LN_73, 0.8473, 1e-4);
// UM10204 example values: VDD 3.3 V, Fast-mode, Cb 200 pF
const r = pullup({ vdd: 3.3, cb: 200e-12, rp: 4700, mode: 'fast' });
close(r.rpMin, (3.3 - 0.4) / 3e-3);          // 966.7 Ω
close(r.rpMax, 300e-9 / (0.8473 * 200e-12)); // 1770 Ω
close(r.tr, 0.8473 * 4700 * 200e-12);        // 796 ns
assert.equal(r.status, 'weak');               // 4.7 kΩ is too weak for 400 kHz at 200 pF
// same 4.7 kΩ is fine in Standard-mode (tr 796 ns < 1000 ns)
assert.equal(pullup({ vdd: 3.3, cb: 200e-12, rp: 4700, mode: 'standard' }).status, 'ok');
// a 470 Ω pull-up is too strong: VOL would exceed 0.4 V at the 3 mA sink limit
const s = pullup({ vdd: 3.3, cb: 200e-12, rp: 470, mode: 'fast' });
assert.equal(s.status, 'strong'); assert.ok(s.vLow > 0.4);
// at exactly Rp(min), the modelled low level is exactly VOL = 0.4 V
close(pullup({ vdd: 3.3, cb: 200e-12, rp: r.rpMin, mode: 'fast' }).vLow, 0.4, 1e-9);
// Fm+ has 20 mA sink → much smaller Rp(min); 5 V: (5−0.4)/20mA = 230 Ω
close(pullup({ vdd: 5, cb: 100e-12, rp: 1000, mode: 'fastplus' }).rpMin, 230);
// low VDD: VOL = 0.2·VDD
close(pullup({ vdd: 1.8, cb: 100e-12, rp: 1000, mode: 'fast' }).VOL, 0.36);
// waveform: after one RC time-constant of rise, the line is at 63.2 % of the way to VDD
const p = { vdd: 3.3, cb: 100e-12, rp: 1000, mode: 'standard' as const }; // τ = 100 ns, T/2 = 5 µs
const w = busWave(p, 1, 10000);
const k = w.t.findIndex(t => t >= 100e-9);
const v0 = pullup(p).vLow;
close((w.v[k] - v0) / (3.3 - v0), 1 - Math.exp(-1), 2e-3);
// settles to VDD by the end of the high half-period and to vLow by the end of the period
assert.ok(Math.abs(w.v[5000] - 3.3) < 1e-6); assert.ok(Math.abs(w.v[10000] - v0) < 1e-3);
console.log('i2c-pullup model: all tests passed');
