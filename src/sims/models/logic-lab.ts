// Gate-level combinational logic simulator.
// - Three-valued (Kleene) logic: 0, 1 and 'X' (unknown / floating). A floating gate input reads X.
//   AND: any 0 -> 0, all 1 -> 1, else X.  OR: any 1 -> 1, all 0 -> 0, else X.  NOT X = X.
//   XOR: X if any input X, else parity. NAND/NOR/XNOR are the complements.
// - Evaluation is a topological sort of the gate graph (Kahn's algorithm). Gates left over after the sort
//   lie on (or downstream of) a combinational loop: a cycle with no register in it has no well-defined
//   steady state (it can latch or oscillate), so those nets are reported as X and the loop is flagged.
// - Truth table: every 2^n input combination is evaluated; the minimal SOP of each output is derived with
//   Quine-McCluskey (prime implicants + exact minimum cover), and a structural expression is read
//   straight off the netlist.

export type GateKind = 'IN' | 'OUT' | 'AND' | 'OR' | 'NOT' | 'BUF' | 'NAND' | 'NOR' | 'XOR' | 'XNOR';
export type V = 0 | 1 | 'X';
export type LNode = { id: string; kind: GateKind; x: number; y: number; label?: string; value?: 0 | 1 };
export type Wire = { from: string; to: string; pin: number };
export type Circuit = { nodes: LNode[]; wires: Wire[] };

export const GATE_KINDS: GateKind[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'BUF'];
export function nInputs(k: GateKind): number { return k === 'IN' ? 0 : k === 'OUT' || k === 'NOT' || k === 'BUF' ? 1 : 2; }
export function hasOutput(k: GateKind) { return k !== 'OUT'; }

export function gateEval(kind: GateKind, ins: V[]): V {
  const and = (xs: V[]): V => xs.some(v => v === 0) ? 0 : xs.every(v => v === 1) ? 1 : 'X';
  const or = (xs: V[]): V => xs.some(v => v === 1) ? 1 : xs.every(v => v === 0) ? 0 : 'X';
  const not = (v: V): V => v === 'X' ? 'X' : v === 1 ? 0 : 1;
  const xor = (xs: V[]): V => xs.some(v => v === 'X') ? 'X' : (xs.reduce<number>((a, v) => a ^ (v as number), 0) as 0 | 1);
  switch (kind) {
    case 'AND': return and(ins); case 'NAND': return not(and(ins));
    case 'OR': return or(ins); case 'NOR': return not(or(ins));
    case 'XOR': return xor(ins); case 'XNOR': return not(xor(ins));
    case 'NOT': return not(ins[0]); case 'BUF': case 'OUT': return ins[0];
    default: return 'X';
  }
}

export type EvalResult = { values: Record<string, V>; pinValues: Record<string, V[]>; loopNodes: string[]; order: string[] };

/** Evaluate the circuit with the given input assignment (by node id). */
export function evaluate(c: Circuit, inputs?: Record<string, 0 | 1>): EvalResult {
  const byId = new Map(c.nodes.map(n => [n.id, n]));
  const drivers = new Map<string, string>(); // `${to}:${pin}` -> from
  for (const w of c.wires) if (byId.has(w.from) && byId.has(w.to)) drivers.set(`${w.to}:${w.pin}`, w.from);
  const indeg = new Map<string, number>(); const fanout = new Map<string, string[]>();
  for (const n of c.nodes) { indeg.set(n.id, 0); fanout.set(n.id, []); }
  for (const [key, from] of drivers) { const to = key.split(':')[0]; indeg.set(to, (indeg.get(to) || 0) + 1); fanout.get(from)!.push(to); }
  const q = c.nodes.filter(n => indeg.get(n.id) === 0).map(n => n.id); const order: string[] = [];
  const deg = new Map(indeg);
  while (q.length) { const id = q.shift()!; order.push(id); for (const t of fanout.get(id)!) { deg.set(t, deg.get(t)! - 1); if (deg.get(t) === 0) q.push(t); } }
  const done = new Set(order);
  const leftover = c.nodes.filter(n => !done.has(n.id)).map(n => n.id);
  // Nodes actually on a cycle (not just downstream of one): node is on a cycle if it can reach itself.
  const loopNodes = leftover.filter(id => {
    const seen = new Set<string>(); const st = [...fanout.get(id)!];
    while (st.length) { const v = st.pop()!; if (v === id) return true; if (seen.has(v) || done.has(v)) continue; seen.add(v); st.push(...fanout.get(v)!); }
    return false;
  });
  const values: Record<string, V> = {}; const pinValues: Record<string, V[]> = {};
  for (const id of leftover) values[id] = 'X';
  for (const id of order) {
    const n = byId.get(id)!;
    if (n.kind === 'IN') { const v = inputs?.[id] ?? n.value ?? 0; values[id] = v; pinValues[id] = []; continue; }
    const ins: V[] = Array.from({ length: nInputs(n.kind) }, (_, p) => { const d = drivers.get(`${id}:${p}`); return d === undefined ? 'X' : (values[d] ?? 'X'); });
    pinValues[id] = ins; values[id] = gateEval(n.kind, ins);
  }
  for (const id of leftover) { const n = byId.get(id)!; pinValues[id] = Array.from({ length: nInputs(n.kind) }, (_, p) => { const d = drivers.get(`${id}:${p}`); return d === undefined ? 'X' : (values[d] ?? 'X'); }); }
  return { values, pinValues, loopNodes, order };
}

export const inputsOf = (c: Circuit) => c.nodes.filter(n => n.kind === 'IN').sort((a, b) => a.y - b.y || a.x - b.x);
export const outputsOf = (c: Circuit) => c.nodes.filter(n => n.kind === 'OUT').sort((a, b) => a.y - b.y || a.x - b.x);
export const nameOf = (n: LNode) => n.label || n.id;

export type TruthTable = { inNames: string[]; outNames: string[]; rows: { ins: (0 | 1)[]; outs: V[] }[] };
/** Enumerate all input combinations; first input listed is the MSB of the row index. */
export function truthTable(c: Circuit): TruthTable {
  const ins = inputsOf(c), outs = outputsOf(c); const n = ins.length; const rows: TruthTable['rows'] = [];
  for (let r = 0; r < (1 << n); r++) {
    const a: Record<string, 0 | 1> = {}; const bits: (0 | 1)[] = [];
    ins.forEach((node, i) => { const b = ((r >> (n - 1 - i)) & 1) as 0 | 1; a[node.id] = b; bits.push(b); });
    const ev = evaluate(c, a);
    rows.push({ ins: bits, outs: outs.map(o => ev.values[o.id] ?? 'X') });
  }
  return { inNames: ins.map(nameOf), outNames: outs.map(nameOf), rows };
}

// ---------- Quine-McCluskey (self-contained) ----------
export type Cube = { value: number; mask: number }; // mask bit 1 = "don't care" position
const popcount = (x: number) => { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };
export function primeImplicants(nv: number, on: number[], dc: number[]): Cube[] {
  let cur: Cube[] = [...new Set([...on, ...dc])].map(v => ({ value: v, mask: 0 }));
  const primes: Cube[] = [];
  while (cur.length) {
    const used = new Set<number>(); const next = new Map<string, Cube>();
    for (let i = 0; i < cur.length; i++) for (let j = i + 1; j < cur.length; j++) {
      const a = cur[i], b = cur[j]; if (a.mask !== b.mask) continue;
      const d = a.value ^ b.value; if (popcount(d) !== 1) continue;
      used.add(i); used.add(j); const c = { value: a.value & ~d, mask: a.mask | d }; next.set(`${c.value}/${c.mask}`, c);
    }
    cur.forEach((c, i) => { if (!used.has(i)) primes.push(c); });
    cur = [...next.values()];
  }
  const seen = new Set<string>();
  return primes.filter(p => { const k = `${p.value}/${p.mask}`; if (seen.has(k)) return false; seen.add(k); return true; }).filter(() => nv >= 0);
}
export const covers = (c: Cube, m: number) => ((m & ~c.mask) === c.value);
export function literals(nv: number, c: Cube) { return nv - popcount(c.mask & ((1 << nv) - 1)); }
/** Exact minimum cover: fewest terms, then fewest literals (branch and bound; fine for <= 6 variables). */
export function minCover(nv: number, on: number[], dc: number[]): Cube[] {
  if (on.length === 0) return [];
  const primes = primeImplicants(nv, on, dc);
  const cost = (s: Cube[]) => s.length * 1000 + s.reduce((a, c) => a + literals(nv, c), 0);
  let best: Cube[] | null = null;
  const rec = (left: number[], chosen: Cube[], avail: Cube[]) => {
    if (best && cost(chosen) >= cost(best)) return;
    if (!left.length) { best = [...chosen]; return; }
    // pick the minterm with the fewest covering primes (essential ones first)
    let pick = left[0], cands: Cube[] = avail.filter(p => covers(p, pick));
    for (const m of left) { const cs = avail.filter(p => covers(p, m)); if (cs.length < cands.length) { pick = m; cands = cs; } }
    cands.sort((a, b) => literals(nv, a) - literals(nv, b));
    for (const p of cands) rec(left.filter(m => !covers(p, m)), [...chosen, p], avail.filter(q => q !== p));
  };
  rec([...on], [], primes);
  return best ?? [];
}
export function cubeSOP(nv: number, c: Cube, names: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < nv; i++) { const bit = 1 << (nv - 1 - i); if (c.mask & bit) continue; parts.push(c.value & bit ? names[i] : names[i] + "'"); }
  return parts.length ? parts.join(names.some(n => n.length > 1) ? '·' : '') : '1';
}
export function minimalSOP(nv: number, on: number[], dc: number[], names: string[]): string {
  if (on.length === 0) return '0';
  const cov = minCover(nv, on, dc);
  return cov.map(c => cubeSOP(nv, c, names)).sort().join(' + ');
}

/** Structural expression for a net, read straight off the gate graph (uses ' for NOT, · for AND, + for OR, ⊕ for XOR). */
export function structuralExpr(c: Circuit, id: string, depth = 0): string {
  const byId = new Map(c.nodes.map(n => [n.id, n])); const n = byId.get(id); if (!n) return '?';
  if (depth > 12) return '…';
  const drv = (pin: number) => { const w = c.wires.find(w => w.to === id && w.pin === pin); return w ? structuralExpr(c, w.from, depth + 1) : '?'; };
  const wrap = (s: string) => /^[A-Za-z0-9_]+'?$/.test(s) ? s : `(${s})`;
  switch (n.kind) {
    case 'IN': return nameOf(n);
    case 'OUT': case 'BUF': return drv(0);
    case 'NOT': return wrap(drv(0)) + "'";
    case 'AND': return `${wrap(drv(0))}·${wrap(drv(1))}`;
    case 'OR': return `${drv(0)} + ${drv(1)}`;
    case 'XOR': return `${wrap(drv(0))} ⊕ ${wrap(drv(1))}`;
    case 'NAND': return `(${wrap(drv(0))}·${wrap(drv(1))})'`;
    case 'NOR': return `(${drv(0)} + ${drv(1)})'`;
    case 'XNOR': return `(${wrap(drv(0))} ⊕ ${wrap(drv(1))})'`;
  }
}

export function gateCount(c: Circuit) { return c.nodes.filter(n => n.kind !== 'IN' && n.kind !== 'OUT').length; }

// ---------- Presets ----------
type P = { nodes: [string, GateKind, number, number, string?][]; wires: [string, string, number][] };
const mk = (p: P): Circuit => ({ nodes: p.nodes.map(([id, kind, x, y, label]) => ({ id, kind, x, y, label, ...(kind === 'IN' ? { value: 0 as const } : {}) })), wires: p.wires.map(([from, to, pin]) => ({ from, to, pin })) });
export const PRESET_NAMES = ['blank', 'and', 'half-adder', 'full-adder', 'mux2', 'nand-universal', 'xor-from-nand', 'majority', 'decoder2'] as const;
export type PresetName = typeof PRESET_NAMES[number];
export function preset(name: string): Circuit {
  switch (name) {
    case 'and': return mk({ nodes: [['A', 'IN', 60, 120, 'A'], ['B', 'IN', 60, 220, 'B'], ['g1', 'AND', 300, 170], ['Y', 'OUT', 560, 170, 'Y']], wires: [['A', 'g1', 0], ['B', 'g1', 1], ['g1', 'Y', 0]] });
    case 'half-adder': return mk({ nodes: [['A', 'IN', 60, 110, 'A'], ['B', 'IN', 60, 230, 'B'], ['x1', 'XOR', 300, 110], ['a1', 'AND', 300, 260], ['S', 'OUT', 560, 110, 'S'], ['C', 'OUT', 560, 260, 'C']], wires: [['A', 'x1', 0], ['B', 'x1', 1], ['A', 'a1', 0], ['B', 'a1', 1], ['x1', 'S', 0], ['a1', 'C', 0]] });
    case 'full-adder': return mk({ nodes: [['A', 'IN', 40, 70, 'A'], ['B', 'IN', 40, 150, 'B'], ['Ci', 'IN', 40, 250, 'Cin'], ['x1', 'XOR', 200, 110], ['x2', 'XOR', 400, 150], ['a1', 'AND', 400, 250], ['a2', 'AND', 200, 330], ['o1', 'OR', 560, 290], ['S', 'OUT', 640, 150, 'S'], ['Co', 'OUT', 640, 290, 'Cout']],
      wires: [['A', 'x1', 0], ['B', 'x1', 1], ['x1', 'x2', 0], ['Ci', 'x2', 1], ['x1', 'a1', 0], ['Ci', 'a1', 1], ['A', 'a2', 0], ['B', 'a2', 1], ['a1', 'o1', 0], ['a2', 'o1', 1], ['x2', 'S', 0], ['o1', 'Co', 0]] });
    case 'mux2': return mk({ nodes: [['I0', 'IN', 40, 80, 'I0'], ['Sel', 'IN', 40, 200, 'S'], ['I1', 'IN', 40, 320, 'I1'], ['n1', 'NOT', 180, 140], ['a1', 'AND', 340, 110], ['a2', 'AND', 340, 290], ['o1', 'OR', 500, 200], ['Y', 'OUT', 660, 200, 'Y']],
      wires: [['Sel', 'n1', 0], ['I0', 'a1', 0], ['n1', 'a1', 1], ['Sel', 'a2', 0], ['I1', 'a2', 1], ['a1', 'o1', 0], ['a2', 'o1', 1], ['o1', 'Y', 0]] });
    case 'nand-universal': return mk({ nodes: [['A', 'IN', 40, 120, 'A'], ['B', 'IN', 40, 280, 'B'], ['n1', 'NAND', 200, 60], ['n2', 'NAND', 200, 200], ['n3', 'NAND', 380, 200], ['n4', 'NAND', 200, 330], ['n5', 'NAND', 380, 300], ['Yn', 'OUT', 640, 60, 'NOT_A'], ['Ya', 'OUT', 640, 200, 'AND'], ['Yo', 'OUT', 640, 300, 'OR']],
      wires: [['A', 'n1', 0], ['A', 'n1', 1], ['A', 'n2', 0], ['B', 'n2', 1], ['n2', 'n3', 0], ['n2', 'n3', 1], ['B', 'n4', 0], ['B', 'n4', 1], ['n1', 'n5', 0], ['n4', 'n5', 1], ['n1', 'Yn', 0], ['n3', 'Ya', 0], ['n5', 'Yo', 0]] });
    case 'xor-from-nand': return mk({ nodes: [['A', 'IN', 40, 120, 'A'], ['B', 'IN', 40, 280, 'B'], ['n1', 'NAND', 200, 200], ['n2', 'NAND', 370, 120], ['n3', 'NAND', 370, 280], ['n4', 'NAND', 530, 200], ['Y', 'OUT', 680, 200, 'Y']],
      wires: [['A', 'n1', 0], ['B', 'n1', 1], ['A', 'n2', 0], ['n1', 'n2', 1], ['n1', 'n3', 0], ['B', 'n3', 1], ['n2', 'n4', 0], ['n3', 'n4', 1], ['n4', 'Y', 0]] });
    case 'majority': return mk({ nodes: [['A', 'IN', 40, 80, 'A'], ['B', 'IN', 40, 200, 'B'], ['C', 'IN', 40, 320, 'C'], ['a1', 'AND', 220, 80], ['a2', 'AND', 220, 200], ['a3', 'AND', 220, 320], ['o1', 'OR', 400, 140], ['o2', 'OR', 540, 230], ['Y', 'OUT', 680, 230, 'M']],
      wires: [['A', 'a1', 0], ['B', 'a1', 1], ['B', 'a2', 0], ['C', 'a2', 1], ['A', 'a3', 0], ['C', 'a3', 1], ['a1', 'o1', 0], ['a2', 'o1', 1], ['o1', 'o2', 0], ['a3', 'o2', 1], ['o2', 'Y', 0]] });
    case 'decoder2': return mk({ nodes: [['A1', 'IN', 40, 100, 'A1'], ['A0', 'IN', 40, 300, 'A0'], ['n1', 'NOT', 160, 160], ['n0', 'NOT', 160, 360], ['d0', 'AND', 400, 50], ['d1', 'AND', 400, 150], ['d2', 'AND', 400, 250], ['d3', 'AND', 400, 350], ['Y0', 'OUT', 640, 50, 'Y0'], ['Y1', 'OUT', 640, 150, 'Y1'], ['Y2', 'OUT', 640, 250, 'Y2'], ['Y3', 'OUT', 640, 350, 'Y3']],
      wires: [['A1', 'n1', 0], ['A0', 'n0', 0], ['n1', 'd0', 0], ['n0', 'd0', 1], ['n1', 'd1', 0], ['A0', 'd1', 1], ['A1', 'd2', 0], ['n0', 'd2', 1], ['A1', 'd3', 0], ['A0', 'd3', 1], ['d0', 'Y0', 0], ['d1', 'Y1', 0], ['d2', 'Y2', 0], ['d3', 'Y3', 0]] });
    default: return mk({ nodes: [['A', 'IN', 60, 120, 'A'], ['B', 'IN', 60, 240, 'B'], ['Y', 'OUT', 600, 180, 'Y']], wires: [] });
  }
}
