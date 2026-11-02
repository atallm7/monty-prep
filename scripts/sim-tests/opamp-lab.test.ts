import assert from 'node:assert/strict';
import { simulate, measuredGain, idealGain, finiteGain, beta, waveAt, type OpampIn } from '../../src/sims/models/opamp-lab.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${msg} ${a} != ${b}`);
const base: OpampIn = { config: 'inverting', r1: 10e3, r2: 100e3, c: 10e-9, vin: 0.5, wave: 'sine', f: 1e3, vpos: 12, vneg: -12, real: false, a0: 1e5, gbw: 1e6, sr: 0.5e6, headroom: 1, v2: 0 };
const peakAt = (o: ReturnType<typeof simulate>, t: number) => { let k = 0; for (let i = 0; i < o.t.length; i++) if (Math.abs(o.t[i] - t) < Math.abs(o.t[k] - t)) k = i; return o.vout[k]; };

// Inverting ideal: gain −10. At t = T/4 vin = +0.5 → vout = −5
let o = simulate(base);
close(measuredGain(o), -10, 1e-3, 'inv gain'); close(peakAt(o, 0.25e-3), -5, 1e-3, 'inv sign');
assert.ok(o.vdPeak < 1e-6, 'virtual short');
// Non-inverting: 1 + R2/R1 = 11
o = simulate({ ...base, config: 'noninverting' }); close(measuredGain(o), 11, 1e-3, 'noninv'); close(peakAt(o, 0.25e-3), 5.5, 1e-3);
// Buffer
o = simulate({ ...base, config: 'buffer' }); close(measuredGain(o), 1, 1e-3, 'buffer');
// Difference: vo = R2/R1 (V2 − V1); DC V2 = 0.5 V, V1 = 0.2 V → 3 V
o = simulate({ ...base, config: 'difference', wave: 'dc', vin: 0.5, v2: 0.2 }); close(o.vout[o.vout.length - 1], 3, 1e-4, 'diff');
// Summing: −(R2/R1)(0.3 + 0.2) = −5
o = simulate({ ...base, config: 'summing', wave: 'dc', vin: 0.3, v2: 0.2 }); close(o.vout[o.vout.length - 1], -5, 1e-4, 'sum');
// Clipping at the rails: gain 10 × 2 V = 20 V > 12 V rail
o = simulate({ ...base, vin: 2 }); assert.ok(o.clipped); close(o.voutMax, 12, 1e-9); close(o.voutMin, -12, 1e-9);
// Real op-amp: finite gain A0 = 1000 → G = 10/(1 + 11/1000)
o = simulate({ ...base, real: true, a0: 1000, gbw: 1e7, sr: 1e9, headroom: 0 });
close(-measuredGain(o), finiteGain(10, 1000, beta('inverting', 10e3, 100e3)), 2e-3, 'finite A0');
close(finiteGain(10, 1000, 1 / 11), 10 / 1.011, 1e-12);
assert.ok(o.vdPeak > 1e-3, 'finite gain leaves a visible v+ − v− error');
// Slew rate: sine 5 V pk at 100 kHz needs 2π f Vp = 3.14 V/µs > 0.5 V/µs → slew-limited, output amplitude reduced
o = simulate({ ...base, config: 'buffer', vin: 5, f: 100e3, real: true, sr: 0.5e6, gbw: 10e6 });
assert.ok(o.slewLimited, 'slew limited');
// fully slew-limited triangle amplitude ≈ SR·T/4 = 0.5e6 · 2.5e-6 = 1.25 V
close(o.voutMax, 1.25, 0.05, 'slew triangle amplitude');
// Closed-loop bandwidth: noninverting G=11 with GBW 1 MHz → f3dB ≈ 90.9 kHz: gain at f3dB is G/√2
o = simulate({ ...base, config: 'noninverting', vin: 0.1, f: 1e6 / 11, real: true, a0: 1e6, gbw: 1e6, sr: 1e9, headroom: 0 }, 4000);
close(measuredGain(o), 11 / Math.SQRT2, 0.02, 'GBW');
// Integrator: square ±1 V, R1C = 100 µs, f = 1 kHz: ramp over T/2 = 0.5 ms gives Δ = 1·0.5e-3/1e-4 = 5 V p-p (R2 = 10 MΩ ≈ ideal)
o = simulate({ ...base, config: 'integrator', wave: 'square', vin: 1, r1: 10e3, r2: 10e6, c: 10e-9 });
close(o.voutMax - o.voutMin, 5, 0.01, 'integrator ramp'); assert.ok(Math.abs(o.voutMax + o.voutMin) < 0.1, 'integrator centred');
// Integrator with DC: ramp slope −Vin/(R1C) from 0
o = simulate({ ...base, config: 'integrator', wave: 'dc', vin: 1, r1: 10e3, r2: 1e9, c: 10e-9 });
close(o.vout[600] / o.t[600], -1 / (10e3 * 10e-9), 0.01, 'dc integrator slope');
// Integrator sine gain 1/(ωR1C) = 1/(2π·1e3·1e-4) = 1.59
o = simulate({ ...base, config: 'integrator', vin: 1, r1: 10e3, r2: 1e9, c: 10e-9 }, 3000);
close(Math.abs(measuredGain(o)), 1 / (2 * Math.PI * 1e3 * 1e-4), 0.01, 'int sine');
close(idealGain({ config: 'integrator', r1: 10e3, r2: 1e12, c: 10e-9, f: 1e3 }).mag, 1.5915, 1e-3);
// Differentiator: sine gain ωR2C = 2π·1e3·10e3·10e-9 = 0.628 (R1 = 10 Ω tiny)
o = simulate({ ...base, config: 'differentiator', vin: 1, r1: 10, r2: 10e3, c: 10e-9 }, 3000);
close(Math.abs(measuredGain(o)), 2 * Math.PI * 1e3 * 1e-4, 0.01, 'diff sine');
// triangle in → square out of amplitude R2·C·4Af = 1e-4·4·1e3 = 0.4 V
o = simulate({ ...base, config: 'differentiator', wave: 'triangle', vin: 1, r1: 10, r2: 10e3, c: 10e-9 }, 3000);
close(peakAt(o, 0.1e-3), -0.4, 0.02, 'diff triangle');
// Comparator: output = +rail when vin > vref
o = simulate({ ...base, config: 'comparator', v2: 0.2 });
close(peakAt(o, 0.25e-3), 12, 1e-6); close(peakAt(o, 0.75e-3), -12, 1e-6);
// Schmitt: thresholds ±12·R1/(R1+R2); with R1=10k R2=100k → ±1.09 V. Input 0.5 V never crosses → output stays put.
o = simulate({ ...base, config: 'schmitt' });
close(o.thresholds![1], 12 / 11, 1e-9); assert.equal(o.voutMax, o.voutMin);
o = simulate({ ...base, config: 'schmitt', vin: 2 }, 4000);
// output goes low when vin rises above +1.09 V: sin(θ)=0.545 → θ = 33° → t = 0.0917 ms
let tSw = 0; for (let i = 1; i < o.t.length; i++) if (o.vout[i - 1] > 0 && o.vout[i] < 0) { tSw = o.t[i]; break; }
close(tSw, Math.asin(12 / 11 / 2) / (2 * Math.PI * 1e3), 0.02, 'schmitt switch time');
close(waveAt('triangle', 1, 1, 0.25), 1, 1e-12); close(waveAt('triangle', 1, 1, 0.75), -1, 1e-12);
console.log('opamp-lab model: all tests passed');
