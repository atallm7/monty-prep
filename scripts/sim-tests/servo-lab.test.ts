import assert from 'node:assert/strict';
import { pulseToAngle, simulateServo, servoLinear } from '../../src/sims/models/servo-lab.ts';
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b} ±${tol}`);

// Pulse mapping: 1 ms → 0°, 1.5 ms → 90°, 2 ms → 180°, clamped beyond
near(pulseToAngle(1.0), 0, 1e-9); near(pulseToAngle(1.5), 90, 1e-9); near(pulseToAngle(2.0), 180, 1e-9); near(pulseToAngle(2.4), 180, 1e-9);

// Linear 2nd-order analysis: Kp = 4, Kd = 0, τm = 30 ms, ωmax = 10 rad/s → ζ = 1/(2√1.2) = 0.4564
const lin = servoLinear(4, 0);
near(lin.zeta, 1 / (2 * Math.sqrt(1.2)), 1e-9, 'zeta');
near(lin.wn, Math.sqrt(400 / 0.3), 1e-9, 'wn');
const mp = Math.exp(-Math.PI * lin.zeta / Math.sqrt(1 - lin.zeta ** 2));
// Small step (2°) keeps |u| < 1 → simulated overshoot must match textbook Mp ≈ 19.9 %
const small = simulateServo({ pulse: 1.5, kp: 4, kd: 0, start: 88, load: 0, tEnd: 1, dt: 1e-4 });
near(small.overshoot, mp, 0.003, 'P-only overshoot');
near(small.final, 90, 0.01, 'zero SS error without load (type-1 plant)');
// Peak time tp = π/ωd
near(small.tPeak, Math.PI / lin.wd, 0.002, 'peak time');

// Steady-state error with constant load torque = uL/Kp (radians)
const ld = simulateServo({ pulse: 1.5, kp: 4, kd: 0.2, start: 0, load: 0.1, tEnd: 2 });
near(ld.ssErr, 0.1 / 4 * 180 / Math.PI, 0.02, 'load SS error');

// Derivative raises damping: ζ = (1 + ωmax·Kd)/(2√(τm ωmax Kp)); Kd = 0.2 → ζ = 3/(2√1.2) > 1 → no overshoot (small step)
const pd = simulateServo({ pulse: 1.5, kp: 4, kd: 0.2, start: 88, load: 0 });
near(servoLinear(4, 0.2).zeta, 3 / (2 * Math.sqrt(1.2)), 1e-9);
assert.ok(pd.overshoot < 1e-3, 'overdamped PD has no overshoot');

// Large step saturates the drive: slew-limited at ωmax → 90° takes at least (π/2)/ωmax = 157 ms
const big = simulateServo({ pulse: 1.5, kp: 4, kd: 0.2, start: 0, load: 0 });
assert.ok(big.satFrac > 0.1, 'drive saturates on a 90° step');
assert.ok(big.tPeak > 0.157 || big.tSettle > 0.157, 'slew limited');
console.log('servo-lab model: all tests passed');
