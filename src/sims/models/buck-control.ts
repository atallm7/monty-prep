// Voltage-mode buck control loop: averaged plant, Type II/III compensator by the K-factor method, optional
// feed-forward capacitor, loop-gain Bode and a nonlinear (duty-clamped) averaged load-step simulation.
//
// Plant (state-space averaged, CCM):  Gvd(s) = Vin · Zo/(Zo + sL + DCR),  Zo = R ‖ (ESR + 1/sC)
//   → double pole f0 = 1/(2π√(LC)) (Q set by R, DCR, ESR) and ESR zero f_esr = 1/(2π·ESR·C).
// Loop gain: T(s) = Gc(s) · (1/Vramp) · Gvd(s) · H · Hff(s), H = Vref/Vout (divider), PWM gain 1/Vramp.
// Compensator (Venable K-factor): with plant phase φp at the target crossover fc, the needed boost is
//   B = PM − 90° − φp (the integrator contributes −90°).
//   Type II: Gc = (ωI/s)(1+s/ωz)/(1+s/ωp),   k = tan(B/2 + 45°),  fz = fc/k,  fp = fc·k
//   Type III: Gc = (ωI/s)(1+s/ωz)²/(1+s/ωp)², k = tan²(B/4 + 45°), fz = fc/√k, fp = fc·√k
//   ωI is chosen so |T(j2πfc)| = 1. B < 0 gives k < 1 (a lag), which is how the sim lets you dial in low or negative PM.
// Feed-forward cap across the top divider resistor R1: Hff = (1 + sR1Cff)/(1 + s(R1‖R2)Cff): a zero then a pole a
//   factor Vout/Vref higher; max lead = asin((a−1)/(a+1)) at their geometric mean, a = Vout/Vref.
// Time domain: L·di/dt = d·Vin − i·DCR − vout, C·dvC/dt = i − vout/R − I_step, vout = (vC + ESR(i − I_step))/(1 + ESR/R),
//   d = clamp(Vc/Vramp, 0, Dmax) with integrator anti-windup; RK4. Rule of thumb: ΔV ≈ ΔI/(2π·fc·C).

export type BCIn = {
  vin: number; vout: number; vref: number; vramp: number; l: number; c: number; esr: number; dcr: number; iout: number;
  fc: number; pm: number; istep: number; type: 'auto' | 'II' | 'III'; cffOn: boolean; cff: number; r2: number; dmax: number; fsw: number;
};
export function bcDefaults(): BCIn {
  return { vin: 12, vout: 3.3, vref: 0.8, vramp: 1, l: 4.7e-6, c: 47e-6, esr: 0.01, dcr: 0.02, iout: 1, fc: 40e3, pm: 55, istep: 2, type: 'auto', cffOn: false, cff: 0, r2: 10e3, dmax: 0.9, fsw: 500e3 };
}

type C = [number, number];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cabs = (a: C) => Math.hypot(a[0], a[1]);
const cang = (a: C) => Math.atan2(a[1], a[0]) * 180 / Math.PI;
const deg = Math.PI / 180;

export function loadR(p: BCIn) { return p.vout / Math.max(1e-6, p.iout); }
export function f0(p: BCIn) { return 1 / (2 * Math.PI * Math.sqrt(p.l * p.c)); }
export function fesr(p: BCIn) { return p.esr > 0 ? 1 / (2 * Math.PI * p.esr * p.c) : Infinity; }
export function dividerR1(p: BCIn) { return p.r2 * (p.vout / p.vref - 1); }
/** Cff that centres the feed-forward lead at fc. */
export function cffCentered(p: BCIn) { const a = p.vout / p.vref, R1 = dividerR1(p); return R1 > 0 ? 1 / (2 * Math.PI * R1 * (p.fc / Math.sqrt(a))) : 0; }

export function plant(p: BCIn, f: number): C {
  const s: C = [0, 2 * Math.PI * f], R = loadR(p);
  const zc = cadd([p.esr, 0], cdiv([1, 0], [s[0] * p.c, s[1] * p.c]));
  const zo = cdiv(cmul([R, 0], zc), cadd([R, 0], zc));
  const zl: C = [p.dcr, 2 * Math.PI * f * p.l];
  return cmul([p.vin, 0], cdiv(zo, cadd(zo, zl)));
}
function hff(p: BCIn, f: number): C {
  if (!p.cffOn || !(p.cff > 0)) return [1, 0];
  const R1 = dividerR1(p); if (!(R1 > 0)) return [1, 0];
  const w = 2 * Math.PI * f, Rp = R1 * p.r2 / (R1 + p.r2);
  return cdiv([1, w * R1 * p.cff], [1, w * Rp * p.cff]);
}
export type Comp = { type: 'II' | 'III'; wI: number; fz: number; fp: number; k: number; boost: number; boostReq: number; phiP: number; limited: boolean };
function compShape(cp: Omit<Comp, 'wI'> | Comp, f: number): C {
  const s: C = [0, 2 * Math.PI * f];
  const z: C = [1, f / cp.fz], pl: C = [1, f / cp.fp];
  let g = cdiv(z, pl); if (cp.type === 'III') g = cmul(g, g);
  return cdiv(g, s); // 1/s · shape (ωI applied separately)
}
export function comp(cp: Comp, f: number): C { const g = compShape(cp, f); return [g[0] * cp.wI, g[1] * cp.wI]; }
/** Open-loop plant seen by the compensator: Gvd·H/Vramp·Hff */
export function plantLoop(p: BCIn, f: number): C { return cmul(cmul(plant(p, f), [p.vref / p.vout / p.vramp, 0]), hff(p, f)); }

export function designComp(p: BCIn): Comp {
  // K-factor uses the bare power-stage phase (Cff is an add-on, applied afterwards so its effect is visible)
  const bare = cmul(plant(p, p.fc), [p.vref / p.vout / p.vramp, 0]);
  const phiP = cang(bare);
  const boostReq = p.pm - 90 - phiP;
  const type: 'II' | 'III' = p.type === 'auto' ? (boostReq <= 65 ? 'II' : 'III') : p.type;
  const [bmin, bmax] = type === 'II' ? [-80, 85] : [-170, 170];
  const boost = Math.min(bmax, Math.max(bmin, boostReq));
  const k = type === 'II' ? Math.tan((boost / 2 + 45) * deg) : Math.tan((boost / 4 + 45) * deg) ** 2;
  const fz = type === 'II' ? p.fc / k : p.fc / Math.sqrt(k), fp = type === 'II' ? p.fc * k : p.fc * Math.sqrt(k);
  const shape = { type, fz, fp, k, boost, boostReq, phiP, limited: boost !== boostReq };
  const wI = 1 / (cabs(compShape(shape, p.fc)) * cabs(bare));
  return { ...shape, wI };
}

export function loopGain(p: BCIn, cp: Comp, f: number): C { return cmul(comp(cp, f), plantLoop(p, f)); }

/** Crossover (last 0 dB crossing), phase margin and gain margin from a dense log sweep. */
export function margins(p: BCIn, cp: Comp) {
  const N = 1600, fa = 10, fb = 1e8;
  let prevF = fa, prevM = cabs(loopGain(p, cp, fa)), prevP = cang(loopGain(p, cp, fa));
  let fc = NaN;
  const x180: { f: number; m: number }[] = [];
  for (let i = 1; i <= N; i++) {
    const f = fa * (fb / fa) ** (i / N), T = loopGain(p, cp, f), m = cabs(T), ph = cang(T);
    if (prevM >= 1 && m < 1) { const r = Math.log(prevM) / (Math.log(prevM) - Math.log(m)); fc = prevF * (f / prevF) ** r; }
    // phase falling through −180° shows up as atan2 wrapping from ≈−180 to ≈+180
    if (prevP < -150 && ph > 150) x180.push({ f, m });
    prevF = f; prevM = m; prevP = ph;
  }
  // gain margin at the first phase crossover above the gain crossover (lower crossings = conditional stability)
  const above = x180.find(x => !(x.f < fc));
  const gm = above ? -20 * Math.log10(above.m) : Infinity, f180 = above ? above.f : NaN;
  const conditional = x180.some(x => x.f < fc);
  const pmAct = isNaN(fc) ? NaN : wrap(180 + cang(loopGain(p, cp, fc)));
  return { fc, pm: pmAct, gm, f180, conditional };
}
const wrap = (a: number) => { let x = ((a + 180) % 360 + 360) % 360 - 180; if (x === -180) x = 180; return x; };

export function bode(p: BCIn, cp: Comp, fmin = 100, fmax = 10e6, n = 300) {
  const f: number[] = [], mag: number[] = [], ph: number[] = [], pmag: number[] = [], cmag: number[] = [], pph: number[] = [];
  let unwrapPrev = NaN, plPrev = NaN;
  for (let i = 0; i < n; i++) {
    const fr = fmin * (fmax / fmin) ** (i / (n - 1));
    const T = loopGain(p, cp, fr), P = plantLoop(p, fr), G = comp(cp, fr);
    let a = cang(T); if (!isNaN(unwrapPrev)) { while (a - unwrapPrev > 180) a -= 360; while (a - unwrapPrev < -180) a += 360; } unwrapPrev = a;
    let b = cang(P); if (!isNaN(plPrev)) { while (b - plPrev > 180) b -= 360; while (b - plPrev < -180) b += 360; } plPrev = b;
    f.push(fr); mag.push(20 * Math.log10(cabs(T))); ph.push(a); pmag.push(20 * Math.log10(cabs(P))); cmag.push(20 * Math.log10(cabs(G))); pph.push(b);
  }
  return { f, mag, ph, pmag, cmag, pph };
}

/** Nonlinear averaged closed-loop simulation of a load step up (at t1) and back down (at t2). */
export function stepResponse(p: BCIn, cp: Comp, opts: { tEnd?: number; nMax?: number } = {}) {
  const R = loadR(p);
  const tEnd = opts.tEnd ?? 24 / Math.max(p.fc, 100);
  const fmax = Math.max(cp.fp, p.fc, f0(p), p.cffOn && p.cff > 0 ? 1 / (2 * Math.PI * (dividerR1(p) * p.r2 / (dividerR1(p) + p.r2)) * p.cff) : 0);
  const nMax = opts.nMax ?? 40000;
  const dt = Math.max(tEnd / nMax, Math.min(tEnd / 2000, 1 / (2 * Math.PI * fmax * 8)));
  const n = Math.ceil(tEnd / dt);
  const t1 = 0.1 * tEnd, t2 = 0.55 * tEnd;
  const H = p.vref / p.vout, a = 1 / H; // Cff section ωp/ωz = Vout/Vref
  const R1 = dividerR1(p), Rp = R1 * p.r2 / (R1 + p.r2);
  const useCff = p.cffOn && p.cff > 0 && R1 > 0;
  const wpf = useCff ? 1 / (Rp * p.cff) : 0;
  const nsec = cp.type === 'II' ? 1 : 2, wz = 2 * Math.PI * cp.fz, wp = 2 * Math.PI * cp.fp, ra = wp / wz;
  // initial steady state
  const iL0 = p.vout / R, d0 = (p.vout + iL0 * p.dcr) / p.vin, vc0 = d0 * p.vramp;
  // state: [iL, vC, xI, xs1, xs2, xf]
  let x = [iL0, p.vout, vc0, vc0, vc0, p.vout];
  const ist = (t: number) => (t >= t1 && t < t2 ? p.istep : 0);
  const outV = (s: number[], is: number) => (s[1] + p.esr * (s[0] - is)) / (1 + p.esr / R);
  let sat = 0;
  const ctrl = (s: number[], is: number) => {
    const vo = outV(s, is);
    const vfb = useCff ? H * (a * vo + (1 - a) * s[5]) : H * vo;
    const e = p.vref - vfb;
    let u = s[2];
    const y1 = ra * u + (1 - ra) * s[3]; const y2 = nsec === 2 ? ra * y1 + (1 - ra) * s[4] : y1;
    const vcmd = y2;
    const d = Math.min(p.dmax, Math.max(0, vcmd / p.vramp));
    return { vo, e, y1, d, vcmd };
  };
  const der = (s: number[], is: number) => {
    const c = ctrl(s, is);
    // anti-windup: stop integrating when the duty is clamped and the error pushes further into the clamp
    const clampedHi = c.vcmd / p.vramp > p.dmax && c.e > 0, clampedLo = c.vcmd < 0 && c.e < 0;
    return [
      (c.d * p.vin - s[0] * p.dcr - c.vo) / p.l,
      (s[0] - c.vo / R - is) / p.c,
      clampedHi || clampedLo ? 0 : cp.wI * c.e,
      wp * (s[2] - s[3]),
      nsec === 2 ? wp * (c.y1 - s[4]) : 0,
      useCff ? wpf * (c.vo - s[5]) : 0,
    ];
  };
  const keep = Math.max(1, Math.floor(n / 1500));
  const T: number[] = [], V: number[] = [], I: number[] = [], Dd: number[] = [], Il: number[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k * dt, is = ist(t);
    if (k % keep === 0) { const c = ctrl(x, is); T.push(t); V.push(c.vo); I.push(x[0]); Dd.push(c.d); Il.push(p.vout / R + is); if (c.d >= p.dmax || c.d <= 0) sat++; }
    // RK4 (load current is piecewise constant; steps straddling an edge use the value at the step start)
    const k1 = der(x, is), x2 = x.map((v, i) => v + 0.5 * dt * k1[i]);
    const k2 = der(x2, is), x3 = x.map((v, i) => v + 0.5 * dt * k2[i]);
    const k3 = der(x3, is), x4 = x.map((v, i) => v + dt * k3[i]);
    const k4 = der(x4, is);
    x = x.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    if (!x.every(isFinite)) break;
  }
  // metrics
  let vmin = Infinity, vmax = -Infinity, settle = NaN, lastOut = -1;
  for (let i = 0; i < T.length; i++) {
    if (T[i] >= t1 && T[i] < t2) vmin = Math.min(vmin, V[i]);
    if (T[i] >= t2) vmax = Math.max(vmax, V[i]);
  }
  // settling: back within ±10% of the peak deviation (or ±0.1% of Vout) for good
  const band = Math.max(0.1 * (p.vout - vmin), 1e-3 * p.vout);
  for (let i = 0; i < T.length; i++) if (T[i] >= t1 && T[i] < t2 && Math.abs(V[i] - p.vout) > band) lastOut = i;
  if (lastOut >= 0 && lastOut < T.length - 1 && T[lastOut + 1] < t2 * 0.98) settle = T[lastOut + 1] - t1; else if (lastOut < 0) settle = 0;
  // ringing at the end of the window → instability (limit cycle)
  let tailMin = Infinity, tailMax = -Infinity;
  for (let i = 0; i < T.length; i++) if (T[i] > 0.85 * tEnd) { tailMin = Math.min(tailMin, V[i]); tailMax = Math.max(tailMax, V[i]); }
  const stillRinging = tailMax - tailMin > 0.02 * p.vout;
  return { t: T, v: V, iL: I, d: Dd, iload: Il, t1, t2, tEnd, undershoot: p.vout - vmin, overshoot: vmax - p.vout, settle, band, stillRinging, saturatedFrac: sat / T.length, rule: p.istep / (2 * Math.PI * p.fc * p.c) };
}
