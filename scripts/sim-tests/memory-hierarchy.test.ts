import assert from 'node:assert/strict';
import { amat, breakdown, cpi, hitsFromWorkingSet } from '../../src/sims/models/memory-hierarchy.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const d = { l1hit: 0.95, l2hit: 0.8, l3hit: 0.5, l1: 4, l2: 12, l3: 40, dram: 200 };
// AMAT = 4 + 0.05(12 + 0.2(40 + 0.5·200)) = 4 + 0.05·40 = 6
close(amat(d), 6);
const b = breakdown(d);
close(b.time.l1, 4); close(b.time.l2, 0.6); close(b.time.l3, 0.05 * 0.2 * 40); close(b.time.dram, 0.05 * 0.2 * 0.5 * 200);
close(b.cache, 6);
close(b.served.l1 + b.served.l2 + b.served.l3 + b.served.dram, 1);
close(b.served.dram, 0.005);
// TLB term adds miss·penalty
close(breakdown(d, 0.01, 30).total, 6.3);
// all hits in L1 -> AMAT = t1; all L1 misses & everything else misses -> sum of latencies
close(amat({ ...d, l1hit: 1 }), 4);
close(amat({ ...d, l1hit: 0, l2hit: 0, l3hit: 0 }), 4 + 12 + 40 + 200);
// CPI: 1 + 0.3·(6−4) = 1.6
close(cpi(1, 0.3, 6, 4), 1.6);
// Working-set sweep: fits in L1 -> AMAT = t1, and nested AMAT equals the flat form t1 + (1−H1)t2 + (1−H2)t3 + (1−H3)tD
const fit = hitsFromWorkingSet(16e3, 32e3, 256e3, 8e6);
close(amat({ ...d, ...fit }), 4);
const W = 2e6, h = hitsFromWorkingSet(W, 32e3, 256e3, 8e6);
close(amat({ ...d, ...h }), 4 + (1 - h.H[0]) * 12 + (1 - h.H[1]) * 40 + (1 - h.H[2]) * 200, 1e-9);
// huge working set -> approaches DRAM-dominated
assert.ok(amat({ ...d, ...hitsFromWorkingSet(1e10, 32e3, 256e3, 8e6) }) > 190);
console.log('memory-hierarchy model: all tests passed');
