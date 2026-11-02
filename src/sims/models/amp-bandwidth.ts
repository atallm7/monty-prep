// Gain-bandwidth & slew rate of a single-pole (dominant-pole compensated) op-amp.
//   A(jf) = A0 / (1 + j f/fp),  fp = GBW/A0                       (open loop)
//   ACL(jf) = A/(1 + Aβ),  β = 1/G (G = noise gain)               (closed loop, Sedra & Smith §2.8)
//     → DC gain G·A0β/(1 + A0β), −3 dB at f3 = fp(1 + A0β) ≈ GBW/G
//   Small-signal step: first order, τ = 1/(2π f3), 10–90 % rise tr = τ·ln 9 = 2.197τ ≈ 0.35/f3
//   Slew rate: |dvo/dt| ≤ SR. A sine Vp·sin(2πft) is undistorted only while 2πf·Vp ≤ SR,
//     i.e. full-power bandwidth fFP = SR/(2π Vp).  A step is slew-limited when G·ΔV·2πf3 > SR.

export type BwIn = { gbw: number; a0: number; gain: number; sr: number };

export const fpole = (p: BwIn) => p.gbw / p.a0;
/** −3 dB closed-loop bandwidth, exact for the single-pole model: fp·(1 + A0/G) */
export const fClosed = (p: BwIn) => fpole(p) * (1 + p.a0 / Math.max(1, p.gain));
export const dcGain = (p: BwIn) => { const G = Math.max(1, p.gain); return G / (1 + G / p.a0); };

/** Open-loop magnitude (V/V) and phase (deg) */
export function openLoop(p: BwIn, f: number) { const x = f / fpole(p); return { mag: p.a0 / Math.hypot(1, x), phase: -Math.atan(x) * 180 / Math.PI }; }
/** Closed-loop magnitude/phase: ACL = A/(1 + A/G) with complex A */
export function closedLoop(p: BwIn, f: number) {
  const G = Math.max(1, p.gain); const x = f / fpole(p);
  // A = A0/(1 + jx);  ACL = A0/(1 + jx + A0/G)
  const re = 1 + p.a0 / G, im = x;
  return { mag: p.a0 / Math.hypot(re, im), phase: -Math.atan2(im, re) * 180 / Math.PI };
}
export const fullPowerBW = (sr: number, vp: number) => sr / (2 * Math.PI * Math.max(1e-9, vp));

export type Wave = { t: number[]; ideal: number[]; out: number[]; slewLimited: boolean };

/**
 * Closed-loop follower dynamics for a large-signal input: dvo/dt = clamp(2πf3·(Gdc·vin − vo), ±SR).
 * This is the standard first-order + slew macro-model (output stage never saturates here).
 * Exact exponential update inside each step, then the slew clamp.
 */
function follow(p: BwIn, vin: (t: number) => number, t0: number, t1: number, n: number, settle = 0, v0 = 0): Wave {
  const w = 2 * Math.PI * fClosed(p), g = dcGain(p);
  const h = (t1 - t0) / (n - 1); const sub = Math.max(1, Math.ceil(h * w / 0.2));
  const hs = h / sub; const decay = Math.exp(-w * hs);
  let vo = v0; let lim = false;
  const out: Wave = { t: [], ideal: [], out: [], slewLimited: false };
  for (let i = -settle; i < n; i++) {
    const t = t0 + i * h;
    if (i > -settle) {
      for (let k = sub - 1; k >= 0; k--) {
        const target = g * vin(t - k * hs);
        let nv = target + (vo - target) * decay;
        const dm = p.sr * hs; if (Math.abs(nv - vo) > dm) { nv = vo + Math.sign(nv - vo) * dm; if (i >= 0) lim = true; }
        vo = nv;
      }
    }
    if (i < 0) continue;
    out.t.push(t); out.ideal.push(g * vin(t)); out.out.push(vo);
  }
  out.slewLimited = lim; return out;
}

/** Sine of output amplitude vp (input vp/G) at frequency f: 2 displayed periods after settling */
export function sineResponse(p: BwIn, vp: number, f: number, n = 1000): Wave & { outPk: number } {
  const G = dcGain(p); const T = 1 / f;
  const vin = (t: number) => (vp / G) * Math.sin(2 * Math.PI * f * t);
  const settleSteps = Math.round((n - 1) / 2) * 8; // 8 extra periods to reach periodic steady state
  const w = follow(p, vin, 0, 2 * T, n, settleSteps, 0);
  let pk = 0; for (const v of w.out) pk = Math.max(pk, Math.abs(v));
  return { ...w, outPk: pk };
}

/** Output step of size vstep (input vstep/G) starting at t = 0, shown over a window that fits the response */
export function stepResponse(p: BwIn, vstep: number, n = 1200) {
  const G = dcGain(p);
  const tau = 1 / (2 * Math.PI * fClosed(p));
  const tSlew = Math.abs(vstep) / p.sr;
  const tEnd = Math.max(8 * tau, 1.6 * (tSlew + 3 * tau));
  const tStart = -0.08 * tEnd;
  const w = follow(p, t => (t >= 0 ? vstep / G : 0), tStart, tEnd, n, 0, 0);
  const tr = riseTime(w.t, w.out, 0, vstep);
  return { ...w, tau, tr, trSmall: Math.log(9) * tau, tEnd };
}

/** 10–90 % rise time of y(t) going from y0 to y1 (linear interpolation of the crossings) */
export function riseTime(t: number[], y: number[], y0: number, y1: number): number {
  const cross = (lvl: number) => {
    const v = y0 + (y1 - y0) * lvl;
    for (let i = 1; i < y.length; i++) {
      const a = (y[i - 1] - v) * Math.sign(y1 - y0), b = (y[i] - v) * Math.sign(y1 - y0);
      if (a < 0 && b >= 0) return t[i - 1] + (t[i] - t[i - 1]) * (-a) / (b - a);
    }
    return NaN;
  };
  return cross(0.9) - cross(0.1);
}
