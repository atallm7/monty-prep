import assert from 'node:assert/strict';
import { build, run, reference, PRESETS } from '../../src/sims/models/fsm-lab.ts';
const bits = (s: string) => s.split('').map(Number);
// Mealy 101 detector (overlapping) matches the brute-force reference
for (const [id, pat] of [['detect-101', [1, 0, 1]], ['detect-110', [1, 1, 0]]] as const) {
  const p = build(id);
  for (let v = 0; v < 1024; v++) {
    const xs = Array.from({ length: 10 }, (_, i) => (v >> i) & 1);
    const y = run(p.mealy, xs).steps.map(s => s.out as number);
    assert.deepEqual(y, reference(xs, [...pat]), `${id} ${xs}`);
    // Moore output (after the edge) = Mealy output at the same step: both come from the same step record
    const z = run(p.moore, xs).steps.map(s => s.out as number);
    assert.deepEqual(z, y, `${id} moore/mealy ${xs}`);
  }
}
// 10101 contains 101 twice (overlap)
assert.equal(run(build('detect-101').mealy, bits('10101')).steps.reduce((a, s) => a + (s.out as number), 0), 2);
// Moore visible output lags Mealy by one cycle: Moore out as seen before step t+1 = out[state_{t+1}] = Mealy y_t. Moore needs one more state.
const p = build('detect-101'); assert.equal(p.moore.states.length, p.mealy.states.length + 1);
// the Mealy output is raised during the cycle in which the last input bit is applied; Moore only in the next cycle
const xs = bits('101'); const ml = run(p.mealy, xs).steps, mo = run(p.moore, xs);
assert.equal(ml[2].out, 1); assert.equal(mo.state, 3); assert.equal((p.moore.out as number[])[mo.state], 1);
assert.equal((p.moore.out as number[])[run(p.moore, bits('10')).state], 0); // not yet visible before the last bit arrives
// vending: 15c = N+D, D+N, N+N+N, D+D (overpay) all dispense; Moore/Mealy agree
const v = build('vending');
for (const seq of ['ND', 'DN', 'NNN', 'DD']) { const dm = run(v.mealy, bits(seq.replace(/N/g, '0').replace(/D/g, '1'))); assert.equal(dm.steps[dm.steps.length - 1].out, 1, seq); assert.equal(dm.state, 0); }
assert.equal(run(v.mealy, bits('0')).steps[0].out, 0);
// traffic: no car keeps main green; a car triggers yellow then side green
const t = build('traffic'); const tr = run(t.moore, [0, 0, 1, 0, 0, 0]).steps.map(s => s.out);
assert.deepEqual(tr, ['G/R', 'G/R', 'Y/R', 'R/G', 'R/Y', 'G/R']);
for (const id of PRESETS) { const q = build(id); for (const m of [q.moore, q.mealy]) m.delta.forEach(r => r.forEach(n => assert.ok(n >= 0 && n < m.states.length))); }
console.log('fsm-lab model: all tests passed');
{ // z(t+1) = y(t): Moore output seen during cycle t is lambda(state_t)
  const p2 = build('detect-110'); const xs2 = bits('0110110011'); const ml2 = run(p2.mealy, xs2).steps, mo2 = run(p2.moore, xs2).steps;
  const zDuring = mo2.map(s => (p2.moore.out as number[])[s.from]);
  for (let t = 0; t + 1 < xs2.length; t++) assert.equal(zDuring[t + 1], ml2[t].out);
  console.log('fsm-lab: Moore lags Mealy by one cycle OK');
}
