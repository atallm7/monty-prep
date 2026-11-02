// Light sensing: photodiode + transimpedance amplifier vs a CdS photoresistor (LDR).
//
// Photometry → radiometry: E_e [W/m²] = E_v [lux] / K, K = luminous efficacy of the source spectrum
//   (683 lm/W at 555 nm by definition of the candela; ≈ 93 lm/W for sunlight, ≈ 300 lm/W for a white LED).
// Photodiode: I_ph = R_λ · E_e · A  (responsivity R_λ in A/W, active area A), plus dark current I_d.
// TIA (op-amp with feedback R_f ‖ C_f, photodiode capacitance C_d at the summing node, single-pole op-amp A(s) = ω_t/s):
//   β(s) = (1 + sR_fC_f)/(1 + sR_f(C_d + C_f)),   Z(s) = V_out/I_ph = −Z_f / (1 + 1/(Aβ))
//   ⇒ Z(s) = R_f / (1 + s(R_fC_f + 1/ω_t) + s²·R_f(C_d + C_f)/ω_t)            (2nd-order low-pass)
//   ω_n = √(ω_t/(R_f C_in)), ζ = (R_fC_f + 1/ω_t)·ω_n/2, C_in = C_d + C_f.
//   Butterworth (ζ = 1/√2) feedback cap: C_f = √(2C_d/(R_f ω_t) − 1/(R_f ω_t)²) ≈ √(C_d/(π R_f GBW)).
//   With C_f dominant: f_3dB ≈ 1/(2π R_f C_f).
// Photoresistor (CdS): R(E) = R_10·(E/10 lux)^(−γ) in parallel with R_dark, γ ≈ 0.7 (GL55xx datasheets),
//   and slow first-order response: rise (to bright) τ ≈ 20 ms, decay τ ≈ 30 ms. Read out with a divider.

export type Source = 'green' | 'white' | 'sun';
export const SOURCES: Record<Source, { K: number; R: number; label: string }> = {
  green: { K: 683, R: 0.35, label: '555 nm green LED' },
  white: { K: 300, R: 0.30, label: 'White LED' },
  sun: { K: 93, R: 0.45, label: 'Sunlight' },
};

export type PdIn = { lux: number; source: Source; area: number /* m² */; idark: number; rf: number; cf: number; cd: number; gbw: number; vmax: number };

export function photocurrent(lux: number, source: Source, area: number, idark = 0) {
  const s = SOURCES[source] ?? SOURCES.green;
  const Ee = Math.max(0, lux) / s.K;          // W/m²
  const P = Ee * area;                         // W on the active area
  return { Ee, P, iph: s.R * P, itot: s.R * P + idark };
}

/** Denominator coefficients of Z(s)/R_f = 1/(1 + b·s + a·s²). */
export function tiaPoly(rf: number, cf: number, cd: number, gbw: number) {
  const wt = 2 * Math.PI * gbw;
  const a = rf * (cd + cf) / wt, b = rf * cf + 1 / wt;
  const wn = 1 / Math.sqrt(a), zeta = b * wn / 2;
  return { a, b, wn, zeta, fn: wn / (2 * Math.PI) };
}

export function tiaMag(f: number, rf: number, cf: number, cd: number, gbw: number) {
  const { a, b } = tiaPoly(rf, cf, cd, gbw); const w = 2 * Math.PI * f;
  const re = 1 - a * w * w, im = b * w; return rf / Math.hypot(re, im);
}

/** −3 dB bandwidth by bisection on the closed-form magnitude (handles peaking). */
export function tiaBandwidth(rf: number, cf: number, cd: number, gbw: number) {
  const target = rf / Math.SQRT2;
  let lo = 1e-3, hi = gbw * 10;
  if (tiaMag(hi, rf, cf, cd, gbw) > target) return hi;
  for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (tiaMag(m, rf, cf, cd, gbw) > target) lo = m; else hi = m; }
  // with peaking the magnitude can exceed target below the peak; bisection from above finds the last crossing
  return Math.sqrt(lo * hi);
}

export function butterworthCf(rf: number, cd: number, gbw: number) {
  const wt = 2 * Math.PI * gbw; const x = 2 * cd / (rf * wt) - 1 / (rf * wt) ** 2;
  return x > 0 ? Math.sqrt(x) : 0;
}

/** Normalised unit-step response of 1/(1 + b s + a s²). */
export function step2(t: number, a: number, b: number) {
  if (t <= 0) return 0;
  const wn = 1 / Math.sqrt(a), z = b * wn / 2;
  if (Math.abs(z - 1) < 1e-6) return 1 - (1 + wn * t) * Math.exp(-wn * t);
  if (z < 1) { const wd = wn * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + z / Math.sqrt(1 - z * z) * Math.sin(wd * t)); }
  const r = Math.sqrt(z * z - 1), p1 = wn * (-z + r), p2 = wn * (-z - r);
  return 1 + (p2 * Math.exp(p1 * t) - p1 * Math.exp(p2 * t)) / (p1 - p2);
}

export function overshoot(zeta: number) { return zeta >= 1 ? 0 : Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta * zeta)); }

/** 10–90 % rise time of a monotone-ish response sampled on a grid. */
export function riseTime(t: number[], y: number[], final = 1) {
  let t10 = NaN, t90 = NaN;
  for (let i = 1; i < t.length; i++) {
    const c = (lvl: number) => y[i - 1] < lvl && y[i] >= lvl ? t[i - 1] + (lvl - y[i - 1]) / (y[i] - y[i - 1]) * (t[i] - t[i - 1]) : NaN;
    if (isNaN(t10)) t10 = c(0.1 * final);
    if (isNaN(t90)) t90 = c(0.9 * final);
  }
  return t90 - t10;
}

export function pdTia(p: PdIn) {
  const ph = photocurrent(p.lux, p.source, p.area, p.idark);
  const vIdeal = ph.itot * p.rf;
  const vout = Math.min(p.vmax, vIdeal);
  const poly = tiaPoly(p.rf, p.cf, p.cd, p.gbw);
  const bw = tiaBandwidth(p.rf, p.cf, p.cd, p.gbw);
  const luxSat = (p.vmax / p.rf - p.idark) / ((SOURCES[p.source] ?? SOURCES.green).R * p.area) * (SOURCES[p.source] ?? SOURCES.green).K;
  return { ...ph, vIdeal, vout, clipped: vIdeal > p.vmax, ...poly, bw, os: overshoot(poly.zeta), cfButter: butterworthCf(p.rf, p.cd, p.gbw), fRC: p.cf > 0 ? 1 / (2 * Math.PI * p.rf * p.cf) : Infinity, luxSat };
}

export type LdrIn = { lux: number; r10: number; gamma: number; rdark: number; rfix: number; vcc: number; tauRise: number; tauFall: number };
export function ldrR(lux: number, r10: number, gamma: number, rdark: number) {
  const rl = lux > 0 ? r10 * (lux / 10) ** (-gamma) : Infinity;
  return isFinite(rl) ? rl * rdark / (rl + rdark) : rdark;
}
export function ldr(p: LdrIn) {
  const R = ldrR(p.lux, p.r10, p.gamma, p.rdark);
  const vout = p.vcc * p.rfix / (R + p.rfix);    // LDR on top, fixed resistor to ground → V rises with light
  return { R, vout, sens: -p.gamma * p.vcc * p.rfix * R / (R + p.rfix) ** 2 /* dV/dln(lux) */ };
}
/** LDR step dark → lux: log-resistance relaxes first-order with τ_rise; returns normalised output (V − V0)/(V∞ − V0). */
export function ldrStep(t: number, p: LdrIn) {
  const R0 = p.rdark, R1 = ldrR(p.lux, p.r10, p.gamma, p.rdark);
  const lr = Math.log(R1) + (Math.log(R0) - Math.log(R1)) * Math.exp(-Math.max(0, t) / p.tauRise);
  const v = (R: number) => p.vcc * p.rfix / (R + p.rfix);
  const v0 = v(R0), v1 = v(R1); return Math.abs(v1 - v0) < 1e-15 ? 1 : (v(Math.exp(lr)) - v0) / (v1 - v0);
}
