import assert from 'node:assert/strict';
import { simulate, minSizeNeeded, stateAt, isPow2, maskReach, nextPow2, capacityOf } from '../../src/sims/models/ring-buffer.ts';
const base = { prodRate: 1.2, consRate: 1, burst: 20, gap: 30, conv: 'count' as const };
// default traffic: backlog = burst(1 - c/p) = 3.33 -> peak ~4, no drops in 16 slots
const r = simulate({ ...base, size: 16 }); assert.equal(r.dropped, 0); assert.ok(r.peak >= 3 && r.peak <= 5, String(r.peak));
// conservation: produced = consumed + dropped + still in buffer
const end = stateAt(16, r.events, r.tEnd); assert.equal(r.produced, r.consumed + r.dropped + end.count);
// overload: a 40-item burst into 8 slots at 4x consumer speed drops the excess
const o = simulate({ size: 8, prodRate: 4, consRate: 1, burst: 40, gap: 100, conv: 'count' });
assert.ok(o.dropped > 0); const firstBurst = o.events.filter(e => e.t < 40 / 4 + 1e-9);
const need = minSizeNeeded({ prodRate: 4, consRate: 1, burst: 40, gap: 100, conv: 'count' });
assert.ok(Math.abs(need.peak - need.formula) <= 1, `${need.peak} vs ${need.formula}`);
assert.equal(simulate({ size: need.size, prodRate: 4, consRate: 1, burst: 40, gap: 100, conv: 'count' }).dropped, 0);
assert.ok(simulate({ size: need.size - 1, prodRate: 4, consRate: 1, burst: 40, gap: 100, conv: 'count' }).dropped > 0);
// one-slot-empty convention loses one slot
assert.equal(capacityOf(16, 'slot'), 15); assert.equal(capacityOf(16, 'count'), 16);
const s1 = minSizeNeeded({ prodRate: 4, consRate: 1, burst: 40, gap: 100, conv: 'slot' }); assert.equal(s1.size, need.size + 1);
assert.equal(simulate({ size: s1.size, prodRate: 4, consRate: 1, burst: 40, gap: 100, conv: 'slot' }).dropped, 0);
// consumer faster than producer: never more than ~1 item queued
assert.ok(simulate({ size: 4, prodRate: 1, consRate: 2, burst: 50, gap: 0, conv: 'slot' }).dropped === 0);
// fill with no consumer service: exactly cap items accepted, rest dropped
const f = simulate({ size: 8, prodRate: 1, consRate: 0.001, burst: 20, gap: 100, conv: 'slot', tEnd: 25 }); const accepted = f.events.filter(e => e.kind === 'push').length; assert.ok(accepted <= 8);
assert.ok(f.events.filter(e => e.kind === 'drop').length >= 12);
// pointers wrap: index = counter mod N, head - tail = count
const w = stateAt(8, simulate({ size: 8, prodRate: 1, consRate: 1, burst: 100, gap: 0, conv: 'count', tEnd: 30 }).events, 20.5); assert.ok(w.headAbs > 8 && w.headIdx === w.headAbs % 8 && w.headAbs - w.tailAbs === w.count);
assert.ok(isPow2(16) && !isPow2(12) && maskReach(16) === 16 && maskReach(12) === 8 && nextPow2(21) === 32);
console.log('ring-buffer model: all tests passed');
