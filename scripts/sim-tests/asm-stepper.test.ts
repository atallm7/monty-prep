import assert from 'node:assert/strict';
import { assemble, run, source, cycleEstimate, regNum } from '../../src/sims/models/asm-stepper.ts';

assert.equal(regNum('a0'), 10); assert.equal(regNum('x31'), 31); assert.equal(regNum('s1'), 9); assert.equal(regNum('t3'), 28);

// sum-loop: sum 1..10 = 55, N = 3 + 3n instructions, n-1 taken branches
const s = run(assemble(source('sum-loop', 10)));
assert.ok(s.halted); assert.equal(s.final[10], 55); assert.equal(s.count, 33); assert.equal(s.taken, 9); assert.equal(s.notTaken, 1);
const ce = cycleEstimate(s, 2); assert.equal(ce.cycles, 33 + 4 + 18); assert.equal(ce.unpipelined, 165);
for (const n of [1, 5, 37]) { const r = run(assemble(source('sum-loop', n))); assert.equal(r.final[10], n * (n + 1) / 2); assert.equal(r.count, 3 + 3 * n); }

// nested-loop: count = N*M; instructions = 4 + N(3M + 3)
for (const [n, m] of [[3, 4], [5, 2], [1, 1]]) {
  const r = run(assemble(source('nested-loop', n, m)));
  assert.equal(r.final[10], n * m); assert.equal(r.count, 4 + n * (3 * m + 3));
  const asm = assemble(source('nested-loop', n, m));
  assert.equal(r.execCount[asm.labels.inner], n * m); // inner body runs N*M times
}

// subroutine: sum of squares n(n+1)(2n+1)/6, n calls, instructions = 4 + 7n
const sub = run(assemble(source('subroutine', 4)));
assert.equal(sub.final[8], 30); assert.equal(sub.calls, 4); assert.equal(sub.count, 4 + 7 * 4);
const asm = assemble(source('subroutine', 4)); assert.equal(sub.execCount[asm.labels.square], 4);
// jal writes the return address (byte address of the next instruction); ret returns there
const call = sub.steps.find(x => x.jump === 'call')!; assert.equal(call.regs[1], (call.pc + 1) * 4);
const ret = sub.steps.find(x => x.jump === 'ret')!; assert.equal(ret.nextPc, call.pc + 1);
assert.ok(sub.steps.every(x => x.regs[0] === 0));

// load-use detection and signed compare
const lu = run(assemble(`li t0, 5\nsw t0, 0(sp)\nlw t1, 0(sp)\nadd t2, t1, t1\nli t3, -1\nblt t3, zero, end\nli t4, 9\nend:`));
assert.equal(lu.loadUse, 1); assert.equal(lu.final[7], 10); assert.equal(lu.final[29], 0); assert.equal(lu.taken, 1);
assert.throws(() => assemble('foo x1, x2'));
console.log('asm-stepper model: all tests passed');
