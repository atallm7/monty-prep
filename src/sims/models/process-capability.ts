// Process capability model.
//   Cp  = (USL − LSL) / (6σ)
//   Cpk = min(USL − μ, μ − LSL) / (3σ)
//   Z   = 3·Cpk  (sigma level to the nearest spec limit)
//   Out-of-spec fraction = Φ((LSL−μ)/σ) + 1 − Φ((USL−μ)/σ);  long-term: mean shifted by `shift`·σ toward the nearer limit.
//   X-bar chart: subgroup mean of n samples ~ N(μ, σ/√n), limits CL ± 3σ/√n.

/** Complementary error function, Numerical Recipes erfcc (fractional error < 1.2e-7 everywhere, good in tails). */
export function erfc(x: number) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
/** Standard normal CDF */
export const Phi = (z: number) => 0.5 * erfc(-z / Math.SQRT2);
export const pdf = (x: number, mu: number, s: number) => Math.exp(-0.5 * ((x - mu) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

export type CapIn = { mu: number; sigma: number; lsl: number; usl: number; shift: number };
export function capability({ mu, sigma, lsl, usl, shift }: CapIn) {
  const s = Math.max(sigma, 1e-9);
  const cp = (usl - lsl) / (6 * s);
  const cpu = (usl - mu) / (3 * s), cpl = (mu - lsl) / (3 * s);
  const cpk = Math.min(cpu, cpl);
  const tail = (m: number) => ({ lo: Phi((lsl - m) / s), hi: 1 - Phi((usl - m) / s) });
  const st = tail(mu);
  // Long-term: drift the mean `shift`·σ toward the nearer limit (worst case)
  const dir = cpu < cpl ? 1 : -1;
  const lt = tail(mu + dir * shift * s);
  return { cp, cpk, cpu, cpl, sigmaLevel: 3 * cpk, stFrac: st.lo + st.hi, stLo: st.lo, stHi: st.hi, ppm: (st.lo + st.hi) * 1e6, ltFrac: lt.lo + lt.hi, ppmLT: (lt.lo + lt.hi) * 1e6, centered: Math.abs(cp - cpk) < 1e-9 };
}

/** Deterministic standard normals (mulberry32 + Box–Muller) */
export function normals(seed: number, n: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296; };
  const out: number[] = [];
  while (out.length < n) { const r = Math.sqrt(-2 * Math.log(u())), th = 2 * Math.PI * u(); out.push(r * Math.cos(th)); if (out.length < n) out.push(r * Math.sin(th)); }
  return out;
}
/** Mean of subgroup k (size n) in standard-normal units, reproducible from seed. */
export function subgroupZ(seed: number, k: number, n: number) { const z = normals(seed * 100003 + k * 7919 + 1, n); return z.reduce((a, b) => a + b, 0) / n; }
export const xbarLimits = (mu0: number, sigma0: number, n: number) => { const se = sigma0 / Math.sqrt(n); return { cl: mu0, ucl: mu0 + 3 * se, lcl: mu0 - 3 * se, se }; };
