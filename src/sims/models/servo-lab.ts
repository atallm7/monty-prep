// Hobby servo position loop model.
//
// Command: 50 Hz PWM (20 ms frame). Pulse width maps linearly to target angle:
//   θt = θmid + (Tpulse − 1.5 ms) / 0.5 ms · 90°   →  1.0 ms = 0°, 1.5 ms = 90°, 2.0 ms = 180°
// (clamped to the 0…180° mechanical range).
//
// Plant: brushed DC motor + gearbox, armature inductance neglected (L/R << τm):
//   τm·dω/dt + ω = ωmax·(u − uL)          (first-order speed response, ωmax = no-load output speed at full duty)
//   dθ/dt = ω
// where u ∈ [−1, 1] is the H-bridge duty and uL is a constant load torque expressed as the duty needed to hold it
// (T/Tstall). Transfer function θ/u = ωmax / (s(τm s + 1)) — a type-1 plant.
//
// Controller (the servo IC compares pot feedback with the decoded pulse):
//   u = sat( Kp·e − Kd·ω ),   e = θt − θ in radians, derivative on measurement (no derivative kick)
//
// Closed loop (unsaturated): τm s² + (1 + ωmax Kd) s + ωmax Kp = 0
//   ωn = √(ωmax Kp / τm),  ζ = (1 + ωmax Kd) / (2 √(τm ωmax Kp))
//   P-only step overshoot  Mp = exp(−πζ / √(1−ζ²))
//   Steady-state error with constant load:  e_ss = uL / Kp   (type-1 plant rejects setpoint error, not load torque)

export const DEG = Math.PI / 180;
export type ServoIn = {
  pulse: number;      // ms
  kp: number;         // duty per rad of error
  kd: number;         // duty per (rad/s)
  start: number;      // initial angle, deg
  load: number;       // load torque as fraction of stall (−1…1)
  tauM?: number;      // s, mechanical time constant
  wmax?: number;      // rad/s, output no-load speed
  tEnd?: number;      // s
  dt?: number;        // s
  saturate?: boolean; // default true
};

export const SERVO_DEFAULTS = { tauM: 0.03, wmax: 10 };

export function pulseToAngle(ms: number) {
  const a = 90 + (ms - 1.5) / 0.5 * 90;
  return Math.min(180, Math.max(0, a));
}

export function servoLinear(kp: number, kd: number, tauM = SERVO_DEFAULTS.tauM, wmax = SERVO_DEFAULTS.wmax) {
  const k = Math.max(kp, 1e-9);
  const wn = Math.sqrt(wmax * k / tauM);
  const zeta = (1 + wmax * kd) / (2 * Math.sqrt(tauM * wmax * k));
  const mp = zeta < 1 ? Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta * zeta)) : 0;
  const wd = zeta < 1 ? wn * Math.sqrt(1 - zeta * zeta) : 0;
  return { wn, zeta, mp, wd, fRing: wd / (2 * Math.PI) };
}

export function simulateServo(p: ServoIn) {
  const tauM = p.tauM ?? SERVO_DEFAULTS.tauM, wmax = p.wmax ?? SERVO_DEFAULTS.wmax;
  const tEnd = p.tEnd ?? 1.0, dt = p.dt ?? 2.5e-4, sat = p.saturate ?? true;
  const target = pulseToAngle(p.pulse) * DEG;
  const kp = Math.max(0, p.kp), kd = Math.max(0, p.kd);
  const ctrl = (th: number, w: number) => { const u = kp * (target - th) - kd * w; return sat ? Math.max(-1, Math.min(1, u)) : u; };
  const f = (th: number, w: number): [number, number] => [w, (wmax * (ctrl(th, w) - p.load) - w) / tauM];
  let th = p.start * DEG, w = 0;
  const N = Math.round(tEnd / dt);
  const t: number[] = [], ang: number[] = [], u: number[] = [], spd: number[] = [];
  const every = Math.max(1, Math.round(N / 800));
  for (let i = 0; i <= N; i++) {
    if (i % every === 0 || i === N) { t.push(i * dt); ang.push(th / DEG); u.push(ctrl(th, w)); spd.push(w / DEG); }
    // RK4
    const [a1, b1] = f(th, w);
    const [a2, b2] = f(th + a1 * dt / 2, w + b1 * dt / 2);
    const [a3, b3] = f(th + a2 * dt / 2, w + b2 * dt / 2);
    const [a4, b4] = f(th + a3 * dt, w + b3 * dt);
    th += dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4); w += dt / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
  }
  return { t, ang, u, spd, target: target / DEG, ...metrics(t, ang, u, p.start, target / DEG) };
}

/** Step metrics from a simulated trajectory. */
export function metrics(t: number[], ang: number[], u: number[], start: number, target: number) {
  const step = target - start; const n = ang.length;
  const final = ang[n - 1];
  const sgn = step >= 0 ? 1 : -1;
  let peak = start, tPeak = 0;
  for (let i = 0; i < n; i++) if ((ang[i] - peak) * sgn > 0) { peak = ang[i]; tPeak = t[i]; }
  const overshoot = Math.abs(step) > 1e-9 ? Math.max(0, (peak - target) * sgn) / Math.abs(step) : 0;
  // 10–90 % rise time
  let t10 = NaN, t90 = NaN;
  for (let i = 0; i < n; i++) {
    const fr = Math.abs(step) > 1e-9 ? (ang[i] - start) / step : 1;
    if (isNaN(t10) && fr >= 0.1) t10 = t[i];
    if (isNaN(t90) && fr >= 0.9) { t90 = t[i]; break; }
  }
  // 2 % settling (band relative to step, at least 0.5°) around final value
  const band = Math.max(0.02 * Math.abs(step), 0.5);
  let tSettle = 0;
  for (let i = n - 1; i >= 0; i--) if (Math.abs(ang[i] - final) > band) { tSettle = t[Math.min(n - 1, i + 1)]; break; }
  const settled = Math.abs(ang[n - 1] - ang[Math.floor(n * 0.9)]) < 0.2;
  let satFrac = 0; for (const x of u) if (Math.abs(x) >= 0.999) satFrac++;
  return { peak, tPeak, overshoot, rise: t90 - t10, tSettle, final, ssErr: target - final, settled, satFrac: satFrac / n };
}

/** 50 Hz command waveform for plotting: pulse train of width ms over tEnd seconds. */
export function pwmTrain(pulseMs: number, tEnd: number) {
  const x: number[] = [], y: number[] = [];
  const T = 0.02, w = pulseMs * 1e-3;
  for (let k = 0; k * T < tEnd; k++) { const t0 = k * T; x.push(t0, t0, t0 + w, t0 + w); y.push(0, 1, 1, 0); }
  x.push(tEnd); y.push(0);
  return { x, y };
}
