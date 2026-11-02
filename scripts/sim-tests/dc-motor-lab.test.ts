import assert from 'node:assert/strict';
import { expm2, simulateTransient, steadyState, motorCurves, timeConstants } from '../../src/sims/models/dc-motor-lab.ts';
const rel = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${msg}: ${a} != ${b} (rel ${tol})`);

// expm2 sanity: diagonal and rotation generator
const E1 = expm2([-2, 0, 0, -5], 0.3); rel(E1[0], Math.exp(-0.6), 1e-12); rel(E1[3], Math.exp(-1.5), 1e-12); assert.ok(Math.abs(E1[1]) < 1e-15);
const E2 = expm2([0, -1, 1, 0], 0.7); rel(E2[0], Math.cos(0.7), 1e-12); rel(E2[2], Math.sin(0.7), 1e-12);
// stiff: eigenvalues −1e6 and −1 must not overflow
const E3 = expm2([-1e6, 0, 0, -1], 1); rel(E3[3], Math.exp(-1), 1e-9); assert.ok(Math.abs(E3[0]) < 1e-12);

const p = { v: 12, r: 1, l: 1e-3, kt: 0.02, load: 0.01, j: 2e-5, b: 1e-6 };
// Steady state matches closed form and the transient settles to it
const ss = steadyState(p);
rel(ss.w, (0.02 * 12 - 1 * 0.01) / (0.02 ** 2 + 1e-6), 1e-12);
const tr = simulateTransient(p);
rel(tr.w[tr.w.length - 1], ss.w, 2e-3, 'speed settles'); rel(tr.i[tr.i.length - 1], ss.i, 1.5e-2, 'current settles');
// Inrush: peak current below stall current V/R but well above steady state
assert.ok(tr.peakI < 12 / 1 && tr.peakI > 0.7 * 12, 'inrush near stall current: ' + tr.peakI);
// KVL at steady state: V = i·R + K·ω
rel(ss.i * p.r + p.kt * ss.w, 12, 1e-12);

// Locked rotor (huge inertia): pure RL, i(τe) = 0.632·V/R
const locked = simulateTransient({ ...p, j: 1e6, load: 0 }, { T: 5e-3, N: 1000 });
const kTau = locked.t.findIndex(t => t >= 1e-3 - 1e-12);
rel(locked.i[kTau], 12 * (1 - Math.exp(-1)), 1e-3, 'RL rise');

// Load ≥ stall torque K·V/R: never breaks away, current → V/R
const st = simulateTransient({ ...p, load: 0.3 });
assert.equal(Math.max(...st.w), 0); rel(st.i[st.i.length - 1], 12, 1e-3);

// Energy balance: E_in = Cu loss + friction + load work + ½Li² + ½Jω²
const e = tr.energy, sum = e.cu + e.fric + e.load + e.storedL + e.storedJ;
rel(sum, e.in, 5e-3, 'energy balance');

// PWM duty scales the voltage: half duty, no load, b→0  => half speed
rel(steadyState({ ...p, duty: 0.5, load: 0, b: 0 }).w, 6 / 0.02, 1e-12);

// Mechanical time constant: 63 % speed at ≈ τm when τe ≪ τm and no load
const fast = { ...p, load: 0, b: 0, l: 1e-5 };
const tc = timeConstants(fast); rel(tc.tm, 2e-5 * 1 / 4e-4, 1e-12);
rel(simulateTransient(fast).t63, tc.tm, 0.02, 't63 = τm');

// Underdamped case (large L) still converges to the same steady state
const ud = simulateTransient({ ...p, l: 0.05 });
rel(ud.w[ud.w.length - 1], ss.w, 5e-3, 'underdamped settles');

// Curves (b = 0): no-load speed V/K, stall torque K·V/R, max power V²/(4R) at half stall torque
const c = motorCurves({ ...p, b: 0 });
rel(c.wNl, 600, 1e-12); rel(c.tStall, 0.24, 1e-12); rel(c.pMax, 144 / 4, 1e-4); rel(c.tAtPmax, 0.12, 1e-2);
// efficiency without friction = ω·K/V (falls linearly with torque)
rel(c.eff[100], c.w[100] * 0.02 / 12, 1e-9);
// with friction, efficiency peaks somewhere in between, below 100 %
const cf = motorCurves({ ...p, b: 2e-5 });
assert.ok(cf.effMax < 1 && cf.tAtEffMax > 0 && cf.tAtEffMax < cf.tStall / 2);
// operating point equals the load torque
rel(cf.op!.t, 0.01, 1e-12);
console.log('dc-motor-lab model: all tests passed', { peakI: tr.peakI.toFixed(2), wss_rpm: (ss.w * 60 / 2 / Math.PI).toFixed(0), effMax: cf.effMax.toFixed(3) });
