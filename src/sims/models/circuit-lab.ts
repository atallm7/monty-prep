// Circuit lab model: Modified Nodal Analysis (MNA) solver for a grid-drawn circuit.
//
// MNA (Ho, Ruehli & Brennan, 1975; as used in SPICE): unknowns are the node voltages (ground = 0) plus one
// branch current for every voltage-defined element (independent V sources, inductors). KCL rows:
//   Σ G·v + Σ (branch currents leaving the node) = Σ (source currents into the node)
// and one constitutive row per V-type branch (v_a − v_b = V for a source; v_a − v_b − (L/h)·i = −(L/h)·i_prev
// for a backward-Euler inductor). Capacitors use the backward-Euler companion model: conductance C/h in parallel
// with a current source (C/h)·v_prev. In DC, C is open and L is a short (0 V branch).
// Diodes / LEDs follow Shockley, I = Is·(e^{V/(n·Vt)} − 1), solved by Newton–Raphson with SPICE-style junction
// voltage limiting (pnjlim). A tiny gmin (1 pS) from every node to ground keeps floating nodes solvable.
// Ideal wires and closed switches merge points into one node; their currents are recovered afterwards by solving
// KCL on each wire cluster (unit-conductance Laplacian), which gives the physical split for equal wire resistances.
export type Pt = [number, number];
export type Kind = 'wire' | 'R' | 'C' | 'L' | 'V' | 'I' | 'SW' | 'D' | 'LED';
export type Part = { id: string; kind: Kind; a: Pt; b: Pt; value: number; closed?: boolean };
export type Circuit = { parts: Part[]; grounds: Pt[] };

export const VT = 0.025852; // thermal voltage kT/q at 300 K
export const DIODE = { D: { is: 1e-14, n: 1 }, LED: { is: 1.5e-19, n: 2 } }; // Si diode ≈ 0.65 V @ 1 mA; red LED ≈ 2.0 V @ 10 mA
const GMIN = 1e-12;
export const key = (p: Pt) => `${p[0]},${p[1]}`;
const isIdeal = (p: Part) => p.kind === 'wire' || (p.kind === 'SW' && !!p.closed);

export type Netlist = {
  netOf: Map<string, number>; nNets: number; ref: number; autoGround: boolean;
  nodeIdx: number[]; // net -> unknown index (−1 for reference)
  branchIdx: Map<string, number>; // part id -> branch-current unknown
  size: number; errors: string[]; points: string[];
};

export function buildNetlist(c: Circuit): Netlist {
  const parent = new Map<string, string>();
  const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r)!; let x = k; while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; } return r; };
  const add = (k: string) => { if (!parent.has(k)) parent.set(k, k); };
  const union = (a: string, b: string) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const p of c.parts) { add(key(p.a)); add(key(p.b)); if (isIdeal(p)) union(key(p.a), key(p.b)); }
  for (let i = 0; i < c.grounds.length; i++) { add(key(c.grounds[i])); if (i) union(key(c.grounds[0]), key(c.grounds[i])); }
  const roots = new Map<string, number>(); const netOf = new Map<string, number>();
  for (const k of parent.keys()) { const r = find(k); if (!roots.has(r)) roots.set(r, roots.size); netOf.set(k, roots.get(r)!); }
  const nNets = roots.size;
  let ref = -1; let autoGround = false;
  if (c.grounds.length) ref = netOf.get(key(c.grounds[0]))!;
  else if (nNets) {
    autoGround = true;
    const src = c.parts.find(p => p.kind === 'V');
    ref = src ? netOf.get(key(src.b))! : netOf.get(key((c.parts.find(p => !isIdeal(p)) ?? c.parts[0]).b))!;
  }
  const nodeIdx: number[] = []; let n = 0;
  for (let k = 0; k < nNets; k++) nodeIdx.push(k === ref ? -1 : n++);
  const branchIdx = new Map<string, number>(); const errors: string[] = [];
  for (const p of c.parts) {
    const na = netOf.get(key(p.a))!, nb = netOf.get(key(p.b))!;
    if (p.kind === 'V') {
      if (na === nb) { if (p.value !== 0) errors.push(`short circuit: a wire connects both terminals of the ${p.id} source`); continue; }
      branchIdx.set(p.id, n++);
    } else if (p.kind === 'L' && na !== nb) branchIdx.set(p.id, n++);
  }
  return { netOf, nNets, ref, autoGround, nodeIdx, branchIdx, size: n, errors, points: [...parent.keys()] };
}

/** Dense Gaussian elimination with partial pivoting. Returns null if singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length; let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) <= 1e-18 * Math.max(scale, 1e-30)) return null;
    if (piv !== c) { const t = M[piv]; M[piv] = M[c]; M[c] = t; }
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f === 0) continue; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

/** SPICE pnjlim: limit the per-iteration change of a junction voltage. */
function pnjlim(vnew: number, vold: number, nvt: number, vcrit: number) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nvt) {
    if (vold > 0) { const arg = 1 + (vnew - vold) / nvt; return arg > 0 ? vold + nvt * Math.log(arg) : vcrit; }
    return nvt * Math.log(vnew / nvt);
  }
  return vnew;
}
export function diodeI(kind: 'D' | 'LED', v: number) { const { is, n } = DIODE[kind]; return is * (Math.exp(Math.min(v / (n * VT), 200)) - 1); }

export type State = { vc: Map<string, number>; il: Map<string, number> };
export type Solution = {
  ok: boolean; errors: string[]; warnings: string[];
  net: Netlist; netV: number[]; // voltage of every net
  v: Map<string, number>; i: Map<string, number>; p: Map<string, number>; // per part: v_a − v_b, current a→b through the part, absorbed power
  pointV: (p: Pt) => number | undefined; groundI: Map<string, number>;
};

type SolveOpts = { mode: 'dc' | 'tran'; h?: number; prev?: State; guess?: Map<string, number> };

/** Solve one operating point (DC, or one backward-Euler step). */
export function solve(c: Circuit, opts: SolveOpts = { mode: 'dc' }, net = buildNetlist(c)): Solution {
  const errors = [...net.errors]; const warnings: string[] = [];
  if (net.autoGround && c.parts.length) warnings.push('No ground symbol: the − terminal of the first source is used as 0 V.');
  const N = net.size; const nNodes = net.nodeIdx.filter(q => q >= 0).length; const nodeOf = (p: Pt) => net.nodeIdx[net.netOf.get(key(p))!];
  const diodes = c.parts.filter(p => (p.kind === 'D' || p.kind === 'LED') && net.netOf.get(key(p.a)) !== net.netOf.get(key(p.b)));
  const vdLin = new Map<string, number>(diodes.map(d => [d.id, opts.guess?.get(d.id) ?? 0.6 * DIODE[d.kind as 'D'].n]));
  let x: number[] | null = new Array(N).fill(0);
  const h = opts.h ?? 1;
  const volt = (xx: number[], p: Pt) => { const k = nodeOf(p); return k < 0 ? 0 : xx[k]; };
  let converged = false;
  for (let iter = 0; iter < 300 && errors.length === 0; iter++) {
    const A = Array.from({ length: N }, () => new Array(N).fill(0)); const rhs = new Array(N).fill(0);
    const G = (a: number, b: number, g: number) => { if (a >= 0) A[a][a] += g; if (b >= 0) A[b][b] += g; if (a >= 0 && b >= 0) { A[a][b] -= g; A[b][a] -= g; } };
    const J = (a: number, b: number, cur: number) => { if (a >= 0) rhs[a] -= cur; if (b >= 0) rhs[b] += cur; }; // current cur flows a→b through the element
    for (let k = 0; k < nNodes; k++) A[k][k] += GMIN;
    for (const p of c.parts) {
      const a = nodeOf(p.a), b = nodeOf(p.b);
      switch (p.kind) {
        case 'R': G(a, b, 1 / Math.max(p.value, 1e-6)); break;
        case 'C': if (opts.mode === 'tran') { const g = p.value / h; G(a, b, g); J(a, b, -g * (opts.prev?.vc.get(p.id) ?? 0)); } break;
        case 'I': J(a, b, p.value); break;
        case 'V': case 'L': {
          const k = net.branchIdx.get(p.id); if (k === undefined) break;
          if (a >= 0) { A[a][k] += 1; A[k][a] += 1; } if (b >= 0) { A[b][k] -= 1; A[k][b] -= 1; }
          if (p.kind === 'V') rhs[k] = p.value;
          else if (opts.mode === 'tran') { A[k][k] -= p.value / h; rhs[k] = -(p.value / h) * (opts.prev?.il.get(p.id) ?? 0); }
          break;
        }
        case 'D': case 'LED': {
          if (a === b) break; const vd = vdLin.get(p.id)!; const { is, n } = DIODE[p.kind]; const nvt = n * VT;
          const e = Math.exp(Math.min(vd / nvt, 200)); const id = is * (e - 1); const gd = (is / nvt) * e + GMIN;
          G(a, b, gd); J(a, b, id - gd * vd); break;
        }
      }
    }
    x = solveLinear(A, rhs);
    if (!x) { errors.push(c.parts.some(p => p.kind === 'V') ? 'The circuit has no unique solution: check for voltage sources in parallel (a loop of sources and wires) or a shorted inductor across a source.' : 'The circuit has no unique solution.'); break; }
    if (!diodes.length) { converged = true; break; }
    let maxd = 0;
    for (const d of diodes) {
      const vnew = volt(x, d.a) - volt(x, d.b); const vold = vdLin.get(d.id)!; const { is, n } = DIODE[d.kind as 'D']; const nvt = n * VT;
      const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * is));
      const vl = pnjlim(vnew, vold, nvt, vcrit); maxd = Math.max(maxd, Math.abs(vl - vold), Math.abs(vnew - vl)); vdLin.set(d.id, vl);
    }
    if (maxd < 1e-9) { converged = true; break; }
  }
  if (!converged && !errors.length) warnings.push('Newton iteration did not fully converge (diode circuit); values may be approximate.');
  const xx = x ?? new Array(N).fill(0);
  const netV = Array.from({ length: net.nNets }, (_, k) => net.nodeIdx[k] < 0 ? 0 : xx[net.nodeIdx[k]]);
  const v = new Map<string, number>(), i = new Map<string, number>(), pw = new Map<string, number>();
  for (const p of c.parts) {
    const vab = volt(xx, p.a) - volt(xx, p.b); let cur = 0;
    switch (p.kind) {
      case 'R': cur = vab / Math.max(p.value, 1e-6); break;
      case 'C': cur = opts.mode === 'tran' ? (p.value / h) * (vab - (opts.prev?.vc.get(p.id) ?? 0)) : 0; break;
      case 'I': cur = p.value; break;
      case 'V': case 'L': { const k = net.branchIdx.get(p.id); cur = k === undefined ? (p.kind === 'L' ? (opts.prev?.il.get(p.id) ?? 0) : 0) : xx[k]; break; }
      case 'D': case 'LED': cur = diodeI(p.kind, vab); break;
      case 'SW': cur = 0; break;
    }
    v.set(p.id, isIdeal(p) ? 0 : vab); i.set(p.id, cur);
  }
  const groundI = wireFlows(c, net, i);
  for (const p of c.parts) pw.set(p.id, v.get(p.id)! * i.get(p.id)!);
  if (!errors.length && netV.some(q => Math.abs(q) > 1e6)) warnings.push('A node is floating (huge voltage): a current source or capacitor has no DC path to complete its loop.');
  return { ok: errors.length === 0, errors, warnings, net, netV, v, i, p: pw, pointV: (pt: Pt) => { const k = net.netOf.get(key(pt)); return k === undefined ? undefined : netV[k]; }, groundI };
}

/** Recover currents in ideal conductors (wires, closed switches, ground links) from KCL on each cluster. Mutates i. */
function wireFlows(c: Circuit, net: Netlist, i: Map<string, number>) {
  const out = new Map<string, number>(); // current leaving point P into non-ideal parts
  for (const p of c.parts) if (!isIdeal(p)) {
    const cur = i.get(p.id) ?? 0; const ka = key(p.a), kb = key(p.b);
    out.set(ka, (out.get(ka) ?? 0) + cur); out.set(kb, (out.get(kb) ?? 0) - cur);
  }
  const groundI = new Map<string, number>();
  for (let n = 0; n < net.nNets; n++) {
    const pts = net.points.filter(k => net.netOf.get(k) === n);
    const ideal = c.parts.filter(p => isIdeal(p) && net.netOf.get(key(p.a)) === n);
    const gpts = n === net.ref ? c.grounds.map(key) : [];
    if (!ideal.length && gpts.length <= 1) continue;
    const nodes = [...pts, ...(gpts.length ? ['GND'] : [])]; const idx = new Map(nodes.map((k, j) => [k, j]));
    const edges: [number, number, string | null][] = [...ideal.map(p => [idx.get(key(p.a))!, idx.get(key(p.b))!, p.id] as [number, number, string]), ...gpts.map(g => [idx.get(g)!, idx.get('GND')!, null] as [number, number, null])];
    const m = nodes.length; if (m < 2) continue;
    // Laplacian L·φ = −out, fix φ[0] = 0 (drop row/col 0)
    const A = Array.from({ length: m - 1 }, () => new Array(m - 1).fill(0)); const b = new Array(m - 1).fill(0);
    for (const [u, w] of edges) { if (u === w) continue; for (const [s, t] of [[u, w], [w, u]]) { if (s > 0) { A[s - 1][s - 1] += 1; if (t > 0) A[s - 1][t - 1] -= 1; } } }
    for (let j = 1; j < m; j++) { const k = nodes[j]; b[j - 1] = -(out.get(k) ?? 0); if (k === 'GND') b[j - 1] = 0; }
    // KCL residual (the GND node absorbs the reference net's imbalance, which is zero for a closed circuit)
    for (let j = 0; j < m - 1; j++) if (A[j][j] === 0) A[j][j] = 1; // isolated point inside a cluster (no edges)
    const phi = solveLinear(A, b); if (!phi) continue;
    const ph = (j: number) => (j === 0 ? 0 : phi[j - 1]);
    for (const [u, w, id] of edges) {
      const f = ph(u) - ph(w);
      if (id) i.set(id, f); else groundI.set(nodes[u], f);
    }
  }
  return groundI;
}

/** Thevenin resistance between points A and B with all independent sources zeroed (V → short, I → open), C open, L short, diodes open. */
export function reqBetween(c: Circuit, A: Pt, B: Pt): number {
  const parts: Part[] = [];
  for (const p of c.parts) {
    if (p.kind === 'V' || p.kind === 'L') parts.push({ ...p, kind: 'wire' });
    else if (p.kind === 'R' || p.kind === 'wire' || p.kind === 'SW') parts.push(p);
  }
  const net = buildNetlist({ parts, grounds: [B] });
  const na = net.netOf.get(key(A)), nb = net.netOf.get(key(B));
  if (na === undefined || nb === undefined) return Infinity;
  if (na === nb) return 0;
  parts.push({ id: '__test', kind: 'I', a: B, b: A, value: 1 });
  const s = solve({ parts, grounds: [B] }, { mode: 'dc' });
  const v = s.pointV(A) ?? Infinity;
  return !s.ok || Math.abs(v) > 1e9 ? Infinity : v;
}

/** Time constants seen by each C (τ = C·R_th) and L (τ = L/R_th). */
export function timeConstants(c: Circuit) {
  const out: { id: string; tau: number; r: number }[] = [];
  for (const p of c.parts) {
    if (p.kind !== 'C' && p.kind !== 'L') continue;
    const others = c.parts.filter(q => q.id !== p.id).map(q => q.kind === 'C' ? null : q).filter(Boolean) as Part[];
    const r = reqBetween({ parts: others, grounds: c.grounds }, p.a, p.b);
    const tau = p.kind === 'C' ? p.value * r : r > 0 ? p.value / r : Infinity;
    if (isFinite(tau) && tau > 0) out.push({ id: p.id, tau, r });
  }
  return out;
}

export type Transient = { t: number[]; frames: Solution[]; error?: string };
/**
 * Backward-Euler transient from t = 0 to span. init = 'zero': capacitors discharged, inductor currents 0.
 * init = 'dc': start from the DC steady state reached with every switch in the OPPOSITE position, i.e. the
 * switches are flipped at t = 0 (the classic "switch closed for a long time, opens at t = 0" problem).
 */
export function transient(c: Circuit, span: number, steps = 1000, init: 'zero' | 'dc' = 'zero'): Transient {
  const prev: State = { vc: new Map(), il: new Map() };
  if (init === 'dc') {
    const flipped: Circuit = { ...c, parts: c.parts.map(p => p.kind === 'SW' ? { ...p, closed: !p.closed } : p) };
    const s0 = solve(flipped, { mode: 'dc' });
    if (!s0.ok) return { t: [], frames: [], error: s0.errors[0] };
    for (const p of c.parts) { if (p.kind === 'C') prev.vc.set(p.id, s0.v.get(p.id)!); if (p.kind === 'L') prev.il.set(p.id, s0.i.get(p.id)!); }
  }
  const h = span / steps; const net = buildNetlist(c);
  const t: number[] = [], frames: Solution[] = [];
  // t = 0+ frame: solve with a tiny step so C voltages / L currents stay at their initial values
  let guess: Map<string, number> | undefined;
  for (let k = 0; k <= steps; k++) {
    const hk = k === 0 ? h * 1e-9 : h;
    const s = solve(c, { mode: 'tran', h: hk, prev, guess }, net);
    if (!s.ok) return { t, frames, error: s.errors[0] };
    t.push(k * h); frames.push(s);
    for (const p of c.parts) { if (p.kind === 'C') prev.vc.set(p.id, s.v.get(p.id)!); if (p.kind === 'L') prev.il.set(p.id, s.i.get(p.id)!); }
    guess = new Map(c.parts.filter(p => p.kind === 'D' || p.kind === 'LED').map(p => [p.id, s.v.get(p.id)!]));
  }
  return { t, frames };
}
