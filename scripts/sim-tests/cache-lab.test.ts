import assert from 'node:assert/strict';
import { fields, split, makeTrace, simulate, amat } from '../../src/sims/models/cache-lab.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

const dm = { lines: 8, ways: 1, block: 16 };
const f = fields(dm);
assert.deepEqual([f.offsetBits, f.indexBits, f.tagBits, f.size], [4, 3, 9, 128]);
assert.deepEqual(split(0x1234, dm), { offset: 4, index: 3, tag: 0x24 });
const f2 = fields({ lines: 8, ways: 2, block: 16 }); assert.deepEqual([f2.sets, f2.indexBits, f2.tagBits], [4, 2, 10]);
const fa = fields({ lines: 8, ways: 8, block: 16 }); assert.equal(fa.indexBits, 0);

// Sequential word reads, 128 B array, 16 B blocks: 1 miss per 4 words on pass 1, all hits on pass 2.
const seq = simulate(dm, makeTrace('sequential', dm, { arrayBytes: 128 }));
assert.equal(seq.misses, 8); close(seq.hitRate, 56 / 64); assert.equal(seq.kinds.compulsory, 8);
// first pass alone: hit rate = 1 - word/block = 75%
const p1 = simulate(dm, makeTrace('sequential', dm, { arrayBytes: 128 }).slice(0, 32)); close(p1.hitRate, 0.75);
// array larger than the cache: second pass misses again (capacity misses)
const big = simulate(dm, makeTrace('sequential', dm, { arrayBytes: 256 }));
assert.equal(big.kinds.capacity, 16); close(big.hitRate, 0.75);

// Conflict: A[i], B[i] one cache-size apart thrash a direct-mapped cache (0% hits) ...
const cf = simulate(dm, makeTrace('conflict', dm));
assert.equal(cf.hits, 0); assert.equal(cf.kinds.compulsory, 8); assert.equal(cf.kinds.conflict, 24);
// ... but a 2-way cache of the same size holds both: 75%
const w2 = { lines: 8, ways: 2, block: 16 };
close(simulate(w2, makeTrace('conflict', w2)).hitRate, 0.75);

// LRU vs FIFO on one 2-way set: A B A C A
const one = { lines: 2, ways: 2, block: 16 };
const tr = [0x000, 0x100, 0x000, 0x200, 0x000];
assert.deepEqual(simulate({ ...one, repl: 'lru' }, tr).accesses.map(a => a.hit), [false, false, true, false, true]);
assert.deepEqual(simulate({ ...one, repl: 'fifo' }, tr).accesses.map(a => a.hit), [false, false, true, false, false]);
// eviction record: in LRU, C evicts B (tag of 0x100)
const ev = simulate({ ...one, repl: 'lru' }, tr).accesses[3].evicted!; assert.equal(ev.blockAddr, 0x100);

// custom trace parsing
assert.deepEqual(makeTrace('custom', dm, { custom: '0x10, 32 0xff' }), [16, 32, 255]);
close(amat(1, 0.05, 100), 6);
console.log('cache-lab model: all tests passed');
