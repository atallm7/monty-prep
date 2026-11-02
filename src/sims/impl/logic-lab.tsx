// Digital logic simulator: drag gates, click pins to wire, toggle inputs; live propagation with 0/1/X,
// truth table, minimal SOP (Quine-McCluskey) and combinational-loop detection. Logic lives in models/logic-lab.ts.
import { ReactElement, useEffect, useMemo, useRef, useState, PointerEvent as RPE, KeyboardEvent as RKE } from 'react';
import { SimShell, SimProps, Select, Readout, Readouts, Note, RegionBadge } from '../kit';
import { Circuit, GateKind, LNode, V, evaluate, truthTable, preset, PRESET_NAMES, nInputs, hasOutput, inputsOf, outputsOf, nameOf, minimalSOP, structuralExpr, gateCount, GATE_KINDS } from '../models/logic-lab';

const VW = 760, VH = 420;
const PRESET_LABEL: Record<string, string> = { blank: 'Blank canvas', and: 'AND gate', 'half-adder': 'Half adder', 'full-adder': 'Full adder', mux2: '2:1 multiplexer', 'nand-universal': 'NAND is universal', 'xor-from-nand': 'XOR from 4 NANDs', majority: 'Majority of 3', decoder2: '2-to-4 decoder' };

// pin geometry (SVG user units)
function inPin(n: LNode, p: number): [number, number] {
  if (n.kind === 'OUT') return [n.x, n.y];
  const k = nInputs(n.kind); return [n.x, n.y + (k === 1 ? 0 : p === 0 ? -10 : 10)];
}
function outPin(n: LNode): [number, number] { return n.kind === 'IN' ? [n.x + 54, n.y] : [n.x + 70, n.y]; }
const vColor = (v: V | undefined) => v === 1 ? 'var(--d-accent)' : v === 0 ? 'var(--d-muted)' : 'var(--d-red)';

function GateBody({ kind, stroke }: { kind: GateKind; stroke: string }) {
  const inv = kind === 'NAND' || kind === 'NOR' || kind === 'XNOR' || kind === 'NOT';
  const sw = { stroke, strokeWidth: 2, fill: 'var(--d-bg)', strokeLinejoin: 'round' as const };
  const lead = { stroke, strokeWidth: 2 };
  let body: ReactElement; let end = 60;
  if (kind === 'AND' || kind === 'NAND') { body = <path d="M 10 -20 L 34 -20 A 20 20 0 0 1 34 20 L 10 20 Z" {...sw} />; end = 54; }
  else if (kind === 'NOT' || kind === 'BUF') { body = <path d="M 12 -16 L 12 16 L 50 0 Z" {...sw} />; end = 50; }
  else { body = <path d="M 8 -20 Q 40 -20 58 0 Q 40 20 8 20 Q 20 0 8 -20 Z" {...sw} />; end = 58; }
  const k = kind === 'NOT' || kind === 'BUF' ? 1 : 2;
  return <g>
    {k === 1 ? <line x1={0} y1={0} x2={14} y2={0} {...lead} /> : <><line x1={0} y1={-10} x2={16} y2={-10} {...lead} /><line x1={0} y1={10} x2={16} y2={10} {...lead} /></>}
    <line x1={end} y1={0} x2={70} y2={0} {...lead} />
    {body}
    {(kind === 'XOR' || kind === 'XNOR') && <path d="M 2 -20 Q 14 0 2 20" fill="none" {...lead} />}
    {inv && <circle cx={end + 4.5} cy={0} r={4.5} {...sw} />}
    <text x={30} y={34} textAnchor="middle" fontSize={10.5} fill="var(--d-muted)">{kind}</text>
  </g>;
}

let uid = 0;
const newId = (p: string) => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`;

export default function LogicLab({ params }: SimProps) {
  const initName = PRESET_NAMES.includes(params.preset) ? String(params.preset) : 'blank';
  const [presetName, setPresetName] = useState(initName);
  const [c, setC] = useState<Circuit>(() => preset(initName));
  const [sel, setSel] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: 'out'; node: string } | { kind: 'in'; node: string; pin: number } | null>(null);
  const [hoverWire, setHoverWire] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);

  const load = (name: string) => { setPresetName(name); setC(preset(name)); setSel(null); setPending(null); };
  const ev = useMemo(() => evaluate(c), [c]);
  const tt = useMemo(() => truthTable(c), [c]);
  const ins = inputsOf(c), outs = outputsOf(c);
  const curRow = ins.reduce((a, n) => a * 2 + (n.value ?? 0), 0);
  const floating = c.nodes.filter(n => n.kind !== 'IN' && Array.from({ length: nInputs(n.kind) }, (_, p) => p).some(p => !c.wires.some(w => w.to === n.id && w.pin === p)));
  const exprs = useMemo(() => outs.map((o, k) => {
    const col = tt.rows.map(r => r.outs[k]);
    if (col.some(v => v === 'X')) return { name: nameOf(o), sop: null as string | null, struct: structuralExpr(c, o.id) };
    const on = col.map((v, i) => v === 1 ? i : -1).filter(i => i >= 0);
    return { name: nameOf(o), sop: minimalSOP(ins.length, on, [], tt.inNames), struct: structuralExpr(c, o.id) };
  }), [tt, c]);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current; const m = svg?.getScreenCTM(); if (!svg || !m) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const r = pt.matrixTransform(m.inverse()); return { x: r.x, y: r.y };
  };
  const toggleIn = (id: string) => setC(p => ({ ...p, nodes: p.nodes.map(n => n.id === id ? { ...n, value: n.value ? 0 : 1 } : n) }));
  const onNodeDown = (e: RPE, n: LNode) => {
    e.stopPropagation(); const p = toSvg(e);
    drag.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y, sx: p.x, sy: p.y, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPE) => {
    const d = drag.current; if (!d) return; const p = toSvg(e);
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) < 4) return; d.moved = true;
    const nx = Math.max(10, Math.min(VW - 90, Math.round(p.x - d.dx))), ny = Math.max(28, Math.min(VH - 28, Math.round(p.y - d.dy)));
    setC(pc => ({ ...pc, nodes: pc.nodes.map(n => n.id === d.id ? { ...n, x: nx, y: ny } : n) }));
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    if (!d.moved) { const n = c.nodes.find(x => x.id === d.id); if (n?.kind === 'IN') toggleIn(n.id); setSel(d.id); }
  };
  const connect = (from: string, to: string, pin: number) => setC(p => ({ ...p, wires: [...p.wires.filter(w => !(w.to === to && w.pin === pin)), { from, to, pin }] }));
  const clickOut = (id: string) => {
    if (pending?.kind === 'in') { connect(id, pending.node, pending.pin); setPending(null); }
    else setPending(pending?.kind === 'out' && pending.node === id ? null : { kind: 'out', node: id });
  };
  const clickIn = (id: string, pin: number) => {
    if (pending?.kind === 'out') { connect(pending.node, id, pin); setPending(null); }
    else setPending(pending?.kind === 'in' && pending.node === id && pending.pin === pin ? null : { kind: 'in', node: id, pin });
  };
  const delWire = (i: number) => setC(p => ({ ...p, wires: p.wires.filter((_, k) => k !== i) }));
  const delNode = (id: string) => { setC(p => ({ nodes: p.nodes.filter(n => n.id !== id), wires: p.wires.filter(w => w.from !== id && w.to !== id) })); setSel(null); setPending(null); };
  const freeSpot = () => { const k = c.nodes.length; return { x: 220 + (k * 53) % 300, y: 60 + (k * 97) % 300 }; };
  const addGate = (kind: GateKind) => { const id = newId('g'); const s = freeSpot(); setC(p => ({ ...p, nodes: [...p.nodes, { id, kind, ...s }] })); setSel(id); };
  const addInput = () => {
    const used = new Set(c.nodes.map(nameOf)); const name = 'ABCDEFGH'.split('').find(l => !used.has(l)) || 'I' + c.nodes.length;
    const ys = ins.map(n => n.y); const y = ys.length ? Math.min(VH - 30, Math.max(...ys) + 60) : 80;
    setC(p => ({ ...p, nodes: [...p.nodes, { id: newId('i'), kind: 'IN', x: 40, y, label: name, value: 0 }] }));
  };
  const addOutput = () => {
    const used = new Set(c.nodes.map(nameOf)); const name = ['Y', 'Z', 'W', 'Y2', 'Y3', 'Y4'].find(l => !used.has(l)) || 'Out';
    const ys = outs.map(n => n.y); const y = ys.length ? Math.min(VH - 30, Math.max(...ys) + 70) : 180;
    setC(p => ({ ...p, nodes: [...p.nodes, { id: newId('o'), kind: 'OUT', x: 640, y, label: name }] }));
  };
  const setRow = (r: number) => setC(p => { const iv = inputsOf(p); const nIn = iv.length; const map = new Map(iv.map((n, i) => [n.id, ((r >> (nIn - 1 - i)) & 1) as 0 | 1])); return { ...p, nodes: p.nodes.map(n => map.has(n.id) ? { ...n, value: map.get(n.id) } : n) }; });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel && document.activeElement?.closest?.('.logic-canvas')) { e.preventDefault(); delNode(sel); } if (e.key === 'Escape') setPending(null); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  const kb = (fn: () => void) => (e: RKE) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

  const byId = new Map(c.nodes.map(n => [n.id, n]));
  const loopSet = new Set(ev.loopNodes);
  const selNode = sel ? byId.get(sel) : undefined;
  const status = ev.loopNodes.length ? { l: 'Combinational loop', c: 'bad' as const } : floating.length ? { l: 'Unconnected inputs (X)', c: 'warn' as const } : { l: 'Fully defined', c: 'ok' as const };

  return (
    <SimShell title="Digital logic simulator" onReset={() => load(initName)}
      tryThis={<>load <b>NAND is universal</b> and toggle A and B: three outputs (NOT, AND, OR) all come from one gate type. Then load <b>Blank canvas</b>, add a NOT gate and wire its output back to its own input: the simulator flags a combinational loop (a ring oscillator has no stable value). In the <b>2:1 multiplexer</b>, compare the minimal SOP with the gate network.</>}
      controls={<>
        <Select label="Preset circuit" value={presetName} onChange={load} options={PRESET_NAMES.map(p => ({ value: p, label: PRESET_LABEL[p] }))} />
        <div className="ctl"><span className="ctl-head"><span className="ctl-label">Add gate</span></span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {GATE_KINDS.map(k => <button key={k} className="btn btn-sm" onClick={() => addGate(k)}>{k}</button>)}
          </div></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={addInput} disabled={ins.length >= 6}>+ Input</button>
          <button className="btn btn-sm" onClick={addOutput} disabled={outs.length >= 4}>+ Output</button>
          <button className="btn btn-sm" onClick={() => { setC(p => ({ ...p, wires: [] })); setPending(null); }}>Clear wires</button>
        </div>
        {selNode && <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="small">Selected: <b>{selNode.kind === 'IN' || selNode.kind === 'OUT' ? `${selNode.kind === 'IN' ? 'input' : 'output'} ${nameOf(selNode)}` : selNode.kind}</b></span>
          <button className="btn btn-sm" onClick={() => delNode(selNode.id)}>Delete</button>
        </div>}
        <Note><b>Wire:</b> click an output pin (right side), then an input pin (or the reverse). Clicking a wire deletes it. <b>Drag</b> parts to move them, <b>click</b> an input box to toggle it. Wires: <span style={{ color: 'var(--d-accent)' }}>1</span>, <span style={{ color: 'var(--d-muted)' }}>0</span>, <span style={{ color: 'var(--d-red)' }}>X (unknown)</span>.</Note>
      </>}>
      <div className="logic-canvas" style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--d-bg)', touchAction: 'none' }}>
        <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block', userSelect: 'none' }} onPointerMove={onMove} onPointerUp={onUp} onPointerDown={() => { setSel(null); }} role="application" aria-label="Logic circuit canvas">
          <defs><pattern id="ll-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--d-grid)" /></pattern></defs>
          <rect width={VW} height={VH} fill="url(#ll-grid)" />
          {/* wires */}
          {c.wires.map((w, i) => {
            const a = byId.get(w.from), b = byId.get(w.to); if (!a || !b) return null;
            const [x1, y1] = outPin(a), [x2, y2] = inPin(b, w.pin); const v = ev.values[w.from];
            const dx = Math.max(30, Math.abs(x2 - x1) * 0.5);
            // forward wires: smooth S-curve; backward (feedback) wires: route around below both parts
            const yb = Math.min(VH - 6, Math.max(y1, y2) + 34);
            const d = x2 > x1 + 24 ? `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
              : `M ${x1} ${y1} H ${x1 + 14} Q ${x1 + 24} ${y1} ${x1 + 24} ${y1 + 10} V ${yb - 10} Q ${x1 + 24} ${yb} ${x1 + 14} ${yb} H ${x2 - 14} Q ${x2 - 24} ${yb} ${x2 - 24} ${yb - 10} V ${y2 + 10} Q ${x2 - 24} ${y2} ${x2 - 14} ${y2} H ${x2}`;
            return <g key={i} onPointerDown={e => e.stopPropagation()} onClick={() => delWire(i)} onPointerEnter={() => setHoverWire(i)} onPointerLeave={() => setHoverWire(null)} style={{ cursor: 'pointer' }}
              role="button" tabIndex={0} aria-label={`wire from ${nameOf(a)} to ${nameOf(b)}, value ${v}; press Enter to delete`} onKeyDown={kb(() => delWire(i))}>
              <path d={d} stroke="transparent" strokeWidth={12} fill="none" />
              <path d={d} fill="none" stroke={hoverWire === i ? 'var(--d-orange)' : vColor(v)} strokeWidth={v === 1 ? 3 : 2} strokeDasharray={v === 'X' ? '5 4' : undefined} />
            </g>;
          })}
          {/* nodes */}
          {c.nodes.map(n => {
            const isLoop = loopSet.has(n.id); const selected = sel === n.id; const stroke = isLoop ? 'var(--d-red)' : selected ? 'var(--d-orange)' : 'var(--d-ink)';
            const v = ev.values[n.id];
            const body = n.kind === 'IN'
              ? <g role="button" tabIndex={0} aria-label={`input ${nameOf(n)} = ${n.value ?? 0}, press to toggle`} onKeyDown={kb(() => toggleIn(n.id))}>
                  <rect x={0} y={-17} width={46} height={34} rx={7} fill={n.value ? 'var(--d-accent)' : 'var(--d-box)'} stroke={stroke} strokeWidth={selected ? 2.5 : 1.6} />
                  <text x={23} y={5} textAnchor="middle" fontSize={15} fontWeight={700} fill={n.value ? 'var(--d-bg)' : 'var(--d-ink)'} fontFamily="var(--font-mono)">{n.value ?? 0}</text>
                  <line x1={46} y1={0} x2={54} y2={0} stroke={vColor(v)} strokeWidth={2} />
                  <text x={-6} y={4} textAnchor="end" fontSize={13} fontWeight={600} fill="var(--d-ink)">{nameOf(n)}</text>
                </g>
              : n.kind === 'OUT'
                ? <g>
                    <line x1={0} y1={0} x2={10} y2={0} stroke={vColor(v)} strokeWidth={2} />
                    <circle cx={24} cy={0} r={14} fill={v === 1 ? 'var(--d-green)' : v === 'X' ? 'color-mix(in srgb, var(--d-red) 25%, transparent)' : 'var(--d-box)'} stroke={stroke} strokeWidth={selected ? 2.5 : 1.6} />
                    {v === 1 && <circle cx={24} cy={0} r={20} fill="none" stroke="var(--d-green)" strokeOpacity={0.35} strokeWidth={4} />}
                    <text x={24} y={5} textAnchor="middle" fontSize={13} fontWeight={700} fill={v === 1 ? 'var(--d-bg)' : 'var(--d-ink)'} fontFamily="var(--font-mono)">{v}</text>
                    <text x={44} y={5} fontSize={13} fontWeight={600} fill="var(--d-ink)">{nameOf(n)}</text>
                  </g>
                : <GateBody kind={n.kind} stroke={stroke} />;
            return <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
              <g onPointerDown={e => onNodeDown(e, n)} style={{ cursor: 'grab' }}>
                <rect x={n.kind === 'OUT' ? 6 : -2} y={-22} width={n.kind === 'IN' ? 50 : n.kind === 'OUT' ? 40 : 66} height={44} fill="transparent" />
                {body}
              </g>
              {/* pins */}
              {Array.from({ length: nInputs(n.kind) }, (_, p) => {
                const [px, py] = inPin(n, p); const on = pending?.kind === 'in' && pending.node === n.id && pending.pin === p; const can = pending?.kind === 'out';
                return <g key={p} transform={`translate(${px - n.x} ${py - n.y})`} role="button" tabIndex={0} aria-label={`input pin ${p + 1} of ${nameOf(n)}`}
                  onPointerDown={e => e.stopPropagation()} onClick={() => clickIn(n.id, p)} onKeyDown={kb(() => clickIn(n.id, p))} style={{ cursor: 'crosshair' }}>
                  <circle r={11} fill="transparent" />
                  <circle r={on ? 6 : 4} fill={on ? 'var(--d-orange)' : can ? 'var(--d-accent)' : 'var(--d-bg)'} stroke={can ? 'var(--d-accent)' : 'var(--d-ink)'} strokeWidth={1.5} />
                </g>;
              })}
              {hasOutput(n.kind) && (() => {
                const [px, py] = outPin(n); const on = pending?.kind === 'out' && pending.node === n.id; const can = pending?.kind === 'in';
                return <g transform={`translate(${px - n.x} ${py - n.y})`} role="button" tabIndex={0} aria-label={`output pin of ${nameOf(n)}`}
                  onPointerDown={e => e.stopPropagation()} onClick={() => clickOut(n.id)} onKeyDown={kb(() => clickOut(n.id))} style={{ cursor: 'crosshair' }}>
                  <circle r={11} fill="transparent" />
                  <circle r={on ? 6 : 4} fill={on ? 'var(--d-orange)' : can ? 'var(--d-accent)' : vColor(v)} stroke={can ? 'var(--d-accent)' : 'var(--d-ink)'} strokeWidth={1.5} />
                </g>;
              })()}
            </g>;
          })}
          {pending && <text x={VW / 2} y={18} textAnchor="middle" fontSize={12.5} fill="var(--d-orange)">{pending.kind === 'out' ? 'Now click an input pin to connect (Esc cancels)' : 'Now click an output pin to drive this input (Esc cancels)'}</text>}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegionBadge label={status.l} color={status.c} />
        {ev.loopNodes.length > 0 && <span className="small" style={{ color: 'var(--bad)' }}>Gates on the loop are highlighted red; their outputs are undefined (X).</span>}
        {!ev.loopNodes.length && floating.length > 0 && <span className="small muted">{floating.length} part{floating.length > 1 ? 's have' : ' has'} an unconnected input pin, which reads as X.</span>}
      </div>
      <Readouts>
        <Readout k="Inputs / outputs" v={`${ins.length} / ${outs.length}`} />
        <Readout k="Gates" v={gateCount(c)} />
        <Readout k="Wires" v={c.wires.length} />
        {outs.slice(0, 4).map(o => <Readout key={o.id} k={`Output ${nameOf(o)}`} v={String(ev.values[o.id])} hl tone={ev.values[o.id] === 'X' ? 'bad' : undefined} />)}
      </Readouts>
      {outs.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5 }}>
        {exprs.map(e => <div key={e.name} style={{ fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
          <b>{e.name}</b> = {e.sop ?? <span style={{ color: 'var(--bad)' }}>undefined for some inputs (X)</span>}
          <span className="muted"> &nbsp;(minimal SOP){e.struct && e.sop !== null && e.struct !== e.sop ? <> · as wired: {e.struct}</> : null}</span>
        </div>)}
      </div>}
      {ins.length > 0 && outs.length > 0 && <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'center' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}><tr>
            <th style={{ padding: '4px 6px', color: 'var(--text-3)', fontWeight: 500 }}>#</th>
            {tt.inNames.map(nm => <th key={'i' + nm} style={{ padding: '4px 6px' }}>{nm}</th>)}
            {tt.outNames.map((nm, k) => <th key={'o' + k} style={{ padding: '4px 6px', color: 'var(--accent)', borderLeft: k === 0 ? '2px solid var(--border)' : undefined }}>{nm}</th>)}
          </tr></thead>
          <tbody>{tt.rows.map((r, i) => <tr key={i} onClick={() => setRow(i)} style={{ cursor: 'pointer', background: i === curRow ? 'var(--accent-soft)' : undefined }} title="Click to apply this input combination">
            <td style={{ padding: '2px 6px', color: 'var(--text-3)' }}>{i}</td>
            {r.ins.map((b, k) => <td key={k} style={{ padding: '2px 6px' }}>{b}</td>)}
            {r.outs.map((o, k) => <td key={'o' + k} style={{ padding: '2px 6px', fontWeight: 600, color: o === 1 ? 'var(--accent)' : o === 'X' ? 'var(--bad)' : 'var(--text-2)', borderLeft: k === 0 ? '2px solid var(--border)' : undefined }}>{o}</td>)}
          </tr>)}</tbody>
        </table>
      </div>}
    </SimShell>
  );
}
