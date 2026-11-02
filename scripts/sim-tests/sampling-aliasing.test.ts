import assert from 'node:assert/strict';
import { alias, butter, simulate, images } from '../../src/sims/models/sampling-aliasing.ts';
const close = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} != ${b} (±${tol})`);
// Folding: fa = |f − round(f/fs)·fs|
close(alias(900, 1000).fa, 100, 1e-9, '900@1k'); assert.ok(alias(900, 1000).inverted);
close(alias(1100, 1000).fa, 100, 1e-9, '1100@1k'); assert.ok(!alias(1100, 1000).inverted);
close(alias(400, 1000).fa, 400, 1e-9, 'no alias'); assert.ok(!alias(400, 1000).aliased);
close(alias(1000, 1000).fa, 0, 1e-9, 'f = fs → DC');
close(alias(2600, 1000).fa, 400, 1e-9, '2600@1k'); assert.equal(alias(2600, 1000).zone, 6);
close(alias(7e6, 10e6).fa, 3e6, 1e-3, '7 MHz @ 10 MS/s');
// Samples of f and its alias are identical
const r = simulate({ f: 900, fs: 1000, phase: 0.7 }, 0.02, 801);
for (let n = 0; n < r.st.length; n++) close(r.sv[n], Math.cos(2 * Math.PI * 100 * r.st[n] - 0.7), 1e-9, 'sample = alias');
// Sinc reconstruction converges to the alias tone between samples
let maxErr = 0; for (let i = 0; i < r.t.length; i++) maxErr = Math.max(maxErr, Math.abs(r.xr[i] - r.xa[i]));
assert.ok(maxErr < 0.03, 'reconstruction error ' + maxErr);
// Below Nyquist the reconstruction returns the original
const q = simulate({ f: 300, fs: 1000 }, 0.01, 401);
let e2 = 0; for (let i = 0; i < q.t.length; i++) e2 = Math.max(e2, Math.abs(q.xr[i] - q.x[i]));
assert.ok(e2 < 0.03, 'baseband reconstruction ' + e2);
// Butterworth: −3 dB at fc, −80 dB/dec slope for order 4
close(butter(1000, 1000, 4).mag, Math.SQRT1_2, 1e-9, 'Butterworth fc');
close(20 * Math.log10(butter(10000, 1000, 4).mag), -80, 0.01, '4th-order slope');
close(butter(500, 1000, 2).mag, 1 / Math.sqrt(1 + 0.5 ** 4), 1e-12, '2nd order');
close(butter(1000, 1000, 2).phase, -Math.PI / 2, 1e-9, '2nd order phase at fc');
// Images at k·fs ± f
const im = images(300, 1000, 2500).map(x => x.f);
assert.deepEqual(im, [300, 700, 1300, 1700, 2300]);
console.log('sampling-aliasing model: all tests passed');
