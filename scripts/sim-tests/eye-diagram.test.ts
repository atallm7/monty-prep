import assert from 'node:assert/strict';
import { prbs7, simulate, firTaps, response, erfc, type EyeIn } from '../../src/sims/models/eye-diagram.ts';
const close = (a: number, b: number, tol: number, m = '') => assert.ok(Math.abs(a - b) <= tol, `${m} ${a} != ${b} (±${tol})`);
// PRBS7: period 127, 64 ones / 63 zeros, longest run of ones = 7
const s = prbs7(254); assert.deepEqual(s.slice(0, 127), s.slice(127));
assert.equal(s.slice(0, 127).reduce((a, b) => a + b, 0), 64);
let run = 0, mx = 0; for (const b of s) { run = b ? run + 1 : 0; mx = Math.max(mx, run); } assert.equal(mx, 7);
// erfc and Q→BER: Q = 7 ↔ BER ≈ 1.28e−12
close(erfc(0), 1, 1e-7); close(0.5 * erfc(7 / Math.SQRT2) / 1.28e-12, 1, 0.01, 'Q=7');
// FIR taps: 6 dB de-emphasis → c0 = 0.75, c1 = −0.25
const t6 = firTaps(6.0206); close(t6.c0, 0.75, 1e-4); close(t6.c1, -0.25, 1e-4);
const base: EyeIn = { rate: 5e9, bw: 2.5e9, noise: 0, jitter: 0, preemph: 0, ctle: 0, poles: 1 };
// Wide channel, no noise: eye fully open (2A = 1 V), width ≈ 1 UI
const wide = simulate({ ...base, bw: 200e9 });
close(wide.height, 1, 0.02, 'open eye height'); assert.ok(wide.width > 0.9, 'width ' + wide.width); assert.equal(wide.errors, 0);
// 1-pole channel at f−3dB = rate/2: worst-case isolated bit reaches A(1 − 2e^{−π}) → height = 2A(1 − 2e^{−π}) = 0.9136 V
const isi = simulate(base);
close(isi.height, 1 - 2 * Math.exp(-Math.PI), 0.02, 'ISI eye height');
// Halving the bandwidth closes the eye: 2A(1 − 2e^{−π/2}) = 0.584 V
close(simulate({ ...base, bw: 1.25e9 }).height, 1 - 2 * Math.exp(-Math.PI / 2), 0.03, 'ISI at rate/4');
// De-emphasis and CTLE reopen a band-limited eye
const slow = simulate({ ...base, bw: 1e9 });
assert.ok(simulate({ ...base, bw: 1e9, preemph: 3.5 }).height > slow.height + 0.05, 'de-emphasis helps');
const ct = simulate({ ...base, bw: 1e9, ctle: 6 });
const ratio = (r: ReturnType<typeof simulate>) => r.height / (r.mu1 - r.mu0); // ISI closure relative to the level spacing
assert.ok(ratio(ct) > ratio(slow) + 0.1, `CTLE helps ${ratio(ct)} vs ${ratio(slow)}`);
// Channel response: −3 dB at bw for both 1 and 2 poles
close(response(base, 2.5e9).ch, Math.SQRT1_2, 1e-9); close(response({ ...base, poles: 2 }, 2.5e9).ch, Math.SQRT1_2, 1e-9);
// CTLE: −boost dB at DC, ≈ 0 dB near Nyquist; FIR at Nyquist has gain c0 − c1 = 1
close(20 * Math.log10(response({ ...base, ctle: 6 }, 1e3).ct), -6, 1e-3); close(response({ ...base, preemph: 6 }, 2.5e9).fir, 1, 1e-9);
// Noise: measured σ at the slicer matches the requested rms, and lowers Q
const nz = simulate({ ...base, bw: 200e9, noise: 0.05 });
close((nz.sd1 + nz.sd0) / 2, 0.05, 0.012, 'noise rms'); close(nz.Q, 1 / 0.1, 2.5, 'Q ≈ 2A/(2σ)');
// Jitter shrinks the eye width
assert.ok(simulate({ ...base, bw: 200e9, jitter: 0.05 }).width < wide.width - 0.1, 'jitter closes width');
// Mask hits: clean eye → none; heavy noise → many
assert.equal(wide.hits.length, 0); assert.ok(simulate({ ...base, noise: 0.15 }).hitTraces > 10);
console.log('eye-diagram model: all tests passed');
