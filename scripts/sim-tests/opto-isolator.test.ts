import assert from 'node:assert/strict';
import { design, ledCurrent, vfOf, ctrShape, ctrEff, tempFactor, sweepRpull, simulate } from '../../src/sims/models/opto-isolator.ts';
const near = (a: number, b: number, rel: number, m = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(1e-12, Math.abs(b)), `${m}: ${a} vs ${b}`);
const base = { vgpio: 3.3, rled: 330, ctr: 0.5, rpull: 4700, vcc: 5 };
// LED current satisfies KVL: If = (V − Vf(If))/R ; Vf(20 mA) = 1.2 V
{
  const i = ledCurrent(3.3, 330); near(i, (3.3 - vfOf(i)) / 330, 1e-6, 'KVL'); assert.ok(i > 5e-3 && i < 7e-3, 'If ' + i);
  near(vfOf(20e-3), 1.2, 1e-12);
  assert.equal(ledCurrent(0.5, 330), 0, 'below the LED knee');
  near(ledCurrent(5, 100), (5 - 1.2) / 100, 0.05, '≈ (V−Vf)/R');
}
// CTR: nominal at 5 mA, peaks there, ageing and temperature derate
near(ctrShape(5e-3), 1, 1e-12); assert.ok(ctrShape(0.5e-3) < 0.7 && ctrShape(50e-3) < 0.85);
near(ctrEff({ ...base, aging: 0.3 }, 5e-3), 0.5 * 0.7, 1e-12); near(tempFactor(85), 1 - 0.24, 1e-12); assert.ok(tempFactor(-25) < 1);
// 5 V pull-up 4.7k, If ≈ 6.4 mA: Ic,max ≈ 3.2 mA > Ic,req ≈ 1.02 mA → saturated, Vol = Vcesat
{
  const d = design(base); assert.ok(d.saturated && d.depth > 2.5, 'saturated depth ' + d.depth); near(d.vol, 0.2, 1e-12);
  near(d.icReq, (5 - 0.2) / 4700, 1e-12); near(d.icMax, d.ctr * d.iF, 1e-12); assert.ok(d.volOk);
  near(d.tr, 2.2 * 4700 * 25e-12, 1e-12, 'RC rise');
}
// too big a CTR drop or too small a pull-up → active region, Vol = Vcc − Ic,max·Rpull
{
  const d = design({ ...base, rpull: 470, ctr: 0.2, rled: 1000 }); assert.ok(!d.saturated);
  near(d.vol, 5 - d.icMax * 470, 1e-12); assert.ok(d.depth < 1);
  assert.ok(!d.volOk, 'output no longer a valid low');
  const rmin = design({ ...base }).rMinSat; assert.ok(design({ ...base, rpull: rmin * 1.01 }).saturated && !design({ ...base, rpull: rmin * 0.99 }).saturated, 'Rpull,min boundary');
}
// speed vs pull-up: rise time ∝ Rpull, saturation depth ∝ 1/Rpull
{
  const sw = sweepRpull(base, [1e3, 10e3]); near(sw[1].tr / sw[0].tr, 10, 1e-9); near(sw[1].depth / sw[0].depth, 10, 1e-9, 'depth ∝ Rpull');
}
// time domain: 10–90 % rise of the simulated output ≈ 2.2·R·C (isolate the RC with a fast phototransistor)
{
  const o = { ...base, tauPt: 1e-9 }; const r = simulate(o, 1 / (2 * 40 * 2.2 * 4700 * 25e-12), 1);
  const V = r.out, t = r.t; const iLow = V.findIndex(v => v < 0.5);
  let i10 = -1, i90 = -1; for (let k = iLow; k < V.length; k++) { if (i10 < 0 && V[k] > 0.2 + 0.1 * 4.8) i10 = k; if (i90 < 0 && V[k] > 0.2 + 0.9 * 4.8) { i90 = k; break; } }
  assert.ok(i10 > 0 && i90 > i10, 'rise found'); near(t[i90] - t[i10], 2.2 * 4700 * 25e-12, 0.08, 'sim rise time');
  assert.ok(Math.min(...V) < 0.25 && Math.max(...V) > 4.95);
}
// storage delay: deeper saturation delays the turn-off
{
  const hi = simulate({ ...base, rpull: 1e3 }, 20e3, 2), lo = simulate({ ...base, rpull: 10e3 }, 20e3, 2);
  const delay = (r: ReturnType<typeof simulate>) => { const kOff = r.led.findIndex((v, k) => k > 0 && v === 0 && r.led[k - 1] === 1); let k = kOff; while (k < r.out.length && r.out[k] < 2.5) k++; return r.t[k] - r.t[kOff]; };
  assert.ok(delay(hi) > 0 && delay(lo) > 0);
  const d1 = design({ ...base, rpull: 1e3 }), d2 = design({ ...base, rpull: 10e3 }); assert.ok(d1.tOffDelay < d2.tOffDelay, 'deeper saturation → more storage delay');
}
console.log('opto-isolator model: all tests passed');
