import assert from 'node:assert/strict';
import { rectifier } from '../../src/sims/models/rectifier-lab.ts';
const near = (a: number, b: number, rel: number, msg = '') => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg} ${a} vs ${b} (±${rel * 100}%)`);

// 1) No capacitor (tiny C), ideal diode (Vf=0, Rs→0): average = Vpk/π (half), 2Vpk/π (full)
{
  const base = { vpk: 10, f: 60, c: 1e-12, rl: 1000, vf: 0, rs: 1e-3 };
  near(rectifier({ ...base, type: 'half' }).vdc, 10 / Math.PI, 0.005, 'half avg');
  near(rectifier({ ...base, type: 'bridge' }).vdc, 20 / Math.PI, 0.005, 'bridge avg');
  near(rectifier({ ...base, type: 'center' }).vdc, 20 / Math.PI, 0.005, 'center avg');
  // half-wave conducts for 180°
  near(rectifier({ ...base, type: 'half' }).conductDeg, 180, 0.01, 'half cond angle');
}
// 2) Big C: ripple ≈ I/(2fC) bridge, I/(fC) half; Vdc ≈ Vpk − nVf − Vpp/2
{
  const p = { vpk: 17, f: 60, c: 10e-3, rl: 100, vf: 0.7, rs: 0.05 };
  const b = rectifier({ ...p, type: 'bridge' });
  near(b.ripple, b.iload / (2 * 60 * 10e-3), 0.12, 'bridge ripple');
  near(b.vdc, 17 - 1.4 - b.ripple / 2, 0.03, 'bridge vdc');
  assert.ok(b.vmax < 17 - 1.4 + 1e-9, 'vout never exceeds Vpk − 2Vf');
  const h = rectifier({ ...p, type: 'half' });
  near(h.ripple, h.iload / (60 * 10e-3), 0.12, 'half ripple');
  assert.ok(h.ripple > 1.7 * b.ripple, 'half-wave ripple ~2x bridge');
  // Charge balance: average diode-path current = load current in steady state (each bridge diode carries half)
  near(b.idAvg * 2, b.iload, 0.01, 'charge balance bridge');
  near(h.idAvg, h.iload, 0.01, 'charge balance half');
  // short conduction angle -> peak diode current >> average
  assert.ok(b.idPeak > 5 * b.iload, 'peaky diode current');
  assert.ok(b.conductDeg < 60, 'short conduction angle');
  // PIV: bridge ≈ Vpk, half-wave ≈ 2Vpk
  near(b.piv, 17, 0.05, 'bridge PIV'); near(h.piv, 2 * 17 - 0.7, 0.05, 'half PIV');
  // power: load power ≈ Vdc²/RL
  near(b.pLoad, b.vdc ** 2 / 100, 0.01, 'load power');
}
// 3) Edge cases: zero amplitude, no NaN
{
  const z = rectifier({ type: 'bridge', vpk: 0, f: 60, c: 1e-3, rl: 100, vf: 0.7, rs: 0.5 });
  assert.equal(z.vdc, 0); assert.ok(Number.isFinite(z.ripple));
}
console.log('rectifier-lab model: all tests passed');
