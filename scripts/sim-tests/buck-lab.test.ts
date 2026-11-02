import assert from 'node:assert/strict';
import { simulateBuck, defaults, effSweep } from '../../src/sims/models/buck-lab.ts';
const rel = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg} ${a} vs ${b}`);
const ideal = { ...defaults(), rdsHi: 0, rdsLo: 0, dcr: 1e-6, esr: 0, td: 0, vfBody: 0, vfDiode: 0, tr: 0, tf: 0, coss: 0, qg: 0, qrr: 0 };

// 1. Lossless synchronous CCM: Vout = D·Vin, ΔI = (Vin−Vout)·D/(L·fsw), ΔV = ΔI/(8·C·fsw)
let t0 = performance.now();
const a = simulateBuck({ ...ideal, mode: 'duty', d: 0.275 });
console.log('ideal sync sim ms', (performance.now() - t0).toFixed(1));
rel(a.voutAvg, 3.3, 1e-3, 'Vout=D·Vin');
rel(a.dI, (12 - 3.3) * 0.275 / (4.7e-6 * 500e3), 2e-3, 'ΔI');
rel(a.dI, a.dIanalytic, 2e-3, 'ΔI vs analytic');
rel(a.dV, a.dI / (8 * 22e-6 * 500e3), 0.03, 'ΔV cap');
rel(a.iLavg, 2, 1e-3, 'avg iL = Iout');
assert.equal(a.mode, 'CCM'); assert.ok(a.converged);
rel(a.eff, 1, 1e-4, 'lossless efficiency');

// 2. Target mode with losses: regulates exactly and needs D > Vout/Vin
t0 = performance.now();
const b = simulateBuck({ ...defaults() });
console.log('target-mode sim ms', (performance.now() - t0).toFixed(1));
rel(b.voutAvg, 3.3, 1e-5, 'regulated Vout');
assert.ok(b.D > 3.3 / 12, 'losses raise D');
// energy balance: Vin·Iin = Pout + conduction + diode + ESR + DCR losses (switching/gate are added analytically)
const L = b.losses;
rel(b.pinWave, b.pout + L.hs + L.ls + L.diode + L.dcr + L.esr, 2e-3, 'energy balance');
assert.ok(b.eff > 0.85 && b.eff < 0.97, 'realistic sync efficiency ' + b.eff);
// ESR ripple dominates when ESR·ΔI >> ΔI/(8Cf)
const e = simulateBuck({ ...ideal, mode: 'duty', d: 0.275, esr: 0.1 });
rel(e.dV, e.dI * 0.1, 0.05, 'ESR ripple');

// 3. Async DCM, lossless, constant-current load: Vout = Vin/(1 + 2·L·Iout/(D²·T·Vin))
const D = 0.15, io = 0.2;
const c = simulateBuck({ ...ideal, sync: false, mode: 'duty', d: D, iout: io });
const T = 1 / 500e3;
assert.equal(c.mode, 'DCM');
rel(c.voutAvg, 12 / (1 + 2 * 4.7e-6 * io / (D * D * T * 12)), 2e-3, 'DCM Vout');
rel(c.iLmin + 1, 1, 1e-9, 'iL clamps at 0');
// sync (forced PWM) at the same light load: no DCM, inductor current goes negative, Vout = D·Vin
const s = simulateBuck({ ...ideal, sync: true, mode: 'duty', d: D, iout: io });
assert.equal(s.mode, 'FCCM'); assert.ok(s.iLmin < 0); rel(s.voutAvg, D * 12, 1e-3, 'FCCM Vout');

// 4. CCM/DCM boundary for async: Iout = ΔI/2
const asy = { ...defaults(), sync: false };
const hi = simulateBuck({ ...asy, iout: 1.0 }), lo = simulateBuck({ ...asy, iout: 0.2 });
assert.ok(hi.dI / 2 < 1.0 && hi.mode !== 'DCM', 'CCM above boundary');
assert.equal(lo.mode, 'DCM'); rel(lo.voutAvg, 3.3, 1e-5, 'regulated in DCM');
// diode loss ≈ Vf·Iout·(1−D) in async CCM
const h2 = simulateBuck({ ...asy, iout: 2 });
rel(h2.losses.diode, 0.45 * 2 * (1 - h2.D), 0.02, 'diode loss');
// sync beats async at heavy load (Vf·I >> I²·Rds)
assert.ok(b.eff > h2.eff, 'sync more efficient at 2 A');
// dead time: body diode conducts during dead time -> diode loss ≈ 2·td·fsw·Vf·Iout
rel(b.losses.diode, 2 * 20e-9 * 500e3 * 0.7 * 2, 0.08, 'dead-time diode loss');

// 5. dropout: target above Vin
const d = simulateBuck({ ...defaults(), vin: 3.3, vout: 3.3 });
assert.ok(d.dropout);
t0 = performance.now();
const sw = effSweep(defaults(), [0.05, 0.1, 0.2, 0.5, 1, 2, 3, 4, 5, 6]);
console.log('eff sweep ms', (performance.now() - t0).toFixed(1), sw.map(x => x.eff.toFixed(3)).join(' '));
assert.ok(sw.every(x => x.eff > 0 && x.eff < 1));
console.log('buck-lab model: all tests passed');
