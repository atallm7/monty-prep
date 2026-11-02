import assert from 'node:assert/strict';
import { params, response, overshoot, settlingTime, unitStep } from '../../src/sims/models/rlc-transient.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// default: series R=20, L=1mH, C=1µF -> ω0 = 31623 rad/s, α = 10000, ζ = 0.316, Q = 1.58
const d = { topology: 'series' as const, r: 20, l: 1e-3, c: 1e-6, vs: 5 };
const p = params(d);
close(p.w0, 1 / Math.sqrt(1e-9)); close(p.alpha, 1e4); close(p.zeta, 1e4 / p.w0); close(p.Q, Math.sqrt(1e-3 / 1e-6) / 20);
assert.equal(p.kind, 'underdamped');
// critical: R = 2√(L/C) = 63.25 Ω
assert.equal(params({ ...d, r: 2 * Math.sqrt(1e3) }).kind, 'critically damped');
assert.equal(params({ ...d, r: 200 }).kind, 'overdamped');
// parallel: α = 1/(2RC); critical when R = ½√(L/C) = 15.81 Ω
const pp = params({ ...d, topology: 'parallel' });
close(pp.alpha, 1 / (2 * 20 * 1e-6)); close(pp.Q, 20 * Math.sqrt(1e-6 / 1e-3));
assert.equal(params({ ...d, topology: 'parallel', r: 0.5 * Math.sqrt(1e3) }).kind, 'critically damped');

// Compare closed form to RK4 integration of the actual circuit ODEs for all three damping cases.
function rk4Series(r: number, l: number, c: number, vs: number, tEnd: number, n: number) {
  let v = 0, i = 0; const h = tEnd / n;
  const f = (v: number, i: number) => [i / c, (vs - r * i - v) / l];
  for (let k = 0; k < n; k++) {
    const a = f(v, i), b = f(v + h / 2 * a[0], i + h / 2 * a[1]), cc = f(v + h / 2 * b[0], i + h / 2 * b[1]), dd = f(v + h * cc[0], i + h * cc[1]);
    v += h / 6 * (a[0] + 2 * b[0] + 2 * cc[0] + dd[0]); i += h / 6 * (a[1] + 2 * b[1] + 2 * cc[1] + dd[1]);
  }
  return [v, i];
}
function rk4Parallel(r: number, l: number, c: number, vs: number, tEnd: number, n: number) {
  // node v: C dv/dt = (vs − v)/R − iL ; L diL/dt = v
  let v = 0, i = 0; const h = tEnd / n;
  const f = (v: number, i: number) => [((vs - v) / r - i) / c, v / l];
  for (let k = 0; k < n; k++) {
    const a = f(v, i), b = f(v + h / 2 * a[0], i + h / 2 * a[1]), cc = f(v + h / 2 * b[0], i + h / 2 * b[1]), dd = f(v + h * cc[0], i + h * cc[1]);
    v += h / 6 * (a[0] + 2 * b[0] + 2 * cc[0] + dd[0]); i += h / 6 * (a[1] + 2 * b[1] + 2 * cc[1] + dd[1]);
  }
  return [v, i];
}
for (const r of [5, 20, 63.2455532, 200, 5000]) {
  const tEnd = 3e-4;
  const w = response({ ...d, r }, tEnd, 10);
  const [v, i] = rk4Series(r, 1e-3, 1e-6, 5, tEnd, 200000);
  close(w.vC[10], v, 1e-6); close(w.iL[10], i, 1e-5);
}
for (const r of [2, 15.8113883, 20, 100]) {
  const tEnd = 3e-4;
  const w = response({ ...d, topology: 'parallel', r }, tEnd, 10);
  const [v, i] = rk4Parallel(r, 1e-3, 1e-6, 5, tEnd, 200000);
  close(w.vC[10], v, 1e-5); close(w.iL[10], i, 1e-5);
}
// Overshoot: ζ = 0.316 -> Mp = e^{-πζ/√(1−ζ²)} ≈ 35.1 %, and matches the closed form peak
const os = overshoot(p.zeta, p.wd);
close(os.mp, Math.exp(-Math.PI * p.zeta / Math.sqrt(1 - p.zeta ** 2)));
close(unitStep(p.alpha, p.w0, os.tp)[0], 1 + os.mp, 1e-9);
// ζ = 0.5 -> 16.3 % overshoot (textbook)
close(overshoot(0.5, 1).mp, 0.163, 1e-2);
// settling (2%) ≈ 4/α for light damping (within 25 %), critical ≈ 5.83/ω0
const ts = settlingTime(p.alpha, p.w0);
assert.ok(ts > 0.5 * 4 / p.alpha && ts < 1.25 * 4 / p.alpha, `ts=${ts}`);
close(settlingTime(1, 1), 5.834, 2e-3);
// final values: series vC -> Vs, parallel iL -> Vs/R
const longS = response(d, 0.01, 4); close(longS.vC[4], 5, 1e-9); close(longS.iL[4], 0, 1e-9);
const longP = response({ ...d, topology: 'parallel' }, 0.01, 4); close(longP.iL[4], 5 / 20, 1e-9); close(longP.vC[4], 0, 1e-9);
// KVL in series: vs = vR + vL + vC at t > 0
for (let k = 1; k < longS.t.length; k++) close(longS.vR[k] + longS.vL[k] + longS.vC[k], 5, 1e-9);
// no NaN at extreme overdamping
const big = response({ ...d, r: 1e6 }, 1, 50); assert.ok(big.vC.every(Number.isFinite));
console.log('rlc-transient model: all tests passed');
