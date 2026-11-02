// Power-distribution-network (PDN) impedance seen by an IC at its supply pins.
//
// Each capacitor is a series R-L-C:  Z_cap = ESR + jω(ESL + L_mount) + 1/(jωC)
//   (L_mount = pad + trace + via loop inductance; it usually exceeds the part's own ESL).
// N identical caps in parallel:      Z_group = Z_cap / N
// VRM (regulator) output:            Z_vrm = R_vrm + jω·L_vrm  (its loop gain runs out above ~100 kHz,
//                                     so it looks like a small resistance in series with an inductance)
// Everything is in parallel at the IC: Z_pdn = 1 / Σ (1/Z_k)
// Target impedance (Smith / Novak):   Z_target = V_dd · ripple% / ΔI_transient
// Anti-resonance between a larger cap group (inductive above its SRF, L1) and a smaller one
// (still capacitive, C2):  f_ar ≈ 1/(2π√(L1·C2)),  |Z_peak| ≈ (L1/C2) / (R1 + R2)   (high-Q approximation).

export type Group = { name: string; c: number; n: number; esr: number; esl: number; lmnt: number; on: boolean };
export type Vrm = { r: number; l: number; on: boolean };
export type Pdn = { vrm: Vrm; groups: Group[] };
type Cx = { re: number; im: number };

const W = (f: number) => 2 * Math.PI * f;

/** Impedance of one group of N identical capacitors. */
export function zGroup(g: Group, f: number): Cx {
  const w = W(f), n = Math.max(1, g.n);
  return { re: g.esr / n, im: (w * (g.esl + g.lmnt) - 1 / (w * g.c)) / n };
}
export function zVrm(v: Vrm, f: number): Cx { return { re: v.r, im: W(f) * v.l }; }

const invC = (z: Cx): Cx => { const d = z.re * z.re + z.im * z.im; return { re: z.re / d, im: -z.im / d }; };
export const magC = (z: Cx) => Math.hypot(z.re, z.im);

/** Total PDN impedance at f. */
export function zPdn(p: Pdn, f: number): Cx {
  let yr = 0, yi = 0;
  const addZ = (z: Cx) => { const y = invC(z); yr += y.re; yi += y.im; };
  if (p.vrm.on) addZ(zVrm(p.vrm, f));
  for (const g of p.groups) if (g.on && g.n > 0 && g.c > 0) addZ(zGroup(g, f));
  if (yr === 0 && yi === 0) return { re: Infinity, im: 0 };
  return invC({ re: yr, im: yi });
}

/** Series self-resonance of one cap (same for the group). */
export const srfOf = (g: Group) => 1 / (2 * Math.PI * Math.sqrt((g.esl + g.lmnt) * g.c));

export function sweep(p: Pdn, f0: number, f1: number, n = 500) {
  const la = Math.log10(f0), lb = Math.log10(f1);
  const f: number[] = [], z: number[] = [];
  for (let i = 0; i < n; i++) { const x = 10 ** (la + (lb - la) * i / (n - 1)); f.push(x); z.push(magC(zPdn(p, x))); }
  return { f, z };
}

/** Golden-section refine of a local extreme of |Z| between a and b (log-f). */
function refine(p: Pdn, a: number, b: number, max: boolean) {
  let la = Math.log(a), lb = Math.log(b); const g = (Math.sqrt(5) - 1) / 2;
  const val = (lf: number) => (max ? -1 : 1) * magC(zPdn(p, Math.exp(lf)));
  let c = lb - g * (lb - la), d = la + g * (lb - la);
  for (let i = 0; i < 60; i++) { if (val(c) < val(d)) lb = d; else la = c; c = lb - g * (lb - la); d = la + g * (lb - la); }
  const f = Math.exp((la + lb) / 2); return { f, z: magC(zPdn(p, f)) };
}

/** Local maxima (anti-resonances) and minima (series resonances) of |Z_pdn| inside (f0, f1). */
export function extremes(p: Pdn, f0: number, f1: number, n = 1500) {
  const { f, z } = sweep(p, f0, f1, n);
  const peaks: { f: number; z: number }[] = [], dips: { f: number; z: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (z[i] > z[i - 1] && z[i] >= z[i + 1]) peaks.push(refine(p, f[i - 1], f[i + 1], true));
    if (z[i] < z[i - 1] && z[i] <= z[i + 1]) dips.push(refine(p, f[i - 1], f[i + 1], false));
  }
  return { peaks, dips };
}

/** Frequency intervals where |Z| exceeds the target (from a dense sweep). */
export function violations(p: Pdn, zt: number, f0: number, f1: number, n = 1500) {
  const { f, z } = sweep(p, f0, f1, n);
  const out: { from: number; to: number; worst: number }[] = [];
  let cur: { from: number; to: number; worst: number } | null = null;
  for (let i = 0; i < n; i++) {
    if (z[i] > zt) { if (!cur) cur = { from: f[i], to: f[i], worst: z[i] }; cur.to = f[i]; cur.worst = Math.max(cur.worst, z[i]); }
    else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

/** Highest frequency up to which |Z| ≤ target continuously from f0 (0 if it fails at f0). */
export function meetsUpTo(p: Pdn, zt: number, f0: number, f1: number) {
  const v = violations(p, zt, f0, f1);
  if (!v.length) return Infinity;
  return v[0].from <= f0 * 1.0001 ? 0 : v[0].from;
}

export const totalC = (p: Pdn) => p.groups.reduce((s, g) => s + (g.on ? g.c * g.n : 0), 0);
/** High-frequency limit: all cap inductances in parallel. */
export function hfInductance(p: Pdn) {
  let y = 0; for (const g of p.groups) if (g.on && g.n > 0) y += g.n / (g.esl + g.lmnt);
  return y > 0 ? 1 / y : Infinity;
}

// ---- presets -------------------------------------------------------------------------------
export const BULK: Group = { name: 'Bulk', c: 220e-6, n: 1, esr: 0.01, esl: 2e-9, lmnt: 3e-9, on: true };
const cap = (name: string, c: number, n: number, esr: number, esl: number, lmnt: number, on = true): Group => ({ name, c, n, esr, esl, lmnt, on });
export const VRM: Vrm = { r: 1e-3, l: 20e-9, on: true };

export type PresetId = 'single' | 'many-same' | 'mixed' | 'far-placement';
export function preset(id: PresetId): Pdn {
  switch (id) {
    case 'single': return { vrm: { ...VRM }, groups: [{ ...BULK }, cap('A', 100e-9, 1, 0.02, 0.4e-9, 0.6e-9), cap('B', 1e-6, 0, 0.008, 0.5e-9, 0.6e-9, false), cap('C', 10e-6, 0, 0.003, 0.8e-9, 0.6e-9, false)] };
    case 'many-same': return { vrm: { ...VRM }, groups: [{ ...BULK }, cap('A', 100e-9, 20, 0.02, 0.4e-9, 0.6e-9), cap('B', 1e-6, 0, 0.008, 0.5e-9, 0.6e-9, false), cap('C', 10e-6, 0, 0.003, 0.8e-9, 0.6e-9, false)] };
    case 'far-placement': return { vrm: { ...VRM }, groups: [{ ...BULK }, cap('A', 100e-9, 10, 0.02, 0.4e-9, 3e-9), cap('B', 1e-6, 6, 0.008, 0.5e-9, 3e-9), cap('C', 10e-6, 4, 0.003, 0.8e-9, 3e-9)] };
    case 'mixed': default: return { vrm: { ...VRM }, groups: [{ ...BULK }, cap('A', 100e-9, 10, 0.02, 0.4e-9, 0.6e-9), cap('B', 1e-6, 6, 0.008, 0.5e-9, 0.6e-9), cap('C', 10e-6, 4, 0.003, 0.8e-9, 0.6e-9)] };
  }
}
