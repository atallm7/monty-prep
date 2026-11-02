// Karnaugh map + Quine-McCluskey minimiser for 2-4 variables.
// - Variables are named A (MSB) ... D (LSB); minterm index m = sum(bit_i * 2^(n-1-i)).
// - K-map axes use Gray code (00, 01, 11, 10) so physically adjacent cells differ in exactly one variable,
//   including wrap-around at the edges (the map is a torus).
// - Prime implicants by Quine-McCluskey tabulation (combine cubes differing in one bit, repeat; uncombined
//   cubes are prime). Essential primes cover a minterm no other prime covers. The minimum cover is found
//   exactly (branch and bound over primes: fewest terms, then fewest literals), which equals Petrick's method.
// - Minimal POS: minimise the complement F' (its ON-set is F's zeros; don't-cares are shared), then apply
//   De Morgan: F = (F')' turns each product term of F' into a sum term with every literal complemented.
// - Gate count (two-level, 2-input-equivalent not assumed): one AND per product term with >= 2 literals,
//   one OR if >= 2 terms, plus one inverter per distinct complemented variable (if complements aren't free).

export type Cell = 0 | 1 | 'X';
export type Cube = { value: number; mask: number };
export const VARS = ['A', 'B', 'C', 'D'];
export const GRAY = (bits: number) => bits === 0 ? [0] : bits === 1 ? [0, 1] : [0, 1, 3, 2];

const popcount = (x: number) => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };
export const covers = (c: Cube, m: number) => (m & ~c.mask) === c.value;
export const literalCount = (nv: number, c: Cube) => nv - popcount(c.mask & ((1 << nv) - 1));

export function primeImplicants(on: number[], dc: number[]): Cube[] {
  let cur: Cube[] = [...new Set([...on, ...dc])].sort((a, b) => a - b).map(v => ({ value: v, mask: 0 }));
  const primes = new Map<string, Cube>();
  while (cur.length) {
    const used = new Set<number>(); const next = new Map<string, Cube>();
    for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) {
      const a = cur[i], b = cur[j]; if (a.mask !== b.mask) continue;
      const d = a.value ^ b.value; if (popcount(d) !== 1) continue;
      used.add(i); used.add(j); const c = { value: a.value & ~d, mask: a.mask | d }; next.set(`${c.value}/${c.mask}`, c);
    }
    cur.forEach((c, i) => { if (!used.has(i)) primes.set(`${c.value}/${c.mask}`, c); });
    cur = [...next.values()];
  }
  // primes that cover only don't-cares are useless for the cover; keep them in the list but flag via usefulness later
  return [...primes.values()];
}

export function essentialPrimes(primes: Cube[], on: number[]): Cube[] {
  const ess = new Set<Cube>();
  for (const m of on) { const cs = primes.filter(p => covers(p, m)); if (cs.length === 1) ess.add(cs[0]); }
  return [...ess];
}

/** Exact minimum cover of `on` using `primes` (fewest terms, then fewest literals). */
export function minimumCover(nv: number, primes: Cube[], on: number[]): Cube[] {
  if (!on.length) return [];
  const cost = (s: Cube[]) => s.length * 100 + s.reduce((a, c) => a + literalCount(nv, c), 0);
  let best: Cube[] | null = null; let bestCost = Infinity;
  const rec = (left: number[], chosen: Cube[], avail: Cube[]) => {
    const cc = cost(chosen); if (cc >= bestCost) return;
    if (!left.length) { best = [...chosen]; bestCost = cc; return; }
    let pick = left[0], cands = avail.filter(p => covers(p, pick));
    for (const m of left) { const cs = avail.filter(p => covers(p, m)); if (cs.length < cands.length) { pick = m; cands = cs; } }
    cands.sort((a, b) => literalCount(nv, a) - literalCount(nv, b));
    for (const p of cands) rec(left.filter(m => !covers(p, m)), [...chosen, p], avail.filter(q => q !== p));
  };
  rec([...on], [], primes);
  return best ?? [];
}

export function productTerm(nv: number, c: Cube): string {
  const parts: string[] = [];
  for (let i = 0; i < nv; i++) { const bit = 1 << (nv - 1 - i); if (c.mask & bit) continue; parts.push(c.value & bit ? VARS[i] : VARS[i] + "'"); }
  return parts.length ? parts.join('') : '1';
}
/** Sum term for POS: a product term P of F' becomes (P)' = sum of complemented literals. */
export function sumTermFromComplement(nv: number, c: Cube): string {
  const parts: string[] = [];
  for (let i = 0; i < nv; i++) { const bit = 1 << (nv - 1 - i); if (c.mask & bit) continue; parts.push(c.value & bit ? VARS[i] + "'" : VARS[i]); }
  return parts.length ? '(' + parts.join(' + ') + ')' : '0';
}

export type Minimised = {
  on: number[]; off: number[]; dc: number[];
  primes: Cube[]; essential: Cube[]; sop: Cube[]; sopStr: string;
  posCubes: Cube[]; posStr: string;
  sopLiterals: number; posLiterals: number; sopGates: GateCount; posGates: GateCount;
};
export type GateCount = { and: number; or: number; not: number; total: number };

function gates(nv: number, terms: Cube[], pos: boolean): GateCount {
  // SOP: AND per multi-literal term, OR to combine. POS: OR per multi-literal sum, AND to combine.
  const multi = terms.filter(t => literalCount(nv, t) >= 2).length;
  const comp = new Set<number>();
  for (const t of terms) for (let i = 0; i < nv; i++) { const bit = 1 << (nv - 1 - i); if (t.mask & bit) continue; const complemented = pos ? !!(t.value & bit) : !(t.value & bit); if (complemented) comp.add(i); }
  const combine = terms.length >= 2 ? 1 : 0;
  const and = pos ? combine : multi, or = pos ? multi : combine;
  return { and, or, not: comp.size, total: and + or + comp.size };
}

export function minimise(nv: number, cells: Cell[]): Minimised {
  const on: number[] = [], off: number[] = [], dc: number[] = [];
  cells.slice(0, 1 << nv).forEach((v, i) => (v === 1 ? on : v === 0 ? off : dc).push(i));
  const primes = primeImplicants(on, dc).filter(p => on.some(m => covers(p, m)));
  const essential = essentialPrimes(primes, on);
  const sop = minimumCover(nv, primes, on);
  const sopStr = on.length === 0 ? '0' : sop.map(c => productTerm(nv, c)).join(' + ');
  const nprimes = primeImplicants(off, dc).filter(p => off.some(m => covers(p, m)));
  const posCubes = minimumCover(nv, nprimes, off);
  const posStr = off.length === 0 ? '1' : posCubes.map(c => sumTermFromComplement(nv, c)).join('');
  return {
    on, off, dc, primes, essential, sop, sopStr, posCubes, posStr,
    sopLiterals: sop.reduce((a, c) => a + literalCount(nv, c), 0), posLiterals: posCubes.reduce((a, c) => a + literalCount(nv, c), 0),
    sopGates: on.length && off.length ? gates(nv, sop, false) : { and: 0, or: 0, not: 0, total: 0 },
    posGates: on.length && off.length ? gates(nv, posCubes, true) : { and: 0, or: 0, not: 0, total: 0 },
  };
}

/** Evaluate a cover (SOP) at minterm m. */
export const evalSOP = (cover: Cube[], m: number) => cover.some(c => covers(c, m));
export const evalPOS = (posCubes: Cube[], m: number) => !posCubes.some(c => covers(c, m));

/** K-map layout: row variables are the high bits, column variables the low bits. */
export function layout(nv: number) {
  const rowBits = nv >> 1, colBits = nv - rowBits; // 2 -> 1x1 bits, 3 -> 1 row bit (A) x 2 col bits (BC), 4 -> 2x2
  const rows = GRAY(rowBits), cols = GRAY(colBits);
  const minterm = (r: number, c: number) => (rows[r] << colBits) | cols[c];
  return { rowBits, colBits, rows, cols, minterm, rowVars: VARS.slice(0, rowBits).join(''), colVars: VARS.slice(rowBits, nv).join('') };
}

/** Rectangles (in cell coordinates) that draw a cube on the K-map; wrap-around groups split into pieces. */
export function cubeRects(nv: number, c: Cube): { r0: number; r1: number; c0: number; c1: number }[] {
  const L = layout(nv);
  const rowIdx = L.rows.map((_, r) => r).filter(r => L.cols.some((_, k) => covers(c, L.minterm(r, k))));
  const colIdx = L.cols.map((_, k) => k).filter(k => L.rows.some((_, r) => covers(c, L.minterm(r, k))));
  const runs = (idx: number[]) => { const out: [number, number][] = []; for (const i of idx) { const last = out[out.length - 1]; if (last && last[1] === i - 1) last[1] = i; else out.push([i, i]); } return out; };
  const out: { r0: number; r1: number; c0: number; c1: number }[] = [];
  for (const [r0, r1] of runs(rowIdx)) for (const [c0, c1] of runs(colIdx)) out.push({ r0, r1, c0, c1 });
  return out;
}

export function cellsFrom(nv: number, minterms: number[], dontcares: number[]): Cell[] {
  const n = 1 << nv; const cells: Cell[] = Array(n).fill(0);
  for (const m of dontcares) if (m >= 0 && m < n) cells[m] = 'X';
  for (const m of minterms) if (m >= 0 && m < n) cells[m] = 1;
  return cells;
}
