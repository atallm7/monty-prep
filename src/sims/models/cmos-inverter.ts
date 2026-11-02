// Static CMOS inverter with long-channel square-law devices (Rabaey ch. 5, Kang & Leblebici ch. 5–6).
//
// Devices (β = k'(W/L), λ channel-length modulation, SPICE level 1):
//   NMOS: Vgs = Vin,        Vds = Vout        In = f(Vin − Vtn, Vout)
//   PMOS: Vsg = VDD − Vin,  Vsd = VDD − Vout  Ip = f(VDD − Vin − |Vtp|, VDD − Vout),  βp = ratio·βn
//   with f(vov, v) = β(vov·v − v²/2)(1+λv) for v < vov (triode), ½β·vov²(1+λv) otherwise; 0 if vov ≤ 0.
// VTC: In(Vin, Vout) = Ip(Vin, Vout), solved for Vout by bisection (In − Ip rises monotonically with Vout).
// Gain dVout/dVin = −(∂F/∂Vin)/(∂F/∂Vout) with F = In − Ip (implicit function theorem, exact partials).
// Switching threshold (λ = 0, both saturated): VM = (Vtn + r(VDD − |Vtp|))/(1 + r),  r = √(βp/βn).
// Noise margins: VIL, VIH are the unity-gain points (dVout/dVin = −1); VOH = Vout(Vin=0) = VDD, VOL = Vout(Vin=VDD) = 0;
//   NML = VIL − VOL, NMH = VOH − VIH. Matched devices (βn = βp, Vtn = |Vtp| = Vt, λ = 0):
//   VIL = (3VDD + 2Vt)/8, VIH = (5VDD − 2Vt)/8.
// Shoot-through current Isc(Vin) = In at the static operating point; peak at Vin = VM.
// Power: dynamic P = α·C·VDD²·f (α = 0→1 output transitions per clock cycle);
//   short-circuit P = 2α·f·tr·∫Isc(Vin)dVin for a linear input ramp of duration tr (no-load upper bound;
//   reduces to Veendrick's (β/12)(VDD − 2Vt)³·tr·f for a symmetric inverter); leakage P = VDD·Ileak.
// Transient: output stage driving a series R + C load, integrated with backward Euler (unconditionally stable)
//   on a time grid that is dense after every input edge.

export type InvParams = { vdd: number; kn: number; ratio: number; vtn: number; vtp: number; lambda: number };

type D = { i: number; dov: number; dv: number }; // current and partials wrt overdrive and wrt Vds
function fet(beta: number, vov: number, v: number, lambda: number): D {
  if (vov <= 0 || beta <= 0) return { i: 0, dov: 0, dv: 0 };
  if (v < 0) { // source/drain swap: current reverses, controlling overdrive becomes vov − v
    const r = fet(beta, vov - v, -v, lambda);
    return { i: -r.i, dov: -r.dov, dv: r.dov + r.dv };
  }
  const c = 1 + lambda * v;
  if (v < vov) {
    const q = vov * v - v * v / 2;
    return { i: beta * q * c, dov: beta * v * c, dv: beta * ((vov - v) * c + q * lambda) };
  }
  const q = 0.5 * vov * vov;
  return { i: beta * q * c, dov: beta * vov * c, dv: beta * q * lambda };
}

/** NMOS and PMOS currents (both as positive "pull" magnitudes) at given Vin, Vout. */
export function currents(p: InvParams, vin: number, vout: number) {
  const n = fet(p.kn, vin - p.vtn, vout, p.lambda);
  const pp = fet(p.kn * p.ratio, p.vdd - vin - Math.abs(p.vtp), p.vdd - vout, p.lambda);
  return { in: n.i, ip: pp.i, n, p: pp };
}

/** Static output voltage for a given input (no load current). */
export function vout(p: InvParams, vin: number) {
  const F = (v: number) => { const c = currents(p, vin, v); return c.in - c.ip; };
  let lo = 0, hi = p.vdd;
  if (F(lo) >= 0) return 0;
  if (F(hi) <= 0) return p.vdd;
  // F can be exactly zero over an interval (λ = 0, both devices saturated at Vin = VM): Vout is then
  // indeterminate within [Vin − Vtn, Vin + |Vtp|]; return the centre of the zero set.
  let a = lo, b = hi; const tol = 1e-9 * p.kn * Math.max(1, p.ratio) * p.vdd * p.vdd;
  for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (F(m) < -tol) lo = m; else hi = m; }
  for (let i = 0; i < 70; i++) { const m = (a + b) / 2; if (F(m) <= tol) a = m; else b = m; }
  return ((lo + hi) / 2 + (a + b) / 2) / 2;
}

/** Small-signal gain dVout/dVin at the static point. Returns −Infinity where both devices are ideal current sources. */
export function gain(p: InvParams, vin: number) {
  const vo = vout(p, vin); const c = currents(p, vin, vo);
  const dFdVin = c.n.dov + c.p.dov;        // ∂In/∂Vin − ∂Ip/∂Vin, with ∂(VDD−Vin)/∂Vin = −1
  const dFdVout = c.n.dv + c.p.dv;         // ∂In/∂Vout − ∂Ip/∂Vout, with ∂(VDD−Vout)/∂Vout = −1
  if (dFdVout <= 0) return dFdVin > 0 ? -Infinity : 0;
  return -dFdVin / dFdVout;
}

export function vmAnalytic(p: InvParams) {
  const r = Math.sqrt(p.ratio);
  return (p.vtn + r * (p.vdd - Math.abs(p.vtp))) / (1 + r);
}

/** Switching threshold VM: Vin where Vout = Vin. */
export function vm(p: InvParams) {
  let lo = 0, hi = p.vdd;
  for (let i = 0; i < 70; i++) { const m = (lo + hi) / 2; if (vout(p, m) > m) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export type NoiseMargins = { vm: number; vil: number; vih: number; voh: number; vol: number; nml: number; nmh: number; voutAtVil: number; voutAtVih: number; gainAtVm: number };

export function noiseMargins(p: InvParams): NoiseMargins {
  const m = vm(p);
  const root = (a: number, b: number, leftAbove: boolean) => {
    // find gain = −1 in [a, b]; leftAbove: gain > −1 at a
    let lo = a, hi = b;
    for (let i = 0; i < 70; i++) { const x = (lo + hi) / 2; const above = gain(p, x) > -1; if (above === leftAbove) lo = x; else hi = x; }
    return (lo + hi) / 2;
  };
  const vil = root(Math.max(0, p.vtn), m, true);
  const vih = root(m, Math.min(p.vdd, p.vdd - Math.abs(p.vtp)), false);
  const voh = vout(p, 0), vol = vout(p, p.vdd);
  return { vm: m, vil, vih, voh, vol, nml: vil - vol, nmh: voh - vih, voutAtVil: vout(p, vil), voutAtVih: vout(p, vih), gainAtVm: gain(p, m) };
}

export function vtc(p: InvParams, n = 241) {
  const x: number[] = [], y: number[] = [], isc: number[] = [], g: number[] = [];
  for (let i = 0; i < n; i++) {
    const vin = p.vdd * i / (n - 1); const vo = vout(p, vin);
    x.push(vin); y.push(vo); isc.push(currents(p, vin, vo).in); g.push(gain(p, vin));
  }
  return { x, y, isc, gain: g };
}

/** Peak shoot-through current (at VM). */
export function iscPeak(p: InvParams) { const m = vm(p); return currents(p, m, vout(p, m)).in; }

/** ∫ Isc(Vin) dVin over 0..VDD (Simpson). Units A·V. */
export function iscIntegral(p: InvParams, n = 400) {
  const h = p.vdd / n; let s = 0;
  for (let i = 0; i <= n; i++) { const v = i * h; const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w * currents(p, v, vout(p, v)).in; }
  return s * h / 3;
}

export type PowerIn = { cl: number; f: number; alpha: number; tr: number; ileak: number };
export function power(p: InvParams, q: PowerIn, scIntegral = iscIntegral(p)) {
  const dyn = q.alpha * q.cl * p.vdd * p.vdd * q.f;
  const sc = 2 * q.alpha * q.f * q.tr * scIntegral;
  const leak = p.vdd * q.ileak;
  return { dyn, sc, leak, total: dyn + sc + leak, eSwitch: q.cl * p.vdd * p.vdd };
}

// ---------------- transient ----------------
export type TranIn = { cl: number; rs: number; f: number; tr: number; periods?: number; dense?: number };
export type TranOut = {
  t: number[]; vin: number[]; vgate: number[]; vout: number[]; vc: number[]; ip: number[]; in: number[];
  T: number; tRise: number; tFall: number; tpLH: number; tpHL: number; trise1090: number; tfall1090: number;
  eSupply: number; eCV2: number; tauEst: number;
};

/** Buffer input A (ideal pre-driver); output-stage gate is its complement Ā with the same edge time. */
function inputAt(t: number, T: number, tr: number, vdd: number) {
  const u = ((t % T) + T) % T; const t1 = 0.05 * T, t2 = 0.55 * T;
  if (u < t1) return 0;
  if (u < t1 + tr) return vdd * (u - t1) / tr;
  if (u < t2) return vdd;
  if (u < t2 + tr) return vdd * (1 - (u - t2) / tr);
  return 0;
}

export function transient(p: InvParams, q: TranIn): TranOut {
  const T = 1 / q.f; const P = q.periods ?? 3; const vdd = p.vdd;
  const tr = Math.min(q.tr, 0.4 * T);
  const isatMin = 0.5 * p.kn * Math.min(1, p.ratio) * Math.max(vdd - Math.max(p.vtn, Math.abs(p.vtp)), 0.05) ** 2;
  const tauEst = q.cl * (q.rs + vdd / Math.max(isatMin, 1e-12));
  // time grid: dense after each edge
  const nd = q.dense ?? 400; const grid: number[] = [];
  for (let k = 0; k < P; k++) {
    for (const [e0, e1] of [[0.05, 0.55], [0.55, 1.05]]) {
      const ts = (k + e0) * T, te = (k + e1) * T; const w = Math.min(te - ts, tr + 12 * tauEst);
      for (let i = 0; i < nd; i++) grid.push(ts + w * i / nd);
      const nr = 40; for (let i = 0; i < nr; i++) grid.push(ts + w + (te - ts - w) * i / nr);
    }
  }
  const t0 = [0]; for (let i = 0; i < 20; i++) t0.push(0.05 * T * i / 20);
  const ts = [...t0, ...grid.filter(t => t < P * T), P * T].filter((t, i, a) => i === 0 || t > a[i - 1]);

  const voFor = (vg: number, vc: number) => {
    if (q.rs <= 0) return vc;
    const g = (vo: number) => { const c = currents(p, vg, vo); return c.ip - c.in - (vo - vc) / q.rs; };
    let lo = Math.min(0, vc) - 0.5, hi = Math.max(vdd, vc) + 0.5;
    for (let i = 0; i < 44; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  };
  const iLoad = (vg: number, vc: number) => {
    if (q.rs <= 0) { const c = currents(p, vg, vc); return c.ip - c.in; }
    return (voFor(vg, vc) - vc) / q.rs;
  };

  const out: TranOut = { t: [], vin: [], vgate: [], vout: [], vc: [], ip: [], in: [], T, tRise: 0, tFall: 0, tpLH: NaN, tpHL: NaN, trise1090: NaN, tfall1090: NaN, eSupply: 0, eCV2: q.cl * vdd * vdd, tauEst };
  let vc = 0;
  const push = (t: number, vc: number) => {
    const a = inputAt(t, T, tr, vdd); const vg = vdd - a; const vo = voFor(vg, vc); const c = currents(p, vg, vo);
    out.t.push(t); out.vin.push(a); out.vgate.push(vg); out.vout.push(vo); out.vc.push(vc); out.ip.push(c.ip); out.in.push(c.in);
  };
  push(0, vc);
  for (let k = 1; k < ts.length; k++) {
    const dt = ts[k] - ts[k - 1]; const vg = vdd - inputAt(ts[k], T, tr, vdd);
    // backward Euler: vc1 − vc0 − dt/C·I(vc1) = 0, left side increasing in vc1
    const h = (v: number) => v - vc - dt / q.cl * iLoad(vg, v);
    let lo = -0.5 - 0.2 * vdd, hi = 1.2 * vdd + 0.5;
    for (let i = 0; i < 44; i++) { const m = (lo + hi) / 2; if (h(m) < 0) lo = m; else hi = m; }
    vc = (lo + hi) / 2; push(ts[k], vc);
  }
  // measurements on the last period
  const tA = (P - 1) * T; const tr50 = tA + 0.05 * T + tr / 2, tf50 = tA + 0.55 * T + tr / 2;
  const cross = (from: number, to: number, level: number, rising: boolean, arr: number[]) => {
    for (let i = 1; i < out.t.length; i++) {
      if (out.t[i] <= from || out.t[i - 1] > to) continue;
      const a = arr[i - 1], b = arr[i];
      if (rising ? a < level && b >= level : a > level && b <= level) return out.t[i - 1] + (out.t[i] - out.t[i - 1]) * (level - a) / (b - a);
    }
    return NaN;
  };
  out.tRise = tr50; out.tFall = tf50;
  out.tpLH = cross(tA + 0.05 * T, tA + 0.55 * T, vdd / 2, true, out.vc) - tr50;
  out.tpHL = cross(tA + 0.55 * T, tA + 1.05 * T, vdd / 2, false, out.vc) - tf50;
  out.trise1090 = cross(tA + 0.05 * T, tA + 0.55 * T, 0.9 * vdd, true, out.vc) - cross(tA + 0.05 * T, tA + 0.55 * T, 0.1 * vdd, true, out.vc);
  out.tfall1090 = cross(tA + 0.55 * T, tA + 1.05 * T, 0.1 * vdd, false, out.vc) - cross(tA + 0.55 * T, tA + 1.05 * T, 0.9 * vdd, false, out.vc);
  // supply energy over the last period (trapezoid on PMOS current)
  let e = 0;
  for (let i = 1; i < out.t.length; i++) if (out.t[i - 1] >= tA - 1e-18) e += 0.5 * (out.ip[i] + out.ip[i - 1]) * (out.t[i] - out.t[i - 1]);
  out.eSupply = e * vdd;
  return out;
}
