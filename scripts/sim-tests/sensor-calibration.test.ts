import assert from 'node:assert/strict';
import { FS, ideal, calibrate, errorCurves, readings, mean, std, polyfit, polyval, mulberry32, gauss, histogram, noiseGain } from '../../src/sims/models/sensor-calibration.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-9, Math.abs(b)) , `${a} != ${b}`);
const near0 = (a: number, tol = 1e-9) => assert.ok(Math.abs(a) < tol, `${a} not ~0`);
const S = { offset: 0.2, gain: 1.05, nonlin: 0.02, noise: 0.05 };
// raw response: offset at 0, gain error at FS, bow of nonlin*FS at mid-scale
close(ideal({ ...S, nonlin: 0 }, 0), 0.2); close(ideal({ ...S, nonlin: 0 }, FS), 0.2 + 10.5);
close(ideal({ offset: 0, gain: 1, nonlin: 0.02, noise: 0 }, FS / 2) - FS / 2, 0.02 * FS, 1e-12);
// polyfit recovers a known quadratic exactly
const xs = [0, 2, 5, 7, 10]; const co = polyfit(xs, xs.map(x => 1 + 0.5 * x + 0.03 * x * x), 2);
for (const x of xs) close(polyval(co, x), 1 + 0.5 * x + 0.03 * x * x, 1e-9);
const q0 = { ...S, noise: 0 };
// no calibration: error equals sensor error (offset at zero)
const none = calibrate(q0, { mode: 'none' }); close(errorCurves(q0, none).raw[0], 0.2); close(errorCurves(q0, none).maxFixed, errorCurves(q0, none).maxRaw);
// 1-pt offset trim removes the offset at the cal point exactly and leaves gain error
const p1 = calibrate(q0, { mode: 'pt1', xcal1: 5 }); near0(p1.correct(ideal(q0, 5)) - 5);
assert.ok(errorCurves(q0, p1).maxFixed < errorCurves(q0, none).maxFixed);
// 2-pt fit on a linear sensor (nonlin 0) is exact; with bow it leaves ~ the INL
const lin = { ...S, nonlin: 0, noise: 0 }; near0(errorCurves(lin, calibrate(lin, { mode: 'pt2' })).maxFixed, 1e-8);
const p2 = errorCurves(q0, calibrate(q0, { mode: 'pt2' })); assert.ok(p2.maxFixed > 0.1 && p2.maxFixed < 0.25, `${p2.maxFixed}`);
// 3-pt quadratic fit is exact for a quadratic sensor; so is the multi-point cubic least squares
near0(errorCurves(q0, calibrate(q0, { mode: 'pt3' })).maxFixed, 1e-7); near0(errorCurves(q0, calibrate(q0, { mode: 'multi', nMulti: 8 })).maxFixed, 1e-7);
// noise statistics: averaging M samples shrinks scatter by sqrt(M) ; scatter ~ sigma
const rnd = mulberry32(1); const g = Array.from({ length: 20000 }, () => gauss(rnd)); assert.ok(Math.abs(mean(g)) < 0.03 && Math.abs(std(g) - 1) < 0.03);
const noisy = { offset: 0, gain: 1, nonlin: 0, noise: 0.5 }; const cn = calibrate(noisy, { mode: 'none' });
const s1 = std(readings(noisy, cn, 5, 4000, 1)), s16 = std(readings(noisy, cn, 5, 4000, 16));
close(s1, 0.5, 0.05); close(s16, 0.5 / 4, 0.06); assert.ok(Math.abs(mean(readings(noisy, cn, 5, 4000, 1)) - 5) < 0.03);
// bias vs scatter: a calibrated noisy sensor has the same scatter but ~zero bias; uncalibrated has bias = error
const cal = calibrate({ ...S, noise: 0 }, { mode: 'pt2' }); const r = readings({ ...S, noise: 0.05 }, cal, 5, 4000, 1);
assert.ok(Math.abs(mean(r) - 5) < 0.2 && std(r) > 0.04); close(noiseGain(q0, cal, 5), 1 / 1.05, 0.05);
const h = histogram([1, 1, 2, 3], 0, 4, 4); close(h.y.reduce((a, b) => a + b, 0), 1, 1e-12);
// more cal points with noise reduces calibration-induced error (on average over seeds)
const avgErr = (n: number) => { let t = 0; for (let sd = 1; sd <= 30; sd++) t += errorCurves(S, calibrate(S, { mode: 'multi', nMulti: n, seed: sd })).rmsFixed; return t / 30; };
assert.ok(avgErr(10) < avgErr(4));
console.log('sensor-calibration model: all tests passed');
