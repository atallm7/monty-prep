import assert from 'node:assert/strict';
import { simulate, type Src } from '../../src/sims/models/interrupt-lab.ts';
const close = (a: number, b: number, t = 1e-9) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const S = (name: string, period: number, phase: number, dur: number, prio: number): Src => ({ name, period, phase, dur, prio, enabled: true });
// single ISR: 10 us every 100 us, no overhead -> 10 % load, zero latency, no misses
{ const r = simulate([S('A', 100, 0, 10, 1)], { nesting: false, entry: 0, T: 1000 }); close(r.isrLoad, 0.1); close(r.util, 0.1); assert.equal(r.stats[0].missed, 0); assert.equal(r.stats[0].worstLatency, 0); assert.equal(r.stats[0].served, 10); }
// entry overhead adds to load and to latency: (10+2)/100 = 12 %
{ const r = simulate([S('A', 100, 0, 10, 1)], { nesting: false, entry: 2, T: 1000 }); close(r.isrLoad, 0.12); assert.equal(r.stats[0].worstLatency, 2); }
// priority inversion of response: low-prio ISR (20 us at t=0) blocks a high-prio event arriving at t=5
const mk = () => [S('LOW', 1000, 0, 20, 3), S('HIGH', 1000, 5, 4, 1)];
{ const r = simulate(mk(), { nesting: false, entry: 0, T: 100 }); assert.equal(r.stats[1].worstLatency, 15); const hi = r.evs.find(e => e.src === 1)!; assert.equal(hi.start, 20); assert.equal(hi.end, 24); }
{ const r = simulate(mk(), { nesting: true, entry: 0, T: 100 }); assert.equal(r.stats[1].worstLatency, 0); const hi = r.evs.find(e => e.src === 1)!; assert.equal(hi.start, 5); assert.equal(hi.end, 9);
  const lo = r.evs.find(e => e.src === 0)!; assert.equal(lo.end, 24); // 20 us of work stretched by the 4 us preemption
  assert.deepEqual(r.segs.filter(s => s.src >= 0).map(s => [s.src, s.t0, s.t1]), [[0, 0, 5], [1, 5, 9], [0, 9, 24]]); }
// equal priority never preempts, even when nesting is enabled
{ const r = simulate([S('A', 1000, 0, 20, 2), S('B', 1000, 5, 4, 2)], { nesting: true, entry: 0, T: 100 }); assert.equal(r.evs.find(e => e.src === 1)!.start, 20); }
// ISR longer than its period => missed events; shorter => none
{ const r = simulate([S('A', 10, 0, 25, 1)], { nesting: false, entry: 0, T: 200 }); assert.ok(r.stats[0].missed > 0); assert.ok(r.isrLoad > 0.99); assert.ok(r.util > 1); }
{ const r = simulate([S('A', 10, 0, 9, 1)], { nesting: false, entry: 0, T: 200 }); assert.equal(r.stats[0].missed, 0); }
// timeline covers exactly T and main loop gets the rest
{ const r = simulate([S('A', 40, 3, 6, 1), S('B', 55, 7, 12, 2)], { nesting: true, entry: 1, T: 220 }); assert.equal(r.segs.reduce((a, s) => a + s.t1 - s.t0, 0), 220); close(r.mainLoad + r.isrLoad, 1); }
// disabled source never fires
{ const r = simulate([{ ...S('A', 10, 0, 2, 1), enabled: false }], { nesting: false, entry: 0, T: 100 }); assert.equal(r.stats[0].fired, 0); close(r.isrLoad, 0); }
console.log('interrupt-lab model: all tests passed');
