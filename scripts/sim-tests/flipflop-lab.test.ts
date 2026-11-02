import assert from 'node:assert/strict';
import { simulateFF, simulateLatch, simulateSR, clockWave, fromRuns, valueAt, slacks, mtbf, risingEdges } from '../../src/sims/models/flipflop-lab.ts';

const spp = 20, nPer = 6; const T = { spp, tsu: 0.1, th: 0.05, tcq: 0.1, tau: 0.08, seed: 1 };
const clk = clockWave(nPer, spp); // rising edges at 0.5, 1.5, ...
assert.deepEqual(risingEdges(clk, spp), [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]);

// D toggles well away from edges: FF output is D delayed to the next edge (+ t_cq), never X after first edge
{ const d = fromRuns(spp, nPer, [1.0, 3.0]); // D=1 during [1,3)
  const r = simulateFF(clk, d, T); assert.ok(r.edges.every(e => !e.violated));
  assert.equal(valueAt(r.q, 0.55), 'x'); // before t_cq after the first edge: power-up unknown
  assert.equal(valueAt(r.q, 0.65), 0); assert.equal(valueAt(r.q, 1.65), 1); assert.equal(valueAt(r.q, 2.65), 1); assert.equal(valueAt(r.q, 3.65), 0); }

// A glitch on D while CLK is high passes through a latch but is ignored by the edge-triggered FF
{ const d = fromRuns(spp, nPer, [0.7, 0.85]); // pulse inside the high phase of period 0 (CLK high 0.5..1.0)
  const ff = simulateFF(clk, d, T); const la = simulateLatch(clk, d, T);
  assert.equal(valueAt(la.q, 0.85), 1, 'latch is transparent'); assert.equal(valueAt(la.q, 1.2), 0);
  assert.ok(ff.q.every(s => s.v !== 1), 'FF never sees the glitch'); }

// Setup violation: D changes 0.05 T before the edge with t_su = 0.1 T -> slack −0.05, metastable output
{ const s = slacks([1.45], 1.5, 0.1, 0.05); assert.ok(Math.abs(s.setupSlack + 0.05) < 1e-9); assert.equal(s.violated, true);
  const ok = slacks([1.4], 1.5, 0.1, 0.05); assert.equal(ok.violated, false); // exactly t_su before is fine
  const hold = slacks([1.5], 1.5, 0.1, 0.05); assert.ok(hold.holdSlack < 0 && hold.violated);
  const d = fromRuns(spp, nPer, [1.45]); const r = simulateFF(clk, d, T);
  const e = r.edges[1]; assert.equal(e.violated, true); assert.equal(valueAt(r.q, 1.6 + 1e-6), 'x');
  assert.ok(e.resolveAt! > 1.6); assert.equal(valueAt(r.q, e.resolveAt! + 1e-6), e.value); }

// Metastability resolution time is exponential with mean τ (sample many seeds)
{ let sum = 0; const n = 4000; const d = fromRuns(spp, 2, [0.45]); const c2 = clockWave(2, spp);
  for (let s = 0; s < n; s++) { const r = simulateFF(c2, d, { ...T, seed: s + 10 }); sum += r.edges[0].resolveAt! - (0.5 + T.tcq); }
  assert.ok(Math.abs(sum / n - T.tau) < 0.1 * T.tau, `mean t_res ${sum / n}`); }

// SR latch: set, hold, reset, invalid (Q = Q' = 0), simultaneous release -> race
{ const S = fromRuns(spp, nPer, [0.5, 1.0, 3.0, 4.0]); const R = fromRuns(spp, nPer, [2.0, 2.5, 3.0, 4.0]);
  const r = simulateSR(S, R, { spp, tpd: 0.05, tau: 0.08, seed: 3 });
  assert.equal(valueAt(r.q, 0.3), 'x'); assert.equal(valueAt(r.q, 0.8), 1); assert.equal(valueAt(r.q, 1.5), 1); // hold
  assert.equal(valueAt(r.q, 2.3), 0); assert.equal(valueAt(r.qn, 2.3), 1);
  assert.equal(valueAt(r.q, 3.5), 0); assert.equal(valueAt(r.qn, 3.5), 0); // invalid: both outputs low
  assert.ok(r.notes.some(n => n.kind === 'race')); }

// Synchroniser MTBF = e^(tr/τ)/(T0·fclk·fdata): τ = 20 ps, T0 = 50 ps, 1 GHz clock, 100 MHz data, tr = 0.8 ns -> e^40/5e6
{ const m = mtbf(0.8e-9, 20e-12, 50e-12, 1e9, 1e8); assert.ok(Math.abs(m / (Math.exp(40) / 5e6) - 1) < 1e-12); }
console.log('flipflop-lab model: all tests passed');
