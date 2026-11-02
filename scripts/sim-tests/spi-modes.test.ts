import assert from 'node:assert/strict';
import { cpol, cpha, sampleEdge, clockEdges, sclkLevel, sampleTimes, dataWindows, bitsOf, crossReceive, daisyChain } from '../../src/sims/models/spi-modes.ts';

// Textbook mode table
assert.deepEqual([0, 1, 2, 3].map(m => [cpol(m as any), cpha(m as any), sampleEdge(m as any)]),
  [[0, 0, 'rising'], [0, 1, 'falling'], [1, 0, 'falling'], [1, 1, 'rising']]);
// idle level = CPOL; 8 clock cycles = 16 edges
assert.equal(sclkLevel(0, 0), 0); assert.equal(sclkLevel(2, 0), 1); assert.equal(sclkLevel(3, 20), 1);
assert.equal(clockEdges(0).length, 16);
assert.equal(clockEdges(0)[0].dir, 'rising'); assert.equal(clockEdges(2)[0].dir, 'falling');
// every sampling edge has the documented polarity
for (const m of [0, 1, 2, 3] as const) {
  const st = sampleTimes(m); assert.equal(st.length, 8);
  for (const t of st) assert.equal(clockEdges(m).find(e => e.t === t)!.dir, sampleEdge(m));
  // data must be stable at each sample instant (sample strictly inside a data window, not on a change)
  const w = dataWindows(m);
  st.forEach((t, i) => assert.ok(t > w[i].from && t < w[i].to, `mode ${m} bit ${i}`));
}
// CPHA=0: first bit valid at CS fall (t=0); CPHA=1: on first edge
assert.equal(dataWindows(0)[0].from, 0); assert.equal(dataWindows(1)[0].from, 1);
assert.deepEqual(bitsOf(0xA5), [1, 0, 1, 0, 0, 1, 0, 1]); assert.deepEqual(bitsOf(0xA5, false), [1, 0, 1, 0, 0, 1, 0, 1].reverse());
// same mode → exact; modes 0 and 3 share the rising sampling edge → also correct, no race
for (const [tx, rx] of [[0, 0], [1, 1], [2, 2], [3, 3], [0, 3], [3, 0], [1, 2]] as const) {
  const r = crossReceive(tx, rx, 0xA5); assert.equal(r.valueIfHoldOk, 0xA5); assert.equal(r.valueIfLate, 0xA5); assert.equal(r.race, false, `${tx}->${rx}`);
}
// master mode 0, slave mode 1: slave samples on the master's shift edge → hold-time race,
// late outcome is the byte shifted left by one with the last bit repeated: 0xA5 → 0x4B
const x = crossReceive(0, 1, 0xA5);
assert.equal(x.race, true); assert.equal(x.valueIfHoldOk, 0xA5); assert.equal(x.valueIfLate, 0x4B);
// daisy chain: after 8·n clocks the first byte sent is in the last device; MISO returns last device first
const d = daisyChain([0x11, 0x22], [0xAA, 0xBB], 16);
assert.deepEqual(d.regs, [0xBB, 0xAA]);
const misoBytes = [0, 1].map(k => d.miso.slice(8 * k, 8 * k + 8).reduce((a, b) => (a << 1) | b, 0));
assert.deepEqual(misoBytes, [0x22, 0x11]);
assert.deepEqual(daisyChain([0x11, 0x22], [0xAA, 0xBB], 8).regs, [0xAA, 0x11]);
console.log('spi-modes model: all tests passed');
