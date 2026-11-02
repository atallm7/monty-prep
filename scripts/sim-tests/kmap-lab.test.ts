import assert from 'node:assert/strict';
import { minimise, cellsFrom, evalSOP, evalPOS, layout, cubeRects, productTerm } from '../../src/sims/models/kmap-lab.ts';

const sortTerms = (s: string) => s.split(' + ').sort().join(' + ');
// Majority of three: AB + AC + BC (three essential primes)
{ const r = minimise(3, cellsFrom(3, [3, 5, 6, 7], [])); assert.equal(sortTerms(r.sopStr), 'AB + AC + BC'); assert.equal(r.essential.length, 3); assert.equal(r.sopGates.total, 4); }
// Textbook: F(A,B,C,D) = Σm(0,2,5,7,8,10,13,15) = B'D' + BD (corners group wraps around)
{ const r = minimise(4, cellsFrom(4, [0, 2, 5, 7, 8, 10, 13, 15], [])); assert.equal(sortTerms(r.sopStr), "B'D' + BD");
  const corner = r.sop.find(c => productTerm(4, c) === "B'D'")!; assert.equal(cubeRects(4, corner).length, 4, 'corner group is drawn as 4 pieces'); }
// Don't cares: F = Σm(1,3,7,11,15) + d(0,2,5) -> 2 terms, 4 literals (CD + A'B' or CD + A'D)
{ const r = minimise(4, cellsFrom(4, [1, 3, 7, 11, 15], [0, 2, 5])); assert.equal(r.sop.length, 2); assert.equal(r.sopLiterals, 4); assert.ok(r.sopStr.includes('CD')); }
// Default demo: Σm(0,2,4,5,6) = C' + AB'  (C' wraps the left and right columns)
{ const r = minimise(3, cellsFrom(3, [0, 2, 4, 5, 6], [])); assert.equal(sortTerms(r.sopStr), "AB' + C'"); assert.equal(r.posStr.length > 0, true); }
// POS of XOR: (A + B)(A' + B')
{ const r = minimise(2, cellsFrom(2, [1, 2], [])); assert.equal(r.posStr, "(A + B)(A' + B')"); assert.equal(sortTerms(r.sopStr), "A'B + AB'"); }
// Constants
assert.equal(minimise(3, cellsFrom(3, [], [])).sopStr, '0');
assert.equal(minimise(3, cellsFrom(3, [0, 1, 2, 3, 4, 5, 6, 7], [])).sopStr, '1');
// Gray-code layout: adjacent cells differ in exactly one bit, including wrap-around
for (const nv of [2, 3, 4]) { const L = layout(nv);
  for (let r = 0; r < L.rows.length; r++) for (let c = 0; c < L.cols.length; c++) {
    const m = L.minterm(r, c); const pc = (x: number) => x.toString(2).split('').filter(b => b === '1').length;
    if (L.cols.length > 1) assert.equal(pc(m ^ L.minterm(r, (c + 1) % L.cols.length)), 1);
    if (L.rows.length > 1) assert.equal(pc(m ^ L.minterm((r + 1) % L.rows.length, c), ), 1);
  } }
// Exhaustive check: for every 3-variable function (with random don't-cares), SOP and POS reproduce the spec
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let f = 0; f < 256; f++) {
  const cells = Array.from({ length: 8 }, (_, i) => (f >> i) & 1 ? 1 : (rnd() < 0.2 ? 'X' : 0)) as (0 | 1 | 'X')[];
  const r = minimise(3, cells);
  cells.forEach((v, m) => { if (v === 'X') return; assert.equal(evalSOP(r.sop, m), v === 1, `SOP f=${f} m=${m}`); assert.equal(evalPOS(r.posCubes, m), v === 1, `POS f=${f} m=${m}`); });
}
console.log('kmap-lab model: all tests passed');
