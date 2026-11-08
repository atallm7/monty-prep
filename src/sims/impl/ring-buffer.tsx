// Ring buffer: animated circular FIFO with producer (head) and consumer (tail) pointers. Model: models/ring-buffer.ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note } from '../kit';
import Plot from '../../components/Plot';
import { simulate, stateAt, minSizeNeeded, capacityOf, isPow2, maskReach, Conv } from '../models/ring-buffer';

const PRESETS: Record<string, { size: number; prodRate: number; consRate: number; burst: number; gap: number }> = {
  balanced: { size: 16, prodRate: 1, consRate: 1.5, burst: 20, gap: 10 },
  'burst-overflow': { size: 16, prodRate: 4, consRate: 1, burst: 40, gap: 30 },
  sized: { size: 32, prodRate: 4, consRate: 1, burst: 40, gap: 30 },
};

export default function RingBuffer({ params }: SimProps) {
  const init = { size: Math.max(2, Math.min(64, Math.round(Number(params.size ?? 16)))), prodRate: Number(params.prodRate ?? 1.2), consRate: Number(params.consRate ?? 1), burst: Math.max(1, Math.round(Number(params.burst ?? 20))), gap: Number(params.gap ?? 20) };
  const [s, setS] = useState(init);
  const [conv, setConv] = useState<Conv>('count');
  const [mask, setMask] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8); // simulated ms per real second
  const upd = (k: keyof typeof s) => (v: number) => setS(p => ({ ...p, [k]: v }));

  const sim = useMemo(() => simulate({ ...s, conv }), [s, conv]);
  const need = useMemo(() => minSizeNeeded({ prodRate: s.prodRate, consRate: s.consRate, burst: s.burst, gap: s.gap, conv }), [s.prodRate, s.consRate, s.burst, s.gap, conv]);
  const st = useMemo(() => stateAt(s.size, sim.events, t), [s.size, sim, t]);
  const tRef = useRef(0);
  useEffect(() => { tRef.current = 0; setT(0); setPlaying(false); }, [s, conv]);
  useEffect(() => { tRef.current = t; }, [t]);
  const spd = useRef(speed); spd.current = speed;
  useEffect(() => {
    if (!playing) return; let raf = 0, last = -1;
    const tick = (now: number) => {
      tRef.current = Math.min(sim.tEnd, tRef.current + (last < 0 ? 0 : Math.max(0, now - last)) / 1000 * spd.current); last = now; setT(tRef.current);
      if (tRef.current >= sim.tEnd) { setPlaying(false); return; } raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, sim]);

  const plot = useMemo(() => {
    const x: number[] = [0], y: number[] = [0], dy: number[] = [0];
    for (const e of sim.events) { x.push(e.t); y.push(e.count); dy.push(e.dropped); }
    x.push(sim.tEnd); y.push(y[y.length - 1]); dy.push(dy[dy.length - 1]);
    return { x, y, dy };
  }, [sim]);

  const N = s.size, cap = capacityOf(N, conv);
  const full = conv === 'slot' ? (st.headIdx + 1) % N === st.tailIdx : st.count === N;
  const empty = st.count === 0;
  const justDropped = t - st.lastDrop < 0.8 && playing || (!playing && t - st.lastDrop < 0.8 && t > 0 && st.lastDrop >= 0);
  const pow2 = isPow2(N);

  // ---- ring geometry ----
  const C = 160, Ro = 125, Ri = 70, gapA = N > 40 ? 0.01 : 0.025;
  const arc = (i: number) => {
    const a0 = (i / N) * 2 * Math.PI - Math.PI / 2 + gapA, a1 = ((i + 1) / N) * 2 * Math.PI - Math.PI / 2 - gapA;
    const p = (r: number, a: number) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
    return `M${p(Ro, a0)}A${Ro},${Ro} 0 0 1 ${p(Ro, a1)}L${p(Ri, a1)}A${Ri},${Ri} 0 0 0 ${p(Ri, a0)}Z`;
  };
  const mid = (i: number, r: number) => { const a = ((i + 0.5) / N) * 2 * Math.PI - Math.PI / 2; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  const headDeg = (st.headAbs / N) * 360 + (360 / N) / 2, tailDeg = (st.tailAbs / N) * 360 + (360 / N) / 2;
  const unusable = conv === 'slot' ? st.headIdx : -1; // with one-slot-empty the slot at head is always kept free
  const reset = () => { setS(init); setConv('count'); setMask(false); setT(0); setPlaying(false); };
  const applyPreset = (k: string) => { setS(PRESETS[k]); setConv('count'); };
  const play = () => { if (t >= sim.tEnd) { tRef.current = 0; setT(0); } setPlaying(p => !p); };

  const eq = String.raw`\text{backlog} = B\left(1-\frac{r_c}{r_p}\right) = ${s.burst}\left(1-\frac{${s.consRate}}{${s.prodRate}}\right) = ${Math.max(0, s.burst * (1 - s.consRate / s.prodRate)).toFixed(1)}\ \text{items} \Rightarrow N_{\min} = ${need.size}${conv === 'slot' ? '\\ (\\text{incl. 1 empty slot})' : ''}`;

  return (
    <SimShell title="Ring buffer & producer/consumer" onReset={reset}
      tryThis={<>press <b>Play</b> with the <b>Burst overflow</b> preset: the producer (orange arrow, head, outside) laps ahead of the consumer (green arrow, tail, inside) and bytes get dropped. Then choose <b>Sized</b>: N must be at least the backlog B(1 − r<sub>c</sub>/r<sub>p</sub>) (+1 with the one-slot-empty convention), and the next power of two lets you wrap with <code>i &amp; (N−1)</code>.</>}
      controls={<>
        <Slider label="Buffer size N (slots)" value={s.size} min={2} max={64} step={1} format={v => String(Math.round(v))} onChange={v => upd('size')(Math.round(v))} />
        <Slider label="Producer rate" value={s.prodRate} min={0.1} max={6} step={0.1} format={v => `${v.toFixed(1)} /ms`} onChange={upd('prodRate')} />
        <Slider label="Consumer rate" value={s.consRate} min={0.1} max={6} step={0.1} format={v => `${v.toFixed(1)} /ms`} onChange={upd('consRate')} />
        <Slider label="Burst length" value={s.burst} min={1} max={100} step={1} format={v => `${Math.round(v)} items`} onChange={v => upd('burst')(Math.round(v))} />
        <Slider label="Idle gap between bursts" value={s.gap} min={0} max={100} step={1} format={v => `${Math.round(v)} ms`} onChange={upd('gap')} />
        <Seg label="Full / empty convention" value={conv} options={[{ value: 'count', label: 'Count variable' }, { value: 'slot', label: 'One slot empty' }]} onChange={setConv} />
        <Toggle label="Index with mask (i & (N−1))" checked={mask} onChange={setMask} />
        <Slider label="Playback speed" value={speed} min={1} max={60} log format={v => `${Math.round(v)} ms/s`} onChange={setSpeed} />
        <div className="ctl"><span className="ctl-head"><span className="ctl-label">Presets</span></span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{Object.keys(PRESETS).map(k => <button key={k} className="btn btn-sm btn-ghost" onClick={() => applyPreset(k)}>{k}</button>)}</div></div>
      </>}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <button className="btn btn-sm btn-primary" style={{ minWidth: 84 }} onClick={play}>{playing ? '❚❚ Pause' : t >= sim.tEnd ? '↻ Replay' : '▶ Play'}</button>
        <button className="btn btn-sm" onClick={() => { setPlaying(false); const nx = sim.events.find(e => e.t > t + 1e-9); if (nx) { setT(nx.t); } }}>Next event ▶</button>
        <button className="btn btn-sm btn-ghost" onClick={() => { setPlaying(false); setT(0); }}>⏮ Restart</button>
        <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-2)' }}>t = {t.toFixed(1)} / {sim.tEnd.toFixed(0)} ms</span>
      </div>
      <input type="range" min={0} max={sim.tEnd} step={0.1} value={t} aria-label="Time" style={{ width: '100%' }} onChange={e => { setPlaying(false); setT(parseFloat(e.target.value)); }} />
      <svg viewBox="0 0 320 320" style={{ width: '100%', maxWidth: 380, display: 'block', margin: '0 auto' }} role="img" aria-label={`Ring buffer with ${N} slots, ${st.count} used`}>
        {Array.from({ length: N }, (_, i) => { const id = st.slots[i]; const [lx, ly] = mid(i, (Ro + Ri) / 2); const [ix, iy] = mid(i, Ro + 10);
          return <g key={i}>
            <path d={arc(i)} fill={id !== null ? 'var(--d-blue)' : 'var(--d-box)'} opacity={id !== null ? 0.85 : 1} stroke={i === unusable && conv === 'slot' ? 'var(--d-red)' : 'var(--d-muted)'} strokeWidth={i === unusable && conv === 'slot' ? 1.4 : 0.6} strokeDasharray={i === unusable && conv === 'slot' ? '3 2' : undefined} />
            {N <= 24 && id !== null && <text x={lx} y={ly + 3.5} textAnchor="middle" fontSize={N > 16 ? 8 : 10} fill="var(--d-bg)" fontWeight={600}>{id}</text>}
            {N <= 32 && <text x={ix} y={iy + 3} textAnchor="middle" fontSize={8} fill="var(--d-muted)">{i}</text>}
          </g>; })}
        {/* head: producer writes here (outside arrow); tail: consumer reads here (inside arrow). transition animates pointer motion */}
        <g style={{ transform: `rotate(${headDeg}deg)`, transformOrigin: `${C}px ${C}px`, transition: playing ? 'transform .1s linear' : 'transform .25s ease' }}>
          <path d={`M${C},${C - Ro - 1} L${C - 8},${C - Ro - 15} L${C + 8},${C - Ro - 15} Z`} fill="var(--d-orange)" />
        </g>
        <g style={{ transform: `rotate(${tailDeg}deg)`, transformOrigin: `${C}px ${C}px`, transition: playing ? 'transform .1s linear' : 'transform .25s ease' }}>
          <path d={`M${C},${C - Ri + 1} L${C - 8},${C - Ri + 15} L${C + 8},${C - Ri + 15} Z`} fill="var(--d-green)" />
        </g>
        <text x={C} y={C - 22} textAnchor="middle" fontSize={11} fill="var(--d-orange)">▼ head (write) = {st.headIdx}{mask && pow2 ? ` = ${st.headAbs} & ${N - 1}` : ''}</text>
        <text x={C} y={C - 6} textAnchor="middle" fontSize={11} fill="var(--d-green)">▲ tail (read) = {st.tailIdx}</text>
        <text x={C} y={C + 16} textAnchor="middle" fontSize={20} fontWeight={700} fill="var(--d-ink)">{st.count}/{cap}</text>
        <text x={C} y={C + 32} textAnchor="middle" fontSize={11} fill={full ? 'var(--d-red)' : 'var(--d-muted)'}>{full ? 'FULL' : empty ? 'EMPTY' : 'in buffer'}</text>
        {justDropped && <text x={C} y={C + 52} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--d-red)">DROPPED!</text>}
      </svg>
      <Readouts>
        <Readout k="In buffer" v={`${st.count} / ${cap}`} hl tone={full ? 'bad' : undefined} />
        <Readout k="Dropped items" v={st.dropped} tone={st.dropped ? 'bad' : 'ok'} />
        <Readout k="Peak backlog (whole run)" v={sim.peak} tone={sim.peak >= cap ? 'warn' : undefined} />
        <Readout k="Min N for this burst" v={`${need.size} (pow2: ${need.pow2})`} />
        <Readout k="Total dropped (run)" v={sim.dropped} tone={sim.dropped ? 'bad' : 'ok'} />
        <Readout k="State" v={full ? 'full' : empty ? 'empty' : 'partial'} />
      </Readouts>
      {mask && !pow2 && <Note><b>Mask warning:</b> N = {N} is not a power of two. i &amp; {N - 1} only reaches {maskReach(N)} distinct slots, so unread data would be overwritten. Use N = {need.pow2} or the % operator.</Note>}
      {mask && pow2 && <Note>Mask indexing: index = counter &amp; {N - 1} (binary {(N - 1).toString(2)}). Counters run free ({st.headAbs} writes, {st.tailAbs} reads) and count = head − tail even across wraparound.</Note>}
      {conv === 'slot' && <Note>With one slot always empty, head == tail means empty and (head+1) mod N == tail means full, so usable capacity is N − 1 = {cap} (the dashed slot).</Note>}
      <EqBox>{eq}</EqBox>
      <Plot series={[{ x: plot.x, y: plot.y, label: 'items in buffer', color: 'accent', step: true, fill: true }, { x: plot.x, y: plot.dy, label: 'dropped (cumulative)', color: 'red', step: true }]}
        xLabel="time (ms)" yLabel="items" height={230} xTickFormat={v => `${Math.round(v)}`}
        hlines={[{ at: cap, label: `capacity ${cap}`, color: 'orange' }]} vlines={[{ at: t, label: 'now', color: 'ink' }]} />
    </SimShell>
  );
}
