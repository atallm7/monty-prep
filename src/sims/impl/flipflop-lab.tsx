// Latches vs flip-flops, setup/hold windows and metastability, SR latch. Model: models/flipflop-lab.ts
import { ReactElement, useMemo, useRef, useState, PointerEvent as RPE } from 'react';
import { SimShell, SimProps, Seg as SegCtl, Slider, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import { Seg, L, simulateFF, simulateLatch, simulateSR, clockWave, fromRuns, mtbf } from '../models/flipflop-lab';

type Mode = 'latch-vs-ff' | 'setup-hold' | 'sr';
const SPP = 20, NPER = 6, N = SPP * NPER, TCQ = 0.1;
const VW = 760, NAME_W = 70, X0 = NAME_W, X1 = VW - 10, PX = (X1 - X0) / NPER; // px per period
const ROW_H = 46, AMP = 24;
const tx = (t: number) => X0 + t * PX;

function defaults(mode: Mode) {
  if (mode === 'sr') return { a: fromRuns(SPP, NPER, [0.5, 1.0, 3.0, 4.0, 5.0, 5.3]), b: fromRuns(SPP, NPER, [2.0, 2.5, 3.0, 4.0]) };
  if (mode === 'setup-hold') return { a: clockWave(NPER, SPP), b: fromRuns(SPP, NPER, [0.2, 1.45, 2.8, 3.5, 4.2, 5.4]) };
  return { a: clockWave(NPER, SPP), b: fromRuns(SPP, NPER, [0.2, 1.7, 2.2, 3.65, 3.85, 4.75, 5.2]) };
}

function binPath(w: number[], y0: number) {
  let d = ''; const yH = y0 - AMP / 2, yL = y0 + AMP / 2;
  w.forEach((v, k) => { const x = tx(k / SPP), y = v ? yH : yL; if (k === 0) d += `M ${x} ${y}`; else if (v !== w[k - 1]) d += ` L ${x} ${v ? yL : yH} L ${x} ${y}`; d += ` L ${tx((k + 1) / SPP)} ${y}`; });
  return d;
}
function SegWave({ segs, y0, color }: { segs: Seg[]; y0: number; color: string }) {
  const yH = y0 - AMP / 2, yL = y0 + AMP / 2; const lv = (v: L) => v === 1 ? yH : yL;
  const parts: ReactElement[] = []; let d = ''; let prev: L | null = null;
  segs.forEach((s, i) => {
    const xa = tx(s.t0), xb = tx(s.t1);
    if (s.v === 'x') {
      parts.push(<g key={'x' + i}><rect x={xa} y={yH} width={Math.max(0, xb - xa)} height={AMP} fill="var(--d-red)" opacity={0.18} />
        <path d={`M ${xa} ${yH} H ${xb} M ${xa} ${yL} H ${xb}`} stroke="var(--d-red)" strokeWidth={1.6} />
        {xb - xa > 26 && <text x={(xa + xb) / 2} y={y0 + 4} textAnchor="middle" fontSize={10.5} fill="var(--d-red)" fontWeight={700}>X</text>}</g>);
      prev = 'x'; return;
    }
    const y = lv(s.v);
    if (prev === null || prev === 'x') d += ` M ${xa} ${y}`; else if (prev !== s.v) d += ` L ${xa} ${lv(prev)} L ${xa} ${y}`;
    d += ` L ${xb} ${y}`; prev = s.v;
  });
  return <g>{parts}<path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" /></g>;
}

export default function FlipflopLab({ params }: SimProps) {
  const m0: Mode = ['latch-vs-ff', 'setup-hold', 'sr'].includes(params.mode) ? params.mode : 'latch-vs-ff';
  const tsu0 = Math.min(0.4, Math.max(0, Number(params.tsu ?? 0.1))), th0 = Math.min(0.4, Math.max(0, Number(params.th ?? 0.05)));
  const [mode, setModeRaw] = useState<Mode>(m0);
  const [w, setW] = useState(() => defaults(m0));
  const [tsu, setTsu] = useState(tsu0); const [th, setTh] = useState(th0);
  const [tau, setTau] = useState(0.08);
  const [seed, setSeed] = useState(1);
  const [fclk, setFclk] = useState(1e9); const [fdata, setFdata] = useState(1e8); const [stages, setStages] = useState('2');
  const setMode = (m: Mode) => { setModeRaw(m); setW(defaults(m)); };
  const svgRef = useRef<SVGSVGElement>(null);
  const paint = useRef<{ row: 'a' | 'b'; v: number } | null>(null);

  const timing = { spp: SPP, tsu, th, tcq: TCQ, tau, seed };
  const sim = useMemo(() => mode === 'sr'
    ? { sr: simulateSR(w.a, w.b, { spp: SPP, tpd: 0.05, tau, seed }) }
    : { ff: simulateFF(w.a, w.b, timing), la: simulateLatch(w.a, w.b, timing) }, [w, tsu, th, tau, seed, mode]);

  const slotAt = (e: RPE) => { const svg = svgRef.current; const m = svg?.getScreenCTM(); if (!svg || !m) return -1; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const p = pt.matrixTransform(m.inverse()); return Math.floor((p.x - X0) / PX * SPP); };
  const down = (row: 'a' | 'b') => (e: RPE) => { const k = slotAt(e); if (k < 0 || k >= N) return; const v = 1 - w[row][k]; paint.current = { row, v }; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setW(p => ({ ...p, [row]: p[row].map((x, i) => i === k ? v : x) })); };
  const move = (e: RPE) => { const pc = paint.current; if (!pc) return; const k = slotAt(e); if (k < 0 || k >= N || w[pc.row][k] === pc.v) return; setW(p => ({ ...p, [pc.row]: p[pc.row].map((x, i) => i === k ? pc.v : x) })); };
  const up = () => { paint.current = null; };

  const names = mode === 'sr' ? ['S', 'R', 'Q', 'Q̄'] : mode === 'setup-hold' ? ['CLK', 'D', 'Q (DFF)'] : ['CLK', 'D', 'Q latch', 'Q DFF'];
  const rows = names.length; const TOP = mode === 'setup-hold' ? 30 : 16; const VH = TOP + rows * ROW_H + 18;
  const rowY = (i: number) => TOP + i * ROW_H + ROW_H / 2;

  const ff = sim.ff, la = sim.la, sr = sim.sr;
  const viol = ff ? ff.edges.filter(e => e.violated) : [];
  const worstSu = ff ? Math.min(...ff.edges.map(e => e.setupSlack)) : 0, worstH = ff ? Math.min(...ff.edges.map(e => e.holdSlack)) : 0;
  const tr = (Number(stages) - TCQ - tsu) / fclk; // resolution time available (s) before the next stage samples
  const mt = mtbf(tr, 20e-12, 50e-12, fclk, fdata);
  const fmtTime = (s: number) => !isFinite(s) || s > 3.15e7 * 1e12 ? '> 10¹² years' : s > 3.15e7 ? `${(s / 3.15e7).toPrecision(3)} years` : s > 86400 ? `${(s / 86400).toPrecision(3)} days` : si(s, 's');
  const latchDiffers = la && ff ? la.q.some(s => s.v !== 'x' && ff.q.some(f => f.v !== 'x' && f.v !== s.v && Math.min(f.t1, s.t1) > Math.max(f.t0, s.t0))) : false;

  return (
    <SimShell title="Latches, flip-flops, setup/hold & metastability" onReset={() => { setModeRaw(m0); setW(defaults(m0)); setTsu(tsu0); setTh(th0); setTau(0.08); setSeed(1); }}
      tryThis={mode === 'sr' ? <>paint S and R high at the same time: both Q and Q̄ go low (the "forbidden" state). Release them on the same slot and the latch races to a random value; press <b>Re-roll</b> to see it land differently. Release R a slot later than S and the outcome becomes deterministic.</>
        : mode === 'setup-hold' ? <>drag the D edge near 1.45 T leftwards until it leaves the shaded setup window: the red X disappears. Then increase t<sub>su</sub> and watch previously-safe edges fail. Press <b>Re-roll</b>: a violating edge resolves to a random value after a random delay (mean τ).</>
        : <>add a short pulse on D while CLK is high: the latch copies it straight through (transparent), the flip-flop ignores it because it only samples at rising edges. Paint on CLK to make an extra edge and watch only the DFF react.</>}
      controls={<>
        <SegCtl label="Mode" value={mode} onChange={setMode} options={[{ value: 'latch-vs-ff', label: 'Latch vs FF' }, { value: 'setup-hold', label: 'Setup / hold' }, { value: 'sr', label: 'SR latch' }]} />
        {mode !== 'sr' && <>
          <Slider label="Setup time t_su" value={tsu} min={0} max={0.4} step={0.025} onChange={setTsu} format={v => v.toFixed(3) + ' T'} />
          <Slider label="Hold time t_h" value={th} min={0} max={0.3} step={0.025} onChange={setTh} format={v => v.toFixed(3) + ' T'} />
        </>}
        <Slider label="Resolution time constant τ" value={tau} min={0.02} max={0.3} step={0.01} onChange={setTau} format={v => v.toFixed(2) + ' T'} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setSeed(s => s + 1)}>Re-roll metastability</button>
          {mode !== 'sr' && <button className="btn btn-sm" onClick={() => setW(p => ({ ...p, a: clockWave(NPER, SPP) }))}>Regular clock</button>}
          <button className="btn btn-sm" onClick={() => setW(defaults(mode))}>Default waves</button>
          <button className="btn btn-sm" onClick={() => setW(p => ({ ...p, b: Array(N).fill(0) }))}>Clear {mode === 'sr' ? 'R' : 'D'}</button>
        </div>
        {mode === 'setup-hold' && <>
          <div className="small" style={{ fontWeight: 600, marginTop: 4 }}>Synchroniser MTBF (τ = 20 ps, T₀ = 50 ps)</div>
          <Slider label="Clock f_clk" value={fclk} min={5e7} max={3e9} log unit="Hz" onChange={setFclk} />
          <Slider label="Async data rate f_data" value={fdata} min={1e3} max={5e8} log unit="Hz" onChange={setFdata} />
          <SegCtl label="Flip-flops in synchroniser" value={stages} onChange={setStages} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} />
        </>}
        <Note><b>Click or drag</b> on the {mode === 'sr' ? 'S and R' : 'CLK and D'} rows to paint the waveform (each cell is T/20). Time is in clock periods T; t<sub>cq</sub> = 0.1 T.</Note>
      </>}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--d-bg)', touchAction: 'none' }}>
        <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block', userSelect: 'none' }} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Timing diagram">
          {/* period grid */}
          {Array.from({ length: NPER + 1 }, (_, i) => <g key={i}><line x1={tx(i)} x2={tx(i)} y1={TOP - 6} y2={VH - 14} stroke="var(--d-grid)" strokeWidth={1} />
            <text x={tx(i)} y={VH - 3} textAnchor="middle" fontSize={10} fill="var(--d-muted)">{i}T</text></g>)}
          {/* setup/hold windows */}
          {ff && mode !== 'sr' && ff.edges.map((e, i) => <g key={'w' + i}>
            <rect x={tx(e.t - tsu)} width={Math.max(0, tx(e.t + th) - tx(e.t - tsu))} y={TOP - 4} height={VH - TOP - 14} fill={e.violated ? 'var(--d-red)' : 'var(--d-orange)'} opacity={mode === 'setup-hold' ? (e.violated ? 0.22 : 0.12) : 0.06} />
            <line x1={tx(e.t)} x2={tx(e.t)} y1={TOP - 4} y2={VH - 14} stroke={e.violated ? 'var(--d-red)' : 'var(--d-accent)'} strokeWidth={1} strokeDasharray="3 3" />
            {mode === 'setup-hold' && <text x={tx(e.t)} y={TOP - 12} textAnchor="middle" fontSize={10} fontWeight={600} fill={e.violated ? 'var(--d-red)' : 'var(--d-green)'}>{e.violated ? (e.setupSlack < 0 ? 'setup ✗' : 'hold ✗') : '✓'}</text>}
          </g>)}
          {names.map((nm, i) => <text key={nm} x={NAME_W - 8} y={rowY(i) + 4} textAnchor="end" fontSize={12.5} fontWeight={600} fill="var(--d-ink)">{nm}</text>)}
          {/* editable rows */}
          {(['a', 'b'] as const).map((row, i) => <g key={row} onPointerDown={down(row)} style={{ cursor: 'pointer' }} role="group" aria-label={`${names[i]} waveform (click to edit)`}>
            <rect x={X0} y={rowY(i) - ROW_H / 2 + 3} width={X1 - X0} height={ROW_H - 6} fill="var(--d-box)" opacity={0.6} rx={4} />
            <path d={binPath(w[row], rowY(i))} fill="none" stroke={i === 0 && mode !== 'sr' ? 'var(--d-blue)' : 'var(--d-ink)'} strokeWidth={2.2} />
          </g>)}
          {mode === 'sr' && sr && <><SegWave segs={sr.q} y0={rowY(2)} color="var(--d-accent)" /><SegWave segs={sr.qn} y0={rowY(3)} color="var(--d-purple)" />
            {sr.notes.filter(n => n.kind === 'invalid' || n.kind === 'race').map((n, i) => <text key={i} x={tx(n.t) + 3} y={rowY(2) - ROW_H / 2 + 6} fontSize={10} fill="var(--d-red)" fontWeight={600}>{n.kind === 'race' ? 'race!' : 'S=R=1'}</text>)}</>}
          {mode === 'latch-vs-ff' && la && ff && <>
            {/* shade transparent phases on the latch row */}
            {w.a.map((v, k) => v ? <rect key={k} x={tx(k / SPP)} width={PX / SPP + 0.3} y={rowY(2) - ROW_H / 2 + 3} height={ROW_H - 6} fill="var(--d-green)" opacity={0.08} /> : null)}
            <SegWave segs={la.q} y0={rowY(2)} color="var(--d-green)" /><SegWave segs={ff.q} y0={rowY(3)} color="var(--d-accent)" /></>}
          {mode === 'setup-hold' && ff && <SegWave segs={ff.q} y0={rowY(2)} color="var(--d-accent)" />}
        </svg>
      </div>

      {mode === 'latch-vs-ff' && la && ff && <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <RegionBadge label={latchDiffers ? 'Latch and flip-flop outputs differ' : 'Outputs agree (D only changes while CLK is low)'} color={latchDiffers ? 'warn' : 'ok'} />
          <span className="small muted">Green bands: latch transparent (CLK = 1).</span>
        </div>
        <EqBox>{String.raw`\text{D latch: } Q = \begin{cases} D & \text{CLK}=1 \ (\text{transparent})\\ Q_{prev} & \text{CLK}=0 \end{cases}\qquad \text{DFF: } Q(t_{\uparrow}+t_{cq}) = D(t_{\uparrow})`}</EqBox>
        <Readouts>
          <Readout k="Rising edges (DFF samples)" v={ff.edges.length} />
          <Readout k="Latch closing edges" v={la.closes.length} />
          <Readout k="Timing violations" v={ff.edges.filter(e => e.violated).length + la.closes.filter(e => e.violated).length} tone={ff.edges.some(e => e.violated) || la.closes.some(e => e.violated) ? 'bad' : 'ok'} />
          <Readout k="t_cq / t_dq" v="0.1 T" />
        </Readouts>
      </>}
      {mode === 'setup-hold' && ff && <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <RegionBadge label={viol.length ? `${viol.length} violating edge${viol.length > 1 ? 's' : ''}: metastable` : 'All edges meet setup and hold'} color={viol.length ? 'bad' : 'ok'} />
          {ff.edges.some(e => e.failure) && <RegionBadge label="Unresolved before the next edge: failure propagates" color="bad" />}
        </div>
        <EqBox>{String.raw`\text{slack}_{su} = t_{\uparrow} - t_{D} - t_{su} = ${worstSu === Infinity ? '\\infty' : worstSu.toFixed(3)}\,T,\quad \text{slack}_{h} = t_{D} - t_{\uparrow} - t_{h} = ${worstH === Infinity ? '\\infty' : worstH.toFixed(3)}\,T\quad(\text{worst})`}</EqBox>
        <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, fontFamily: 'var(--font-mono)' }}>
          <thead><tr>{['edge', 't', 'setup slack', 'hold slack', 'Q →', 'resolves at'].map(h => <th key={h} style={{ textAlign: 'right', padding: '3px 8px', color: 'var(--text-2)', fontWeight: 600, borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-sans, inherit)' }}>{h}</th>)}</tr></thead>
          <tbody>{ff.edges.map((e, i) => <tr key={i} style={{ color: e.violated ? 'var(--bad)' : undefined }}>
            <td style={{ textAlign: 'right', padding: '2px 8px' }}>{i + 1}</td><td style={{ textAlign: 'right', padding: '2px 8px' }}>{e.t.toFixed(2)} T</td>
            <td style={{ textAlign: 'right', padding: '2px 8px' }}>{isFinite(e.setupSlack) ? e.setupSlack.toFixed(3) : '∞'}</td><td style={{ textAlign: 'right', padding: '2px 8px' }}>{isFinite(e.holdSlack) ? e.holdSlack.toFixed(3) : '∞'}</td>
            <td style={{ textAlign: 'right', padding: '2px 8px', fontWeight: 700 }}>{e.violated ? `X→${e.value}` : e.value}</td><td style={{ textAlign: 'right', padding: '2px 8px' }}>{e.resolveAt ? `${e.resolveAt.toFixed(3)} T${e.failure ? ' ✗' : ''}` : '—'}</td>
          </tr>)}</tbody></table></div>
        <EqBox>{String.raw`\text{MTBF} = \frac{e^{t_r/\tau}}{T_0\, f_{clk}\, f_{data}},\quad t_r = ${stages}\,T - t_{cq} - t_{su} = ${si(tr, 's')}\ \Rightarrow\ \text{MTBF} = \text{${fmtTime(mt)}}`}</EqBox>
        <Readouts>
          <Readout k="Window t_su + t_h" v={`${(tsu + th).toFixed(3)} T`} />
          <Readout k="Resolution time t_r" v={si(tr, 's')} />
          <Readout k="Synchroniser MTBF" v={fmtTime(mt)} hl tone={mt < 3.15e7 * 10 ? 'bad' : mt < 3.15e7 * 1e4 ? 'warn' : 'ok'} />
          <Readout k="Each extra FF multiplies MTBF by" v={`e^(T/τ) = e^${(1 / fclk / 20e-12).toFixed(0)}`} />
        </Readouts>
      </>}
      {mode === 'sr' && sr && <>
        <EqBox>{String.raw`Q^{+} = S + \overline{R}\,Q\quad(SR = 0),\qquad S=R=1 \Rightarrow Q=\overline{Q}=0\ \text{(invalid)}`}</EqBox>
        <Readouts>
          <Readout k="Sets / resets" v={`${sr.notes.filter(n => n.kind === 'set').length} / ${sr.notes.filter(n => n.kind === 'reset').length}`} />
          <Readout k="Invalid S=R=1" v={sr.notes.filter(n => n.kind === 'invalid').length} tone={sr.notes.some(n => n.kind === 'invalid') ? 'warn' : 'ok'} />
          <Readout k="Races (metastable)" v={sr.notes.filter(n => n.kind === 'race').length} tone={sr.notes.some(n => n.kind === 'race') ? 'bad' : 'ok'} />
        </Readouts>
        <Note>A NOR SR latch is two cross-coupled NOR gates. With S = R = 1 both outputs are forced low, so Q̄ is no longer the complement of Q. If both inputs drop together, each gate tries to go high and the loop balances on its metastable point until noise tips it.</Note>
      </>}
    </SimShell>
  );
}
