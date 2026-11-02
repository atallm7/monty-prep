// 5-stage pipeline & hazards: pipeline diagram with stalls, forwarding paths and branch flushes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Toggle, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import { simulate, compareTiming, occupancy, ProgramId, Stage, Row } from '../models/pipeline-lab';

const STAGE_COLOR: Record<Stage, string> = { IF: 'var(--d-blue)', ID: 'var(--d-purple)', EX: 'var(--d-orange)', MEM: 'var(--d-green)', WB: 'var(--d-accent)' };
const PROGS: { value: ProgramId; label: string }[] = [{ value: 'alu', label: 'ALU chain' }, { value: 'load-use', label: 'Load-use' }, { value: 'branch', label: 'Branch loop' }];

function useRaf(on: boolean, period: number, tick: () => void) {
  const ref = useRef(tick); ref.current = tick;
  useEffect(() => {
    if (!on) return;
    let id = 0, last = performance.now(), acc = 0;
    const loop = (t: number) => { acc += t - last; last = t; if (acc >= period) { acc = 0; ref.current(); } id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id);
  }, [on, period]);
}

function Diagram({ rows, cycles, cursor, onCursor, showFwd }: { rows: Row[]; cycles: number; cursor: number; onCursor: (c: number) => void; showFwd: boolean }) {
  const L = 150, CW = 30, RH = 24, HT = 24;
  const nC = Math.max(cycles, 9);
  const W = L + nC * CW + 8, H = HT + rows.length * RH + 6;
  const x = (c: number) => L + (c - 1) * CW;
  const y = (r: number) => HT + r * RH;
  const arrows: { d: string; key: string }[] = [];
  if (showFwd) rows.forEach((r, i) => r.fwd.forEach(f => {
    if (f.kind === 'RF') return;
    const p = rows[f.from]; const srcCycle = f.kind.startsWith('EX/MEM') ? p.ex : p.ex + 1; // value leaves EX/MEM or MEM/WB latch
    const dstCycle = f.kind.endsWith('ID') ? r.ex - 1 : r.ex;
    const x0 = x(srcCycle) + CW - 1, y0 = y(f.from) + RH / 2 + 4, x1 = x(dstCycle) + 3, y1 = y(i) + RH / 2;
    arrows.push({ key: `${i}-${f.reg}-${f.from}`, d: `M${x0},${y0} C${x0},${y1} ${x1 - 8},${y1} ${x1},${y1}` });
  }));
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W * 1.15, minWidth: Math.min(W, 620), display: 'block', fontFamily: 'Inter, sans-serif' }} role="img" aria-label="Pipeline diagram">
        <defs><marker id="pl-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--d-red)' }} /></marker></defs>
        <rect x={x(cursor)} y={2} width={CW} height={H - 4} rx={4} style={{ fill: 'var(--d-accent)', fillOpacity: 0.1 }} />
        {Array.from({ length: nC }, (_, k) => k + 1).map(c => (
          <g key={c} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onCursor(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCursor(c); } }}>
            <rect x={x(c)} y={0} width={CW} height={HT} style={{ fill: 'transparent' }} />
            <text x={x(c) + CW / 2} y={15} textAnchor="middle" fontSize={11} style={{ fill: c === cursor ? 'var(--d-accent)' : 'var(--d-muted)', fontWeight: c === cursor ? 700 : 400 }}>{c}</text>
          </g>))}
        {rows.map((r, i) => (
          <g key={i} opacity={r.flushed ? 0.55 : 1}>
            <line x1={0} x2={W} y1={y(i) + RH} y2={y(i) + RH} style={{ stroke: 'var(--d-grid)' }} />
            <text x={4} y={y(i) + 16} fontSize={11.5} style={{ fill: r.flushed ? 'var(--d-muted)' : 'var(--d-ink)', fontFamily: 'var(--font-mono)', textDecoration: r.flushed ? 'line-through' : undefined }}>{r.ins.text}</text>
            {r.cells.map((c, k) => (
              <g key={k}>
                <rect x={x(c.cycle) + 1.5} y={y(i) + 3} width={CW - 3} height={RH - 6} rx={4}
                  style={{ fill: c.stall ? 'var(--d-bg)' : STAGE_COLOR[c.stage], fillOpacity: c.stall ? 1 : 0.2, stroke: c.stall ? 'var(--d-red)' : STAGE_COLOR[c.stage], strokeDasharray: c.stall ? '3 2' : undefined }} />
                <text x={x(c.cycle) + CW / 2} y={y(i) + 16} textAnchor="middle" fontSize={c.stage === 'MEM' ? 9 : 10} style={{ fill: c.stall ? 'var(--d-red)' : 'var(--d-ink)', fontWeight: 600 }}>{c.stall ? 'st' : c.stage === 'MEM' ? 'MEM' : c.stage}</text>
              </g>))}
            {r.flushed && r.cells.length > 0 && <text x={x(r.cells[r.cells.length - 1].cycle) + CW + 4} y={y(i) + 16} fontSize={11} style={{ fill: 'var(--d-red)', fontWeight: 700 }}>✕ flushed</text>}
            {!r.flushed && r.taken !== undefined && <text x={x(r.ex + 2) + CW + 4} y={y(i) + 16} fontSize={10.5} style={{ fill: r.taken ? 'var(--d-orange)' : 'var(--d-muted)' }}>{r.taken ? 'taken' : 'not taken'}</text>}
          </g>))}
        {arrows.map(a => <path key={a.key} d={a.d} style={{ fill: 'none', stroke: 'var(--d-red)', strokeWidth: 1.6 }} markerEnd="url(#pl-arr)" />)}
      </svg>
    </div>
  );
}

export default function PipelineLab({ params }: SimProps) {
  const p0 = String(params.program ?? 'load-use');
  const init = {
    program: (['alu', 'load-use', 'branch'].includes(p0) ? p0 : 'load-use') as ProgramId,
    forwarding: params.forwarding === undefined ? true : !(params.forwarding === false || params.forwarding === 'false'),
    reorder: false, branchIn: 'EX' as 'EX' | 'ID', tStage: 200e-12, tReg: 20e-12,
  };
  const [s, set] = useState(init);
  const [cursor, setCursor] = useState(5);
  const [play, setPlay] = useState(false);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(q => ({ ...q, [k]: v }));

  const r = useMemo(() => simulate(s.program, { forwarding: s.forwarding, branchIn: s.branchIn, reorder: s.reorder }), [s.program, s.forwarding, s.branchIn, s.reorder]);
  const tm = compareTiming(r.n, r.cycles, s.tStage, s.tReg);
  const cur = Math.min(cursor, r.cycles);
  useRaf(play, 650, () => setCursor(c => (c >= r.cycles ? 1 : c + 1)));
  const occ = occupancy(r.rows, cur);
  const penalty = r.stallCycles + r.flushCycles;
  const fwdUsed = r.rows.flatMap(x => x.fwd.filter(f => f.kind !== 'RF')).length;

  return (
    <SimShell title="5-stage pipeline & hazards" layout="stacked" onReset={() => { set(init); setCursor(5); setPlay(false); }}
      tryThis={<>on <b>Load-use</b>, turn forwarding off and watch each dependent add pay 2 stalls instead of 1. Then turn forwarding back on and tick <b>Reorder loads</b>: moving <code>lw x4</code> up hides both load-use bubbles (13 → 11 cycles). On <b>Branch loop</b>, switch branch resolution from EX to ID and count the flushed slots.</>}
      controls={<>
        <Seg label="Program" value={s.program} options={PROGS} onChange={v => { set(q => ({ ...q, program: v })); setCursor(5); }} />
        <Toggle label="Forwarding (bypass) paths" checked={s.forwarding} onChange={upd('forwarding')} />
        {s.program === 'load-use' && <Toggle label="Reorder loads (compiler scheduling)" checked={s.reorder} onChange={upd('reorder')} />}
        {s.program === 'branch' && <Seg label="Branch resolved in" value={s.branchIn} options={[{ value: 'EX', label: 'EX (2-cycle penalty)' }, { value: 'ID', label: 'ID (1-cycle)' }]} onChange={upd('branchIn')} />}
        <Slider label="Slowest stage delay" value={s.tStage} min={50e-12} max={500e-12} step={10e-12} unit="s" onChange={upd('tStage')} />
        <Slider label="Pipeline register overhead" value={s.tReg} min={0} max={100e-12} step={5e-12} unit="s" onChange={upd('tReg')} />
        <div className="ctl">
          <Slider label="Cycle cursor" value={cur} min={1} max={r.cycles} step={1} format={v => `cycle ${v}`} onChange={v => setCursor(Math.round(v))} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => setCursor(c => Math.max(1, c - 1))}>◀ Step</button>
            <button className="btn btn-sm" onClick={() => setPlay(v => !v)}>{play ? '❚❚ Pause' : '▶ Play'}</button>
            <button className="btn btn-sm" onClick={() => setCursor(c => Math.min(r.cycles, c + 1))}>Step ▶</button>
          </div>
        </div>
        <Note>Predict-not-taken; register file writes in the first half of WB and reads in the second half of ID. Red arrows are bypass paths; dashed "st" cells are stall bubbles (instruction held in IF/ID while a bubble goes down the pipe).</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={s.forwarding ? 'Forwarding ON' : 'Forwarding OFF'} color={s.forwarding ? 'ok' : 'warn'} />
        {r.loadUse > 0 && <RegionBadge label={`${r.loadUse} load-use stall${r.loadUse > 1 ? 's' : ''}`} color="bad" />}
        {r.rawStalls > 0 && <RegionBadge label={`${r.rawStalls} RAW stall cycles`} color="bad" />}
        {r.branchStalls > 0 && <RegionBadge label={`${r.branchStalls} branch-operand stalls`} color="warn" />}
        {r.flushCycles > 0 && <RegionBadge label={`${r.flushCycles} flushed slots (${r.takenBranches} taken)`} color="warn" />}
        {penalty === 0 && <RegionBadge label="No hazards: ideal CPI" color="ok" />}
        {s.forwarding && fwdUsed > 0 && <RegionBadge label={`${fwdUsed} operands bypassed`} color="info" />}
      </div>
      <Diagram rows={r.rows} cycles={r.cycles} cursor={cur} onCursor={c => { setPlay(false); setCursor(c); }} showFwd={s.forwarding} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 6 }} aria-label={`Stage occupancy in cycle ${cur}`}>
        {(['IF', 'ID', 'EX', 'MEM', 'WB'] as Stage[]).map(st => {
          const i = occ[st]; const row = i === null ? null : r.rows[i]; const cell = row?.cells.find(c => c.cycle === cur);
          const txt = row === null ? 'bubble' : cell?.stall ? `${row.ins.text.split(' ')[0]} (stalled)` : row.flushed ? `${row.ins.text.split(' ')[0]} ✕` : row.ins.text;
          return <div key={st} className="readout" style={{ borderColor: STAGE_COLOR[st], padding: '6px 8px' }}>
            <div className="k" style={{ color: STAGE_COLOR[st] }}>{st} · cycle {cur}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, marginTop: 2, color: row === null ? 'var(--text-3)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={txt}>{txt}</div>
          </div>;
        })}
      </div>
      <Readouts>
        <Readout k="Instructions N" v={r.n} />
        <Readout k="Total cycles" v={r.cycles} hl />
        <Readout k="Stall cycles" v={r.stallCycles} tone={r.stallCycles ? 'bad' : 'ok'} />
        <Readout k="Flush cycles" v={r.flushCycles} tone={r.flushCycles ? 'warn' : 'ok'} />
        <Readout k="CPI (steady state)" v={r.cpi.toFixed(3)} hl tone={r.cpi > 1.25 ? 'bad' : r.cpi > 1 ? 'warn' : 'ok'} />
        <Readout k="Clock (piped)" v={si(1 / tm.tClk, 'Hz')} />
        <Readout k="Time piped / unpiped" v={`${si(tm.tPiped, 's')} / ${si(tm.tUnpiped, 's')}`} />
        <Readout k="Speedup (ideal)" v={`${tm.speedup.toFixed(2)}× (${tm.ideal.toFixed(2)}×)`} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}\text{cycles} = N + 4 + \text{stalls} + \text{flushes} = ${r.n} + 4 + ${r.stallCycles} + ${r.flushCycles} = ${r.cycles} \\ \text{CPI} = 1 + \frac{${penalty}}{${r.n}} = ${r.cpi.toFixed(3)}\end{gathered}`}</EqBox>
      <EqBox>{String.raw`\begin{gathered}\text{Speedup} = \frac{N\,(5\,t_{stage} + t_{reg})}{\text{cycles}\,(t_{stage}+t_{reg})} \\ = \frac{${r.n}\cdot ${(5 * s.tStage * 1e12 + s.tReg * 1e12).toFixed(0)}\,\text{ps}}{${r.cycles}\cdot ${((s.tStage + s.tReg) * 1e12).toFixed(0)}\,\text{ps}} = ${tm.speedup.toFixed(2)}\times\end{gathered}`}</EqBox>
    </SimShell>
  );
}
