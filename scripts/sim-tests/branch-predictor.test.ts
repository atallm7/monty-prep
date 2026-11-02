import assert from 'node:assert/strict';
import { makePattern, run, windowAccuracy, branchCPI, parseCustom } from '../../src/sims/models/branch-predictor.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

// Loop of 10 iterations executed 10 times
const loop = makePattern('loop', { n: 10, reps: 10 });
assert.equal(loop.length, 100); assert.equal(loop.filter(x => !x).length, 10);
close(run('two', loop, { init2: 2 }).accuracy, 0.9);           // 2-bit: 1 miss per loop -> 90%
close(run('two', loop, { init2: 3 }).accuracy, 0.9);
close(windowAccuracy(run('two', loop, { init2: 0 }), 10), 0.9); // steady state regardless of init
const one = run('one', loop, { init1: true });
assert.equal(one.misses, 1 + 2 * 9);                            // 1-bit: 2 misses per loop after the first
close(windowAccuracy(one, 10), 0.8);
close(run('at', loop).accuracy, 0.9); close(run('ant', loop).accuracy, 0.1);

// Alternating T N T N: 1-bit always wrong after the first; 2-bit starting weakly-NT is 0% (pathological), WT 50%
const alt = makePattern('alternating', { len: 40 });
assert.equal(run('one', alt, { init1: true }).misses, 39);
close(run('two', alt, { init2: 1 }).accuracy, 0);
close(run('two', alt, { init2: 2 }).accuracy, 0.5);
// Local history learns the period-2 pattern: perfect after warm-up
close(windowAccuracy(run('local', alt, { histBits: 2, init2: 1 }), 6), 1);
// Local history with k >= n-1 bits learns a loop of n perfectly; k = 2 on a loop of 4 too
close(windowAccuracy(run('local', makePattern('loop', { n: 4, reps: 20 }), { histBits: 3 }), 16), 1);

// Saturating counter never leaves 0..3
const r = run('two', makePattern('random', { len: 500, p: 0.5, seed: 7 }));
assert.ok(r.state.every(s => s >= 0 && s <= 3));
// Random 50/50 outcomes: no predictor can beat ~50%
assert.ok(Math.abs(r.accuracy - 0.5) < 0.08);
// Random biased 90% taken: 2-bit approaches 0.9*... at least 80%
assert.ok(run('two', makePattern('random', { len: 2000, p: 0.9, seed: 3 })).accuracy > 0.8);

assert.deepEqual(parseCustom('t n 1 0x'), [true, false, true, false]);
close(branchCPI(1, 0.2, 0.1, 3), 1.06);
console.log('branch-predictor model: all tests passed');
