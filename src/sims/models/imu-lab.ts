// IMU integration drift & complementary-filter sensor fusion.
//
// Drift (stationary IMU, strapdown dead reckoning):
//   accel error a_e = b_a + n_a(t)                 [m/s²]
//   velocity error  v_e = ∫a_e dt  → b_a·t          (bias)  ;  σ_v = N_a·√t       (velocity random walk)
//   position error  p_e = ∫v_e dt  → ½·b_a·t²       (bias)  ;  σ_p = N_a·t^{3/2}/√3
//   gyro error      θ_e = ∫(b_g + n_g) dt → b_g·t   ;  σ_θ = ARW·√t
//   tilt coupling: a tilt error θ_e projects gravity into the horizontal axis, a = g·sin θ_e,
//   so a gyro bias alone gives p_e ≈ g·b_g·t³/6 (the dreaded cubic drift).
//   N_a is the noise density (m/s²/√Hz = velocity random walk, m/s/√s). Per-sample std at rate fs is N_a·√fs,
//   chosen so that a sum of n = t·fs samples × dt has variance N_a²·t (IEEE Std 952 random-walk convention).
// Integration: trapezoidal rule (exact for constant bias → linear velocity → quadratic position).
//
// Fusion (complementary filter):
//   θ̂[k] = α·(θ̂[k−1] + ω_gyro·dt) + (1−α)·θ_acc,   θ_acc = atan2(a_x, a_z)
//   Time constant τ = α·dt/(1−α); crossover f_c = 1/(2πτ). Gyro is high-passed, accel low-passed.
//   Steady-state error from a constant gyro bias b_g: θ_ss = α·b_g·dt/(1−α) = b_g·τ.

export const G = 9.80665;

/** Deterministic PRNG (mulberry32) + Box–Muller Gaussian. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare: number | null = null;
  const gauss = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let x = 0, y = 0, r = 0;
    do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (r === 0 || r >= 1);
    const m = Math.sqrt(-2 * Math.log(r) / r); spare = y * m; return x * m;
  };
  return { u, gauss };
}

export type DriftIn = {
  bias: number;       // accel bias, m/s²
  accNoise: number;   // accel noise density, m/s²/√Hz
  gyroBias: number;   // deg/s
  arw: number;        // gyro angle random walk, deg/√s
  T: number;          // duration, s
  fs?: number;        // sample rate, Hz
  tilt: boolean;      // include gravity leakage through gyro tilt error
  seed?: number;
};

export function simulateDrift(p: DriftIn) {
  const fs = p.fs ?? 100, dt = 1 / fs, n = Math.max(2, Math.round(p.T * fs));
  const R = rng(p.seed ?? 1);
  const sa = p.accNoise * Math.sqrt(fs);             // per-sample accel std
  const sg = p.arw * Math.sqrt(fs) * Math.PI / 180;  // per-sample gyro rate std, rad/s
  const bg = p.gyroBias * Math.PI / 180;
  const stride = Math.max(1, Math.floor(n / 500));
  const t: number[] = [0], pos: number[] = [0], vel: number[] = [0], ang: number[] = [0];
  let v = 0, x = 0, th = 0, wPrev = bg + sg * R.gauss(), aPrev = p.bias + sa * R.gauss();
  for (let k = 1; k <= n; k++) {
    const w = bg + sg * R.gauss();
    const thNew = th + 0.5 * (w + wPrev) * dt;
    const a = p.bias + sa * R.gauss() + (p.tilt ? G * Math.sin(thNew) : 0);
    const vNew = v + 0.5 * (a + aPrev) * dt;
    x += 0.5 * (v + vNew) * dt;
    v = vNew; th = thNew; aPrev = a; wPrev = w;
    if (k % stride === 0 || k === n) { t.push(k * dt); pos.push(x); vel.push(v); ang.push(th * 180 / Math.PI); }
  }
  const tEnd = n * dt;
  return {
    t, pos, vel, ang,
    pBias: t.map(tt => 0.5 * p.bias * tt * tt),                              // ½·b·t²
    pTilt: t.map(tt => p.tilt ? G * bg * tt ** 3 / 6 : 0),                     // g·b_g·t³/6
    pSigma: t.map(tt => p.accNoise * tt ** 1.5 / Math.sqrt(3)),                 // N·t^{3/2}/√3
    final: { t: tEnd, pos: x, vel: v, ang: th * 180 / Math.PI },
    analytic: driftAnalytic(p.bias, p.accNoise, p.gyroBias, p.arw, tEnd),
  };
}

export function driftAnalytic(b: number, N: number, bgDeg: number, arw: number, t: number) {
  const bg = bgDeg * Math.PI / 180;
  return {
    pBias: 0.5 * b * t * t, vBias: b * t, angBias: bgDeg * t,
    pTilt: G * bg * t ** 3 / 6,
    vSigma: N * Math.sqrt(t), pSigma: N * t ** 1.5 / Math.sqrt(3), angSigma: arw * Math.sqrt(t),
  };
}

export type FusionIn = {
  alpha: number;
  gyroBias: number;   // deg/s
  gyroNoise: number;  // deg/s rms per sample
  accNoise: number;   // m/s² rms per sample per axis
  shake: number;      // linear-acceleration disturbance amplitude (m/s²) applied during 8–12 s
  T?: number; fs?: number; seed?: number;
};

export const trueAngle = (t: number) => 30 * Math.sin(2 * Math.PI * 0.2 * t) + (t > 14 ? 20 : 0) * Math.min(1, (t - 14) * 4);

export function complementaryTau(alpha: number, dt: number) { return alpha >= 1 ? Infinity : alpha * dt / (1 - alpha); }

export function simulateFusion(p: FusionIn) {
  const fs = p.fs ?? 100, dt = 1 / fs, T = p.T ?? 20, n = Math.round(T * fs);
  const R = rng(p.seed ?? 7);
  const a = Math.min(Math.max(p.alpha, 0), 1);
  const t: number[] = [], truth: number[] = [], acc: number[] = [], gyro: number[] = [], comp: number[] = [];
  let thG = trueAngle(0), thC = trueAngle(0);
  let eA = 0, eG = 0, eC = 0;
  for (let k = 0; k <= n; k++) {
    const tt = k * dt, th = trueAngle(tt);
    const rate = (trueAngle(tt + dt / 2) - trueAngle(tt - dt / 2)) / dt;  // deg/s
    const thr = th * Math.PI / 180;
    const lin = (tt > 8 && tt < 12) ? p.shake * Math.sin(2 * Math.PI * 3 * tt) : 0;
    const ax = G * Math.sin(thr) + lin + p.accNoise * R.gauss();
    const az = G * Math.cos(thr) + p.accNoise * R.gauss();
    const thA = Math.atan2(ax, az) * 180 / Math.PI;
    const w = rate + p.gyroBias + p.gyroNoise * R.gauss();
    if (k > 0) {
      thG += w * dt;
      thC = a * (thC + w * dt) + (1 - a) * thA;
    }
    t.push(tt); truth.push(th); acc.push(thA); gyro.push(thG); comp.push(thC);
    eA += (thA - th) ** 2; eG += (thG - th) ** 2; eC += (thC - th) ** 2;
  }
  const m = n + 1;
  return { t, truth, acc, gyro, comp, rms: { acc: Math.sqrt(eA / m), gyro: Math.sqrt(eG / m), comp: Math.sqrt(eC / m) }, tau: complementaryTau(a, dt), dt };
}

/** Pure filter step response helper used by the test: constant gyro bias, perfect accel at 0. */
export function compSteadyBias(alpha: number, bias: number, dt: number, steps: number) {
  let th = 0; for (let k = 0; k < steps; k++) th = alpha * (th + bias * dt) + (1 - alpha) * 0; return th;
}
