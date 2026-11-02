// Circuit lab: grid editor + Modified Nodal Analysis solver (DC operating point and backward-Euler transient).
import { useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { solve, transient, reqBetween, timeConstants, key } from '../models/circuit-lab';
import type { Circuit, Part, Pt, Kind, Solution } from '../models/circuit-lab';

// ---------- lattice ----------
const COLS = 7, ROWS = 5, S = 4, U = 20, PX = S * U; // lattice spacing: 4 schematic units = 80 px
const VB = { x: -46, y: -56, w: (COLS - 1) * PX + 112, h: (ROWS - 1) * PX + 106 };
const eq = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];
const edgeKey = (a: Pt, b: Pt) => { const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a]; return `${key(p)}|${key(q)}`; };
const ALL_EDGES: [Pt, Pt][] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) ALL_EDGES.push([[c, r], [c + 1, r]]);
for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS - 1; r++) ALL_EDGES.push([[c, r], [c, r + 1]]);

// ---------- parts ----------
type Tool = 'select' | Kind | 'gnd' | 'probe' | 'erase';
const DEFAULTS: Record<Kind, number> = { wire: 0, R: 1000, C: 1e-6, L: 10e-3, V: 5, I: 1e-3, SW: 0, D: 0, LED: 0 };
const UNIT: Record<Kind, string> = { wire: '', R: 'Ω', C: 'F', L: 'H', V: 'V', I: 'A', SW: '', D: '', LED: '' };
const RANGE: Partial<Record<Kind, [number, number, boolean]>> = { R: [1, 1e7, true], C: [1e-12, 1e-2, true], L: [1e-6, 10, true], V: [0, 30, false], I: [1e-6, 1, true] };
const PREFIX: Record<Kind, string> = { wire: 'W', R: 'R', C: 'C', L: 'L', V: 'V', I: 'I', SW: 'S', D: 'D', LED: 'LED' };
const POLAR: Kind[] = ['V', 'I', 'D', 'LED'];
let uid = 0; const nid = () => `p${++uid}`;

type Lab = { parts: Part[]; grounds: Pt[]; A: Pt | null; B: Pt | null; mode: 'dc' | 'tran'; span: number | null; init: 'zero' | 'dc'; sel: string | null };

function mk(kind: Kind, a: Pt, b: Pt, value?: number, closed?: boolean): Part { return { id: nid(), kind, a, b, value: value ?? DEFAULTS[kind], closed }; }
/** Wire along a straight-segment polyline of lattice points, split into unit edges. */
function wires(...pts: Pt[]): Part[] {
  const out: Part[] = [];
  for (let k = 1; k < pts.length; k++) {
    let [x, y] = pts[k - 1]; const [x2, y2] = pts[k];
    while (x !== x2 || y !== y2) { const nx = x + Math.sign(x2 - x), ny = y + Math.sign(y2 - y); out.push(mk('wire', [x, y], [nx, ny])); x = nx; y = ny; }
  }
  return out;
}
const PRESETS: Record<string, { label: string; build: () => Partial<Lab> & { parts: Part[]; grounds: Pt[] }; note: string }> = {
  ohm: { label: 'Ohm: source + resistor', note: 'One loop: the same current flows through every element. I = V/R.', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 5), mk('R', [3, 1], [3, 2], 1000), ...wires([0, 1], [0, 0], [3, 0], [3, 1]), ...wires([3, 2], [3, 3], [0, 3], [0, 2])], grounds: [[0, 3]], A: [3, 1], B: [3, 2] }) },
  series: { label: 'Series resistors', note: 'Series: resistances add, current is common, voltages divide in proportion to R.', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 12), mk('R', [1, 0], [2, 0], 1000), mk('R', [3, 0], [4, 0], 2200), mk('R', [5, 1], [5, 2], 3300), ...wires([0, 1], [0, 0], [1, 0]), ...wires([2, 0], [3, 0]), ...wires([4, 0], [5, 0], [5, 1]), ...wires([5, 2], [5, 3], [0, 3], [0, 2])], grounds: [[0, 3]], A: [3, 0], B: [4, 0] }) },
  parallel: { label: 'Parallel resistors', note: 'Parallel: voltage is common, currents add, conductances add (1/Req = Σ1/R).', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 9), ...[2, 4, 6].flatMap((c, k) => [mk('R', [c, 1], [c, 2], [1000, 2200, 4700][k]), ...wires([c, 0], [c, 1]), ...wires([c, 2], [c, 3])]), ...wires([0, 1], [0, 0], [6, 0]), ...wires([0, 2], [0, 3], [6, 3])], grounds: [[0, 3]], A: [2, 1], B: [2, 2] }) },
  'series-parallel': { label: 'Series-parallel (Req)', note: 'Req = R1 + R2 ‖ (R3 + R4) = 1 k + 2 k ‖ 2 k = 2 kΩ, so the source sees 2 kΩ.', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 10), mk('R', [1, 0], [2, 0], 1000), mk('R', [2, 1], [2, 2], 2000), mk('R', [3, 0], [4, 0], 1000), mk('R', [4, 1], [4, 2], 1000), ...wires([0, 1], [0, 0], [1, 0]), ...wires([2, 0], [3, 0]), ...wires([2, 0], [2, 1]), ...wires([4, 0], [4, 1]), ...wires([2, 2], [2, 3]), ...wires([4, 2], [4, 3]), ...wires([0, 2], [0, 3], [4, 3])], grounds: [[0, 3]], A: [2, 0], B: [2, 3] }) },
  divider: { label: 'Voltage divider', note: 'Vout = Vin·R2/(R1 + R2). Probe A is the tap.', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 12), mk('R', [3, 0], [3, 1], 10000), mk('R', [3, 1], [3, 2], 4700), ...wires([0, 1], [0, 0], [3, 0]), ...wires([3, 2], [3, 3], [0, 3], [0, 2]), ...wires([3, 1], [4, 1])], grounds: [[0, 3]], A: [4, 1], B: [3, 3] }) },
  kcl: { label: 'KCL: node with three branches', note: 'KCL: the 5 mA arriving through R1 splits 2.5 / 1.67 / 0.83 mA into the three branches (current divides in proportion to conductance).', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 10), mk('R', [1, 0], [2, 0], 1000), ...[2, 4, 6].flatMap((c, k) => [mk('R', [c, 1], [c, 2], [2000, 3000, 6000][k]), ...wires([c, 0], [c, 1]), ...wires([c, 2], [c, 3])]), ...wires([0, 1], [0, 0], [1, 0]), ...wires([2, 0], [6, 0]), ...wires([0, 2], [0, 3], [6, 3])], grounds: [[0, 3]], A: [2, 0], B: [2, 3] }) },
  kvl: { label: 'KVL: two loops', note: 'KVL: around any closed loop the voltage rises equal the drops. Check loop 1 (V1, R1, R3) and loop 2 (R3, R2, R4).', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 12), mk('R', [1, 0], [2, 0], 1000), mk('R', [3, 1], [3, 2], 2000), mk('R', [4, 0], [5, 0], 1000), mk('R', [6, 1], [6, 2], 1000), ...wires([0, 1], [0, 0], [1, 0]), ...wires([2, 0], [4, 0]), ...wires([3, 0], [3, 1]), ...wires([5, 0], [6, 0], [6, 1]), ...wires([3, 2], [3, 3]), ...wires([0, 2], [0, 3], [6, 3], [6, 2])], grounds: [[0, 3]], A: [3, 1], B: [3, 2] }) },
  wheatstone: { label: 'Wheatstone bridge', note: 'Balanced when R1/R3 = R2/R4: the bridge resistor R5 then carries zero current. Here R4 is slightly off; set it to 2 kΩ to balance.', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 10), mk('R', [2, 1], [2, 2], 1000), mk('R', [2, 2], [2, 3], 2000), mk('R', [5, 1], [5, 2], 1000), mk('R', [5, 2], [5, 3], 2200), mk('R', [3, 2], [4, 2], 100), ...wires([0, 1], [0, 0], [5, 0], [5, 1]), ...wires([2, 0], [2, 1]), ...wires([2, 2], [3, 2]), ...wires([4, 2], [5, 2]), ...wires([0, 2], [0, 4], [5, 4], [5, 3]), ...wires([2, 3], [2, 4])], grounds: [[0, 4]], A: [2, 2], B: [5, 2] }) },
  superposition: { label: 'Superposition: two sources', note: 'Set V2 to 0 V and note the middle node, then restore V2 and set V1 to 0 V: the two partial answers add to the full one (6.8 V).', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 12), mk('R', [1, 0], [2, 0], 1000), mk('R', [3, 1], [3, 2], 2000), mk('R', [4, 0], [5, 0], 1000), mk('V', [6, 1], [6, 2], 5), ...wires([0, 1], [0, 0], [1, 0]), ...wires([2, 0], [4, 0]), ...wires([3, 0], [3, 1]), ...wires([5, 0], [6, 0], [6, 1]), ...wires([3, 2], [3, 3]), ...wires([0, 2], [0, 3], [6, 3], [6, 2])], grounds: [[0, 3]], A: [3, 0], B: [3, 3] }) },
  'rc-charge': { label: 'RC charging (transient)', note: 'τ = RC = 1 ms. With the switch closed at t = 0, vC rises 63% in one τ; open it and choose "start from DC with switches flipped" to see the other side.', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 5), mk('SW', [1, 0], [2, 0], 0, true), mk('R', [3, 0], [4, 0], 1000), mk('C', [5, 1], [5, 2], 1e-6), ...wires([0, 1], [0, 0], [1, 0]), ...wires([2, 0], [3, 0]), ...wires([4, 0], [5, 0], [5, 1]), ...wires([5, 2], [5, 3], [0, 3], [0, 2])], grounds: [[0, 3]], A: [5, 1], B: [5, 3], mode: 'tran' }) },
  'rl-charge': { label: 'RL charging (transient)', note: 'τ = L/R = 1 ms. The inductor current cannot jump: at t = 0+ the whole 5 V appears across L, then iL rises to V/R = 50 mA.', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 5), mk('SW', [1, 0], [2, 0], 0, true), mk('R', [3, 0], [4, 0], 100), mk('L', [5, 1], [5, 2], 0.1), ...wires([0, 1], [0, 0], [1, 0]), ...wires([2, 0], [3, 0]), ...wires([4, 0], [5, 0], [5, 1]), ...wires([5, 2], [5, 3], [0, 3], [0, 2])], grounds: [[0, 3]], A: [5, 1], B: [5, 3], mode: 'tran' }) },
  'led-resistor': { label: 'LED + current-limiting resistor', note: 'R = (Vs − Vf)/I. A red LED drops ≈ 2 V, so 5 V and 220 Ω give ≈ 13.5 mA. Drop R below ~100 Ω and the LED exceeds its 30 mA rating.', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 5), mk('R', [1, 0], [2, 0], 220), mk('LED', [3, 1], [3, 2]), ...wires([0, 1], [0, 0], [1, 0]), ...wires([2, 0], [3, 0], [3, 1]), ...wires([3, 2], [3, 3], [0, 3], [0, 2])], grounds: [[0, 3]], A: [3, 1], B: [3, 2] }) },
  pullup: { label: 'Pull-up resistor + switch', note: 'Switch open: no current, so no drop across the pull-up and the node sits at Vcc (logic 1). Closed: the node is shorted to ground (logic 0) and Vcc/R flows.', build: () => ({ parts: [mk('V', [0, 1], [0, 2], 3.3), mk('R', [3, 0], [3, 1], 10000), mk('SW', [3, 2], [3, 3], 0, false), ...wires([0, 1], [0, 0], [3, 0]), ...wires([3, 1], [3, 2]), ...wires([3, 1], [4, 1]), ...wires([3, 3], [3, 4], [0, 4], [0, 2])], grounds: [[0, 4]], A: [4, 1], B: [3, 4] }) },
};
function fromPreset(name: string): Lab {
  const p = (PRESETS[name] ?? PRESETS.ohm).build();
  const firstL = p.parts.find(q => q.kind === 'L');
  return { A: null, B: null, mode: 'dc', span: null, init: 'zero', sel: firstL?.id ?? null, ...p };
}

const fmtV = (v: number | undefined) => v === undefined || !isFinite(v) ? '—' : si(Math.abs(v) < 1e-12 ? 0 : v, 'V');

export default function CircuitLab({ params }: SimProps) {
  const presetName = typeof params.preset === 'string' && PRESETS[params.preset] ? params.preset : 'ohm';
  const editable = params.editable === undefined ? true : !(params.editable === false || params.editable === 'false');
  const [preset, setPreset] = useState(presetName);
  const [lab, setLab] = useState<Lab>(() => fromPreset(presetName));
  const [tool, setTool] = useState<Tool>('select');
  const [hover, setHover] = useState<string | null>(null);
  const [showV, setShowV] = useState(true);
  const [tIdx, setTIdx] = useState(1000);
  const [playing, setPlaying] = useState(false);
  const circuit: Circuit = useMemo(() => ({ parts: lab.parts, grounds: lab.grounds }), [lab.parts, lab.grounds]);

  // display names (R1, R2, C1 …) by order of appearance
  const names = useMemo(() => {
    const cnt: Record<string, number> = {}; const m = new Map<string, string>();
    for (const p of lab.parts) { if (p.kind === 'wire') continue; cnt[p.kind] = (cnt[p.kind] ?? 0) + 1; m.set(p.id, PREFIX[p.kind] + cnt[p.kind]); }
    return m;
  }, [lab.parts]);
  const nameOf = (id: string) => names.get(id) ?? 'wire';
  const fixMsg = (s: string) => s.replace(/\bp\d+\b/g, m => names.get(m) ?? m);
  const byEdge = useMemo(() => new Map(lab.parts.map(p => [edgeKey(p.a, p.b), p])), [lab.parts]);

  // ---------- solve ----------
  const dc = useMemo(() => solve(circuit), [circuit]);
  const taus = useMemo(() => lab.mode === 'tran' ? timeConstants(circuit) : [], [circuit, lab.mode]);
  const autoSpan = taus.length ? Math.min(100, Math.max(1e-7, 5 * Math.max(...taus.map(t => t.tau)))) : 1e-3;
  const span = lab.span ?? autoSpan;
  const STEPS = 1000;
  const tran = useMemo(() => lab.mode === 'tran' ? transient(circuit, span, STEPS, lab.init) : null, [circuit, span, lab.mode, lab.init]);
  const k = tran && tran.frames.length ? Math.min(tIdx, tran.frames.length - 1) : 0;
  const sol: Solution = tran && tran.frames.length ? tran.frames[k] : dc;
  const err = lab.mode === 'tran' && tran?.error ? fixMsg(tran.error) : sol.errors.length ? fixMsg(sol.errors[0]) : null;

  // playback of the transient through the scrubber
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let last: number | null = null;
    const step = (t: number) => {
      if (last !== null) setTIdx(i => { const n = i + Math.max(1, Math.round((t - last!) / 4000 * STEPS)); if (n >= STEPS) { setPlaying(false); return STEPS; } return n; });
      last = t; raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing]);

  // ---------- editing ----------
  const update = (f: (l: Lab) => Lab) => setLab(l => f(l));
  const clickEdge = (a: Pt, b: Pt) => {
    const ek = edgeKey(a, b); const cur = byEdge.get(ek);
    if (tool === 'select' || tool === 'probe' || tool === 'gnd') {
      if (cur) update(l => ({ ...l, sel: cur.id, parts: cur.kind === 'SW' ? l.parts.map(p => p.id === cur.id ? { ...p, closed: !p.closed } : p) : l.parts }));
      else update(l => ({ ...l, sel: null }));
      return;
    }
    if (!editable) return;
    if (tool === 'erase') { if (cur) update(l => ({ ...l, parts: l.parts.filter(p => p.id !== cur.id), sel: l.sel === cur.id ? null : l.sel })); return; }
    const kind = tool as Kind;
    if (cur && cur.kind === kind) { // same tool on same part: flip polarity (or select)
      if (POLAR.includes(kind)) update(l => ({ ...l, sel: cur.id, parts: l.parts.map(p => p.id === cur.id ? { ...p, a: p.b, b: p.a } : p) }));
      else update(l => ({ ...l, sel: cur.id }));
      return;
    }
    // new part: vertical sources/diodes point "up" (+ / anode on top) by default
    const [p, q] = a[1] !== b[1] ? (a[1] < b[1] ? [a, b] : [b, a]) : (a[0] < b[0] ? [a, b] : [b, a]);
    const np = mk(kind, p, q, cur?.kind === kind ? cur.value : undefined, kind === 'SW' ? false : undefined);
    update(l => ({ ...l, parts: [...l.parts.filter(x => x.id !== cur?.id), np], sel: kind === 'wire' ? l.sel : np.id }));
  };
  const clickPoint = (pt: Pt) => {
    if (tool === 'gnd' && editable) update(l => ({ ...l, grounds: l.grounds.some(g => eq(g, pt)) ? l.grounds.filter(g => !eq(g, pt)) : [...l.grounds, pt] }));
    else if (tool === 'erase' && editable) update(l => ({ ...l, grounds: l.grounds.filter(g => !eq(g, pt)) }));
    else if (tool === 'probe') update(l => l.A && eq(l.A, pt) ? { ...l, A: null } : l.B && eq(l.B, pt) ? { ...l, B: null } : !l.A ? { ...l, A: pt } : { ...l, B: pt });
  };
  const onKey = (f: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } };
  const sel = lab.parts.find(p => p.id === lab.sel) ?? null;
  const setSel = (f: (p: Part) => Part) => sel && update(l => ({ ...l, parts: l.parts.map(p => p.id === sel.id ? f(p) : p) }));

  // ---------- schematic ----------
  const maxI = useMemo(() => Math.max(1e-15, ...lab.parts.map(p => Math.abs(sol.i.get(p.id) ?? 0))), [sol, lab.parts]);
  const svgInner = useMemo(() => {
    const els: any[] = [];
    const deg = new Map<string, number>();
    for (const p of lab.parts) for (const t of [p.a, p.b]) deg.set(key(t), (deg.get(key(t)) ?? 0) + 1);
    for (const p of lab.parts) {
      const a = [p.a[0] * S, p.a[1] * S], b = [p.b[0] * S, p.b[1] * S];
      const isSel = p.id === lab.sel;
      const cur = sol.i.get(p.id) ?? 0;
      if (p.kind === 'wire') {
        const flowing = sol.ok && Math.abs(cur) > Math.max(1e-9, 1e-4 * maxI);
        els.push({ t: 'wire', pts: [a, b], flow: flowing ? (cur >= 0 ? true : 'reverse') : undefined, color: isSel ? 'accent' : undefined });
        continue;
      }
      const t = p.kind === 'SW' ? (p.closed ? 'SWclosed' : 'SW') : p.kind;
      const val = p.kind === 'SW' ? (p.closed ? 'closed' : 'open') : p.kind === 'D' || p.kind === 'LED' ? '' : si(p.value, UNIT[p.kind]);
      const ledOn = p.kind === 'LED' && cur > 1e-4;
      els.push({ t, a, b, label: nameOf(p.id), value: val, color: isSel ? 'accent' : ledOn ? 'red' : undefined });
    }
    for (const [k2, d] of deg) if (d >= 3) { const [x, y] = k2.split(',').map(Number); els.push({ t: 'dot', at: [x * S, y * S] }); }
    for (const g of lab.grounds) els.push({ t: 'gnd', at: [g[0] * S, g[1] * S] });
    const svg = renderCircuit({ elements: els }).svg;
    return svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
  }, [lab.parts, lab.grounds, lab.sel, sol, maxI, names]);

  // one voltage tag per non-ground net, at its top-left-most point that touches a component
  const tags = useMemo(() => {
    if (!sol.ok || !showV) return [];
    const best = new Map<number, Pt>();
    for (const p of lab.parts) for (const t of [p.a, p.b]) {
      const n = sol.net.netOf.get(key(t)); if (n === undefined || n === sol.net.ref) continue;
      const cur = best.get(n); if (!cur || t[1] < cur[1] || (t[1] === cur[1] && t[0] < cur[0])) best.set(n, t);
    }
    return [...best.entries()].map(([n, pt]) => ({ pt, v: sol.netV[n] }));
  }, [sol, lab.parts, showV]);

  // ---------- readouts ----------
  const vA = lab.A ? sol.pointV(lab.A) : undefined, vB = lab.B ? sol.pointV(lab.B) : 0;
  const vAB = vA !== undefined && vB !== undefined ? vA - vB : undefined;
  const req = useMemo(() => lab.A && lab.B ? reqBetween(circuit, lab.A, lab.B) : null, [circuit, lab.A, lab.B]);
  const sources = lab.parts.filter(p => p.kind === 'V');
  const seen = sources.length === 1 && lab.parts.filter(p => p.kind === 'I').length === 0 ? (() => { const i = -(sol.i.get(sources[0].id) ?? 0); return Math.abs(i) > 1e-15 ? sources[0].value / i : Infinity; })() : null;
  const pSupplied = lab.parts.reduce((s, p) => s + Math.max(0, -(sol.p.get(p.id) ?? 0)), 0);
  const pSum = lab.parts.reduce((s, p) => s + (sol.p.get(p.id) ?? 0), 0);
  const leds = lab.parts.filter(p => p.kind === 'LED');
  const ledOver = leds.some(p => (sol.i.get(p.id) ?? 0) > 0.03);

  // ---------- transient plot ----------
  const tranPlots = useMemo(() => {
    if (!tran || !tran.frames.length) return null;
    const vs: any[] = [], is: any[] = [];
    const colors = ['accent', 'red', 'green', 'orange', 'purple'];
    if (lab.A) vs.push({ x: tran.t, y: tran.frames.map(f => (f.pointV(lab.A!) ?? 0) - (lab.B ? f.pointV(lab.B) ?? 0 : 0)), label: lab.B ? 'V(A) − V(B)' : 'V(A)', color: 'accent' });
    let ci = 1;
    for (const p of lab.parts) {
      if (p.kind === 'C' && vs.length < 4) vs.push({ x: tran.t, y: tran.frames.map(f => f.v.get(p.id) ?? 0), label: `v(${nameOf(p.id)})`, color: colors[ci++ % colors.length], dashed: !!lab.A });
      if (p.kind === 'L' && is.length < 4) is.push({ x: tran.t, y: tran.frames.map(f => f.i.get(p.id) ?? 0), label: `i(${nameOf(p.id)})`, color: colors[ci++ % colors.length] });
    }
    if (sel && sel.kind !== 'wire' && sel.kind !== 'L') is.push({ x: tran.t, y: tran.frames.map(f => f.i.get(sel.id) ?? 0), label: `i(${nameOf(sel.id)})`, color: 'blue', dashed: true });
    return { vs, is };
  }, [tran, lab.A, lab.B, lab.parts, sel, names]);
  const tNow = tran?.t[k] ?? 0;

  const loadPreset = (name: string) => { setPreset(name); setLab(fromPreset(name)); setTIdx(STEPS); setPlaying(false); };
  const toolOpts: { value: Tool; label: string }[] = editable
    ? [{ value: 'select', label: 'Select' }, { value: 'wire', label: 'Wire' }, { value: 'R', label: 'R' }, { value: 'C', label: 'C' }, { value: 'L', label: 'L' }, { value: 'V', label: 'V src' }, { value: 'I', label: 'I src' }, { value: 'SW', label: 'Switch' }, { value: 'D', label: 'Diode' }, { value: 'LED', label: 'LED' }, { value: 'gnd', label: 'Ground' }, { value: 'probe', label: 'Probe' }, { value: 'erase', label: 'Erase' }]
    : [{ value: 'select', label: 'Select / toggle' }, { value: 'probe', label: 'Probe' }];
  const hint: Record<string, string> = {
    select: 'Click a part to select it (click a switch to toggle it).', wire: 'Click grid edges to draw wires.', erase: 'Click a part or a ground to remove it.',
    gnd: 'Click a grid point to add/remove a ground.', probe: 'Click points to place probe A, then B (click again to remove).',
  };
  const curHint = hint[tool] ?? `Click a grid edge to place ${tool === 'V' ? 'a voltage source' : tool === 'I' ? 'a current source' : 'a ' + tool}. Click it again with the same tool to ${POLAR.includes(tool as Kind) ? 'flip its polarity' : 'select it'}.`;

  return (
    <SimShell title="Circuit lab (build & solve)" onReset={() => loadPreset(presetName)}
      tryThis={<>{PRESETS[preset]?.note} {editable ? 'Then build your own: pick a tool, click grid edges to place parts, add a ground, and watch the node voltages and animated current update instantly.' : ''}</>}
      controls={<>
        {editable && <Select label="Preset circuit" value={preset} onChange={loadPreset} options={Object.entries(PRESETS).map(([v, p]) => ({ value: v, label: p.label }))} />}
        <Seg label="Tool" value={tool} onChange={setTool} options={toolOpts} />
        <Note>{curHint}</Note>
        {sel && sel.kind !== 'wire' && <div className="ctl" style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10, gap: 8 }}>
          <span className="ctl-head"><span className="ctl-label">Selected: <b>{nameOf(sel.id)}</b></span><span className="ctl-val">{sel.kind}</span></span>
          {RANGE[sel.kind] && <Slider label="Value" value={sel.value} min={RANGE[sel.kind]![0]} max={RANGE[sel.kind]![1]} log={RANGE[sel.kind]![2]} step={0.1} unit={UNIT[sel.kind]} onChange={v => setSel(p => ({ ...p, value: v }))} />}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {sel.kind === 'SW' && <button type="button" className="btn btn-sm" onClick={() => setSel(p => ({ ...p, closed: !p.closed }))}>{sel.closed ? 'Open switch' : 'Close switch'}</button>}
            {editable && POLAR.includes(sel.kind) && <button type="button" className="btn btn-sm" onClick={() => setSel(p => ({ ...p, a: p.b, b: p.a }))}>Flip polarity</button>}
            {editable && <button type="button" className="btn btn-sm" onClick={() => update(l => ({ ...l, parts: l.parts.filter(p => p.id !== sel.id), sel: null }))}>Delete</button>}
          </div>
        </div>}
        <Seg label="Analysis" value={lab.mode} onChange={m => { update(l => ({ ...l, mode: m })); setTIdx(STEPS); }} options={[{ value: 'dc', label: 'DC operating point' }, { value: 'tran', label: 'Transient' }]} />
        {lab.mode === 'tran' && <>
          <Slider label="Simulated time span" value={span} min={1e-7} max={100} log unit="s" onChange={v => update(l => ({ ...l, span: v }))} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm" onClick={() => update(l => ({ ...l, span: null }))}>Auto span (5τ = {si(autoSpan, 's')})</button>
          </div>
          <Seg label="Initial state at t = 0" value={lab.init} onChange={v => update(l => ({ ...l, init: v }))} options={[{ value: 'zero', label: 'All discharged' }, { value: 'dc', label: 'DC with switches flipped' }]} />
          <Slider label="Show values at time t" value={tNow} min={0} max={span} step={span / STEPS} unit="s" onChange={v => { setPlaying(false); setTIdx(Math.round(v / span * STEPS)); }} />
          <button type="button" className="btn btn-sm" onClick={() => { if (!playing && tIdx >= STEPS) setTIdx(0); setPlaying(p => !p); }}>{playing ? 'Pause' : 'Play transient'}</button>
        </>}
        <Toggle label="Show node voltages" checked={showV} onChange={setShowV} />
        {editable && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLab(l => ({ ...l, parts: [], grounds: [], A: null, B: null, sel: null }))}>Clear the board</button>}
      </>}>
      <div className="figure-body" style={{ padding: 0 }}>
        <svg className="ck-svg" viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} style={{ width: '100%', maxWidth: 720, height: 'auto', touchAction: 'manipulation' }} role="group" aria-label="Circuit editor grid">
          {/* lattice */}
          {Array.from({ length: COLS * ROWS }, (_, n) => { const c = n % COLS, r = Math.floor(n / COLS); return <circle key={'g' + n} cx={c * PX} cy={r * PX} r={2} fill="var(--d-muted)" opacity={0.45} />; })}
          {/* LED glow */}
          {leds.map(p => { const i = sol.i.get(p.id) ?? 0; if (i < 1e-4) return null; return <circle key={'glow' + p.id} cx={(p.a[0] + p.b[0]) / 2 * PX} cy={(p.a[1] + p.b[1]) / 2 * PX} r={26} fill="var(--d-red)" opacity={Math.min(0.55, 0.08 + 0.47 * i / 0.02)} />; })}
          <g dangerouslySetInnerHTML={{ __html: svgInner }} />
          {/* node voltage tags */}
          {tags.map(({ pt, v }, n) => <text key={'v' + n} x={pt[0] * PX + 6} y={pt[1] * PX - 7} fontSize={11} fontWeight={600} fill="var(--d-blue)" style={{ paintOrder: 'stroke', stroke: 'var(--d-bg)', strokeWidth: 3 }}>{fmtV(v)}</text>)}
          {/* probes */}
          {([['A', lab.A, 'var(--d-red)'], ['B', lab.B, 'var(--d-green)']] as const).map(([n, pt, col]) => pt && <g key={n}>
            <circle cx={pt[0] * PX} cy={pt[1] * PX} r={8} fill="var(--d-bg)" stroke={col} strokeWidth={2.2} />
            <text x={pt[0] * PX} y={pt[1] * PX + 4} fontSize={10} fontWeight={700} textAnchor="middle" fill={col}>{n}</text>
          </g>)}
          {/* hit targets: edges */}
          {ALL_EDGES.map(([a, b]) => { const ek = edgeKey(a, b); const p = byEdge.get(ek); const h = hover === ek;
            return <line key={ek} x1={a[0] * PX} y1={a[1] * PX} x2={b[0] * PX} y2={b[1] * PX} stroke="var(--d-accent)" strokeOpacity={h ? 0.22 : 0} strokeWidth={22} strokeLinecap="round"
              style={{ cursor: 'pointer', outline: 'none' }} role="button" tabIndex={0}
              aria-label={p ? `${p.kind === 'wire' ? 'wire' : nameOf(p.id)} from ${key(a)} to ${key(b)}` : `empty edge ${key(a)} to ${key(b)}`}
              onMouseEnter={() => setHover(ek)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(ek)} onBlur={() => setHover(null)}
              onClick={() => clickEdge(a, b)} onKeyDown={onKey(() => clickEdge(a, b))} />; })}
          {/* hit targets: points (ground / probe) */}
          {(tool === 'gnd' || tool === 'probe' || tool === 'erase') && Array.from({ length: COLS * ROWS }, (_, n) => { const pt: Pt = [n % COLS, Math.floor(n / COLS)]; const kk = 'pt' + key(pt);
            return <circle key={kk} cx={pt[0] * PX} cy={pt[1] * PX} r={11} fill="var(--d-accent)" fillOpacity={hover === kk ? 0.3 : 0.06} style={{ cursor: 'pointer', outline: 'none' }}
              role="button" tabIndex={0} aria-label={`grid point ${key(pt)}`} onMouseEnter={() => setHover(kk)} onMouseLeave={() => setHover(null)}
              onClick={() => clickPoint(pt)} onKeyDown={onKey(() => clickPoint(pt))} />; })}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {err ? <RegionBadge label={err} color="bad" /> : <RegionBadge label={lab.mode === 'dc' ? 'DC operating point solved (MNA)' : `Transient (backward Euler, ${STEPS} steps) at t = ${si(tNow, 's')}`} color="ok" />}
        {!err && sol.warnings.map((w, n) => <RegionBadge key={n} label={w} color="warn" />)}
        {ledOver && <RegionBadge label="LED over 30 mA: it would burn out" color="bad" />}
      </div>
      {lab.mode === 'tran' && taus.length > 0 && <EqBox>{taus.map(t => { const p = lab.parts.find(q => q.id === t.id)!; return p.kind === 'C' ? String.raw`\tau_{${nameOf(p.id)}} = R_{th}C = \text{${si(t.r, 'Ω')}}\cdot\text{${si(p.value, 'F')}} = \text{${si(t.tau, 's')}}` : String.raw`\tau_{${nameOf(p.id)}} = \tfrac{L}{R_{th}} = \tfrac{\text{${si(p.value, 'H')}}}{\text{${si(t.r, 'Ω')}}} = \text{${si(t.tau, 's')}}`; }).join(String.raw`\qquad `)}</EqBox>}
      {lab.mode === 'dc' && sel && sel.kind !== 'wire' && !err && <EqBox>{
        sel.kind === 'R' ? String.raw`I_{${nameOf(sel.id)}} = \frac{V}{R} = \frac{\text{${si(sol.v.get(sel.id)!, 'V')}}}{\text{${si(sel.value, 'Ω')}}} = \text{${si(sol.i.get(sel.id)!, 'A')}},\quad P = I^2R = \text{${si(sol.p.get(sel.id)!, 'W')}}`
          : sel.kind === 'D' || sel.kind === 'LED' ? String.raw`I = I_S\left(e^{V/nV_T}-1\right):\ V = \text{${si(sol.v.get(sel.id)!, 'V')}},\ I = \text{${si(sol.i.get(sel.id)!, 'A')}}`
            : sel.kind === 'C' ? String.raw`\text{DC: } i_C = C\,\tfrac{dv}{dt} = 0\ \Rightarrow\ \text{open circuit},\ v_C = \text{${si(sol.v.get(sel.id)!, 'V')}}`
              : sel.kind === 'L' ? String.raw`\text{DC: } v_L = L\,\tfrac{di}{dt} = 0\ \Rightarrow\ \text{short circuit},\ i_L = \text{${si(sol.i.get(sel.id)!, 'A')}}`
                : String.raw`P_{${nameOf(sel.id)}} = V I = \text{${si(sol.v.get(sel.id)!, 'V')}}\times\text{${si(sol.i.get(sel.id)!, 'A')}} = \text{${si(sol.p.get(sel.id)!, 'W')}}\ (${(sol.p.get(sel.id) ?? 0) < 0 ? '\\text{supplying}' : '\\text{absorbing}'})`
      }</EqBox>}
      <Readouts>
        {sel && sel.kind !== 'wire' && <Readout k={`${nameOf(sel.id)} voltage`} v={fmtV(sol.v.get(sel.id))} hl />}
        {sel && <Readout k={`${sel.kind === 'wire' ? 'Wire' : nameOf(sel.id)} current`} v={si(sol.i.get(sel.id) ?? 0, 'A')} hl />}
        {sel && sel.kind !== 'wire' && <Readout k={`${nameOf(sel.id)} power`} v={si(sol.p.get(sel.id) ?? 0, 'W')} />}
        <Readout k={lab.B ? 'Probe V(A) − V(B)' : 'Probe V(A)'} v={lab.A ? fmtV(vAB) : 'place probe A'} />
        {req !== null && <Readout k="R_th between A–B (sources off)" v={si(req, 'Ω')} />}
        {seen !== null && <Readout k={`Req seen by ${nameOf(sources[0].id)}`} v={si(seen, 'Ω')} />}
        <Readout k="Power supplied" v={si(pSupplied, 'W')} />
        <Readout k="ΣP (Tellegen)" v={Math.abs(pSum) < 1e-9 + 1e-6 * pSupplied ? '0 ✓' : si(pSum, 'W')} tone={Math.abs(pSum) < 1e-9 + 1e-6 * pSupplied ? 'ok' : 'warn'} />
      </Readouts>
      {tranPlots && <>
        {tranPlots.vs.length > 0 && <Plot series={tranPlots.vs} xUnit="s" yUnit="V" xLabel="Time t" yLabel="Voltage" height={210} vlines={[{ at: tNow, color: 'muted' }, ...taus.slice(0, 1).map(t => ({ at: t.tau, label: 'τ', color: 'accent' }))]} />}
        {tranPlots.is.length > 0 && <Plot series={tranPlots.is} xUnit="s" yUnit="A" xLabel="Time t" yLabel="Current" height={190} vlines={[{ at: tNow, color: 'muted' }, ...taus.slice(0, 1).map(t => ({ at: t.tau, label: 'τ', color: 'accent' }))]} />}
      </>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr style={{ color: 'var(--text-2)', textAlign: 'right' }}><th style={{ textAlign: 'left', padding: '4px 6px' }}>Part</th><th style={{ padding: '4px 6px' }}>Value</th><th style={{ padding: '4px 6px' }}>V (a→b)</th><th style={{ padding: '4px 6px' }}>I (a→b)</th><th style={{ padding: '4px 6px' }}>P absorbed</th></tr></thead>
          <tbody>{lab.parts.filter(p => p.kind !== 'wire').map(p => <tr key={p.id} onClick={() => update(l => ({ ...l, sel: p.id }))} style={{ cursor: 'pointer', borderTop: '1px solid var(--border)', background: p.id === lab.sel ? 'var(--accent-soft)' : undefined, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
            <td style={{ textAlign: 'left', padding: '4px 6px', fontFamily: 'var(--font-ui)', fontWeight: 600 }}>{nameOf(p.id)}</td>
            <td style={{ padding: '4px 6px' }}>{p.kind === 'SW' ? (p.closed ? 'closed' : 'open') : p.kind === 'D' ? 'Si diode' : p.kind === 'LED' ? 'red LED' : si(p.value, UNIT[p.kind])}</td>
            <td style={{ padding: '4px 6px' }}>{fmtV(sol.v.get(p.id))}</td>
            <td style={{ padding: '4px 6px' }}>{si(sol.i.get(p.id) ?? 0, 'A')}</td>
            <td style={{ padding: '4px 6px', color: (sol.p.get(p.id) ?? 0) < -1e-12 ? 'var(--ok)' : undefined }}>{si(sol.p.get(p.id) ?? 0, 'W')}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <Note>Solved with Modified Nodal Analysis: node voltages plus a branch current for each voltage source and inductor. Negative power (green) means the part is supplying energy. Animated dots show conventional current in wires. In DC, capacitors are open and inductors are shorts; transient mode integrates them with backward Euler.</Note>
    </SimShell>
  );
}
