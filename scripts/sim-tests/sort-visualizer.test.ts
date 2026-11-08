import assert from 'node:assert/strict';
import { makeInput, sortEvents, replay, isSorted, measureSort, searchEvents, measureSearch, type Algo } from '../../src/sims/models/sort-visualizer.ts';
const algos: Algo[] = ['bubble', 'insertion', 'merge', 'quick'];
// correctness: always sorted permutation
for (const al of algos) for (const k of ['random', 'sorted', 'reversed', 'nearly'] as const) for (const n of [1, 2, 3, 8, 17, 50]) {
  const init = makeInput(k, n, 3); const s = replay(init, sortEvents(al, init), Infinity);
  assert.ok(isSorted(s.arr), `${al} ${k} ${n}`); assert.deepEqual(s.arr.slice().sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i + 1));
}
const T = (n: number) => n * (n - 1) / 2;
for (const n of [8, 20, 33]) {
  // bubble: sorted -> n-1 comparisons, 0 swaps; reversed -> n(n-1)/2 comparisons and swaps
  let m = replay(makeInput('sorted', n), sortEvents('bubble', makeInput('sorted', n)), Infinity);
  assert.equal(m.cmp, n - 1); assert.equal(m.swaps, 0);
  m = replay(makeInput('reversed', n), sortEvents('bubble', makeInput('reversed', n)), Infinity);
  assert.equal(m.cmp, T(n)); assert.equal(m.swaps, T(n));
  // insertion: sorted -> n-1 comparisons 0 writes; reversed -> T(n) comparisons, T(n) shifts + (n-1) key writes
  m = replay(makeInput('sorted', n), sortEvents('insertion', makeInput('sorted', n)), Infinity);
  assert.equal(m.cmp, n - 1); assert.equal(m.writes, 0);
  m = replay(makeInput('reversed', n), sortEvents('insertion', makeInput('reversed', n)), Infinity);
  assert.equal(m.cmp, T(n)); assert.equal(m.writes, T(n) + n - 1);
  // quick sort (last pivot) on sorted/reversed input is quadratic
  assert.equal(measureSort('quick', 'sorted', n).cmp, T(n));
  assert.equal(measureSort('quick', 'reversed', n).cmp, T(n));
}
// merge sort on sorted power-of-two n: (n/2)·log2 n comparisons; always <= n·ceil(log2 n)
assert.equal(measureSort('merge', 'sorted', 8).cmp, 12); assert.equal(measureSort('merge', 'sorted', 64).cmp, 192);
assert.equal(measureSort('merge', 'sorted', 64).moves, 64 * 6); // n writes per level
for (let n = 2; n < 200; n += 7) assert.ok(measureSort('merge', 'random', n, 5).cmp <= n * Math.ceil(Math.log2(n)));
// n log n vs n^2 growth for random input
assert.ok(measureSort('merge', 'random', 512).cmp < 5000 && measureSort('bubble', 'random', 512).cmp > 100000);
// searches
const sorted = Array.from({ length: 16 }, (_, i) => i + 1);
assert.equal(searchEvents('linear-search', sorted, 7).filter(e => e.t === 'cmp').length, 7);
assert.equal(searchEvents('linear-search', sorted, 99).filter(e => e.t === 'cmp').length, 16);
assert.equal(measureSearch('binary-search', 16).worst, 5); assert.equal(measureSearch('binary-search', 1024).worst, 11);
assert.equal(measureSearch('linear-search', 100).avg, 50.5);
assert.ok(searchEvents('binary-search', sorted, 99).every(e => e.t !== 'found'));
console.log('sort-visualizer model: all tests passed');
