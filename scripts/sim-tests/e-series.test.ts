import assert from 'node:assert/strict';
import { SERIES, nearest, colorBands, dividerWorstCase, monteCarlo, predictedStd, histogram } from '../../src/sims/models/e-series.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// Series sizes and E96 geometric spacing (values = round(10^(i/96), 2 decimals))
assert.equal(SERIES.E6.length, 6); assert.equal(SERIES.E12.length, 12); assert.equal(SERIES.E24.length, 24); assert.equal(SERIES.E96.length, 96);
SERIES.E96.forEach((v, i) => close(v, Math.round(10 ** (i / 96) * 100) / 100, 1e-12));

// Nearest values
assert.equal(nearest(4700, 'E24').value, 4700); close(nearest(4700, 'E24').err, 0);
assert.equal(nearest(5000, 'E12').value, 4700);         // ln(5000/4700) < ln(5600/5000)
assert.equal(nearest(4700, 'E96').value, 4750);         // 4.64k −1.28 % vs 4.75k +1.06 %
close(nearest(4700, 'E96').err, 4750 / 4700 - 1);
assert.equal(nearest(9700, 'E6').value, 10000);         // wraps to next decade
assert.equal(nearest(1234, 'E24').below, 1200); assert.equal(nearest(1234, 'E24').above, 1300);
assert.equal(nearest(0.33, 'E12').value, 0.33);
// Max error of a pick is half the widest (geometric) step; E24's widest is 1.3→1.5: √(1.5/1.3) − 1 = 7.4 %
for (const name of ['E6', 'E12', 'E24', 'E96'] as const) {
  const s = [...SERIES[name], 10]; let worst = 0; for (let i = 1; i < s.length; i++) worst = Math.max(worst, Math.sqrt(s[i] / s[i - 1]) - 1);
  for (let i = 0; i < 2000; i++) { const v = 10 ** (Math.random() * 6); assert.ok(Math.abs(nearest(v, name).err) <= worst + 1e-9, `${name} ${v}`); }
  if (name === 'E24') close(worst, Math.sqrt(1.5 / 1.3) - 1, 1e-12);
}

// Colour code: 4.7 kΩ 5 % = yellow violet red gold; 4.75 kΩ 1 % = yellow violet green brown brown
assert.deepEqual(colorBands(4700, 2, 0.05)!.bands, ['yellow', 'violet', 'red', 'gold']);
assert.deepEqual(colorBands(4750, 3, 0.01)!.bands, ['yellow', 'violet', 'green', 'brown', 'brown']);
assert.deepEqual(colorBands(10, 2, 0.05)!.bands, ['brown', 'black', 'black', 'gold']);
assert.deepEqual(colorBands(1, 2, 0.1)!.bands, ['brown', 'black', 'gold', 'silver']);
assert.deepEqual(colorBands(0.47, 2, 0.05)!.bands, ['yellow', 'violet', 'silver', 'gold']);
assert.deepEqual(colorBands(1e6, 2, 0.2)!.bands, ['brown', 'black', 'green', 'none']);

// Divider worst case, equal 10 k ±5 %: k = 0.5, kmax = 1.05/2 = 0.525
const wc = dividerWorstCase(10e3, 10e3, 0.05); close(wc.k, 0.5); close(wc.kmax, 0.525); close(wc.kmin, 0.475);
// Monte-Carlo stays within worst case, mean ≈ nominal, σ ≈ first-order prediction
for (const dist of ['uniform', 'gauss'] as const) {
  const mc = monteCarlo(5, 10e3, 4.7e3, 0.05, 20000, dist, 7);
  const w = dividerWorstCase(10e3, 4.7e3, 0.05);
  assert.ok(mc.min >= 5 * w.kmin - 1e-12 && mc.max <= 5 * w.kmax + 1e-12, 'samples inside worst-case');
  close(mc.mean, 5 * w.k, 2e-3);
  const ps = predictedStd(5, 10e3, 4.7e3, 0.05, dist);
  assert.ok(Math.abs(mc.std / ps - 1) < 0.05, `${dist} std ${mc.std} vs ${ps}`);
}
// determinism
assert.equal(monteCarlo(5, 1e3, 1e3, 0.01, 10, 'uniform', 3).mean, monteCarlo(5, 1e3, 1e3, 0.01, 10, 'uniform', 3).mean);
// histogram counts everything inside range
const h = histogram([0, 0.5, 1, 0.99], 0, 1, 4); assert.equal(h.counts.reduce((a, b) => a + b, 0), 4);
console.log('e-series model: all tests passed');
