// Impedance vs frequency for ideal and realistic passive parts.
//
// Realistic models (lumped, textbook first-order parasitics):
//   Capacitor : series R-L-C            Z = ESR + jωESL + 1/(jωC)
//               SRF  f0 = 1/(2π√(ESL·C)), |Z(f0)| = ESR (series resonance, impedance minimum)
//   Inductor  : (DCR + jωL) ∥ Cp ∥ Rcore
//               Y = 1/(DCR + jωL) + jωCp + 1/Rcore
//               Im{Y}=0 → ω0² = 1/(L·Cp) − DCR²/L²   (parallel resonance, impedance maximum)
//   Resistor  : (R + jωLs) ∥ Cp
//               same parallel form; resonance exists only when R < √(Ls/Cp),
//               otherwise Cp simply rolls the impedance off above f ≈ 1/(2πR·Cp).
// Ideal parts: Z_R = R, Z_L = jωL, Z_C = 1/(jωC).

export type Part = 'capacitor' | 'inductor' | 'resistor';
export type ImpIn = {
  part: Part;
  c: number;      // capacitance (capacitor)
  l: number;      // inductance (inductor)
  r: number;      // resistance (resistor)
  esr: number;    // series resistance: capacitor ESR / inductor DCR
  esl: number;    // series inductance: capacitor ESL / resistor lead+body inductance
  cp: number;     // parallel capacitance: inductor winding C / resistor shunt C
  rcore: number;  // inductor core-loss parallel resistance (∞ allowed)
};

export type Cx = { re: number; im: number };
export const cx = (re: number, im = 0): Cx => ({ re, im });
export const add = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im });
export const mul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const inv = (a: Cx): Cx => { const d = a.re * a.re + a.im * a.im; return d === 0 ? { re: Infinity, im: 0 } : { re: a.re / d, im: -a.im / d }; };
export const div = (a: Cx, b: Cx): Cx => mul(a, inv(b));
export const mag = (a: Cx) => Math.hypot(a.re, a.im);
export const phaseDeg = (a: Cx) => Math.atan2(a.im, a.re) * 180 / Math.PI;

const W = (f: number) => 2 * Math.PI * f;

/** Admittance of a set of parallel branches given as admittances; returns the impedance. */
function parallelY(ys: Cx[]): Cx {
  let y = cx(0); for (const k of ys) y = add(y, k);
  return inv(y);
}

/** Ideal impedance of the part at frequency f. */
export function zIdeal(p: ImpIn, f: number): Cx {
  const w = W(f);
  if (p.part === 'capacitor') return w * p.c === 0 ? cx(Infinity) : cx(0, -1 / (w * p.c));
  if (p.part === 'inductor') return cx(0, w * p.l);
  return cx(p.r);
}

/** Realistic impedance of the part at frequency f. */
export function zReal(p: ImpIn, f: number): Cx {
  const w = W(f);
  if (p.part === 'capacitor') {
    const xc = w * p.c === 0 ? Infinity : -1 / (w * p.c);
    return cx(p.esr, w * p.esl + xc);
  }
  if (p.part === 'inductor') {
    const series = cx(p.esr, w * p.l);
    const ys: Cx[] = [inv(series), cx(0, w * p.cp)];
    if (isFinite(p.rcore) && p.rcore > 0) ys.push(cx(1 / p.rcore));
    return parallelY(ys);
  }
  // resistor
  const series = cx(p.r, w * p.esl);
  return parallelY([inv(series), cx(0, w * p.cp)]);
}

/** Self-resonant frequency (Hz); Infinity when the parasitic needed for resonance is zero / no resonance. */
export function srf(p: ImpIn): number {
  if (p.part === 'capacitor') return p.esl > 0 && p.c > 0 ? 1 / (2 * Math.PI * Math.sqrt(p.esl * p.c)) : Infinity;
  const L = p.part === 'inductor' ? p.l : p.esl;
  const R = p.part === 'inductor' ? p.esr : p.r;
  if (!(L > 0 && p.cp > 0)) return Infinity;
  const w2 = 1 / (L * p.cp) - (R * R) / (L * L);
  return w2 > 0 ? Math.sqrt(w2) / (2 * Math.PI) : Infinity;
}

/** Quality factor of the part at frequency f: |Im Z| / Re Z. */
export function qAt(p: ImpIn, f: number) { const z = zReal(p, f); return z.re > 0 ? Math.abs(z.im) / z.re : Infinity; }

/** Classify the realistic part's behaviour from the phase of Z. */
export function behaviour(z: Cx): 'capacitive' | 'inductive' | 'resistive' {
  const ph = phaseDeg(z);
  return ph > 45 ? 'inductive' : ph < -45 ? 'capacitive' : 'resistive';
}

/** Relative complex deviation of the real part from its ideal: |Zreal/Zideal − 1|. */
export function deviation(p: ImpIn, f: number) {
  const zi = zIdeal(p, f), zr = zReal(p, f);
  if (!isFinite(mag(zi))) return 0;
  const d = div(zr, zi);
  return Math.hypot(d.re - 1, d.im);
}

/**
 * Lowest frequency in [f0, f1] (log-scanned then bisected) above which the realistic part
 * deviates from its ideal by more than `tol` (default 10 %). Returns Infinity if it never does.
 * For an inductor the low-frequency DCR also causes deviation; we scan upward from the first
 * frequency where the part *is* within tolerance, so the reported value is the high-frequency limit.
 */
export function usefulUpTo(p: ImpIn, f0: number, f1: number, tol = 0.1): number {
  const n = 600; const la = Math.log10(f0), lb = Math.log10(f1);
  let seenGood = false; let prev = f0;
  for (let i = 0; i <= n; i++) {
    const f = 10 ** (la + (lb - la) * i / n);
    const bad = deviation(p, f) > tol;
    if (!bad) seenGood = true;
    else if (seenGood) {
      let a = prev, b = f;
      for (let k = 0; k < 50; k++) { const m = Math.sqrt(a * b); if (deviation(p, m) > tol) b = m; else a = m; }
      return Math.sqrt(a * b);
    }
    prev = f;
  }
  return Infinity;
}

/** Lowest frequency where the inductor is within tol of ideal (DCR dominates below it). */
export function inductorUsefulFrom(p: ImpIn, f0: number, f1: number, tol = 0.1): number {
  const n = 600; const la = Math.log10(f0), lb = Math.log10(f1);
  for (let i = 0; i <= n; i++) { const f = 10 ** (la + (lb - la) * i / n); if (deviation(p, f) <= tol) return f; }
  return Infinity;
}

/** Sensible plot range spanning ~7 decades: centred on the SRF (C, L) or on the first parasitic corner (R). */
export function freqRange(p: ImpIn): [number, number] {
  let fc = srf(p);
  if (p.part === 'resistor') {
    // first corner where a parasitic starts to matter: R/(2πLs) (inductive) or 1/(2πR·Cp) (capacitive)
    const fl = p.esl > 0 ? p.r / (2 * Math.PI * p.esl) : Infinity;
    const fcp = p.cp > 0 && p.r > 0 ? 1 / (2 * Math.PI * p.r * p.cp) : Infinity;
    fc = Math.min(fl, fcp, fc);
    if (!isFinite(fc)) fc = 1e9;
    const e = Math.floor(Math.log10(fc));
    const lo = Math.max(0, Math.min(e - 3, 8)), hi = Math.min(11, Math.max(e + 3, lo + 4));
    return [10 ** lo, 10 ** hi];
  }
  if (!isFinite(fc)) fc = 1e7;
  const e = Math.floor(Math.log10(fc));
  const lo = Math.max(0, Math.min(e - 5, 7)), hi = Math.min(11, Math.max(e + 2, lo + 4));
  return [10 ** lo, 10 ** hi];
}

export function sweep(p: ImpIn, f0: number, f1: number, n = 400) {
  const la = Math.log10(f0), lb = Math.log10(f1);
  const f: number[] = [], zr: number[] = [], pr: number[] = [], zi: number[] = [], pi: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = 10 ** (la + (lb - la) * i / (n - 1)); f.push(x);
    const a = zReal(p, x), b = zIdeal(p, x);
    zr.push(mag(a)); pr.push(phaseDeg(a)); zi.push(mag(b)); pi.push(phaseDeg(b));
  }
  return { f, zr, pr, zi, pi };
}
