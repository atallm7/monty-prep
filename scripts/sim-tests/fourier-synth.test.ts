import assert from 'node:assert/strict';
import { harmonic, partialSum, synthesize, powerFraction, ideal, edged, corners } from '../../src/sims/models/fourier-synth.ts';
const close = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} != ${b} (±${tol})`);
// Square wave: b1 = 4/π, b3 = 4/(3π), even harmonics zero
close(harmonic('square', 1).amp, 4 / Math.PI, 1e-12, 'b1');
close(harmonic('square', 3).amp, 4 / (3 * Math.PI), 1e-12, 'b3');
close(harmonic('square', 2).amp, 0, 1e-12, 'b2');
// Partial sum converges to the ideal value away from jumps
close(partialSum('square', 2001, 0.25), 1, 2e-3, 'square at T/4');
close(partialSum('triangle', 2001, 0.25), 1, 1e-3, 'triangle peak');
close(partialSum('sawtooth', 4001, 0.25), 0.5, 2e-3, 'sawtooth at T/4');
// Pulse train: DC = D, harmonic magnitude 2D|sinc(nD)| -> D=0.25: 4th harmonic is a null
close(partialSum('pulse', 0, 0.3, 0.25), 0.25, 1e-12, 'pulse DC');
close(harmonic('pulse', 4, 0.25).amp, 0, 1e-12, 'sinc null at n=1/D');
close(harmonic('pulse', 1, 0.25).amp, 2 * 0.25 * Math.sin(Math.PI * 0.25) / (Math.PI * 0.25), 1e-12, 'pulse n=1');
close(partialSum('pulse', 3001, 0.125, 0.25), 1, 3e-3, 'pulse high level');
// Gibbs phenomenon: overshoot → (Si(π)/π − 1/2) ≈ 8.95 % of the jump, independent of N
const g = synthesize('square', 199, 0.25, 0, 0, 0.1, 4000);
close(g.overshoot, 0.0895, 1.5e-3, 'Gibbs overshoot');
close(synthesize('square', 49, 0.25, 0, 0, 0.5, 4000).overshoot, 0.0895, 3e-3, 'Gibbs N=49');
// Parseval: fundamental of a square carries 8/π² = 81.06 % of the power
close(powerFraction('square', 1), 8 / Math.PI ** 2, 1e-12, 'Parseval');
close(powerFraction('triangle', 1), 96 / Math.PI ** 4, 1e-12, 'triangle fundamental power');
// Finite edges: harmonics scale by sinc(n·tr); trapezoid corner 1/(π tr)
close(harmonic('square', 5, 0.25, 0.1).amp, (4 / (5 * Math.PI)) * Math.sin(Math.PI * 0.5) / (Math.PI * 0.5), 1e-12, 'edge sinc');
close(edged('square', 0.25, 0.5, 0.02), 1, 1e-12, 'trapezoid flat top');
close(edged('square', 0, 0.5, 0.02), 0, 1e-9, 'trapezoid mid-edge');
close(partialSum('square', 2001, 0.005, 0.25, 0.02), edged('square', 0.005, 0.25, 0.02), 2e-3, 'series matches trapezoid');
close(corners('square', 0.5, 0.02).f2, 1 / (Math.PI * 0.02), 1e-9, 'corner');
assert.equal(ideal('pulse', 0.3, 0.25), 0);
console.log('fourier-synth model: all tests passed');
