import assert from 'node:assert/strict';
import { simulate, steady, shootThrough, describe, cfgH, leg, deadTime } from '../../src/sims/models/h-bridge-lab.ts';
const near = (a: number, b: number, rel: number, m = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(1e-9, Math.abs(b)), `${m}: ${a} vs ${b}`);
const fwd = { vbat: 12, q1: true, q2: false, q3: false, q4: true };
// forward steady state: ω = Ke·Vm/(Ke² + b·Rt), i = (Vm − Ke·ω)/Rt
{
  const s = steady(fwd), r = simulate(fwd, 0.6);
  near(r.wEnd, s.w, 0.01, 'ω steady'); near(r.iEnd, s.i, 0.03, 'i steady');
  assert.ok(r.i[1] > 0 && r.i[3] > r.i[1], 'inrush');
  { const pk = Math.max(...r.i); assert.ok(pk < 12 / 1.1 && pk > 0.8 * 12 / 1.1, 'inrush below V/(R+2Ron) ' + pk); }
  assert.equal(describe(fwd).name, 'Forward (A→B)');
}
// reverse is the mirror image
{ const f = steady(fwd), r = steady({ vbat: 12, q1: false, q2: true, q3: true, q4: false }); near(r.w, -f.w, 1e-9); near(r.i, -f.i, 1e-9); }
// shoot-through: I = Vbat/(2Ron + Rbus), P = V·I, one leg or two
{
  const st = shootThrough(cfgH({ vbat: 12, q1: true, q2: true, q3: false, q4: false }));
  near(st.i, 12 / (2 * 0.05 + 0.02), 1e-12); assert.equal(st.n, 1);
  assert.equal(shootThrough(cfgH({ vbat: 12, q1: true, q2: true, q3: true, q4: true })).n, 2);
  assert.equal(describe({ vbat: 12, q1: true, q2: true, q3: false, q4: false }).name, 'Shoot-through');
  assert.equal(shootThrough(cfgH({ vbat: 12, q1: true, q2: true, q3: false, q4: false, half: true })).n, 1);
}
// coast after forward: freewheel through D2 and D3 against Vbat + 2Vf, i decays fast and stops at 0 (diodes cannot reverse it)
{
  const run = simulate({ ...fwd, ke: 0, r: 0.01 }, 0.02, 5, 0, 1000);
  const co = simulate({ vbat: 12, q1: false, q2: false, q3: false, q4: false, ke: 0, r: 0.01 }, 0.002, 5, 0, 1000);
  void run;
  const tz = co.t[co.i.findIndex(x => x <= 0)];
  near(tz, (1e-3 * 5) / (12 + 1.4), 0.12, 'flyback decay time L·I/(Vbat+2Vf)');
  assert.ok(co.i.every(x => x >= -1e-9), 'current never reverses');
  assert.equal(co.iEnd, 0);
  assert.equal(co.vA[1] < 0 && co.vB[1] > 12, true);
}
// brake (both low sides): current reverses (regeneration) and decays; speed drops faster than coast
{
  const s0 = simulate(fwd, 0.4); 
  const brake = simulate({ vbat: 12, q1: false, q2: true, q3: false, q4: true }, 0.05, s0.iEnd, s0.wEnd);
  const coast = simulate({ vbat: 12, q1: false, q2: false, q3: false, q4: false }, 0.05, s0.iEnd, s0.wEnd);
  assert.ok(Math.min(...brake.i) < 0, 'braking current is negative'); assert.ok(brake.wEnd < 0.3 * coast.wEnd, `brake ${brake.wEnd} vs coast ${coast.wEnd}`);
  assert.equal(describe({ vbat: 12, q1: false, q2: true, q3: false, q4: true }).name, 'Brake (low sides on)');
}
// load torque: ω reduces, current rises (i = Tload/Kt + b ω/Kt)
{ const a = steady(fwd), b = steady({ ...fwd, tload: 0.1 }); assert.ok(b.w < a.w && b.i > a.i); near(b.i, 0.1 / 0.02, 0.02, 'i = T/Kt'); }
// diode legs
{ const q = cfgH(fwd); assert.equal(leg(false, false, 2, q).v, -0.7); assert.equal(leg(false, false, -2, q).v, 12.7); }
// dead time: LS diode conducts for td at each edge; loss = Vf·I·2·td·fsw
{
  const d = deadTime({ vbat: 12, fsw: 100e3, duty: 0.5, td: 100e-9, iload: 5 });
  near(d.pDiode, 0.7 * 5 * 2 * 100e-9 * 100e3, 1e-12); assert.equal(d.shoot, 0);
  assert.ok(d.vsw.some(v => Math.abs(v + 0.7) < 1e-9), 'Vsw = −Vf during dead time');
  const dn = deadTime({ vbat: 12, fsw: 100e3, duty: 0.5, td: 100e-9, iload: -5 }); assert.ok(dn.vsw.some(v => Math.abs(v - 12.7) < 1e-9));
  const ov = deadTime({ vbat: 12, fsw: 100e3, duty: 0.5, td: -50e-9, iload: 5 }); near(ov.shoot, 12 / 0.12, 1e-9); assert.ok(ov.overlap > 0 && ov.pShoot > 0);
  assert.ok(ov.hs.some((h, k) => h === 1 && ov.ls[k] === 1), 'overlap exists');
  assert.ok(!d.hs.some((h, k) => h === 1 && d.ls[k] === 1), 'no overlap with dead time');
}
console.log('h-bridge-lab model: all tests passed');
