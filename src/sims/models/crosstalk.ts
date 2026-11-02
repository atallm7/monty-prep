// Crosstalk between two coupled traces (aggressor -> victim), weak-coupling transmission-line model.
// Coupling coefficients (microstrip, lossless, matched terminations), after Johnson & Graham "High-Speed Digital Design" ch.5
// and Bogatin "Signal & Power Integrity - Simplified" ch.13:
//   inductive coupling     kL = Lm/L  ~ 1/(1 + (s/h)^2)      (empirical fit; s = edge spacing, h = height above plane)
//   capacitive coupling    kC = Cm/C  ~ rho*kL               (rho = 1 homogeneous stripline, ~0.7 microstrip: inhomogeneous)
//   backward (near-end)    Kb = (kC + kL)/4                   NEXT(t) = Kb * [Va(t) - Va(t - 2*Td)]   (saturates for len >= tr*v/2)
//   forward  (far-end)     Kf = (kC - kL)/2                   FEXT(t) = Kf * Td * dVa/dt(t - Td)       (grows with len/tr, zero for stripline)
// A grounded, via-stitched guard trace between the lines is modelled as a fixed shielding factor on both coefficients.

export const C0 = 299792458;
export type XtIn = { spacing: number; h: number; len: number; tr: number; vagg?: number; er?: number; stripline?: boolean; guard?: boolean };

export const GUARD_FACTOR = 0.3;        // ~10 dB shielding for a well-stitched grounded guard
export const MICROSTRIP_RHO = 0.7;      // Cm/C relative to Lm/L in inhomogeneous microstrip
export const traceWidth = (h: number) => 1.8 * h; // ~50 ohm microstrip on FR-4 (w/h ~ 1.8)

/** Inductive coupling coefficient Lm/L vs spacing/height (mm units, ratio only). */
export const kLof = (s: number, h: number) => 1 / (1 + (s / Math.max(h, 1e-9)) ** 2);

export function epsEff(er: number, stripline: boolean) {
  if (stripline) return er;
  // Hammerstad: w/h = 1.8 for 50 ohm
  return (er + 1) / 2 + (er - 1) / 2 / Math.sqrt(1 + 12 / 1.8);
}

export function crosstalk(p: XtIn) {
  const er = p.er ?? 4.3, V = p.vagg ?? 1, strip = !!p.stripline;
  const guard = p.guard ? GUARD_FACTOR : 1;
  const kL = kLof(p.spacing, p.h) * guard;
  const kC = kL * (strip ? 1 : MICROSTRIP_RHO);
  const Kb = (kC + kL) / 4;
  const Kf = (kC - kL) / 2;
  const v = C0 / Math.sqrt(epsEff(er, strip));
  const Td = (p.len * 1e-3) / v;              // one-way delay
  const tfull = p.tr / 0.8;                    // 10-90% -> 0-100% linear ramp time
  const Lsat = (tfull * v / 2) * 1e3;          // mm: coupled length where NEXT saturates
  const nextFrac = Kb * Math.min(1, 2 * Td / tfull);
  const fextFrac = Kf * Td / tfull;
  return { kL, kC, Kb, Kf, v, Td, tfull, Lsat, saturated: p.len >= Lsat, next: nextFrac * V, fext: fextFrac * V, nextFrac, fextFrac, V, w: traceWidth(p.h), threeW: 2 * traceWidth(p.h) };
}

/** Time-domain waveforms (seconds, volts). */
export function waveforms(p: XtIn, n = 400) {
  const c = crosstalk(p); const { Td, tfull, V, Kb, Kf } = c;
  const t0 = -0.25 * tfull, t1 = 2 * Td + 1.6 * tfull + 0.25 * tfull;
  const va = (t: number) => V * Math.min(1, Math.max(0, t / tfull));
  const t: number[] = [], a: number[] = [], nx: number[] = [], fx: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = t0 + (t1 - t0) * i / (n - 1);
    t.push(x); a.push(va(x));
    nx.push(Kb * (va(x) - va(x - 2 * Td)));
    const tt = x - Td; fx.push(tt >= 0 && tt <= tfull ? Kf * Td * V / tfull : 0);
  }
  return { t, va: a, next: nx, fext: fx };
}
