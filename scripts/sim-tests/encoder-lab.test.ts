import assert from 'node:assert/strict';
import { channels, decodeSequence, step4x, waveforms, speedMetrics } from '../../src/sims/models/encoder-lab.ts';
import type { Decode } from '../../src/sims/models/encoder-lab.ts';
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b} ±${tol}`);

// Gray sequence forward (A leads B): 00 → 10 → 11 → 01
const fwd = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([a, b]) => ({ a, b }));
const cyc = (seq: typeof fwd, n: number) => { const o = []; for (let i = 0; i < n; i++) o.push(...seq); o.push(seq[0]); return o; };
const rev = [...fwd].reverse();
// one full electrical cycle → 1, 2, 4 counts for 1×/2×/4×
for (const [m, k] of [[1, 1], [2, 2], [4, 4]] as [Decode, number][]) {
  assert.equal(decodeSequence(cyc(fwd, 10), m).count, 10 * k, `fwd ${m}x`);
  assert.equal(decodeSequence(cyc(rev, 10), m).count, -10 * k, `rev ${m}x`);
}
// Illegal double transition (00 → 11) flags a missed edge
assert.ok(Number.isNaN(step4x(0b00, 0b11)));
// Direction reversal in the middle: forward 2 steps then back 2 → net 0
assert.equal(decodeSequence([{ a: 0, b: 0 }, { a: 1, b: 0 }, { a: 1, b: 1 }, { a: 1, b: 0 }, { a: 0, b: 0 }], 4).count, 0);

// Channel phase: B lags A by 90° electrical
assert.deepEqual(channels(0.1 / 64, 64), { a: 1, b: 0 });
assert.deepEqual(channels(0.3 / 64, 64), { a: 1, b: 1 });

// Waveform decode over exactly 1 revolution (600 rpm → 0.1 s), cpr 64: counts = 64·k
for (const m of [1, 2, 4] as Decode[]) near(waveforms(600, 64, m, 0.1, 64 * 4 * 8).C.at(-1)!, 64 * m, 1, `1 rev ${m}x`);
near(waveforms(-600, 64, 4, 0.1, 64 * 4 * 8).C.at(-1)!, -256, 1, 'reverse 1 rev');

// Speed: 600 rpm, cpr 64, 4× (256 counts/rev), 10 ms window → 25.6 counts → floor 25 → 585.9 rpm, resolution 23.4 rpm
const s = speedMetrics(600, 64, 4, 0.01, 1e6);
assert.equal(s.Nc, 256); near(s.fEdge, 2560, 1e-9);
assert.equal(s.nCount, 25); near(s.rpmM, 585.9375, 1e-6); near(s.resM, 23.4375, 1e-9);
// T-method: edge period 390.6 µs at 1 MHz → 390 ticks → 600.96 rpm
assert.equal(s.m, 390); near(s.rpmT, 60e6 / (256 * 390), 1e-9);
// crossover where 60/(Nc·Tw·r) = r·Nc/(60·fclk)
near(60 / (256 * 0.01 * s.crossover), s.crossover * 256 / (60e6), 1e-12, 'crossover');
console.log('encoder-lab model: all tests passed');
