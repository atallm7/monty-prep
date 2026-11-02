// Ohm's law model.  V = I·R (Georg Ohm, 1827), P = V·I = I²R = V²/R (Joule heating).
// The learner picks which quantity is the unknown; the other two are inputs.
export type Solve = 'I' | 'V' | 'R';
export type OhmIn = { solve: Solve; v: number; i: number; r: number };
export type OhmOut = { v: number; i: number; r: number; p: number; g: number; ok: boolean; note?: string };

/** Solve Ohm's law for the selected unknown. Handles 0/∞ without producing NaN. */
export function ohm({ solve, v, i, r }: OhmIn): OhmOut {
  let V = v, I = i, R = r; let ok = true; let note: string | undefined;
  if (solve === 'I') {
    if (R <= 0) { I = V === 0 ? 0 : Infinity * Math.sign(V); ok = false; note = 'R = 0 is a short circuit: I → ∞'; }
    else I = V / R;
  } else if (solve === 'V') {
    V = I * R;
  } else {
    if (I === 0) { R = Infinity; ok = V === 0 ? false : true; note = 'I = 0 means an open circuit: R → ∞'; }
    else R = V / I;
  }
  const p = isFinite(V) && isFinite(I) ? V * I : Infinity;
  const g = R === 0 ? Infinity : 1 / R;
  return { v: V, i: I, r: R, p, g, ok, note };
}

/** Three equivalent forms of Joule power; all must agree for a resistor. */
export function powerForms(v: number, i: number, r: number) {
  return { vi: v * i, i2r: i * i * r, v2r: r > 0 ? (v * v) / r : Infinity };
}

/** Standard resistor power ratings (W) and the smallest that survives P with a 2x derating margin. */
export const RATINGS = [0.125, 0.25, 0.5, 1, 2, 5, 10];
export function ratingFor(p: number, margin = 2) {
  const need = Math.abs(p) * margin;
  return RATINGS.find(w => w >= need) ?? null;
}
