import assert from 'node:assert/strict';
import { fClosed, fpole, openLoop, closedLoop, dcGain, fullPowerBW, sineResponse, stepResponse } from '../../src/sims/models/amp-bandwidth.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} != ${b}`);
const p = { gbw: 1e6, a0: 1e5, gain: 10, sr: 0.5e6 };
close(fpole(p), 10, 1e-12, 'open-loop pole');
// GBW/G: 1 MHz / 10 = 100 kHz (exact single-pole: fp(1 + A0/G) = 100.01 kHz)
close(fClosed(p), 100e3, 1e-3, 'closed-loop BW');
// closed-loop gain is 3 dB down at f3
close(closedLoop(p, fClosed(p)).mag, dcGain(p) / Math.SQRT2, 1e-9, '-3 dB point');
close(closedLoop(p, fClosed(p)).phase, -45, 1e-9, '-45° at f3');
// open loop at GBW ≈ unity gain
close(openLoop(p, 1e6).mag, 1, 1e-4, 'unity gain at GBW');
close(dcGain(p), 10 / (1 + 10 / 1e5), 1e-12);
// full-power bandwidth: 0.5 V/µs, 5 V peak → 15.9 kHz
close(fullPowerBW(0.5e6, 5), 15915.5, 1e-4, 'FPBW');
// small-signal step: tr = 2.2τ ≈ 0.35/f3 = 3.5 µs
const s = stepResponse(p, 0.1);
assert.ok(!s.slewLimited, 'small step is linear');
close(s.tr, Math.log(9) / (2 * Math.PI * fClosed(p)), 0.01, 'rise time 2.2τ');
close(s.tr, 0.35 / fClosed(p), 0.01, 'tr ≈ 0.35/BW');
// large step: slew-limited, 10–90 % takes 0.8·V/SR = 0.8·5/0.5e6 = 8 µs (plus a little linear tail)
const L = stepResponse(p, 5);
assert.ok(L.slewLimited, 'large step slews'); close(L.tr, 0.8 * 5 / 0.5e6, 0.05, 'slew-limited rise');
// sine below FPBW: undistorted amplitude ≈ |ACL(f)|·vin; above: triangle with peak SR·T/4
let w = sineResponse(p, 1, 5e3); assert.ok(!w.slewLimited); close(w.outPk, closedLoop(p, 5e3).mag / dcGain(p), 0.01, 'sine amplitude');
w = sineResponse({ ...p, gbw: 100e6 }, 5, 100e3); assert.ok(w.slewLimited); close(w.outPk, 0.5e6 / 100e3 / 4, 0.03, 'slew triangle');
console.log('amp-bandwidth model: all tests passed');
