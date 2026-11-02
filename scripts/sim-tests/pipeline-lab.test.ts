import assert from 'node:assert/strict';
import { simulate, compareTiming, occupancy } from '../../src/sims/models/pipeline-lab.ts';

// H&P §4.7: A=B+E; C=B+F takes 13 cycles with forwarding (2 load-use stalls), 11 when reordered.
const lu = simulate('load-use', { forwarding: true, branchIn: 'EX' });
assert.equal(lu.n, 7); assert.equal(lu.cycles, 13); assert.equal(lu.loadUse, 2); assert.equal(lu.stallCycles, 2);
const lur = simulate('load-use', { forwarding: true, branchIn: 'EX', reorder: true });
assert.equal(lur.cycles, 11); assert.equal(lur.stallCycles, 0);
// each load-use stall is exactly 1 bubble with forwarding
assert.deepEqual(lu.rows.map(r => r.stalls), [0, 0, 1, 0, 0, 1, 0]);
// the dependent add gets its operand via MEM/WB -> EX
assert.ok(lu.rows[2].fwd.some(f => f.kind === 'MEM/WB→EX' && f.reg === 2));

// ALU chain (H&P Fig 4.52): no stalls with forwarding; without forwarding dist-1 RAW costs 2 cycles.
const af = simulate('alu', { forwarding: true, branchIn: 'EX' });
assert.equal(af.cycles, 9); assert.equal(af.cpi, 1);
assert.ok(af.rows[1].fwd.some(f => f.kind === 'EX/MEM→EX'));
assert.ok(af.rows[2].fwd.some(f => f.kind === 'MEM/WB→EX'));
const an = simulate('alu', { forwarding: false, branchIn: 'EX' });
assert.equal(an.stallCycles, 2); assert.equal(an.cycles, 11);
// without forwarding a load-use is also 2 stalls
const lun = simulate('load-use', { forwarding: false, branchIn: 'EX' });
assert.equal(lun.rows[2].stalls, 2);

// Branch loop: 3 iterations, 2 taken -> 12 dynamic instructions; 2-cycle flush each in EX, 1 in ID.
const be = simulate('branch', { forwarding: true, branchIn: 'EX' });
assert.equal(be.n, 12); assert.equal(be.takenBranches, 2); assert.equal(be.flushCycles, 4);
assert.equal(be.cycles, 12 + 4 + 4); assert.ok(Math.abs(be.cpi - 16 / 12) < 1e-12);
assert.equal(be.regs[2], 2 + 1 + 0); // x2 = sum of x1 after decrement: 2+1+0
assert.equal(be.rows.filter(r => r.flushed).length, 4);
const bi = simulate('branch', { forwarding: true, branchIn: 'ID' });
assert.equal(bi.flushCycles, 2); assert.equal(bi.cycles, 12 + 4 + 2);
// unpipelined comparison: ideal speedup = (5*200+20)/(220)
const t = compareTiming(1000, 1004, 200e-12, 20e-12);
assert.ok(Math.abs(t.ideal - 1020 / 220) < 1e-12); assert.ok(t.speedup < t.ideal);
// occupancy: at cycle 5 of the ALU program each stage holds a different instruction
const o = occupancy(af.rows, 5); assert.deepEqual([o.IF, o.ID, o.EX, o.MEM, o.WB], [4, 3, 2, 1, 0]);
console.log('pipeline-lab model: all tests passed');
