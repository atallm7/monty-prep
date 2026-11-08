// Wafer map & die yield model.
// Gross dies: dies are placed on a rectangular grid; a die counts only if all four corners lie inside the
// usable circle of radius R = wafer/2 - edge. We try several grid phase offsets and keep the best.
// Yield models (A = die area in cm², D0 in defects/cm²):
//   Poisson          Y = exp(-A·D0)
//   Murphy           Y = ((1 - exp(-A·D0)) / (A·D0))²
//   Negative binomial Y = (1 + A·D0/α)^(-α)
// Cost per good die = wafer cost / (gross dies · yield).
export type Die = { cx: number; cy: number; x0: number; y0: number; w: number; h: number };
export type Layout = { dies: Die[]; R: number; offX: number; offY: number };

export function layoutDies(wafer: number, dieW: number, dieH: number, edge: number): Layout {
  const R = Math.max(0, wafer / 2 - edge);
  let best: Layout = { dies: [], R, offX: 0, offY: 0 };
  if (!(dieW > 0 && dieH > 0) || R <= 0) return best;
  const phases = [0, 0.5];
  for (const px of phases) for (const py of phases) {
    // grid line positions: x = (i + px)·dieW  -> px=0.5 puts a die centred on the wafer centre
    const dies: Die[] = [];
    const nx = Math.ceil(R / dieW) + 1, ny = Math.ceil(R / dieH) + 1;
    for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) {
      const x0 = (i + px - 0.5) * dieW, y0 = (j + py - 0.5) * dieH;
      const x1 = x0 + dieW, y1 = y0 + dieH;
      const far = Math.max(Math.hypot(x0, y0), Math.hypot(x1, y0), Math.hypot(x0, y1), Math.hypot(x1, y1));
      if (far <= R + 1e-9) dies.push({ x0, y0, w: dieW, h: dieH, cx: x0 + dieW / 2, cy: y0 + dieH / 2 });
    }
    if (dies.length > best.dies.length) best = { dies, R, offX: px, offY: py };
  }
  return best;
}

/** Common closed-form approximation for comparison: π(d/2)²/A − πd/√(2A) with d = usable diameter */
export const grossApprox = (wafer: number, edge: number, A: number) => { const d = wafer - 2 * edge; return Math.PI * d * d / (4 * A) - Math.PI * d / Math.sqrt(2 * A); };

export const yPoisson = (A: number, D0: number) => Math.exp(-A * D0);
export const yMurphy = (A: number, D0: number) => { const x = A * D0; return x < 1e-9 ? 1 : ((1 - Math.exp(-x)) / x) ** 2; };
export const yNegBin = (A: number, D0: number, alpha: number) => Math.pow(1 + (A * D0) / Math.max(alpha, 1e-6), -Math.max(alpha, 1e-6));

/** Deterministic PRNG (mulberry32) */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function poisson(rand: () => number, mean: number) {
  if (mean > 60) { // normal approximation for large means
    const u = Math.max(rand(), 1e-12), v = rand();
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
  }
  const L = Math.exp(-mean); let k = 0, p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

/** Random point defects: Poisson count with mean D0·(usable area), placed uniformly in the usable disc (x,y in mm). */
export function scatterDefects(R: number, D0: number, seed: number) {
  const rand = rng(seed);
  const areaCm2 = Math.PI * R * R / 100;
  const n = poisson(rand, D0 * areaCm2);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) { const r = R * Math.sqrt(rand()), th = 2 * Math.PI * rand(); pts.push({ x: r * Math.cos(th), y: r * Math.sin(th) }); }
  return pts;
}

export type WaferIn = { wafer: number; dieW: number; dieH: number; D0: number; alpha: number; waferCost: number; edge: number; seed: number };
export function waferYield(p: WaferIn) {
  const lay = layoutDies(p.wafer, p.dieW, p.dieH, p.edge);
  const A = p.dieW * p.dieH / 100; // cm²
  const defects = scatterDefects(lay.R, p.D0, p.seed);
  const bad = new Set<number>();
  for (const d of defects) {
    for (let k = 0; k < lay.dies.length; k++) { const s = lay.dies[k]; if (d.x >= s.x0 && d.x < s.x0 + s.w && d.y >= s.y0 && d.y < s.y0 + s.h) { bad.add(k); break; } }
  }
  const gross = lay.dies.length, good = gross - bad.size;
  const yP = yPoisson(A, p.D0), yM = yMurphy(A, p.D0), yN = yNegBin(A, p.D0, p.alpha);
  const cost = (y: number) => (gross * y > 0 ? p.waferCost / (gross * y) : Infinity);
  return { lay, A, defects, bad, gross, good, simYield: gross ? good / gross : 0, yP, yM, yN, costP: cost(yP), costM: cost(yM), costN: cost(yN), costSim: good > 0 ? p.waferCost / good : Infinity };
}
