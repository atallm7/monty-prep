// Skin effect.  Skin depth  delta = sqrt(rho / (pi f mu))  (mu = mu0 for Cu, Al, Au, Ag; non-magnetic).
// Round wire radius a: exact internal impedance per unit length (Bessel, Ramo/Whinnery/Van Duzer, Fields & Waves 3rd ed. eq 3.18):
//   Zint = rho/(2 pi a) * (k a) J0(k a) / J1(k a),   k = (1 - j)/delta      -> Rdc = rho/(pi a^2) as f -> 0
//   large a/delta asymptote: Rac/Rdc ~ a/(2 delta) + 1/4 (+ 3 delta/(32 a)).
// Current density profile in the wire: J(r)/J(a) = J0(k r)/J0(k a)  (complex: magnitude and phase lag both vary with depth).
// Rectangular trace w x t (isolated conductor, current on all four faces): conduction area
//   A_eff = w t - max(0, w - 2 delta) * max(0, t - 2 delta),  Rac = rho / A_eff  (-> w t at DC, 2 delta (w+t) when delta << t).
export const MU0 = 4e-7 * Math.PI;
export type Material = 'cu' | 'al' | 'au' | 'ag';
export const MATERIALS: Record<Material, { name: string; rho: number }> = {
  cu: { name: 'Copper', rho: 1.68e-8 }, al: { name: 'Aluminium', rho: 2.65e-8 }, au: { name: 'Gold', rho: 2.44e-8 }, ag: { name: 'Silver', rho: 1.59e-8 },
};
export const skinDepth = (rho: number, f: number) => Math.sqrt(rho / (Math.PI * Math.max(f, 1e-9) * MU0));

type C = [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
/** Bessel J0, J1 of complex argument by power series (fine for |z| <~ 20). */
export function besselJ01(z: C): { j0: C; j1: C } {
  const q = cmul(z, z); const w: C = [-q[0] / 4, -q[1] / 4];
  let t0: C = [1, 0], t1: C = [0.5 * z[0], 0.5 * z[1]]; // m=0 terms
  let j0: C = [1, 0], j1: C = [t1[0], t1[1]];
  for (let m = 1; m < 80; m++) {
    t0 = cmul(t0, w); t0 = [t0[0] / (m * m), t0[1] / (m * m)];
    t1 = cmul(t1, w); t1 = [t1[0] / (m * (m + 1)), t1[1] / (m * (m + 1))];
    j0 = [j0[0] + t0[0], j0[1] + t0[1]]; j1 = [j1[0] + t1[0], j1[1] + t1[1]];
    if (Math.abs(t0[0]) + Math.abs(t0[1]) + Math.abs(t1[0]) + Math.abs(t1[1]) < 1e-18 * (Math.abs(j0[0]) + 1)) break;
  }
  return { j0, j1 };
}
const EXACT_LIMIT = 7; // a/delta above which the asymptotic series is used

/** Rac/Rdc of a round wire, x = a/delta. */
export function wireRatio(x: number) {
  if (x < 1e-6) return 1;
  if (x > EXACT_LIMIT) return x / 2 + 0.25 + 3 / (64 * x) * 1; // asymptotic series
  const z: C = [x, -x]; // k a = (1 - j) a/delta
  const { j0, j1 } = besselJ01(z);
  const zz = cmul(z, cdiv(j0, j1)); // (ka) J0/J1  -> 2 at DC
  return zz[0] / 2;
}
/** Complex current density J(r)/J(a) magnitude and phase (rad) at normalized radius u = r/a, x = a/delta. */
export function wireProfile(u: number, x: number): { mag: number; phase: number } {
  const s = x * u; // |k r| / sqrt2
  if (x <= EXACT_LIMIT) {
    const a = besselJ01([x, -x]).j0, r = besselJ01([s, -s]).j0; const q = cdiv(r, a);
    return { mag: Math.hypot(q[0], q[1]), phase: Math.atan2(q[1], q[0]) };
  }
  // surface value by asymptote: J0((1-j)x) ~ sqrt(2/(pi sqrt2 x)) e^{x}/2 * e^{j(x - pi/8)}
  const dMag = Math.sqrt(2 / (Math.PI * Math.SQRT2 * x)) * Math.exp(x) / 2, dPh = x - Math.PI / 8;
  if (s <= EXACT_LIMIT) { const r = besselJ01([s, -s]).j0; return { mag: Math.hypot(r[0], r[1]) / dMag, phase: Math.atan2(r[1], r[0]) - dPh }; }
  return { mag: Math.sqrt(x / s) * Math.exp(s - x), phase: s - x }; // both asymptotic: sqrt(a/r) e^{-(a-r)/delta}, phase lag (a-r)/delta
}

export type Shape = 'wire' | 'trace';
export type SkinIn = { material: Material; f: number; shape: Shape; diam: number /*m*/; w: number /*m*/; t: number /*m*/; len: number /*m*/ };

export function analyze(p: SkinIn) {
  const rho = MATERIALS[p.material].rho, d = skinDepth(rho, p.f);
  let rdc: number, rac: number, area: number, areaEff: number;
  if (p.shape === 'wire') {
    const a = p.diam / 2; area = Math.PI * a * a; rdc = rho * p.len / area;
    rac = rdc * wireRatio(a / d);
    areaEff = rho * p.len / rac;
  } else {
    area = p.w * p.t; rdc = rho * p.len / area;
    areaEff = area - Math.max(0, p.w - 2 * d) * Math.max(0, p.t - 2 * d);
    rac = rho * p.len / areaEff;
  }
  // frequency at which delta equals the conductor's half-thickness (skin effect starts to matter)
  const half = p.shape === 'wire' ? p.diam / 2 : Math.min(p.w, p.t) / 2;
  const fKnee = rho / (Math.PI * MU0 * half * half);
  return { delta: d, rdc, rac, ratio: rac / rdc, area, areaEff, fKnee, half, x: half / d };
}
