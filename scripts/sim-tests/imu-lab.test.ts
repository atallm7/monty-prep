import assert from 'node:assert/strict';
import { simulateDrift, simulateFusion, compSteadyBias, complementaryTau, driftAnalytic, G } from '../../src/sims/models/imu-lab.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// 1) Constant accel bias, no noise: trapezoid integration is exact → p = ½·b·t², v = b·t
const d = simulateDrift({ bias: 0.02, accNoise: 0, gyroBias: 0, arw: 0, T: 60, tilt: false });
close(d.final.pos, 0.5 * 0.02 * 3600, 1e-9);  // 36 m after one minute
close(d.final.vel, 0.02 * 60, 1e-9);
// 10× time → 100× position error (t² law)
const d10 = simulateDrift({ bias: 0.02, accNoise: 0, gyroBias: 0, arw: 0, T: 6, tilt: false });
close(d.final.pos / d10.final.pos, 100, 1e-9);

// 2) Gyro bias integrates linearly to angle: 0.01 °/s for 100 s = 1°
const g = simulateDrift({ bias: 0, accNoise: 0, gyroBias: 0.01, arw: 0, T: 100, tilt: false });
close(g.final.ang, 1, 1e-9);
// 3) Tilt coupling: gyro bias → gravity leak → p ≈ g·b_g·t³/6 (small-angle)
const tc = simulateDrift({ bias: 0, accNoise: 0, gyroBias: 0.01, arw: 0, T: 30, tilt: true });
close(tc.final.pos, G * (0.01 * Math.PI / 180) * 27000 / 6, 1e-3);

// 4) Velocity random walk: σ_v = N·√t (Monte Carlo over seeds)
let s2 = 0; const runs = 300;
for (let k = 0; k < runs; k++) { const r = simulateDrift({ bias: 0, accNoise: 0.01, gyroBias: 0, arw: 0, T: 10, tilt: false, seed: k + 11 }); s2 += r.final.vel ** 2; }
const sv = Math.sqrt(s2 / runs), expect = driftAnalytic(0, 0.01, 0, 0, 10).vSigma;
assert.ok(Math.abs(sv / expect - 1) < 0.12, `VRW sigma ${sv} vs ${expect}`);

// 5) Complementary filter: steady-state error from gyro bias = b·τ, τ = α·dt/(1−α)
const dt = 0.01, a = 0.98; const tau = complementaryTau(a, dt);
close(tau, 0.49, 1e-12);
close(compSteadyBias(a, 1, dt, 5000), 1 * tau, 1e-9);   // 1 °/s bias → 0.49° offset
// α = 0 → pure accelerometer, α = 1 → pure gyro integration
const f0 = simulateFusion({ alpha: 0, gyroBias: 0.5, gyroNoise: 0.1, accNoise: 0.2, shake: 0 });
close(f0.comp[500], f0.acc[500], 1e-12);
const f1 = simulateFusion({ alpha: 1, gyroBias: 0.5, gyroNoise: 0.1, accNoise: 0.2, shake: 0 });
close(f1.comp[1500], f1.gyro[1500], 1e-9);
// Fusion beats both single-sensor estimates for a biased gyro + noisy accel
const f = simulateFusion({ alpha: 0.98, gyroBias: 0.5, gyroNoise: 0.1, accNoise: 0.3, shake: 3 });
assert.ok(f.rms.comp < f.rms.acc && f.rms.comp < f.rms.gyro, JSON.stringify(f.rms));
console.log('imu-lab model: all tests passed', f.rms);
