import assert from 'node:assert/strict';
import { H, mag, phaseDeg, dB, characteristics, sineResponse, bode, TYPES } from '../../src/sims/models/filter-lab.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// RC low-pass 1 kΩ, 159.15 nF -> fc = 1 kHz; at fc: −3.01 dB, −45°
const lp = { type: 'rc-lpf' as const, r: 1000, c: 1 / (2 * Math.PI * 1e6), l: 1e-3 };
let ch = characteristics(lp); close(ch.f0, 1000); close(ch.cut[0], 1000, 1e-6);
close(dB(mag(H(lp, 1000))), -3.0103, 1e-4); close(phaseDeg(H(lp, 1000)), -45);
// one decade above: ≈ −20 dB (−20.04)
close(dB(mag(H(lp, 10000))), -20.0432, 1e-3);
// RC high-pass: +45° at fc, unity at high f
const hp = { ...lp, type: 'rc-hpf' as const };
close(phaseDeg(H(hp, 1000)), 45); close(mag(H(hp, 1e9)), 1, 1e-9);
// RL: fc = R/(2πL); 1 kΩ, 159.15 mH -> 1 kHz
const rl = { type: 'rl-lpf' as const, r: 1000, c: 1e-9, l: 1000 / (2 * Math.PI * 1000) };
close(characteristics(rl).f0, 1000); close(mag(H(rl, 1000)), Math.SQRT1_2);
close(mag(H({ ...rl, type: 'rl-hpf' }, 1000)), Math.SQRT1_2);
// LP + HP of same RC sum to 1 (complementary)
for (const f of [10, 1000, 1e5]) { const a = H(lp, f), b = H(hp, f); close(a.re + b.re, 1); close(a.im + b.im, 0); }

// Series RLC: L = 10 mH, C = 100 nF -> f0 = 5.033 kHz; R = 100 Ω -> Q = 3.162, BW = 1.592 kHz
const bp = { type: 'rlc-bpf' as const, r: 100, c: 100e-9, l: 10e-3 };
ch = characteristics(bp);
close(ch.f0, 1 / (2 * Math.PI * Math.sqrt(1e-9))); close(ch.Q, Math.sqrt(1e5) / 100); close(ch.bw, 100 / (2 * Math.PI * 0.01));
close(mag(H(bp, ch.f0)), 1, 1e-9); close(phaseDeg(H(bp, ch.f0)), 0, 1e-6);
// −3 dB edges: f2 − f1 = BW and f1·f2 = f0²
assert.equal(ch.cut.length, 2); close(ch.cut[1] - ch.cut[0], ch.bw, 1e-6); close(ch.cut[0] * ch.cut[1], ch.f0 ** 2, 1e-6);
// band-stop: zero at f0, unity far away
const bs = { ...bp, type: 'rlc-bsf' as const };
assert.ok(mag(H(bs, ch.f0)) < 1e-9); close(mag(H(bs, 1)), 1, 1e-6);
// BP + BS = 1
for (const f of [100, 5000, 1e6]) { const a = H(bp, f), b = H(bs, f); close(a.re + b.re, 1); close(a.im + b.im, 0); }
// 2nd-order LP: |H(f0)| = Q, −90° at f0, −40 dB/decade
const l2 = { ...bp, type: 'rlc-lpf' as const };
close(mag(H(l2, ch.f0)), ch.Q, 1e-9); close(phaseDeg(H(l2, ch.f0)), -90, 1e-6);
close(dB(mag(H(l2, ch.f0 * 1000))) - dB(mag(H(l2, ch.f0 * 100))), -40, 1e-3);
// peak magnitude formula Q/√(1 − 1/4Q²)
const b2 = bode(l2, 100, 1e5, 20000); close(10 ** (Math.max(...b2.m) / 20), characteristics(l2).peak, 1e-4);
// HP: |H(f0)| = Q, +90°
const h2 = { ...bp, type: 'rlc-hpf' as const }; close(mag(H(h2, ch.f0)), ch.Q, 1e-9); close(phaseDeg(H(h2, ch.f0)), 90, 1e-6);
// Butterworth (Q = 0.7071): −3 dB exactly at f0
const bw = { type: 'rlc-lpf' as const, l: 10e-3, c: 100e-9, r: Math.sqrt(1e5) / Math.SQRT1_2 };
close(characteristics(bw).cut[0], characteristics(bw).f0, 1e-6);
// sine response: amplitude and phase follow |H| and ∠H
const sr = sineResponse(lp, 1000, 2);
close(sr.gain, Math.SQRT1_2); close(sr.phaseDeg, -45); close(Math.max(...sr.vout), 2 * Math.SQRT1_2, 1e-3);
close(sr.delay, 0.125e-3); // −45° at 1 kHz = 125 µs lag
// every type finite over a wide sweep
for (const type of TYPES) { const b = bode({ type, r: 100, c: 1e-7, l: 1e-2 }, 1, 1e8, 200); assert.ok(b.m.every(Number.isFinite) && b.ph.every(Number.isFinite), type); }
console.log('filter-lab model: all tests passed');
