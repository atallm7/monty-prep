import assert from 'node:assert/strict';
import { simulate, PRESETS, pgTime, offTime, MASTER, OFF_FRAC, type Rail } from '../../src/sims/models/power-sequencing.ts';
const near = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b} ±${tol}`);
const dt = 5e-6;

// 1) Soft-start ramp + PG threshold: t_PG = t_en + th·t_ss; chained enable = PG + delay
{
  const rails: Rail[] = [
    { name: 'A', vnom: 1.0, src: MASTER, delay: 1e-3, tss: 2e-3, th: 0.9, tau: 1e-3 },
    { name: 'B', vnom: 3.3, src: 0, delay: 0.5e-3, tss: 1e-3, th: 0.95, tau: 1e-3 },
  ];
  const r = simulate({ rails, rules: [], down: 'none', tOff: 1, tEnd: 10e-3, dt });
  near(r.tEn[0], 1e-3, 1e-12, 'A enable');
  near(r.tPg[0], pgTime(rails[0], 1e-3), dt, 'A PG = 1 ms + 0.9·2 ms = 2.8 ms');
  near(r.tEn[1], r.tPg[0] + 0.5e-3, 1e-12, 'B enabled by PG_A + delay');
  near(r.tPg[1], r.tEn[1] + 0.95e-3, dt, 'B PG');
  // mid-ramp voltage: linear soft start
  const k = Math.round(2e-3 / dt); near(r.v[0][k], 0.5, 1e-9, 'A half-way at 1 ms into a 2 ms ramp');
  near(r.v[1][r.v[1].length - 1], 3.3, 1e-12, 'B settles at Vnom');
  near(r.allPg, r.tPg[1], 1e-12, 'all PG');
}
// 2) Presets: correct order → all rules pass with reverse power-down
for (const key of ['soc', 'fpga'] as const) {
  const P = PRESETS[key];
  const r = simulate({ rails: P.rails, rules: P.rules, down: 'reverse', tOff: P.tOff, tEnd: P.tOff + 30e-3, dt: 10e-6 });
  assert.ok(r.rules.every(x => x.ok), `${key}: all rules pass in reverse sequence: ${JSON.stringify(r.rules.map(x => x.first))}`);
  // reverse: last rail disabled first, at tOff; then the one before it after the last one has decayed below 10%
  const n = P.rails.length;
  near(r.tDis[n - 1], P.tOff, 1e-12, 'last rail off first');
  near(r.tDis[n - 2], r.tOffReached[n - 1] + P.rails[n - 2].delay, 1e-12, 'reverse chain');
  // exponential discharge: 10% after τ·ln10
  near(r.tOffReached[n - 1] - r.tDis[n - 1], offTime(P.rails[n - 1]), 2e-5, 'RC discharge time');
  // all at once: uncontrolled → violations
  const s = simulate({ rails: P.rails, rules: P.rules, down: 'simultaneous', tOff: P.tOff, tEnd: P.tOff + 30e-3, dt: 10e-6 });
  assert.ok(s.rules.some(x => !x.ok), `${key}: simultaneous shutdown violates a rule`);
  assert.ok(s.rules.every(x => isNaN(x.first) || x.first >= P.tOff), `${key}: violations only during power-down`);
}
// 3) Wrong order on power-up: I/O enabled directly from master EN before the core → 'before' and 'maxdiff' fail
{
  const P = PRESETS.soc;
  const rails = P.rails.map((r, i) => (i === 3 ? { ...r, src: MASTER, delay: 0 } : r));
  const r = simulate({ rails, rules: P.rules, down: 'none', tOff: 1, tEnd: 15e-3, dt });
  assert.equal(r.rules[0].ok, false); assert.ok(r.rules[0].first < 1e-3, 'violation starts during power-up');
  assert.equal(r.rules[2].ok, false); // worst at t = 2 ms (IO reaches 1.8 V, core is 1/1.5 of the way up): 1.8 − 0.8·(1/1.5) − 1.2
  near(r.rules[2].worst, 1.8 - 0.8 / 1.5 - 1.2, 1e-3, 'maxdiff excess');
}
// 4) Fault: rail stalls at 60% → PG never asserts, downstream rails never enabled
{
  const P = PRESETS.fpga;
  const rails = P.rails.map((r, i) => (i === 1 ? { ...r, fault: true } : r));
  const r = simulate({ rails, rules: P.rules, down: 'none', tOff: 1, tEnd: 20e-3, dt });
  assert.ok(isNaN(r.tPg[1]) && isNaN(r.tEn[2]) && isNaN(r.tEn[3]), 'chain halts');
  near(Math.max(...r.v[1]), 0.6 * 1.0, 1e-9, 'stalled at 60%');
  assert.ok(isNaN(r.allPg));
  void OFF_FRAC;
}
console.log('power-sequencing model: all tests passed');
