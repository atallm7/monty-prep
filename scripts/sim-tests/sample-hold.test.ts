import assert from 'node:assert/strict';
import { shMetrics, shSimulate } from '../../src/sims/models/sample-hold.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-30, Math.abs(b)), `${a} != ${b}`);

const base = { ron: 100, ch: 10e-12, tsample: 100e-9, ileak: 1e-9, bits: 12, qinj: 0, thold: 900e-9, vfs: 1 };
const m = shMetrics(base);
close(m.tau, 1e-9);
// 12-bit acquisition: 13·ln2·τ = 9.011 τ
close(m.tacq, 13 * Math.LN2 * 1e-9);
assert.ok(Math.abs(m.tacq / m.tau - 9.011) < 1e-3);
// droop 1 nA / 10 pF = 100 V/s
close(m.droopRate, 100);
close(m.droop, 100 * 900e-9);
// f-3dB = 1/(2π·1 ns) = 159.15 MHz
close(m.f3db, 159.1549e6, 1e-5);
// kT/C for 10 pF at 300 K ≈ 20.3 µV
close(m.ktc, Math.sqrt(1.380649e-23 * 300 / 10e-12));
assert.ok(Math.abs(m.ktc - 20.35e-6) < 0.05e-6);
// pedestal: 10 fC onto 10 pF = 1 mV
close(shMetrics({ ...base, qinj: 10e-15 }).pedestal, 1e-3);

// Time domain: sample for exactly τ after a step → 63.2 % settled
const p2 = { ...base, ron: 1000, ch: 100e-12, tsample: 100e-9, ileak: 0 }; // τ = 100 ns = tsample
const w = shSimulate(p2, 'step', 1e6, 1, 400);
const v0 = 0.05, v1 = 0.95;
const h = w.held[0];
close((h.v - v0) / (v1 - v0), 1 - Math.exp(-1), 1e-4);
// After 10τ it should be within 1 LSB of 12 bits
const w2 = shSimulate({ ...p2, tsample: 1e-6 }, 'step', 1e6, 1, 400);
assert.ok(Math.abs(w2.held[0].v - 0.95) < 1 / 4096);
// Droop during hold is linear at Ileak/Ch
const p3 = { ...base, ileak: 1e-6, ch: 1e-9, tsample: 1e-6, thold: 1e-3, ron: 10 };
const w3 = shSimulate(p3, 'step', 1, 1, 200);
const last = w3.vh[w3.vh.length - 1];
close(w3.held[0].v - last, 1e-6 / 1e-9 * 1e-3, 1e-6); // 1 V/ms · 1 ms = 1 V? → 1e3 V/s·1e-3 s = 1 V
// Pedestal applied at switch-off
const w4 = shSimulate({ ...base, qinj: 50e-15, tsample: 1e-6 }, 'step', 1, 1, 200);
assert.ok(Math.abs(w4.held[0].v - (0.95 - 5e-3)) < 1e-5);
console.log('sample-hold model: all tests passed');
