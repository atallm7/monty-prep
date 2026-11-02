// Interrupts & ISR timing: priorities, latency, nesting, pending flags, missed events. Model: models/interrupt-lab.ts
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import { Src, simulate } from '../models/interrupt-lab';

const T = 240, VW = 780, X0 = 92, LH = 54;
const COLORS = ['var(--d-accent)', 'var(--d-orange)', 'var(--d-purple)', 'var(--d-green)'];
const DEFAULTS: Src[] = [
  { name: 'Timer tick', period: 40, phase: 0, dur: 4, prio: 1, enabled: true },
  { name: 'UART RX', period: 55, phase: 7, dur: 12, prio: 2, enabled: true },
  { name: 'ADC DMA', period: 90, phase: 3, dur: 30, prio: 3, enabled: true },
];

export default function InterruptLab({ params }: SimProps) {
  const init = { nesting: params.nesting === true || params.nesting === 'true' || params.nesting === 1, entry: 1, srcs: DEFAULTS.map(x => ({ ...x })) };
  const [s, setS] = useState(init);
  const r = useMemo(() => simulate(s.srcs, { nesting: s.nesting, entry: s.entry, T }), [s]);
  const setSrc = (i: number, patch: Partial<Src>) => setS(p => ({ ...p, srcs: p.srcs.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  const n = s.srcs.length; const H = (n + 1) * LH + 36; const tx = (t: number) => X0 + (t / T) * (VW - X0 - 10);
  const lane = (i: number) => 24 + i * LH; // top of lane
  const missedAll = r.stats.reduce((a, x) => a + x.missed, 0);
  const worst = Math.max(0, ...r.stats.map(x => x.worstLatency));
  const overloaded = r.util > 1;

  return (
    <SimShell title="Interrupts & ISR timing" onReset={() => setS({ ...init, srcs: DEFAULTS.map(x => ({ ...x })) })}
      tryThis={<>with nesting <b>off</b>, the high-priority Timer tick (priority 1) has to wait behind the 30 µs ADC DMA ISR: look at its latency in the table. Switch nesting <b>on</b> and the Timer ISR preempts it (the DMA bar is split, finishing later). Then raise the ADC DMA duration above its period (90 µs) or shrink the UART period to 10 µs to see <b>missed events</b>: a second event arrives while the first is still pending and is lost.</>}
      controls={<>
        <Toggle label="Nested interrupts (higher priority preempts)" checked={s.nesting} onChange={v => setS(p => ({ ...p, nesting: v }))} />
        <Slider label="Entry + exit overhead per ISR" value={s.entry} min={0} max={6} step={1} format={v => `${Math.round(v)} µs`} onChange={v => setS(p => ({ ...p, entry: Math.round(v) }))} />
        {s.srcs.map((x, i) => (
          <div key={i} className="ctl" style={{ borderLeft: `4px solid ${COLORS[i]}`, paddingLeft: 8 }}>
            <Toggle label={<b>{x.name}</b>} checked={x.enabled} onChange={v => setSrc(i, { enabled: v })} />
            <Slider label="Period" value={x.period} min={5} max={200} step={1} format={v => `${Math.round(v)} µs`} onChange={v => setSrc(i, { period: Math.round(v) })} disabled={!x.enabled} />
            <Slider label="ISR duration" value={x.dur} min={1} max={100} step={1} format={v => `${Math.round(v)} µs`} onChange={v => setSrc(i, { dur: Math.round(v) })} disabled={!x.enabled} />
            <Seg value={String(x.prio) as '1' | '2' | '3'} onChange={v => setSrc(i, { prio: Number(v) })} label="Priority (1 = most urgent)" options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]} />
          </div>
        ))}
      </>}>
      <div className="figure-body" style={{ padding: 6, display: 'block' }}>
        <svg viewBox={`0 0 ${VW} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Interrupt timeline">
          <defs>
            <pattern id="il-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="var(--d-red)" strokeWidth="2" /></pattern>
          </defs>
          {Array.from({ length: T / 20 + 1 }, (_, k) => <g key={k}><line x1={tx(k * 20)} x2={tx(k * 20)} y1={18} y2={H - 4} stroke="var(--d-muted)" strokeOpacity={0.2} strokeDasharray="2 4" /><text x={tx(k * 20)} y={12} fontSize={10} textAnchor="middle" fill="var(--d-muted)">{k * 20}</text></g>)}
          <text x={X0 - 8} y={12} fontSize={10} textAnchor="end" fill="var(--d-muted)">time (µs)</text>
          {[...s.srcs.map((x, i) => ({ nm: x.name + (x.enabled ? ` (P${x.prio})` : ' (off)'), c: COLORS[i] })), { nm: 'main loop', c: 'var(--d-muted)' }].map((l, i) => (
            <g key={i}><text x={X0 - 8} y={lane(i) + LH / 2 + 4} textAnchor="end" fontSize={11.5} fontWeight={600} fill="var(--d-ink)">{l.nm}</text>
              <line x1={X0} x2={VW - 10} y1={lane(i) + LH - 8} y2={lane(i) + LH - 8} stroke="var(--d-muted)" strokeOpacity={0.35} /></g>))}
          {/* main loop runs whenever no ISR is active */}
          {r.segs.filter(g => g.src < 0).map((g, k) => <rect key={'m' + k} x={tx(g.t0)} y={lane(n) + 16} width={Math.max(1, tx(g.t1) - tx(g.t0))} height={20} fill="var(--d-muted)" fillOpacity={0.35} />)}
          {/* pending intervals (arrival -> ISR start) */}
          {r.evs.filter(e => !e.missed && e.start !== null && e.start > e.t).map((e, k) => <rect key={'p' + k} x={tx(e.t)} y={lane(e.src) + 16} width={tx(e.start!) - tx(e.t)} height={20} fill={COLORS[e.src]} fillOpacity={0.18} stroke={COLORS[e.src]} strokeDasharray="3 2" strokeWidth={1} />)}
          {/* never started before the window ended */}
          {r.evs.filter(e => !e.missed && e.start === null).map((e, k) => <rect key={'q' + k} x={tx(e.t)} y={lane(e.src) + 16} width={tx(T) - tx(e.t)} height={20} fill={COLORS[e.src]} fillOpacity={0.12} stroke={COLORS[e.src]} strokeDasharray="3 2" />)}
          {r.segs.filter(g => g.src >= 0).map((g, k) => <rect key={'s' + k} x={tx(g.t0)} y={lane(g.src) + 16} width={Math.max(1.5, tx(g.t1) - tx(g.t0))} height={20} fill={COLORS[g.src]} fillOpacity={0.85} stroke="var(--d-ink)" strokeWidth={0.6} />)}
          {r.evs.map((e, k) => { const x = tx(e.t), y = lane(e.src);
            return e.missed ? <g key={'e' + k}><rect x={x - 6} y={y + 12} width={12} height={28} fill="url(#il-hatch)" opacity={0.7} /><path d={`M${x - 5},${y + 4} L${x + 5},${y + 14} M${x + 5},${y + 4} L${x - 5},${y + 14}`} stroke="var(--d-red)" strokeWidth={2.2} /></g>
              : <g key={'e' + k}><path d={`M${x},${y + 36} V${y + 8} M${x - 3},${y + 12} L${x},${y + 7} L${x + 3},${y + 12}`} stroke={COLORS[e.src]} strokeWidth={1.6} fill="none" /></g>; })}
        </svg>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '2px 4px' }}>Arrows: event arrival (sets the pending flag). Dashed box: pending/waiting for the CPU. Solid bar: ISR executing (entry overhead included). Red cross: event lost because the flag was still set.</div>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}><table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th>Source</th><th>Prio</th><th>Fired</th><th>Served</th><th>Missed</th><th>Worst latency</th><th>Avg latency</th><th>Load</th></tr></thead>
        <tbody>{s.srcs.map((x, i) => { const st = r.stats[i]; return <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
          <td style={{ color: COLORS[i], fontWeight: 700 }}>{x.name}</td><td>{x.prio}</td><td>{st.fired}</td><td>{st.served}</td>
          <td style={{ color: st.missed ? 'var(--bad)' : undefined, fontWeight: st.missed ? 700 : 400 }}>{st.missed}</td>
          <td style={{ color: st.worstLatency > x.dur * 0.5 + 5 ? 'var(--warn)' : undefined }}>{x.enabled ? si(st.worstLatency * 1e-6, 's', 3) : '-'}</td><td>{x.enabled ? si(st.avgLatency * 1e-6, 's', 3) : '-'}</td>
          <td>{x.enabled ? ((x.dur + s.entry) / x.period * 100).toFixed(1) + ' %' : '-'}</td></tr>; })}</tbody></table></div>
      <Readouts>
        <Readout k="CPU in ISRs (window)" v={`${(r.isrLoad * 100).toFixed(1)} %`} hl tone={r.isrLoad > 0.9 ? 'bad' : r.isrLoad > 0.6 ? 'warn' : undefined} />
        <Readout k="Main loop gets" v={`${(r.mainLoad * 100).toFixed(1)} %`} />
        <Readout k="Σ (t_isr + t_entry)/T" v={`${(r.util * 100).toFixed(1)} %`} tone={overloaded ? 'bad' : undefined} />
        <Readout k="Worst latency" v={si(worst * 1e-6, 's', 3)} />
        <Readout k="Missed events" v={String(missedAll)} tone={missedAll ? 'bad' : 'ok'} />
      </Readouts>
      <div style={{ marginTop: 6 }}><RegionBadge label={missedAll ? `${missedAll} event(s) lost: ISR too long for its period` : overloaded ? 'Overloaded (utilisation > 100 %)' : s.nesting ? 'Nested: urgent ISRs preempt' : 'Non-nested: running ISR always finishes'} color={missedAll || overloaded ? 'bad' : s.nesting ? 'info' : 'ok'} /></div>
      <EqBox>{String.raw`t_{lat}=t_{wait}+t_{entry},\qquad U=\sum_i\frac{t_{ISR,i}+t_{entry}}{T_i}=${(r.util * 100).toFixed(1)}\%\ ${r.util > 1 ? '>100\\%\\ \\text{(overload)}' : '<100\\%'}`}</EqBox>
      <Note>{s.nesting ? 'Preemption cuts the latency of urgent sources to just the entry overhead, but lower-priority ISRs stretch. Equal priorities never preempt each other.' : 'Without nesting, worst-case latency of an urgent ISR = the longest lower-priority ISR + its own entry overhead. Keep ISRs short and defer work to the main loop.'}</Note>
    </SimShell>
  );
}
