// Memory hierarchy / AMAT.
// With local miss rates m_i = 1 − hit_i (the fraction of accesses reaching level i that miss there):
//   AMAT = t1 + m1(t2 + m2(t3 + m3·tDRAM))
// Time per access spent at each level: L1: t1,  L2: m1·t2,  L3: m1·m2·t3,  DRAM: m1·m2·m3·tDRAM  (sum = AMAT).
// A TLB miss adds  tlbMiss × tlbPenalty  cycles per access.
// CPI_eff = CPI_base + loads × (AMAT − t1)   (the L1 hit latency is assumed overlapped in the pipeline's base CPI).
// Working-set sweep (uniform random access, inclusive caches): global hit fraction through level i is H_i = min(1, C_i/W),
// local hit_i = (H_i − H_{i−1}) / (1 − H_{i−1}).
export type MemIn = { l1hit: number; l2hit: number; l3hit: number; l1: number; l2: number; l3: number; dram: number };
const cl = (x: number) => Math.min(1, Math.max(0, x));

export function amat(m: MemIn) {
  const m1 = 1 - cl(m.l1hit), m2 = 1 - cl(m.l2hit), m3 = 1 - cl(m.l3hit);
  return m.l1 + m1 * (m.l2 + m2 * (m.l3 + m3 * m.dram));
}

export function breakdown(m: MemIn, tlbMiss = 0, tlbPenalty = 0) {
  const m1 = 1 - cl(m.l1hit), m2 = 1 - cl(m.l2hit), m3 = 1 - cl(m.l3hit);
  const time = { l1: m.l1, l2: m1 * m.l2, l3: m1 * m2 * m.l3, dram: m1 * m2 * m3 * m.dram, tlb: cl(tlbMiss) * tlbPenalty };
  const cache = time.l1 + time.l2 + time.l3 + time.dram;
  const total = cache + time.tlb;
  // fraction of accesses served at each level (global)
  const served = { l1: 1 - m1, l2: m1 * (1 - m2), l3: m1 * m2 * (1 - m3), dram: m1 * m2 * m3 };
  return { time, cache, total, served };
}

export const cpi = (base: number, loads: number, amatCycles: number, t1: number) => base + loads * Math.max(0, amatCycles - t1);

/** Local hit rates implied by a working set W and capacities (bytes). */
export function hitsFromWorkingSet(W: number, c1: number, c2: number, c3: number) {
  const H1 = Math.min(1, c1 / W), H2 = Math.min(1, Math.max(c2, c1) / W), H3 = Math.min(1, Math.max(c3, c2, c1) / W);
  const loc = (H: number, Hp: number) => (Hp >= 1 ? 1 : (H - Hp) / (1 - Hp));
  return { l1hit: H1, l2hit: loc(H2, H1), l3hit: loc(H3, H2), H: [H1, H2, H3] };
}
