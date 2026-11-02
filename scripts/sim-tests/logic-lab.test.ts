import assert from 'node:assert/strict';
import { preset, truthTable, evaluate, minimalSOP, gateEval, type Circuit, PRESET_NAMES } from '../../src/sims/models/logic-lab.ts';

// Kleene logic: a controlling value dominates an unknown
assert.equal(gateEval('AND', [0, 'X']), 0); assert.equal(gateEval('AND', [1, 'X']), 'X');
assert.equal(gateEval('OR', [1, 'X']), 1); assert.equal(gateEval('NAND', [0, 'X']), 1); assert.equal(gateEval('XOR', [1, 'X']), 'X');

const col = (c: Circuit, k: number) => truthTable(c).rows.map(r => r.outs[k]).join('');
// AND gate truth table (A is MSB): 00,01,10,11
assert.equal(col(preset('and'), 0), '0001');
// Half adder: S = A xor B, C = AB
assert.equal(col(preset('half-adder'), 0), '0110'); assert.equal(col(preset('half-adder'), 1), '0001');
// Full adder: S = parity, Cout = majority over (A,B,Cin)
{ const t = truthTable(preset('full-adder'));
  t.rows.forEach((r, i) => { const s = r.ins[0] + r.ins[1] + r.ins[2]; assert.equal(r.outs[0], s & 1, 'S row ' + i); assert.equal(r.outs[1], s >> 1, 'Cout row ' + i); }); }
// Mux2: inputs ordered by y: I0, S, I1  -> Y = S ? I1 : I0
{ const t = truthTable(preset('mux2')); t.rows.forEach(r => { const [i0, s, i1] = r.ins; assert.equal(r.outs[0], s ? i1 : i0); }); }
// NAND universality: NOT A, A AND B, A OR B
assert.equal(col(preset('nand-universal'), 0), '1100'); assert.equal(col(preset('nand-universal'), 1), '0001'); assert.equal(col(preset('nand-universal'), 2), '0111');
// XOR from 4 NANDs
assert.equal(col(preset('xor-from-nand'), 0), '0110');
// Majority of 3: m(3,5,6,7)
assert.equal(col(preset('majority'), 0), '00010111');
// 2-to-4 decoder: one-hot
{ const t = truthTable(preset('decoder2')); t.rows.forEach((r, i) => r.outs.forEach((o, k) => assert.equal(o, k === i ? 1 : 0))); }
// Minimal SOP (Quine-McCluskey)
assert.equal(minimalSOP(3, [3, 5, 6, 7], [], ['A', 'B', 'C']).split(' + ').sort().join(' + '), 'AB + AC + BC');
assert.equal(minimalSOP(2, [1, 2], [], ['A', 'B']), "A'B + AB'");
assert.equal(minimalSOP(2, [0, 1, 2, 3], [], ['A', 'B']), '1');
// Floating input -> X; combinational loop detection (NOT feeding itself = ring oscillator)
{ const c: Circuit = { nodes: [{ id: 'A', kind: 'IN', x: 0, y: 0, value: 1 }, { id: 'g', kind: 'AND', x: 0, y: 0 }, { id: 'Y', kind: 'OUT', x: 0, y: 0 }], wires: [{ from: 'A', to: 'g', pin: 0 }, { from: 'g', to: 'Y', pin: 0 }] };
  assert.equal(evaluate(c).values.Y, 'X');
  c.nodes[0].value = 0; assert.equal(evaluate(c).values.Y, 0); // 0 controls the AND even with a floating pin
  const loop: Circuit = { nodes: [{ id: 'n', kind: 'NOT', x: 0, y: 0 }, { id: 'Y', kind: 'OUT', x: 0, y: 0 }], wires: [{ from: 'n', to: 'n', pin: 0 }, { from: 'n', to: 'Y', pin: 0 }] };
  const e = evaluate(loop); assert.deepEqual(e.loopNodes, ['n']); assert.equal(e.values.Y, 'X'); }
for (const p of PRESET_NAMES) truthTable(preset(p));
console.log('logic-lab model: all tests passed');
