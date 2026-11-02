import assert from 'node:assert/strict';
import { simulate, tauOf, squareSteady, fractionAt, timeTo } from '../../src/sims/models/rc-transient.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const at = (w: { t: number[] }, t: number) => { let best = 0; for (let k = 0; k < w.t.length; k++) if (Math.abs(w.t[k] - t) < Math.abs(w.t[best] - t)) best = k; return best; };

const rc = { kind: 'rc' as const, r: 1000, c: 1e-6, l: 1e-3, vs: 5, f: 100, drive: 'step' as const };
const tau = tauOf(rc); close(tau, 1e-3);
close(fractionAt(tau, tau), 0.6321205588); close(fractionAt(5 * tau, tau), 0.9932620530);
close(timeTo(0.5, tau), tau * Math.LN2);
// RC step: vC(τ) = 63.2 % of 5 V = 3.1606 V, iC(0+) = Vs/R = 5 mA, vC(0+) = 0 (continuity)
const w = simulate(rc, -0.5e-3, 6e-3, 650);
let k = at(w, 1e-3); close(w.x[k], 5 * 0.6321205588, 1e-6);
const k0 = w.t.indexOf(0); // two samples at the edge: left and right limits
assert.equal(w.t[k0 + 1], 0);
close(w.x[k0], 0); close(w.x[k0 + 1], 0);       // capacitor voltage does not jump
close(w.y[k0], 0); close(w.y[k0 + 1], 5e-3);    // capacitor current jumps 0 -> Vs/R
k = at(w, 6e-3); close(w.x[k], 5 * (1 - Math.exp(-6)), 1e-6);

// RL step: τ = L/R = 1 µs; iL(τ) = 63.2 % of 5 mA; vL(0+) = Vs
const rl = { ...rc, kind: 'rl' as const };
close(tauOf(rl), 1e-6);
const wl = simulate(rl, -0.5e-6, 6e-6, 650);
const j0 = wl.t.indexOf(0);
close(wl.x[j0 + 1], 0); close(wl.y[j0], 0); close(wl.y[j0 + 1], 5);
k = at(wl, 1e-6); close(wl.x[k], 5e-3 * 0.6321205588, 1e-6);

// Square drive: periodic steady state. f = 100 Hz, τ = 1 ms -> a = 5 -> lo = 5e^-5/(1+e^-5), hi = 5/(1+e^-5)
const sq = { ...rc, drive: 'square' as const };
const ss = squareSteady(sq);
close(ss.hi, 5 / (1 + Math.exp(-5))); close(ss.lo, 5 * Math.exp(-5) / (1 + Math.exp(-5)));
// starting discharged converges to the same steady state after many periods
const long = simulate(sq, 0, 0.2, 2000); // 20 periods
const hiIdx = long.t.lastIndexOf(0.195); // end of a high half-period (left-limit sample)
close(long.x[hiIdx], ss.hi, 1e-6);
// starting on steady state: periodic from the first cycle
const st = simulate(sq, 0, 0.02, 400, 'steady');
close(st.x[0], ss.lo); close(st.x[st.t.indexOf(0.005)], ss.hi, 1e-9);
// slow RC (τ >> T): ripple ≈ Vs·T/(4τ) (integrator) and average = Vs/2
const slow = squareSteady({ ...sq, f: 10000, r: 10000 }); // τ = 10 ms, T = 100 µs
close((slow.hi + slow.lo) / 2, 2.5); close(slow.ripple, 5 * 1e-4 / (4 * 1e-2), 1e-3);
// KVL at all samples: vin = vR + vC
for (let i = 0; i < w.t.length; i += 37) close(w.vin[i], w.vR[i] + w.x[i], 1e-9);
console.log('rc-transient model: all tests passed');
