// Brushed DC motor: coupled electrical + mechanical model (permanent-magnet, SI units so Kt = Ke = K).
//   Electrical:  Va = R·i + L·di/dt + K·ω            (armature, back-EMF e = K·ω)
//   Mechanical:  J·dω/dt = K·i − b·ω − T_L            (T_L = load torque opposing rotation, Coulomb-type)
// With PWM, the averaged model uses Va = D·V (valid when f_PWM ≫ 1/τe); ripple ΔI ≈ V·D(1−D)/(L·f).
// Integration: while running the system is linear, x' = A·x + u, so each step uses the exact solution
//   x(t+h) = x* + e^{A h}(x(t) − x*),  x* = −A⁻¹u
// with the 2×2 matrix exponential in closed form (Putzer / Cayley–Hamilton). This is exact for any h, so
// the stiff case τe ≪ τm needs no tiny steps. While stalled (ω = 0 and K·i ≤ T_L) the rotor is held by
// static friction and only i evolves: i(t) = Va/R + (i0 − Va/R)·e^{−tR/L}.
// Steady state:  ω_ss = (K·Va − R·T_L)/(K² + R·b),  i_ss = (b·Va + K·T_L)/(K² + R·b)
// Time constants:  τe = L/R,  τm = J·R/(K² + R·b)

export type MotorIn = { v: number; duty?: number; r: number; l: number; kt: number; j?: number; b?: number; load: number; loadStepAt?: number };
export const DEF_J = 2e-5, DEF_B = 1e-6;

type M2 = [number, number, number, number]; // row-major [a b; c d]

/** e^{A h} for a real 2×2 matrix (closed form). */
export function expm2(A: M2, h: number): M2 {
  const s = (A[0] + A[3]) / 2, det = A[0] * A[3] - A[1] * A[2];
  const disc = s * s - det;
  const B: M2 = [A[0] - s, A[1], A[2], A[3] - s];  // A − sI
  let c: number, g: number;                        // e^{At} = c·I + g·(A − sI)
  if (disc > 1e-12 * Math.max(1, s * s)) {
    const q = Math.sqrt(disc);
    const ep = Math.exp((s + q) * h), em = Math.exp((s - q) * h);   // avoids cosh overflow when stiff
    c = (ep + em) / 2; g = (ep - em) / (2 * q);
  } else if (disc < -1e-12 * Math.max(1, s * s)) {
    const q = Math.sqrt(-disc), e = Math.exp(s * h);
    c = e * Math.cos(q * h); g = e * Math.sin(q * h) / q;
  } else { const e = Math.exp(s * h); c = e; g = e * h; }
  return [c + g * B[0], g * B[1], g * B[2], c + g * B[3]];
}

export function steadyState(p: MotorIn) {
  const Va = p.v * (p.duty ?? 1), K = p.kt, R = p.r, b = p.b ?? DEF_B, TL = p.load;
  const den = K * K + R * b;
  const w = (K * Va - R * TL) / den;
  if (w <= 0) return { w: 0, i: Va / R, stalled: true };            // can't break away: stalled
  return { w, i: (b * Va + K * TL) / den, stalled: false };
}

export function timeConstants(p: MotorIn) {
  const J = p.j ?? DEF_J, b = p.b ?? DEF_B;
  return { te: p.l / p.r, tm: J * p.r / (p.kt * p.kt + p.r * b) };
}

export type Transient = { t: number[]; i: number[]; w: number[]; emf: number[]; torque: number[]; va: number; T: number; peakI: number; tPeak: number; t63: number; energy: { in: number; cu: number; fric: number; load: number; storedL: number; storedJ: number } };

export function simulateTransient(p: MotorIn, opt: { T?: number; N?: number } = {}): Transient {
  const Va = p.v * (p.duty ?? 1), R = p.r, L = Math.max(1e-9, p.l), K = p.kt, J = p.j ?? DEF_J, b = p.b ?? DEF_B;
  const A: M2 = [-R / L, -K / L, K / J, -b / J];
  const { te, tm } = timeConstants(p);
  // slowest decay rate of the coupled system sets the window
  const s = (A[0] + A[3]) / 2, det = A[0] * A[3] - A[1] * A[2], disc = s * s - det;
  const slow = disc > 0 ? -(s + Math.sqrt(disc)) : -s;
  const T = opt.T ?? Math.min(60, Math.max(8 / Math.max(slow, 1e-9), 8 * te, 1e-4) * (p.loadStepAt !== undefined ? 2 : 1));
  const N = opt.N ?? 1600, h = T / N;
  const tStep = p.loadStepAt !== undefined ? p.loadStepAt * T : -1;
  const SUB = 16, hs = h / SUB;
  const Eh = expm2(A, hs);
  let i = 0, w = 0;
  const out: Transient = { t: [0], i: [0], w: [0], emf: [0], torque: [0], va: Va, T, peakI: 0, tPeak: 0, t63: NaN, energy: { in: 0, cu: 0, fric: 0, load: 0, storedL: 0, storedJ: 0 } };
  let t = 0;
  for (let k = 0; k < N; k++) {
    for (let m = 0; m < SUB; m++) {
      const TL = tStep >= 0 && t < tStep ? 0 : p.load;
      const i0 = i, w0 = w;
      const running = w > 0 || K * i > TL;
      if (running) {
        const den = R * b + K * K;                     // equilibrium of the linear running dynamics
        const is = (b * Va + K * TL) / den, ws = (K * Va - R * TL) / den;
        const di = i - is, dw = w - ws;
        i = is + Eh[0] * di + Eh[1] * dw; w = ws + Eh[2] * di + Eh[3] * dw;
        if (w < 0) w = 0;                              // Coulomb load cannot drive it backwards
      } else {
        const iInf = Va / R; i = iInf + (i - iInf) * Math.exp(-hs / (L / R));
      }
      // energy bookkeeping (trapezoid)
      const im = (i0 + i) / 2, wm = (w0 + w) / 2;
      out.energy.in += Va * im * hs; out.energy.cu += R * (i0 * i0 + i * i) / 2 * hs;
      out.energy.fric += b * (w0 * w0 + w * w) / 2 * hs; out.energy.load += TL * wm * hs;
      t += hs;
      if (i > out.peakI) { out.peakI = i; out.tPeak = t; }
    }
    out.t.push(t); out.i.push(i); out.w.push(w); out.emf.push(K * w); out.torque.push(K * i);
  }
  out.energy.storedL = 0.5 * L * i * i; out.energy.storedJ = 0.5 * J * w * w;
  const wEnd = out.w[tStep >= 0 ? Math.floor(N * (p.loadStepAt ?? 1)) : N];
  const k63 = out.w.findIndex(x => x >= 0.632 * wEnd);
  out.t63 = wEnd > 0 && k63 >= 0 ? out.t[k63] : NaN;
  return out;
}

export type Curves = { tq: number[]; w: number[]; i: number[]; pout: number[]; eff: number[]; wNl: number; iNl: number; tStall: number; iStall: number; pMax: number; tAtPmax: number; effMax: number; tAtEffMax: number; op: { t: number; w: number; i: number; p: number; eff: number } | null };

/** Steady-state characteristic curves vs output (shaft) torque, swept by speed from no-load to stall. */
export function motorCurves(p: MotorIn, n = 400): Curves {
  const Va = p.v * (p.duty ?? 1), R = p.r, K = p.kt, b = p.b ?? DEF_B;
  const wNl = K * Va / (K * K + R * b), tStall = K * Va / R, iStall = Va / R;
  const out: Curves = { tq: [], w: [], i: [], pout: [], eff: [], wNl, iNl: (Va - K * wNl) / R, tStall, iStall, pMax: 0, tAtPmax: 0, effMax: 0, tAtEffMax: 0, op: null };
  for (let k = 0; k <= n; k++) {
    const w = wNl * (1 - k / n);
    const i = (Va - K * w) / R, T = K * i - b * w, P = T * w, Pin = Va * i;
    const eff = Pin > 0 ? Math.max(0, P / Pin) : 0;
    out.tq.push(T); out.w.push(w); out.i.push(i); out.pout.push(P); out.eff.push(eff);
    if (P > out.pMax) { out.pMax = P; out.tAtPmax = T; }
    if (eff > out.effMax) { out.effMax = eff; out.tAtEffMax = T; }
  }
  const ss = steadyState(p);
  if (!ss.stalled) { const P = p.load * ss.w; out.op = { t: p.load, w: ss.w, i: ss.i, p: P, eff: Va * ss.i > 0 ? P / (Va * ss.i) : 0 }; }
  return out;
}

export const RPM = 60 / (2 * Math.PI);
