// Set-associative cache simulator (Hennessy & Patterson, CA:AQA App. B; Hill's 3C miss model).
//  sets = lines / ways; offset bits = log2(block); index bits = log2(sets); tag bits = A - index - offset.
//  address -> offset = a mod B, index = floor(a / B) mod sets, tag = floor(a / (B·sets)).
//  Replacement: LRU (evict least-recently used way) or FIFO (evict oldest fill).
//  3C classification: compulsory = first reference to a block; capacity = also misses in a fully
//  associative LRU cache with the same number of lines; conflict = the remaining misses.
//  AMAT = t_hit + miss_rate · miss_penalty.

export type TraceId = 'sequential' | 'stride' | 'conflict' | 'custom';
export type Repl = 'lru' | 'fifo';
export type CacheCfg = { lines: number; ways: number; block: number; addrBits?: number; repl?: Repl };
export type Way = { valid: boolean; tag: number; lastUse: number; filled: number };
export type Access = {
  addr: number; tag: number; index: number; offset: number; hit: boolean; way: number;
  evicted?: { tag: number; blockAddr: number }; kind?: 'compulsory' | 'capacity' | 'conflict'; snapshot: Way[][];
};

const isPow2 = (x: number) => x > 0 && (x & (x - 1)) === 0;
export const log2i = (x: number) => Math.round(Math.log2(x));

export function normalize(c: CacheCfg): Required<CacheCfg> {
  const pow2 = (x: number, lo: number, hi: number) => { const v = Math.min(hi, Math.max(lo, Math.round(x) || lo)); return isPow2(v) ? v : 2 ** Math.round(Math.log2(v)); };
  const lines = pow2(c.lines, 1, 256);
  const ways = Math.min(lines, pow2(c.ways, 1, 256));
  return { lines, ways, block: pow2(c.block, 1, 256), addrBits: Math.round(c.addrBits ?? 16), repl: c.repl ?? 'lru' };
}

export function fields(c: CacheCfg) {
  const n = normalize(c); const sets = n.lines / n.ways;
  const offsetBits = log2i(n.block), indexBits = log2i(sets), tagBits = n.addrBits - offsetBits - indexBits;
  return { ...n, sets, offsetBits, indexBits, tagBits, size: n.lines * n.block };
}

export function split(addr: number, c: CacheCfg) {
  const f = fields(c);
  return { offset: addr % f.block, index: Math.floor(addr / f.block) % f.sets, tag: Math.floor(addr / (f.block * f.sets)) };
}

/** Built-in address traces (4-byte word accesses). */
export function makeTrace(id: TraceId, c: CacheCfg, o: { arrayBytes?: number; stride?: number; count?: number; custom?: string } = {}): number[] {
  const f = fields(c); const out: number[] = [];
  if (id === 'sequential') {
    const bytes = Math.max(4, Math.round(o.arrayBytes ?? 128));
    for (let pass = 0; pass < 2; pass++) for (let a = 0; a < bytes; a += 4) out.push(a);
  } else if (id === 'stride') {
    const st = Math.max(4, Math.round(o.stride ?? 32)); const n = Math.max(1, Math.round(o.count ?? 16));
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < n; k++) out.push(k * st);
  } else if (id === 'conflict') {
    // A[i] and B[i] interleaved, B placed exactly one cache size after A: same set, different tag.
    const n = Math.max(1, Math.round(o.count ?? 16)); const B = f.size;
    for (let i = 0; i < n; i++) out.push(4 * i, B + 4 * i);
  } else {
    for (const t of (o.custom ?? '').split(/[\s,;]+/)) { if (!t) continue; const v = t.toLowerCase().startsWith('0x') ? parseInt(t, 16) : /[a-f]/i.test(t) ? parseInt(t, 16) : parseInt(t, 10); if (isFinite(v) && v >= 0) out.push(v); }
  }
  const max = 2 ** f.addrBits; return out.map(a => a % max);
}

export function simulate(c: CacheCfg, trace: number[]) {
  const f = fields(c);
  const sets: Way[][] = Array.from({ length: f.sets }, () => Array.from({ length: f.ways }, () => ({ valid: false, tag: 0, lastUse: -1, filled: -1 })));
  // fully-associative LRU shadow cache for 3C classification
  const fa: number[] = []; const seen = new Set<number>();
  const acc: Access[] = []; let hits = 0; const kinds = { compulsory: 0, capacity: 0, conflict: 0 };
  trace.forEach((addr, t) => {
    const { offset, index, tag } = split(addr, f); const blk = Math.floor(addr / f.block);
    const set = sets[index]; let way = set.findIndex(w => w.valid && w.tag === tag); const hit = way >= 0;
    // shadow FA cache
    const faPos = fa.indexOf(blk); const faHit = faPos >= 0; if (faHit) fa.splice(faPos, 1); fa.push(blk); if (fa.length > f.lines) fa.shift();
    let evicted: Access['evicted']; let kind: Access['kind'];
    if (hit) { hits++; set[way].lastUse = t; }
    else {
      kind = !seen.has(blk) ? 'compulsory' : !faHit ? 'capacity' : 'conflict'; kinds[kind]++;
      way = set.findIndex(w => !w.valid);
      if (way < 0) {
        const key = (w: Way) => (f.repl === 'lru' ? w.lastUse : w.filled);
        way = 0; for (let k = 1; k < set.length; k++) if (key(set[k]) < key(set[way])) way = k;
        evicted = { tag: set[way].tag, blockAddr: (set[way].tag * f.sets + index) * f.block };
      }
      set[way] = { valid: true, tag, lastUse: t, filled: t };
    }
    seen.add(blk);
    acc.push({ addr, tag, index, offset, hit, way, evicted, kind, snapshot: sets.map(s => s.map(w => ({ ...w }))) });
  });
  const n = trace.length;
  return { ...f, accesses: acc, hits, misses: n - hits, hitRate: n ? hits / n : 0, missRate: n ? 1 - hits / n : 0, kinds };
}

export const amat = (tHit: number, missRate: number, penalty: number) => tHit + missRate * penalty;
