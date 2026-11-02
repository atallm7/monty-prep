import assert from 'node:assert/strict';
import { wave, phasorSum, phaseDiff, rms, sumInfo, reactance, rlc, rlcWaves, wrapDeg } from '../../src/sims/models/phasor-viewer.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// 1∠0 + 1∠90 = √2∠45
let s = phasorSum({ A: 1, phi: 0 }, { A: 1, phi: 90 });
close(s.A, Math.SQRT2); close(s.phi, 45);
// opposite phases cancel
close(phasorSum({ A: 2, phi: 30 }, { A: 2, phi: 210 }).A, 0, 1e-9);
// 3∠0 + 4∠90 = 5∠53.13
s = phasorSum({ A: 3, phi: 0 }, { A: 4, phi: 90 }); close(s.A, 5); close(s.phi, 53.1301, 1e-5);
// phasor sum equals the time-domain sum at any instant
const a = { A: 1.3, f: 50, phi: 20, off: 0 }, b = { A: 0.7, f: 50, phi: -75, off: 0 };
const ps = phasorSum(a, b);
for (const t of [0, 0.0013, 0.0071]) close(wave(a, t) + wave(b, t), wave({ A: ps.A, f: 50, phi: ps.phi, off: 0 }, t), 1e-9);

// 90° at 1 kHz = 250 µs; wrapping
const d = phaseDiff({ A: 1, f: 1000, phi: 0, off: 0 }, { A: 1, f: 1000, phi: 90, off: 0 });
close(d.deg, 90); close(d.dt, 250e-6);
close(wrapDeg(270), -90); close(wrapDeg(-190), 170);
// RMS: sine = A/√2, with offset √(dc² + A²/2)
close(rms({ A: 1, f: 1, phi: 0, off: 0 }), 1 / Math.SQRT2);
close(rms({ A: 2, f: 1, phi: 0, off: 1 }), Math.sqrt(3));
// different frequencies beat at |f1 − f2|
const si = sumInfo({ A: 1, f: 1000, phi: 0, off: 0 }, { A: 0.5, f: 1100, phi: 0, off: 0 });
assert.equal(si.same, false); close(si.beat, 100); close(si.envMax, 1.5); close(si.envMin, 0.5);

// Reactance: X_C(1 µF, 1 kHz) = 159.155 Ω; X_L(1 mH, 1 kHz) = 6.2832 Ω
close(reactance('C', 1e-6, 1000), 159.1549, 1e-6);
close(reactance('L', 1e-3, 1000), 6.283185, 1e-6);
close(reactance('R', 100, 1e6), 100);
// current leads in C, lags in L, in phase in R
close(rlc('C', 1e-6, 1000, 1).iPhase, 90); close(rlc('L', 1e-3, 1000, 1).iPhase, -90); close(rlc('R', 10, 1000, 1).iPhase, 0);
close(rlc('C', 1e-6, 1000, 10).ip, 10 / 159.1549, 1e-6);
// Average power: R → Vp²/(2R); L, C → 0 (numerical average over whole periods)
const avg = (arr: number[]) => arr.slice(0, -1).reduce((x, y) => x + y, 0) / (arr.length - 1);
close(avg(rlcWaves('R', 10, 1000, 5, 2, 2001).p), 25 / 20, 1e-3);
close(rlc('R', 10, 1000, 5).pAvg, 1.25);
for (const el of ['L', 'C'] as const) {
  const w = rlcWaves(el, el === 'L' ? 1e-3 : 1e-6, 1000, 5, 2, 2001);
  assert.ok(Math.abs(avg(w.p)) < 1e-3 * w.ip * 5, `${el} avg power ${avg(w.p)}`);
  assert.equal(w.pAvg, 0);
}
console.log('phasor-viewer model: all tests passed');
