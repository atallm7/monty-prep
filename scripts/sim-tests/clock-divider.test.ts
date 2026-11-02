import assert from 'node:assert/strict';
import { simulate, duty, measuredPeriod, effectiveN, fout } from '../../src/sims/models/clock-divider.ts';
const close = (a: number, b: number, t = 1e-9) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
// divide ratio: output period = N input cycles for every N and mode
for (const mode of ['single', 'symmetric', 'pulse'] as const) for (let n = 2; n <= 13; n++) close(measuredPeriod(n, mode), n);
// even N with toggle = 50 %; odd N single-edge gives (N+1)/2N; dual-edge fix gives exactly 50 %
for (const n of [2, 4, 6, 10]) { close(duty(n, 'single'), 0.5); close(duty(n, 'symmetric'), 0.5); }
close(duty(3, 'single'), 2 / 3); close(duty(5, 'single'), 3 / 5);
for (const n of [3, 5, 7, 9, 11]) close(duty(n, 'symmetric'), 0.5, 1e-9);
// pulse strobe is one cycle wide: duty 1/N
close(duty(8, 'pulse'), 1 / 8); close(duty(3, 'pulse'), 1 / 3);
// dual-edge odd-N output edges sit on falling clock edges (half-cycle offsets)
{ const s = simulate(3, 'symmetric', 12); const rises: number[] = []; for (let i = 1; i < s.samples; i++) if (s.out[i] && !s.out[i - 1]) rises.push(i); assert.ok(rises.every(i => i % 2 === 1), 'rising edges of out land on falling clk edges'); }
// ripple chain: Q_i = f/2^(i+1)
{ const s = simulate(8, 'ripple', 16); assert.equal(s.stages.length, 3); close(measuredPeriod(8, 'ripple'), 8); close(duty(8, 'ripple'), 0.5); assert.equal(effectiveN(5, 'ripple'), 4); assert.equal(effectiveN(6, 'ripple'), 8); }
// counter values 0..N-1 wrap
{ const s = simulate(5, 'single', 12); assert.deepEqual(s.count.filter((_, i) => i % 2 === 0), [0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1]); }
close(fout(100e6, 4), 25e6);
console.log('clock-divider model: all tests passed');
