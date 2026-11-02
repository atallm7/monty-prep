// Charge-pump PLL (PFD + charge pump + series-RC loop filter + VCO + ÷N), behavioural, event-driven per
// reference cycle so the sampling nature of the PFD is kept (Gardner, "Charge-Pump Phase-Lock Loops",
// IEEE Trans. Commun. 1980).
//
// Continuous-time (averaged) model, valid for bw ≪ fref:
//   PFD+CP: i = Icp·θe/(2π)        loop filter: Z(s) = R + 1/(sC)        VCO: ω = ω0 + Kv·vc  (Kv = 2π·Kvco)
//   G(s) = K(1 + sRC)/(s²C),  K = Icp·Kv/(2πN)
//   closed loop H(s) = (2ζωn s + ωn²)/(s² + 2ζωn s + ωn²),  ωn = √(K/C),  ζ = (R/2)·√(K·C)
//   −3 dB bandwidth  ω3dB = ωn·√(1 + 2ζ² + √((1 + 2ζ²)² + 1))     (Best, "Phase-Locked Loops", eq. 2.?)
// Design here: given bw (−3 dB) and ζ, solve ωn, then C = K/ωn², R = 2ζ/(ωn·C).
//
// Event model per reference period Tref: the phase error θe at the reference edge sets a CP pulse of width
// tp = min(|θe|/2π, 1)·Tref; during it vc = vC + Icp·R (the "R jump") and vC ramps by Icp·tp/C. The VCO
// phase advance over the cycle is the exact integral of f0 + Kvco·vc(t). PFD range is ±2π: beyond that a
// cycle slip occurs (the PFD forgets one full cycle), which also makes the PFD a frequency detector.

export type PllIn = {
  fref: number; n: number; bw: number; zeta: number;
  kvco: number;     // Hz/V
  icp: number;      // A
  offset: number;   // initial VCO frequency error, fraction of N·fref (free-running f0 = N·fref·(1 + offset))
  phaseStep: number; // reference phase step, degrees (0 = none)
};

export function design(p: PllIn) {
  const z = Math.max(0.05, p.zeta);
  const a = 1 + 2 * z * z;
  const wn = 2 * Math.PI * p.bw / Math.sqrt(a + Math.sqrt(a * a + 1));
  const Kv = 2 * Math.PI * p.kvco;
  const K = p.icp * Kv / (2 * Math.PI * p.n);
  const C = K / (wn * wn);
  const R = 2 * z * wn / K;
  return { wn, fn: wn / (2 * Math.PI), K, C, R, zeta: z, tauZ: R * C, fzero: 1 / (2 * Math.PI * R * C) };
}

/** Normalised error response g(t) = L⁻¹{ s/(s² + 2ζωn s + ωn²) }·ωn⁰ ... returns e(t)/e(0) for a phase or frequency step. */
export function errorResponse(zeta: number, wn: number, t: number): number {
  if (t < 0) return 1;
  const a = zeta * wn;
  if (Math.abs(zeta - 1) < 1e-6) return Math.exp(-a * t) * (1 - a * t);
  if (zeta < 1) { const wd = wn * Math.sqrt(1 - zeta * zeta); return Math.exp(-a * t) * (Math.cos(wd * t) - (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t)); }
  const r = wn * Math.sqrt(zeta * zeta - 1); const p1 = -a + r, p2 = -a - r;
  return (p1 * Math.exp(p1 * t) - p2 * Math.exp(p2 * t)) / (p1 - p2);
}

export type PllOut = {
  t: number[]; f: number[]; phaseErrDeg: number[]; vc: number[];
  ftarget: number; f0: number; tStep: number; tEnd: number; cycles: number; slips: number;
  lockTime: number; overshootPct: number; locked: boolean; finalPhaseDeg: number; d: ReturnType<typeof design>;
  vcFinal: number; vcPk: number;
};

export function simulate(p: PllIn, maxCycles = 60000): PllOut {
  const d = design(p);
  const Tref = 1 / p.fref; const ftarget = p.n * p.fref; const f0 = ftarget * (1 + p.offset);
  const df = ftarget - f0;
  // estimated settling: linear ~4.6/(ζωn), plus PFD-saturated slewing of vC at Icp/C for big offsets
  const ts = 4.6 / (Math.min(d.zeta, 1) * d.wn);
  const tslew = Math.abs(df / p.kvco) * d.C / p.icp;
  const T1 = 1.4 * (ts + tslew) + 20 * Tref;
  const hasStep = Math.abs(p.phaseStep) > 1e-9;
  const tStep = hasStep ? T1 : Infinity;
  const tEnd = hasStep ? T1 + 1.4 * ts + 20 * Tref : T1 * 1.3;
  const cycles = Math.min(maxCycles, Math.max(80, Math.ceil(tEnd / Tref)));
  const kStep = hasStep ? Math.round(tStep / Tref) : -1;

  let e = 0, vC = 0, slips = 0;
  const out: PllOut = { t: [], f: [], phaseErrDeg: [], vc: [], ftarget, f0, tStep, tEnd: cycles * Tref, cycles, slips: 0, lockTime: NaN, overshootPct: 0, locked: false, finalPhaseDeg: 0, d, vcFinal: 0, vcPk: 0 };
  const { R, C } = d; const I = p.icp;
  for (let k = 0; k < cycles; k++) {
    if (k === kStep) e += p.phaseStep * Math.PI / 180;
    const s = Math.sign(e); const tp = Math.min(Math.abs(e) / (2 * Math.PI), 1) * Tref;
    // ∫vc dt over the cycle (pulse at the start of the cycle, then hold)
    const integ = vC * Tref + s * I * tp * tp / (2 * C) + s * I * R * tp + s * I * tp / C * (Tref - tp);
    out.vcPk = Math.max(out.vcPk, Math.abs(vC + s * I * R));
    vC += s * I * tp / C;
    const cyclesVco = f0 * Tref + p.kvco * integ; // VCO cycles in this reference period
    const fav = cyclesVco / Tref;
    out.t.push(k * Tref); out.f.push(fav); out.phaseErrDeg.push(e * 180 / Math.PI); out.vc.push(integ / Tref);
    e = e + 2 * Math.PI - 2 * Math.PI * cyclesVco / p.n;
    if (e > 2 * Math.PI) { e -= 2 * Math.PI; slips++; } else if (e < -2 * Math.PI) { e += 2 * Math.PI; slips++; }
    if (!isFinite(e)) break;
  }
  out.slips = slips; out.vcFinal = vC;
  // lock: |Δf| < 100 ppm of target and |θe| < 0.1 rad from this point on (before any phase step)
  const kEnd = hasStep ? Math.min(kStep, out.t.length) : out.t.length;
  let last = -1;
  for (let k = 0; k < kEnd; k++) if (Math.abs(out.f[k] - ftarget) > 1e-4 * ftarget || Math.abs(out.phaseErrDeg[k]) > 5.73) last = k;
  out.locked = last < kEnd - 10;
  out.lockTime = out.locked ? (last + 1) * Tref : NaN;
  // frequency overshoot beyond target, relative to the initial frequency error
  if (Math.abs(df) > 0) { let ov = 0; for (let k = 0; k < kEnd; k++) ov = Math.max(ov, (out.f[k] - ftarget) * Math.sign(df)); out.overshootPct = 100 * ov / Math.abs(df); }
  out.finalPhaseDeg = out.phaseErrDeg[out.phaseErrDeg.length - 1];
  return out;
}

/** h(t) = L⁻¹{ 1/(s² + 2ζωn s + ωn²) }: phase error after a frequency step Δω (divided) is θe(t) = Δω·h(t) */
export function phaseImpulse(zeta: number, wn: number, t: number): number {
  if (t < 0) return 0;
  const a = zeta * wn;
  if (Math.abs(zeta - 1) < 1e-6) return t * Math.exp(-a * t);
  if (zeta < 1) { const wd = wn * Math.sqrt(1 - zeta * zeta); return Math.exp(-a * t) * Math.sin(wd * t) / wd; }
  const r = wn * Math.sqrt(zeta * zeta - 1); const p1 = -a + r, p2 = -a - r;
  return (Math.exp(p1 * t) - Math.exp(p2 * t)) / (p1 - p2);
}

/** Continuous-time (linear, averaged) prediction of VCO frequency and phase error for the same scenario. */
export function linearPrediction(p: PllIn, o: PllOut, t: number) {
  const d = o.d; const df = o.ftarget - o.f0;
  let f = o.ftarget - df * errorResponse(d.zeta, d.wn, t);
  let ph = 2 * Math.PI * (df / p.n) * phaseImpulse(d.zeta, d.wn, t);
  if (t >= o.tStep) {
    const phi = p.phaseStep * Math.PI / 180; const tt = t - o.tStep;
    ph += phi * errorResponse(d.zeta, d.wn, tt);
    // output phase θo = θref − θe·N... VCO frequency deviation = N/(2π)·d(θdiv)/dt = N/(2π)·φ·dH/dt-step = N/(2π)·φ·ωn²·h'(...)
    // d/dt of (φ − θe) = −φ·d/dt errorResponse; derivative evaluated numerically
    const dt = 1e-4 / d.wn; const der = (errorResponse(d.zeta, d.wn, tt + dt) - errorResponse(d.zeta, d.wn, tt)) / dt;
    f += -p.n / (2 * Math.PI) * phi * der;
  }
  return { f, phaseDeg: ph * 180 / Math.PI };
}
