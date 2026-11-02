// Passive filter model: voltage transfer functions H(s) = Vout/Vin (unloaded output), evaluated at s = jω.
//   rc-lpf : series R, shunt C          H = 1/(1 + sRC)                 fc = 1/(2πRC)
//   rc-hpf : series C, shunt R          H = sRC/(1 + sRC)
//   rl-lpf : series L, shunt R          H = R/(R + sL)                  fc = R/(2πL)
//   rl-hpf : series R, shunt L          H = sL/(R + sL)
//   series RLC (D(s) = s²LC + sRC + 1), ω0 = 1/√(LC), Q = (1/R)√(L/C):
//   rlc-lpf: output across C            H = 1/D
//   rlc-hpf: output across L            H = s²LC/D
//   rlc-bpf: output across R            H = sRC/D       peak 1 at f0, BW = f0/Q = R/(2πL)
//   rlc-bsf: output across L+C          H = (s²LC + 1)/D  notch (zero) at f0
export type FType = 'rc-lpf' | 'rc-hpf' | 'rl-lpf' | 'rl-hpf' | 'rlc-bpf' | 'rlc-bsf' | 'rlc-lpf' | 'rlc-hpf';
export const TYPES: FType[] = ['rc-lpf', 'rc-hpf', 'rl-lpf', 'rl-hpf', 'rlc-bpf', 'rlc-bsf', 'rlc-lpf', 'rlc-hpf'];
export type FIn = { type: FType; r: number; c: number; l: number };
type Cx = { re: number; im: number };
const cdiv = (a: Cx, b: Cx): Cx => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; };

/** Complex H(j·2πf). */
export function H({ type, r, c, l }: FIn, f: number): Cx {
  const w = 2 * Math.PI * f;
  const D: Cx = { re: 1 - w * w * l * c, im: w * r * c };
  switch (type) {
    case 'rc-lpf': return cdiv({ re: 1, im: 0 }, { re: 1, im: w * r * c });
    case 'rc-hpf': return cdiv({ re: 0, im: w * r * c }, { re: 1, im: w * r * c });
    case 'rl-lpf': return cdiv({ re: r, im: 0 }, { re: r, im: w * l });
    case 'rl-hpf': return cdiv({ re: 0, im: w * l }, { re: r, im: w * l });
    case 'rlc-lpf': return cdiv({ re: 1, im: 0 }, D);
    case 'rlc-hpf': return cdiv({ re: -w * w * l * c, im: 0 }, D);
    case 'rlc-bpf': return cdiv({ re: 0, im: w * r * c }, D);
    case 'rlc-bsf': return cdiv({ re: 1 - w * w * l * c, im: 0 }, D);
  }
}
export const mag = (h: Cx) => Math.hypot(h.re, h.im);
export const phaseDeg = (h: Cx) => (Math.atan2(h.im, h.re) * 180) / Math.PI;
export const dB = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));

export function isSecondOrder(t: FType) { return t.startsWith('rlc'); }
export function kindOf(t: FType): 'lpf' | 'hpf' | 'bpf' | 'bsf' { return t.slice(-3) as 'lpf' | 'hpf' | 'bpf' | 'bsf'; }

/** Characteristic numbers: first-order fc, or second-order f0, Q, bandwidth. */
export function characteristics(p: FIn) {
  const so = isSecondOrder(p.type);
  const f0 = so ? 1 / (2 * Math.PI * Math.sqrt(p.l * p.c)) : p.type.startsWith('rc') ? 1 / (2 * Math.PI * p.r * p.c) : p.r / (2 * Math.PI * p.l);
  const Q = so ? Math.sqrt(p.l / p.c) / p.r : NaN;
  const zeta = so ? 1 / (2 * Q) : NaN;
  const bw = so ? p.r / (2 * Math.PI * p.l) : NaN; // = f0/Q
  const cut = halfPower(p, f0);
  // peaking of 2nd-order LP/HP: |H|max = Q/√(1 − 1/(4Q²)) for Q > 1/√2
  const peak = so && (kindOf(p.type) === 'lpf' || kindOf(p.type) === 'hpf') && Q > Math.SQRT1_2 ? Q / Math.sqrt(1 - 1 / (4 * Q * Q)) : 1;
  return { f0, Q, zeta, bw, cut, peak, slope: so ? 40 : 20 };
}

/** −3 dB (|H| = 1/√2) crossing frequencies found by scan + bisection over 6 decades either side of f0. */
export function halfPower(p: FIn, f0: number): number[] {
  const g = (f: number) => mag(H(p, f)) - Math.SQRT1_2;
  const out: number[] = []; const N = 1200;
  let fa = f0 * 1e-6, ga = g(fa);
  for (let k = 1; k <= N; k++) {
    const fb = f0 * 10 ** (-6 + 12 * k / N); const gb = g(fb);
    if ((ga < 0) !== (gb < 0)) {
      let lo = fa, hi = fb, glo = ga;
      for (let it = 0; it < 80; it++) { const m = Math.sqrt(lo * hi); const gm = g(m); if ((gm < 0) !== (glo < 0)) hi = m; else { lo = m; glo = gm; } }
      out.push(Math.sqrt(lo * hi));
    }
    fa = fb; ga = gb;
  }
  return out;
}

export function bode(p: FIn, fmin: number, fmax: number, n = 400) {
  const f: number[] = [], m: number[] = [], ph: number[] = [];
  for (let k = 0; k < n; k++) {
    const x = fmin * (fmax / fmin) ** (k / (n - 1)); const h = H(p, x);
    f.push(x); m.push(dB(mag(h))); ph.push(phaseDeg(h));
  }
  return { f, m, ph };
}

/** Steady-state sine response: vin = A sin(ωt), vout = A|H| sin(ωt + φ). */
export function sineResponse(p: FIn, f: number, amp = 1, cycles = 3, n = 400) {
  const h = H(p, f); const g = mag(h); const phi = Math.atan2(h.im, h.re);
  const t: number[] = [], vin: number[] = [], vout: number[] = [];
  const Tend = cycles / f;
  for (let k = 0; k <= n; k++) { const tt = Tend * k / n; t.push(tt); vin.push(amp * Math.sin(2 * Math.PI * f * tt)); vout.push(amp * g * Math.sin(2 * Math.PI * f * tt + phi)); }
  return { t, vin, vout, gain: g, phaseDeg: (phi * 180) / Math.PI, delay: -phi / (2 * Math.PI * f) };
}

/** Sensible defaults per topology when the page does not specify values. */
export function defaultsFor(t: FType) {
  if (t.startsWith('rlc')) return { r: t === 'rlc-bpf' || t === 'rlc-bsf' ? 100 : 200, c: 100e-9, l: 10e-3, f: 5000 };
  if (t.startsWith('rl')) return { r: 1000, c: 100e-9, l: 100e-3, f: 1000 };
  return { r: 1000, c: 100e-9, l: 10e-3, f: 1000 };
}
