import assert from 'node:assert/strict';
import { simulateBalance, cellSet } from '../../src/sims/models/cell-balancing.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} != ${b} (±${tol})`);

// Matched cells: both modes deliver the full nominal capacity, nothing bleeds
for (const balance of ['none', 'passive'] as const) {
  const r = simulateBalance({ cells: 4, mismatch: 0, socSpread: 0, balance });
  assert.ok(r.finished);
  close(r.usableAh, 2, 0.03, 'matched usable ' + balance);
  close(r.heatTotalJ, 0, 1e-9, 'no bleed');
}

// cellSet: capacity spread equals the mismatch fraction
const cs = cellSet(5, 0.1, 0.1, 0.3, 2);
close((Math.max(...cs.q) - Math.min(...cs.q)) / 2, 0.1, 1e-12, 'capacity spread');
close(Math.max(...cs.s) - Math.min(...cs.s), 0.1, 1e-12, 'SoC spread');

// Equal capacities, 10 % SoC imbalance, no balancing: the charge stops when the high cell is full,
// so the low cell is ~10 % short and the pack loses ~10 % of its capacity
const none = simulateBalance({ cells: 2, mismatch: 0, socSpread: 0.1, balance: 'none' });
close(none.usableAh, 2 * 0.9, 0.06, 'unbalanced usable');
close(Math.max(...none.sEnd) - Math.min(...none.sEnd), 0.1, 0.01, 'imbalance persists');
// With passive balancing it recovers ~all of it (top balanced)
const pas = simulateBalance({ cells: 2, mismatch: 0, socSpread: 0.1, balance: 'passive' });
assert.ok(pas.finished, 'balancing completes');
assert.ok(pas.usableAh > 0.97 * 2, 'balanced usable ' + pas.usableAh);
assert.ok(Math.max(...pas.vEnd) - Math.min(...pas.vEnd) < 0.012, 'cells within balance window');
assert.ok(pas.tEnd > none.tEnd, 'balancing takes longer');

// Charge conservation per cell: ΔSoC·Q = ∫(Ic − Ib)dt
for (let i = 0; i < 2; i++) close((pas.sEnd[i] - pas.s0[i]) * pas.q[i], pas.chargeInAh - pas.bleedAh[i], 1e-6, 'charge balance');
// Bleed heat ≈ removed charge × ~4.1 V (P = V·I_b), and bleed current ≈ V/R_bal
const hiCell = pas.bleedAh[0] > pas.bleedAh[1] ? 0 : 1;
const vAvg = pas.heatJ[hiCell] / (pas.bleedAh[hiCell] * 3600);
assert.ok(vAvg > 3.9 && vAvg < 4.25, 'heat/charge = bleed voltage ' + vAvg);
close(pas.peakBleedA, 4.2 / 33, 0.01, 'I_bleed ≈ V/R');

// Capacity mismatch: even perfect top balancing is limited by the weakest cell (idealAh = min Q)
const mm = simulateBalance({ cells: 4, mismatch: 0.1, socSpread: 0.1, balance: 'passive' });
close(mm.idealAh, 2 * 0.95, 1e-9);
close(mm.usableAh, mm.idealAh, 0.04, 'balanced -> weakest cell');
const mmN = simulateBalance({ cells: 4, mismatch: 0.1, socSpread: 0.1, balance: 'none' });
assert.ok(mmN.usableAh < mm.usableAh - 0.05, 'unbalanced loses more');

// Pack-level CV without per-cell monitoring overcharges the high cell
assert.ok(mmN.packCvMaxV > 4.22, 'pack CV overcharges: ' + mmN.packCvMaxV);
const matched = simulateBalance({ cells: 4, mismatch: 0, socSpread: 0, balance: 'none' });
close(matched.packCvMaxV, 4.2, 0.01, 'matched pack CV is fine');
console.log('cell-balancing model: all tests passed', { none: none.usableAh.toFixed(3), pas: pas.usableAh.toFixed(3), tNone_h: (none.tEnd / 3600).toFixed(2), tPas_h: (pas.tEnd / 3600).toFixed(2), packCv: mmN.packCvMaxV.toFixed(3) });
