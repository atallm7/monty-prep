import assert from 'node:assert/strict';
import { simulate, predict, rcOf, type FlyIn } from '../../src/sims/models/flyback-protection.ts';
const near = (a: number, b: number, rel: number, m = '') => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${m}: ${a} vs ${b} (±${rel * 100}%)`);
const base: FlyIn = { protection: 'none', l: 10e-3, i0: 1, vs: 12, cp: 100e-12, vf: 0.7, vz: 24, rsn: 47, csn: 2.2e-6, vtvs: 33, aval: false, bv: 60 };
const run = (o: Partial<FlyIn>) => { const t0 = performance.now(); const r = simulate({ ...base, ...o }); const ms = performance.now() - t0; return { ...r, ms }; };
assert.equal(rcOf(base), 12);
// 1) No protection, ideal switch: peak = Vs + i0·√(L/Cp) = 12 + 10 kV; ring at 1/(2π√(LC)) ≈ 159 kHz
{
  const r = run({});
  near(r.vPeak, 12 + Math.sqrt(10e-3 / 100e-12), 0.01, 'LC spike');
  near(r.tPeak, Math.PI / 2 * Math.sqrt(10e-3 * 100e-12), 0.03, 'quarter period to peak');
  near(r.ringF, 1 / (2 * Math.PI * Math.sqrt(10e-3 * 100e-12)), 1e-9);
  assert.ok(Math.abs(r.balanceErr) < 0.01, 'energy balance none ' + r.balanceErr);
  console.log(`  none: peak ${r.vPeak.toFixed(0)} V, ${r.steps} steps, ${r.ms.toFixed(1)} ms`);
}
// 2) MOSFET avalanche at BV: clamp at BV, avalanche energy ≈ ½Li²·BV/(BV−Vs) (minus what Rc dissipates)
{
  const r = run({ aval: true, bv: 60 });
  near(r.vPeak, 60, 0.02, 'avalanche clamp');
  near(r.tZero, predict({ ...base, aval: true }).tZero, 0.03, 'avalanche decay time');
  const pr = predict({ ...base, aval: true });
  assert.ok(r.e.aval < pr.eClamp && r.e.aval > 0.6 * pr.eClamp, `aval energy ${r.e.aval} vs ideal ${pr.eClamp}`);
  assert.ok(Math.abs(r.balanceErr) < 0.01, 'energy balance aval');
}
// 3) Freewheel diode: vX clamps at Vs + Vf, slow decay t0 = τ·ln(1 + Rc·i0/Vf)
{
  const r = run({ protection: 'diode' });
  near(r.vPeak, 12.7, 0.01, 'diode clamp');
  near(r.tZero, (10e-3 / 12) * Math.log(1 + 12 / 0.7), 0.02, 'diode decay');
  assert.ok(Math.abs(r.balanceErr) < 0.01, 'energy balance diode ' + r.balanceErr);
  // nearly all ½Li² goes to coil R and diode; the supply supplies nothing net (current returns to Vs)
  near(r.e.coilR + r.e.diode, 0.5 * 10e-3 * 1, 0.02, 'diode energy split');
}
// 4) Diode + Zener: clamp Vs+Vf+Vz, much faster decay
{
  const r = run({ protection: 'zener' }), d = run({ protection: 'diode' });
  near(r.vPeak, 12 + 0.7 + 24, 0.01, 'zener clamp');
  near(r.tZero, (10e-3 / 12) * Math.log(1 + 12 / 24.7), 0.02, 'zener decay');
  assert.ok(r.tZero < d.tZero / 5, 'zener much faster than diode');
  assert.ok(r.e.zener > 0.5 * (0.5 * 10e-3), 'most energy in the zener');
  assert.ok(Math.abs(r.balanceErr) < 0.01);
}
// 5) TVS across the switch: clamps at Vbr, absorbs MORE than ½Li² (supply keeps feeding the coil)
{
  const r = run({ protection: 'tvs' });
  near(r.vPeak, 33, 0.03, 'tvs clamp');
  near(r.tZero, (10e-3 / 12) * Math.log(1 + 12 / (33 - 12)), 0.03, 'tvs decay');
  assert.ok(r.e.supply > 0 && r.e.tvs > 0.5 * 10e-3 * 1 * 0.9, 'tvs absorbs supply energy too');
  assert.ok(Math.abs(r.balanceErr) < 0.01, 'balance tvs ' + r.balanceErr);
}
// 6) RC snubber across coil: Csn starts charged to −Vs (X was at 0 V), so vX(0+) = i0·Rsn; energy ends in Rsn + Rc
{
  const r = run({ protection: 'rc', csn: 10e-6, rsn: 20 });
  near(r.vx[1], 20, 0.05, 'rc initial step i0·Rsn');
  assert.ok(r.vPeak > 20 && r.vPeak < 12 + Math.sqrt(10e-3 / 10e-6) + 25, 'rc peak ' + r.vPeak);
  assert.ok(Math.abs(r.balanceErr) < 0.01, 'balance rc ' + r.balanceErr);
  near(r.e.snubR + r.e.coilR, r.e.stored0 + r.e.supply - r.e.storedEnd, 0.01);
  // bigger C → lower peak
  assert.ok(run({ protection: 'rc', csn: 47e-6, rsn: 20 }).vPeak < r.vPeak);
}
// 7) performance (each run must stay interactive)
for (const pr of ['none', 'diode', 'zener', 'rc', 'tvs'] as const) { const r = run({ protection: pr }); assert.ok(r.ms < 200, pr + ' slow ' + r.ms); }
console.log('flyback-protection model: all tests passed');
