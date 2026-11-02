import assert from 'node:assert/strict';
import { compensation, compMag, loading, PROBES, rlcParams, groundLead } from '../../src/sims/models/scope-probe.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-30, Math.abs(b)), `${a} != ${b}`);

// Compensated 10× probe: R1C1 = R2C2 → flat response, exact 1/10 division at all f, flat-top square wave
const base = { r1: 9e6, c1: 10e-12, r2: 1e6, f: 1e3, vpp: 5, atten: 10 };
const ok = compensation({ ...base, c2: 90e-12 });
close(ok.kr, 0.1); close(ok.kc, 0.1); close(ok.ratio, 1); assert.ok(Math.abs(ok.overshoot) < 1e-9);
for (const f of [10, 1e3, 1e6, 1e8]) close(compMag(f, { ...base, c2: 90e-12 }), 0.1, 1e-9);
close(ok.tau, 0.9e6 * 100e-12);        // τ = (R1‖R2)(C1+C2) = 90 µs
// Over-compensated (C2 too small): HF gain C1/(C1+C2) > 0.1 → overshoot = kc/kr − 1 at the edge
const over = compensation({ ...base, c2: 70e-12 });
close(over.hfGainErr, (10 / 80) / 0.1 - 1); assert.ok(over.overshoot > 0.2);
close(compMag(1e9, { ...base, c2: 70e-12 }), 10 / 80, 1e-4);
// Under-compensated: rounded leading edge, no overshoot
const under = compensation({ ...base, c2: 110e-12 }); assert.ok(under.overshoot < 1e-6 && under.hfGainErr < 0);
close(ok.cIdeal, 90e-12);

// Loading: 10× (10 MΩ) on a 1 MΩ source reads 1/(1+0.1) = 90.9 % at DC
const x10 = PROBES.find(p => p.id === 'x10')!;
close(loading(1e6, x10, 1).dcRatio, 10 / 11);
// 1× probe (110 pF) on a 10 kΩ source: f3 = 1/(2π·(10k‖1M)·110p) ≈ 146 kHz
const x1 = PROBES.find(p => p.id === 'x1')!;
const L1 = loading(1e4, x1, 1e3); close(L1.f3, 1 / (2 * Math.PI * (1e4 * 1e6 / 1.01e6) * 110e-12));
close(loading(1e4, x1, L1.f3).ratio / L1.dcRatio, Math.SQRT1_2, 1e-6);

// Ground lead: 150 nH (15 cm) with 10 pF tip → f0 ≈ 130 MHz
const g = rlcParams(150e-9, 10e-12, 25);
close(g.f0, 1 / (2 * Math.PI * Math.sqrt(1.5e-18)), 1e-12); close(g.f0, 129.95e6, 1e-3);
close(g.zeta, 12.5 * Math.sqrt(10e-12 / 150e-9));
// Fast edge (tr ≪ 1/f0): simulated overshoot matches the 2nd-order formula
const sim = groundLead({ L: 150e-9, C: 10e-12, rs: 25, tr: 10e-12, v: 1 });
close(sim.overshootSim, g.os, 0.03);
// Spring tip (2 nH): ring moves to > 1 GHz and the slow edge sees almost no overshoot
const spr = groundLead({ L: 2e-9, C: 10e-12, rs: 25, tr: 1e-9, v: 1 });
assert.ok(spr.f0 > 1e9 && spr.overshootSim < 0.02, `${spr.overshootSim}`);
// Final value = input step (no DC drop across L or C)
close(sim.y[sim.y.length - 1], 1, 0.05);
console.log('scope-probe model: all tests passed', { os: sim.overshootSim, formula: g.os });
