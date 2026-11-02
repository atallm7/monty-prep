import assert from 'node:assert/strict';
import { C, roundTrip, rangeRes, maxRange, apparentRange, simulate, returnAmp } from '../../src/sims/models/lidar-tof.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-30, Math.abs(b)), `${a} != ${b}`);

close(roundTrip(30), 200.138e-9, 1e-5);        // 30 m → 200 ns round trip
close(roundTrip(150), 1.0007e-6, 1e-4);       // the classic "1 µs ≈ 150 m"
close(rangeRes(1e-9), 0.1499, 1e-3);          // 1 ns bin → 15 cm
close(maxRange(100e3), 1498.96, 1e-5);        // 100 kHz PRF → 1.5 km unambiguous
const al = apparentRange(2000, 100e3);        // beyond R_max: aliases to 2000 − 1499 = 501 m
close(al.dApp, 2000 - C / 2e5, 1e-9); assert.equal(al.pulsesLate, 1);
close(returnAmp(60, 0.5) / returnAmp(30, 0.5), 0.25); // 1/d²

const base = { d: 30, tres: 1e-9, prf: 100e3, pulseW: 5e-9, refl: 0.5, ambient: 0, second: false, d2: 40, frac2: 0.4, shots: 1, method: 'peak' as const, interp: false, thr: 0.2, seed: 1, noise: false };
// Noise-free peak detection: error bounded by half a bin (ΔR/2)
for (const d of [12.3, 30, 47.77, 101.1]) {
  const r = simulate({ ...base, d, thr: 0.05 });
  assert.ok(Math.abs(r.first.d - d) <= rangeRes(1e-9) / 2 + 1e-9, `peak quantisation d=${d}: ${r.first.d}`);
  const ri = simulate({ ...base, d, thr: 0.05, interp: true });
  assert.ok(Math.abs(ri.first.d - d) < rangeRes(1e-9) / 10, `interp d=${d}: ${ri.first.d}`);
}
// Coarser bins → coarser range: 10 ns bin worst-case error ≤ 0.75 m
const coarse = simulate({ ...base, d: 31.2, tres: 10e-9 });
assert.ok(Math.abs(coarse.first.d - 31.2) <= rangeRes(10e-9) / 2 + 1e-9);
// Two separated targets → two returns, in order
const two = simulate({ ...base, second: true, d2: 36 });
assert.equal(two.returns.length, 2); assert.ok(two.returns[0].d < two.returns[1].d);
// Threshold detection: walk-calibrated at amplitude 1 (30 m) → accurate there, reads long for weak far targets? (fires late)
const th30 = simulate({ ...base, method: 'threshold', interp: true, d: 30 });
assert.ok(Math.abs(th30.first.d - 30) < 0.02, `threshold at cal amplitude ${th30.first.d}`);
const th60 = simulate({ ...base, method: 'threshold', interp: true, d: 60 });
assert.ok(th60.first.d - 60 > 0.1, `weak return walks late ${th60.first.d}`);
// Averaging N shots reduces noise rms by √N
const n1 = simulate({ ...base, noise: true, ambient: 1 }), n16 = simulate({ ...base, noise: true, ambient: 1, shots: 16 });
close(n1.noiseRms / n16.noiseRms, 4, 1e-9);
// Measured scatter in a target-free window agrees with the model rms
const z = simulate({ ...base, noise: true, ambient: 1, d: 30, refl: 0.0 + 1e-9 });
const xs = z.meas.slice(0, 20).map(v => v - z.dc); const rms = Math.sqrt(xs.reduce((a, v) => a + v * v, 0) / xs.length);
assert.ok(rms > 0.5 * z.noiseRms && rms < 1.6 * z.noiseRms, `rms ${rms} vs ${z.noiseRms}`);
console.log('lidar-tof model: all tests passed');
// Detection range: a weak far target falls below threshold; more laser power recovers it
assert.equal(simulate({ ...base, d: 300 }).returns.length, 0);
const far = simulate({ ...base, d: 300, power: 100 }); assert.ok(Math.abs(far.first.d - 300) <= rangeRes(1e-9));
// Aliasing in the full simulation: 2 km target at 100 kHz PRF reads ≈ 501 m
const ali = simulate({ ...base, d: 2000, power: 3000 });
assert.ok(Math.abs(ali.first.d - (2000 - maxRange(100e3))) <= rangeRes(1e-9), `alias ${ali.first.d}`);
console.log('lidar-tof detection-range and aliasing tests passed');
