// Reflow oven: zone setpoints + conveyor speed -> first-order thermal response of a small part and a large thermal mass.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readouts, Readout, EqBox, Note, RegionBadge } from '../kit';
import Plot from '../../components/Plot';
import { simulate, metrics, judge, SPEC, LIQUIDUS, PRESETS, ZONE_LEN, COOL_LEN, T_COOL, T_AMB } from '../models/reflow-profile';

const heat = (T: number) => `hsl(${Math.round(225 - Math.min(1, Math.max(0, (T - 25) / 250)) * 225)} 80% 55%)`;

export default function ReflowProfile({ params }: SimProps) {
  const init = {
    zones: Array.isArray(params.zones) && params.zones.length ? params.zones.map(Number) : (PRESETS[params.preset as string]?.zones ?? PRESETS.good.zones),
    speed: Number(params.speed ?? PRESETS[params.preset as string]?.speed ?? 70),
    tauSmall: Number(params.tauSmall ?? 20), tauLarge: Number(params.tauLarge ?? 60),
  };
  const [s, set] = useState(init);
  const [preset, setPreset] = useState<string>(String(params.preset ?? (params.zones || params.speed ? '' : 'good')));
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);

  const tr = useMemo(() => simulate(s), [s]);
  const ms = useMemo(() => metrics(tr.t, tr.small), [tr]);
  const ml = useMemo(() => metrics(tr.t, tr.large), [tr]);
  const js = judge(ms), jl = judge(ml);
  const all = js.all && jl.all;

  // animate the board travelling through the oven
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), t = cursor ?? 0;
    const step = (now: number) => {
      t += (now - last) / 1000 * (tr.total / 12); last = now;
      if (t >= tr.total) { setCursor(tr.total); setPlaying(false); return; }
      setCursor(t); raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, tr.total]);

  const applyPreset = (k: string) => { const p = PRESETS[k]; setPreset(k); set({ zones: [...p.zones], speed: p.speed, tauSmall: p.tauSmall, tauLarge: p.tauLarge }); };
  const setZone = (i: number, v: number) => { setPreset(''); set(p => ({ ...p, zones: p.zones.map((z, k) => k === i ? v : z) })); };

  const n = s.zones.length;
  const idx = cursor === null ? null : Math.min(tr.t.length - 1, Math.round(cursor / (tr.t[1] || 0.25)));
  const cs = idx === null ? null : tr.small[idx], cl = idx === null ? null : tr.large[idx];

  // oven strip drawing
  const W = 600, zw = W / (n + 1.0), strip = (
    <svg viewBox={`0 0 ${W} 90`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Oven zones and conveyor">
      {s.zones.map((z, i) => <g key={i}>
        <rect x={i * zw + 2} y={14} width={zw - 4} height={34} rx={5} fill={heat(z)} opacity={0.85} />
        <text x={i * zw + zw / 2} y={40} textAnchor="middle" fontSize={20} fontWeight={700} fill="#fff" style={{ paintOrder: 'stroke' }} stroke="rgba(0,0,0,.35)" strokeWidth={2}>{z}°</text>
        <text x={i * zw + zw / 2} y={11} textAnchor="middle" fontSize={14} fill="var(--d-muted)">Z{i + 1}</text>
      </g>)}
      <rect x={n * zw + 2} y={14} width={zw - 4} height={34} rx={5} fill={heat(T_COOL)} opacity={0.85} />
      <text x={n * zw + zw / 2} y={36} textAnchor="middle" fontSize={16} fontWeight={700} fill="#fff" stroke="rgba(0,0,0,.35)" strokeWidth={2} style={{ paintOrder: 'stroke' }}>cool</text>
      <line x1={0} x2={W} y1={56} y2={56} stroke="var(--d-ink)" strokeWidth={2} strokeDasharray="6 4" opacity={0.5} />
      {cursor !== null && (() => { const x = Math.min(W - 8, Math.max(8, cursor / tr.total * W)); return <g>
        <rect x={x - 14} y={52} width={28} height={7} rx={2} fill="var(--d-green)" />
        <rect x={x - 5} y={46} width={10} height={6} rx={1} fill="var(--d-ink)" />
        <circle cx={x - 6} cy={52} r={0.1} />
        <text x={x} y={78} textAnchor="middle" fontSize={15} fill="var(--d-ink)">{Math.round(cs!)}° / {Math.round(cl!)}°</text></g>; })()}
      <text x={4} y={84} fontSize={13} fill="var(--d-muted)">conveyor →</text>
    </svg>);

  const row = (label: string, a: string, b: string, okA: boolean, okB: boolean, spec: string) => (
    <tr><td>{label}</td><td style={{ color: okA ? 'var(--ok)' : 'var(--bad)', fontWeight: 600 }}>{a} {okA ? '✓' : '✗'}</td><td style={{ color: okB ? 'var(--ok)' : 'var(--bad)', fontWeight: 600 }}>{b} {okB ? '✓' : '✗'}</td><td style={{ color: 'var(--text-3, var(--d-muted))' }}>{spec}</td></tr>);

  const y = [Math.min(...tr.small) - 5, Math.max(280, ms.peak + 10)] as [number, number];
  return (
    <SimShell title="Reflow oven profile" badge="Thermal model" onReset={() => { set(init); setPreset(''); setCursor(null); setPlaying(false); }}
      tryThis={<>pick <b>cold</b>: the big part never reaches the {LIQUIDUS} °C liquidus, so BGA balls stay unwetted (cold joints) while the small part looks fine. Then slow the conveyor: both parts get more time and the ΔT between them shrinks. Raise the last zones too far and the small part overshoots 250 °C. With <b>hot-fast</b> the ramp exceeds 3 °C/s (thermal shock, tombstoning).</>}
      controls={<>
        <Seg label="Preset" value={preset as any} options={[...Object.keys(PRESETS).map(k => ({ value: k, label: k })), { value: '' as any, label: 'custom' }]} onChange={v => v && applyPreset(v)} />
        {s.zones.map((z, i) => <Slider key={i} label={`Zone ${i + 1} setpoint`} value={z} min={100} max={300} step={1} unit="°C" format={v => `${Math.round(v)} °C`} onChange={v => setZone(i, v)} />)}
        <Slider label="Conveyor speed" value={s.speed} min={30} max={150} step={1} format={v => `${Math.round(v)} cm/min`} onChange={v => { setPreset(''); set(p => ({ ...p, speed: v })); }} />
        <Slider label="τ small part (0402, QFN)" value={s.tauSmall} min={5} max={80} step={1} format={v => `${Math.round(v)} s`} onChange={v => set(p => ({ ...p, tauSmall: v }))} />
        <Slider label="τ large mass (BGA, connector)" value={s.tauLarge} min={20} max={200} step={1} format={v => `${Math.round(v)} s`} onChange={v => set(p => ({ ...p, tauLarge: v }))} />
        <button className="btn btn-sm" onClick={() => { if (playing) setPlaying(false); else { if (cursor === null || cursor >= tr.total) setCursor(0); setPlaying(true); } }}>{playing ? 'Pause' : 'Run board through oven'}</button>
        <Note>Each zone is {ZONE_LEN} cm, followed by {COOL_LEN} cm of cooling air ({T_COOL} °C). Time per zone = {ZONE_LEN}/speed = {tr.zoneT.toFixed(0)} s.</Note>
      </>}>
      {strip}
      <Plot height={300} xLabel="Time since oven entry" yLabel="Temperature" xUnit="s" yUnit="°C" yRange={y} xRange={[0, tr.total]}
        series={[{ x: tr.t, y: tr.air, label: 'Oven air', color: 'muted', dashed: true }, { x: tr.t, y: tr.small, label: 'Small part', color: 'accent' }, { x: tr.t, y: tr.large, label: 'Large mass', color: 'orange' }]}
        xspans={[...tr.zoneEnds.map((e, i) => ({ from: e - tr.zoneT, to: e, label: `Z${i + 1}`, color: i % 2 ? 'blue' : 'muted' })), { from: n * tr.zoneT, to: tr.total, label: 'cool', color: 'blue' },
          ...(ml.tal > 0 ? [{ from: ml.talStart, to: ml.talEnd, color: 'green' }] : [])]}
        hlines={[{ at: LIQUIDUS, label: `liquidus ${LIQUIDUS} °C`, color: 'red' }, { at: SPEC.peakMax, label: 'max 250', color: 'muted' }]}
        vlines={cursor !== null ? [{ at: cursor, color: 'green' }] : []}
        points={[{ x: ms.tPeak, y: ms.peak, label: `${ms.peak.toFixed(0)} °C`, color: 'accent' }, { x: ml.tPeak, y: ml.peak, label: `${ml.peak.toFixed(0)} °C`, color: 'orange' }]} />
      <div style={{ fontSize: 12, color: 'var(--d-muted)', margin: '-4px 0 8px' }}>Green band: time above liquidus (TAL) of the large mass. Dots: peak temperatures.</div>
      <Readouts>
        <Readout k="Verdict" v={<RegionBadge label={all ? 'Profile passes' : 'Out of window'} color={all ? 'ok' : 'bad'} />} hl />
        <Readout k="ΔT between parts at peak" v={`${(ms.peak - ml.peak).toFixed(0)} °C`} tone={ms.peak - ml.peak > 20 ? 'warn' : 'ok'} />
        {cursor !== null && <Readout k="Now: small / large" v={`${cs!.toFixed(0)} / ${cl!.toFixed(0)} °C`} />}
      </Readouts>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="reflow-table">
          <thead><tr style={{ textAlign: 'left', color: 'var(--d-muted)' }}><th>Metric</th><th>Small</th><th>Large</th><th>Window</th></tr></thead>
          <tbody>
            {row('Ramp (100–200 °C)', `${ms.ramp.toFixed(1)} °C/s`, `${ml.ramp.toFixed(1)} °C/s`, js.ramp, jl.ramp, `≤ ${SPEC.rampMax}`)}
            {row('Soak 150→200 °C', `${ms.soak.toFixed(0)} s`, `${ml.soak.toFixed(0)} s`, js.soak, jl.soak, `${SPEC.soakMin}–${SPEC.soakMax} s`)}
            {row(`TAL > ${LIQUIDUS} °C`, `${ms.tal.toFixed(0)} s`, `${ml.tal.toFixed(0)} s`, js.tal, jl.tal, `${SPEC.talMin}–${SPEC.talMax} s`)}
            {row('Peak', `${ms.peak.toFixed(0)} °C`, `${ml.peak.toFixed(0)} °C`, js.peak, jl.peak, `${SPEC.peakMin}–${SPEC.peakMax} °C`)}
          </tbody>
        </table>
      </div>
      <EqBox>{String.raw`\frac{dT}{dt}=\frac{T_{air}-T}{\tau}\;\Rightarrow\; T(t)=T_{air}+(T_0-T_{air})\,e^{-t/\tau},\qquad \tau_{small}=${s.tauSmall.toFixed(0)}\,\text{s},\ \tau_{large}=${s.tauLarge.toFixed(0)}\,\text{s}`}</EqBox>
    </SimShell>
  );
}
