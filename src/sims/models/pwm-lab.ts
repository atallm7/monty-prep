// PWM signal analysis: 0/A square wave of duty D and frequency f.
//   Average  V_avg = D·A;  RMS  V_rms = A·√D;  AC RMS = A·√(D(1−D))  (since V_rms² = V_avg² + V_ac²)
//   Fourier series: v(t) = D·A + Σ_{n≥1} c_n·cos(2πnf·t − nπD),  c_n = (2A/(nπ))·|sin(nπD)|
//   (harmonics vanish where n·D is an integer, e.g. all even harmonics at D = 0.5). Parseval: V_rms² = (DA)² + Σ c_n²/2.
// First-order RC (time constant τ) driven by the PWM: exact periodic steady state from the piecewise exponentials
//   a = e^{−DT/τ}, b = e^{−(1−D)T/τ}:  V_min = A(1−a)·b/(1−ab),  V_max = A(1−a)/(1−ab),
//   ripple ΔV = A(1−a)(1−b)/(1−ab)  →  A·D(1−D)·T/τ  for τ ≫ T.
// The same first-order solution gives the current ripple in an RL motor winding (τ = L/R, divide by R).
// LED: the eye integrates above the flicker-fusion rate (~60–100 Hz), so perceived luminance ∝ D (Talbot–Plateau law);
//   perceived lightness follows CIE L* = 116·Y^{1/3} − 16 (Y > 0.008856) else 903.3·Y.

export function pwmStats(D: number, A: number) {
  const d = Math.min(1, Math.max(0, D));
  return { avg: d * A, rms: A * Math.sqrt(d), acRms: A * Math.sqrt(d * (1 - d)), formFactor: d > 0 ? 1 / Math.sqrt(d) : Infinity };
}

/** Amplitude of the n-th harmonic (n ≥ 1), peak volts. */
export function harmonic(n: number, D: number, A: number) { return (2 * A / (n * Math.PI)) * Math.abs(Math.sin(n * Math.PI * D)); }

export function rcSteady(D: number, A: number, f: number, tau: number) {
  const T = 1 / f;
  if (!(tau > 0)) return { vmin: D < 1 ? 0 : A, vmax: D > 0 ? A : 0, ripple: D > 0 && D < 1 ? A : 0, approx: Infinity };
  const a = Math.exp(-D * T / tau), b = Math.exp(-(1 - D) * T / tau);
  const den = 1 - a * b;
  const vmax = den > 0 ? A * (1 - a) / den : A * D;
  const vmin = vmax * b;
  return { vmin, vmax, ripple: vmax - vmin, approx: A * D * (1 - D) * T / tau };
}

/** Exact RC response sampled over nPer periods starting from v0 (default 0, i.e. power-up). */
export function rcResponse(D: number, A: number, f: number, tau: number, nPer: number, ptsPer = 80, v0 = 0) {
  const T = 1 / f; const t: number[] = [], pwm: number[] = [], v: number[] = [];
  let vc = v0;
  const hiN = Math.max(2, Math.round(ptsPer * D)), loN = Math.max(2, ptsPer - hiN);
  for (let k = 0; k < nPer; k++) {
    const t0 = k * T;
    // high phase: v → A
    for (let j = 0; j <= hiN; j++) { const tt = D * T * j / hiN; t.push(t0 + tt); pwm.push(D > 0 ? A : 0); v.push(A + (vc - A) * Math.exp(-tt / tau)); }
    vc = A + (vc - A) * Math.exp(-D * T / tau);
    for (let j = 0; j <= loN; j++) { const tt = (1 - D) * T * j / loN; t.push(t0 + D * T + tt); pwm.push(D < 1 ? 0 : A); v.push(vc * Math.exp(-tt / tau)); }
    vc = vc * Math.exp(-(1 - D) * T / tau);
  }
  return { t, pwm, v };
}

/** RC low-pass magnitude at frequency fx. */
export const rcGain = (fx: number, tau: number) => 1 / Math.sqrt(1 + (2 * Math.PI * fx * tau) ** 2);

/** CIE 1976 lightness (0..100) for relative luminance Y (0..1). */
export function cieLightness(Y: number) { return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; }
