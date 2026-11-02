import assert from 'node:assert/strict';
import { erf, trScope, trRule, K_RISE, edgeAnalysis, harmonics, scopeGain, riseTimeOf, edge, sigmaFromBw } from '../../src/sims/models/measurement-bw.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);
close(erf(1), 0.8427008, 1e-6); close(erf(0.5), 0.5204999, 1e-6); close(erf(-2), -0.9953223, 1e-6);
// 0.35/BW rule: 350 MHz -> 1 ns (Gaussian exact 0.3398 -> 0.971 ns)
close(trRule(350e6), 1e-9, 1e-12); close(K_RISE, 0.3398, 2e-3); close(trScope(350e6), 0.971e-9, 5e-3);
// RSS: 1 ns signal into 350 MHz scope, gaussian -> hypot(1ns, 0.971ns)
const e = edgeAnalysis({ tr: 1e-9, bw: 350e6, fs: 1e12 });
close(e.trMeas, Math.hypot(1e-9, trScope(350e6)), 1e-12); close(e.trRSS, Math.SQRT2 * 1e-9, 1e-12);
// numerical 10-90 of the filtered edge equals the RSS (gaussian cascade is exact)
close(riseTimeOf(e.t, e.filt), e.trMeas, 0.01);
// the -3 dB point of the gaussian response and the sigma relation
close(scopeGain(350e6, 350e6), Math.SQRT1_2, 1e-9); close(Math.exp(-((2 * Math.PI * 350e6 * sigmaFromBw(350e6)) ** 2) / 2), Math.SQRT1_2, 1e-9);
// fast scope (10x signal BW) measures the true rise time within 0.5 %
close(edgeAnalysis({ tr: 1e-9, bw: 3.5e9, fs: 1e12 }).trMeas, 1e-9, 5e-3);
// scope BW = signal BW -> reads ~ 41 % slow (sqrt2 with 0.35 rule)
assert.ok(Math.abs(e.errPct - 38.0) < 3);
// sampled measurement: plenty of samples per edge ~ truth; 1 sample/edge is badly wrong; error depends on phase
const hi = edgeAnalysis({ tr: 1e-9, bw: 1e9, fs: 50e9 }); close(hi.trSampled, hi.trMeas, 0.02);
const lo0 = edgeAnalysis({ tr: 1e-9, bw: 1e9, fs: 0.7e9, phase: 0 }), lo5 = edgeAnalysis({ tr: 1e-9, bw: 1e9, fs: 0.7e9, phase: 0.5 });
assert.ok(Math.abs(lo0.trSampled - lo0.trMeas) / lo0.trMeas > 0.1 || Math.abs(lo5.trSampled - lo5.trMeas) / lo5.trMeas > 0.1);
assert.notEqual(lo0.trSampled, lo5.trSampled);
close(edge(0, 1), 0.5, 1e-9);
// harmonics: ideal square (tr -> 0) has 1/n amplitudes; 4/pi for the fundamental
const h = harmonics(10e6, 1e-15, 1e12, 1e12); close(h.ideal[0], 4 / Math.PI, 1e-6); close(h.ideal[1], h.ideal[0] / 3, 1e-6); close(h.ideal[2], h.ideal[0] / 5, 1e-6);
// finite rise suppresses harmonics beyond 1/(pi*tr); scope attenuates by 0.707 at BW, nearly all power kept for BW >> content
const h2 = harmonics(100e6, 1e-9, 100e6, 1e9); assert.ok(h2.seen[0] < h2.ideal[0]); close(h2.seen[0] / h2.ideal[0], scopeGain(100e6, 100e6), 1e-9);
assert.ok(harmonics(100e6, 1e-9, 5e9, 20e9).powerKept > 0.999);
assert.equal(harmonics(100e6, 1e-9, 1e9, 400e6).beyondNyq[1], true);
close(harmonics(100e6, 1e-9, 1e9, 400e6).alias[2], 100e6, 1e-9); // 5th harmonic at 500 MHz aliases to |500-400| = 100 MHz
console.log('measurement-bw model: all tests passed');
