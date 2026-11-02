import assert from 'node:assert/strict';
import { solve, sweep, fet } from '../../src/sims/models/level-shifter.ts';
const base = { vlow: 3.3, vhigh: 5, lowDrive: false, highDrive: false };
const ok = (c: boolean, m: string) => assert.ok(c, m);
// 1) idle: both pulled to their own rails, FET off (Vgs = 0)
let r = solve(base);
ok(Math.abs(r.vs - 3.3) < 1e-3 && Math.abs(r.vd - 5) < 1e-3, `idle ${r.vs} ${r.vd}`); ok(Math.abs(r.vgs) < 1e-3, 'Vgs=0'); ok(r.state.startsWith('FET off'), r.state);
ok(r.resid < 1e-9, 'KCL residual');
// 2) low side pulls low: Vgs ≈ Vlow → FET on, the high side follows to ~0 V
r = solve({ ...base, lowDrive: true });
ok(r.vs < 0.05 && r.vd < 0.1, `low drive ${r.vs} ${r.vd}`); ok(r.vgs > 3.2, 'Vgs high'); ok(r.state.includes('on'), r.state);
// 3) high side pulls low: body diode holds the low node near Vf first, then the FET turns on (Vgs = Vlow − Vs > Vth) and Vs → ~0
r = solve({ ...base, highDrive: true });
ok(r.vs < 0.1 && r.vd < 0.05, `high drive ${r.vs} ${r.vd}`); ok(r.vgs > 3.0, 'Vgs after turn-on ' + r.vgs);
// 3b) without the FET channel (Vth huge) the body diode alone holds Vs at ≈ Vf
r = solve({ ...base, highDrive: true, vth: 100 });
ok(r.vs > 0.4 && r.vs < 0.8, `body diode only Vs=${r.vs}`); ok(r.state.startsWith('Body diode'), r.state);
// 3c) with the body diode removed and FET disabled the low node stays high (no path)
r = solve({ ...base, highDrive: true, vth: 100, bodyDiode: false }); ok(r.vs > 3.2, 'no path');
// 4) both low
r = solve({ ...base, lowDrive: true, highDrive: true }); ok(r.vs < 0.05 && r.vd < 0.05, 'both low');
// 5) Vlow below the threshold (Vth 1.3, Vlow 1.0): the FET never turns on, shifting by channel fails but the body diode path still pulls low
r = solve({ ...base, vlow: 1.0, lowDrive: true }); ok(r.vd > 4.0, `FET off when Vlow<Vth: Vd=${r.vd}`);
// 6) MOSFET equations: triode I = K(Vov·Vds − Vds²/2) at small Vds; saturation I = ½K·Vov²
const vov = 3.3 - 1.3;
ok(Math.abs(fet(3.3, 0.01, 0, 1.3, 0.083) - 0.083 * (vov * 0.01 - 0.00005)) < 2e-5, 'triode');
ok(Math.abs(fet(3.3, 5, 0, 1.3, 0.083) / (0.5 * 0.083 * vov * vov) - 1) < 0.12, 'saturation (with λ)');
// 7) symmetric channel
ok(Math.abs(fet(3.3, 0, 0.2, 1.3, 0.083) + fet(3.3, 0.2, 0, 1.3, 0.083) * 1) < 1e-9 + 0.002, 'sym sign');
// 8) sweep: forcing the high side low pulls the low node down monotonically
const s = sweep(base, 'high'); ok(s.y[0] < 0.1 && Math.abs(s.y[s.y.length - 1] - 3.3) < 0.05, 'sweep ends'); for (let i = 1; i < s.y.length; i++) ok(s.y[i] >= s.y[i - 1] - 1e-6, 'monotonic');
// 9) swap voltages (5 V low side, 3.3 V high side) still works
r = solve({ vlow: 5, vhigh: 3.3, lowDrive: true, highDrive: false }); ok(r.vd < 0.1, 'reverse ratio');
console.log('level-shifter model: all tests passed');
