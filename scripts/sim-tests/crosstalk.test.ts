import assert from 'node:assert/strict';
import { crosstalk, kLof, waveforms, C0 } from '../../src/sims/models/crosstalk.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);
const base = { spacing: 0.2, h: 0.1, len: 50, tr: 200e-12 };
// s = h -> kL = 0.5 ; s -> inf -> 0
close(kLof(1, 1), 0.5); assert.ok(kLof(100, 1) < 1e-3);
const c = crosstalk(base);
// Kb = (kC + kL)/4 , Kf = (kC - kL)/2
close(c.Kb, (c.kC + c.kL) / 4); close(c.Kf, (c.kC - c.kL) / 2); assert.ok(c.Kf < 0, 'microstrip FEXT is negative');
// velocity c/sqrt(eeff)
close(c.v, C0 / Math.sqrt(2.9 + 0.0) , 0.15);
// NEXT saturates once len >= Lsat; below it is linear in length
assert.ok(c.saturated); close(c.nextFrac, c.Kb);
const half = crosstalk({ ...base, len: c.Lsat / 2 });
close(half.nextFrac, c.Kb / 2, 1e-6);
const quarter = crosstalk({ ...base, len: c.Lsat / 4 });
close(quarter.nextFrac, half.nextFrac / 2, 1e-6);
// longer line does not increase NEXT beyond saturation, but FEXT keeps growing linearly
close(crosstalk({ ...base, len: 200 }).nextFrac, c.Kb);
close(crosstalk({ ...base, len: 100 }).fextFrac, 2 * c.fextFrac, 1e-9);
// slower edge -> less FEXT, and shorter saturation length grows
assert.ok(Math.abs(crosstalk({ ...base, tr: 1e-9 }).fextFrac) < Math.abs(c.fextFrac));
// more spacing -> less crosstalk (monotone), higher h -> more
assert.ok(crosstalk({ ...base, spacing: 0.4 }).nextFrac < c.nextFrac);
assert.ok(crosstalk({ ...base, h: 0.2 }).nextFrac > c.nextFrac);
// stripline: homogeneous dielectric -> FEXT = 0
close(crosstalk({ ...base, stripline: true }).fext, 0, 1);
assert.equal(crosstalk({ ...base, stripline: true }).Kf, 0);
// guard trace reduces both
assert.ok(crosstalk({ ...base, guard: true }).nextFrac < 0.4 * c.nextFrac);
// waveform peaks match closed forms
const w = waveforms({ ...base, vagg: 3.3 }, 2000);
close(Math.max(...w.next), 3.3 * c.nextFrac, 0.02);
close(Math.min(...w.fext), 3.3 * c.fextFrac, 1e-9);
close(Math.max(...w.va), 3.3, 1e-9);
console.log('crosstalk model: all tests passed');
