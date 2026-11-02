import assert from 'node:assert/strict';
import { f0, zeta, rCrit, stepOvershoot, analyze, overshootOf, CONTEXTS } from '../../src/sims/models/ringing-lc.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);
close(f0(1e-6, 1e-6), 159154.943, 1e-6);
// 20 nH + 10 pF -> 356 MHz
close(f0(20e-9, 10e-12), 355.88e6, 1e-3);
close(rCrit(1e-6, 1e-9), 2 * Math.sqrt(1000), 1e-12);
close(zeta(1e-6, 1e-9, rCrit(1e-6, 1e-9)), 1, 1e-12);
// textbook step overshoot: zeta=0.5 -> 16.3 %, 0.7071 -> 4.3 %, 0.1 -> 72.9 %
close(stepOvershoot(0.5), 0.16303, 1e-4); close(stepOvershoot(0.7071), 0.04321, 1e-3); close(stepOvershoot(0.1), 0.7292, 1e-3); assert.equal(stepOvershoot(1.2), 0);
// numeric RK4 with a (nearly) ideal step reproduces it
const l = 1e-6, c = 1e-9, T0 = 1 / f0(l, c);
for (const z of [0.1, 0.3, 0.5, 0.7]) close(overshootOf({ l, c, r: 2 * z * Math.sqrt(l / c), tr: 1e-4 * T0 * 0.8 }), stepOvershoot(z), 5e-3);
// R = 0, step -> 100 % overshoot (peak 2V)
close(overshootOf({ l, c, r: 0, tr: 1e-5 * T0 }), 1, 5e-3);
// finite-rise ramp, undamped: ringing amplitude = sin(w0 Tr/2)/(w0 Tr/2) ; Tr = T0/2 -> 2/pi
const Tr = T0 / 2; close(overshootOf({ l, c, r: 0, tr: 0.8 * Tr }), 2 / Math.PI, 1e-2);
// Tr = T0 nulls the ring (only monotone approach, overshoot ~0)
assert.ok(overshootOf({ l, c, r: 0, tr: 0.8 * T0 }) < 0.02);
// critically damped and overdamped: no overshoot
assert.ok(overshootOf({ l, c, r: rCrit(l, c), tr: 1e-3 * T0 }) < 1e-3); assert.ok(overshootOf({ l, c, r: 3 * rCrit(l, c), tr: 1e-3 * T0 }) < 1e-3);
// analyze: ring frequency measured from the waveform zero-crossings of (vc - V) matches fd
const a = analyze({ l: 20e-9, c: 10e-12, r: 5, tr: 100e-12, v: 1 });
assert.equal(a.regime, 'underdamped'); close(a.fd, a.f0 * Math.sqrt(1 - a.zeta ** 2), 1e-12);
const cross: number[] = []; for (let k = 1; k < a.t.length; k++) if ((a.vc[k - 1] - 1) * (a.vc[k] - 1) < 0) cross.push(a.t[k]);
assert.ok(cross.length > 4); close(2 * (cross[3] - cross[1]) / 2, 1 / a.fd, 0.03);
// more series R -> less overshoot ; slower edge -> less overshoot
assert.ok(analyze({ l: 20e-9, c: 10e-12, r: 20, tr: 100e-12 }).overshoot < a.overshoot);
assert.ok(analyze({ l: 20e-9, c: 10e-12, r: 5, tr: 3e-9 }).overshoot < a.overshoot);
for (const k of Object.keys(CONTEXTS) as (keyof typeof CONTEXTS)[]) { const x = CONTEXTS[k]; assert.ok(isFinite(analyze(x).f0)); }
console.log('ringing-lc model: all tests passed');
