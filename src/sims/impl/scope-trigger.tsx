// Oscilloscope triggering: live acquisitions of a noisy repetitive signal with edge / glitch / runt triggers,
// hysteresis, holdoff and auto / normal / single modes, drawn on a persistence screen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { acquire, initAcq, traceOf, instability, recordLen, clean, P, DT, AcqState, SigKind, TrigType, Slope, Mode } from '../models/scope-trigger';

const VDIV = 0.3, W = 500, H = 400;
const SIGS: { value: SigKind; label: string }[] = [
  { value: 'sine', label: 'Sine 1 kHz, ±1 V' }, { value: 'square', label: 'Square 1 kHz, 0–1 V' },
  { value: 'burst', label: 'Burst: 3 pulses every 1 ms' }, { value: 'glitch', label: 'Square with rare 20 µs glitch' },
  { value: 'runt', label: 'Pulse train with a runt' },
];
const TDIVS = [50e-6, 100e-6, 200e-6, 500e-6, 1e-3];
const patternPeriod = (k: SigKind) => k === 'glitch' ? 7 * P : k === 'runt' ? 5 * P : P;

function Screen({ traces, level, trig, runt, status, tdiv }: { traces: [number, number][][]; level: number; trig: TrigType; runt: [number, number]; status: string; tdiv: number }) {
  const X = (t: number) => W / 2 + t / tdiv * 50, Y = (v: number) => H / 2 - v / VDIV * 50;
  const lv = trig === 'runt' ? runt : [level];
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} style={{ width: '100%', maxWidth: 640, display: 'block', margin: '0 auto' }} role="img" aria-label="Oscilloscope screen">
      <rect x={0} y={0} width={W} height={H} rx={6} fill="var(--d-box)" stroke="var(--d-muted)" />
      {Array.from({ length: 11 }, (_, i) => <line key={'v' + i} x1={i * 50} x2={i * 50} y1={0} y2={H} stroke="var(--d-muted)" strokeOpacity={i === 5 ? 0.55 : 0.22} />)}
      {Array.from({ length: 9 }, (_, i) => <line key={'h' + i} y1={i * 50} y2={i * 50} x1={0} x2={W} stroke="var(--d-muted)" strokeOpacity={i === 4 ? 0.55 : 0.22} />)}
      <defs><clipPath id="trigScr"><rect x={0} y={0} width={W} height={H} /></clipPath></defs>
      <g clipPath="url(#trigScr)">
        {lv.map((l, i) => <line key={i} x1={0} x2={W} y1={Y(l)} y2={Y(l)} stroke="var(--d-orange)" strokeDasharray="5 5" strokeOpacity={0.7} />)}
        {traces.map((tr, i) => <polyline key={i} fill="none" stroke="var(--d-accent)" strokeWidth={i === traces.length - 1 ? 1.7 : 1.2}
          strokeOpacity={0.12 + 0.88 * ((i + 1) / traces.length) ** 2} points={tr.map(([t, v]) => `${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')} />)}
      </g>
      <path d={`M${W / 2 - 7},0 L${W / 2 + 7},0 L${W / 2},10 Z`} fill="var(--d-orange)" />
      {lv.map((l, i) => <g key={i}><path d={`M${W},${Y(l)} l-10,-6 l0,12 z`} fill="var(--d-orange)" /><text x={W - 13} y={Y(l) - 8} fontSize={11} textAnchor="end" fill="var(--d-orange)">{trig === 'runt' ? (i ? 'hi' : 'lo') : 'T'} {num(l, 3)} V</text></g>)}
      <rect x={8} y={8} width={70} height={22} rx={4} fill="var(--d-bg)" stroke={status === "Trig'd" ? 'var(--d-green)' : status === 'Stop' ? 'var(--d-red)' : 'var(--d-orange)'} />
      <text x={43} y={23.5} fontSize={12.5} textAnchor="middle" fontWeight={600} fill={status === "Trig'd" ? 'var(--d-green)' : status === 'Stop' ? 'var(--d-red)' : 'var(--d-orange)'}>{status}</text>
      <text x={4} y={H + 16} fontSize={12} fill="var(--d-muted)">{si(tdiv, 's')}/div · {VDIV} V/div · trigger at centre</text>
    </svg>
  );
}

export default function ScopeTrigger({ params }: SimProps) {
  const init = {
    kind: 'sine' as SigKind, noise: 0.05, enabled: true, mode: 'auto' as Mode, type: 'edge' as TrigType,
    level: Number(params.level ?? 0.5), slope: (params.slope === 'falling' ? 'falling' : 'rising') as Slope,
    hyst: 0, holdoff: 0, width: 50e-6, runtLo: 0.2, runtHi: 0.7, tdiv: 200e-6,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const [acq, setAcq] = useState<AcqState>(initAcq);
  const [running, setRunning] = useState(true);
  const cfg = useMemo(() => ({ kind: s.kind, noise: s.noise, enabled: s.enabled, mode: s.mode, holdoff: s.holdoff, tdiv: s.tdiv,
    trig: { type: s.type, level: s.level, slope: s.slope, hyst: s.hyst, width: s.width, runtLo: s.runtLo, runtHi: s.runtHi } }), [s]);
  const cfgRef = useRef(cfg); cfgRef.current = cfg;

  // Acquisition loop: one sweep every ~90 ms while running.
  useEffect(() => {
    if (!running) return;
    let raf = 0, last = 0;
    const tick = (now: number) => {
      if (now - last > 90) { last = now; setAcq(a => acquire(a, cfgRef.current)); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  // Changing the timebase or signal invalidates the stored sweeps (as on a real scope).
  useEffect(() => { setAcq(a => ({ ...a, records: [] })); }, [s.tdiv, s.kind]);

  const n = recordLen(s.tdiv);
  const traces = useMemo(() => acq.records.map(r => traceOf(s.kind, s.noise, r, n)), [acq.records, s.kind, s.noise, n]);
  const instab = useMemo(() => instability(s.kind, acq.records, n), [acq.records, s.kind, n]);
  const PP = patternPeriod(s.kind);
  const phasePlot = useMemo(() => {
    const xs = Array.from({ length: 700 }, (_, i) => i / 699 * PP);
    return { xs, ys: xs.map(t => clean(s.kind, t)) };
  }, [s.kind, PP]);
  const trigPts = acq.records.map(r => { const t = ((r.trigAt * DT) % PP + PP) % PP; return { x: t, y: clean(s.kind, t), color: r.trig ? 'accent' : 'red' }; });

  const stable = acq.records.length >= 2 && instab < 0.08;
  const reset = () => { set(init); setAcq(initAcq()); setRunning(true); };
  const single = () => { set(p => ({ ...p, mode: 'single' })); setAcq(a => ({ ...a, status: 'Ready' })); setRunning(true); };

  const condText = s.type === 'edge' ? `${s.slope} edge through ${num(s.level, 3)} V` : s.type === 'glitch' ? `positive pulse narrower than ${si(s.width, 's')}` : `pulse crossing ${num(s.runtLo, 3)} V but not ${num(s.runtHi, 3)} V`;

  return (
    <SimShell title="Oscilloscope triggering" onReset={reset}
      tryThis={<>untick <i>Trigger enabled</i>: sweeps start at arbitrary times and the trace rolls. Re-enable it and the waveform freezes. Set the level to 1.2 V: in <b>Auto</b> the scope free-runs (unstable), in <b>Normal</b> it simply waits. Choose the <b>burst</b> signal: the edge trigger lands on any of the 3 pulses until you raise holdoff past the burst length (≈ 1.5 ms). On the <b>glitch</b> signal, switch the trigger type to <i>glitch &lt; 50 µs</i> to catch the rare event every sweep. Finally put the level at 0 V on a sine with 0.15 V noise: false triggers on the falling edge produce a double image until you add noise-reject hysteresis.</>}
      controls={<>
        <Select label="Input signal" value={s.kind} onChange={upd('kind')} options={SIGS} />
        <Slider label="Noise" value={s.noise} min={0} max={0.3} step={0.005} format={v => `${num(v, 3)} V rms`} onChange={upd('noise')} />
        <Select label="Timebase" value={String(s.tdiv)} onChange={v => upd('tdiv')(Number(v))} options={TDIVS.map(t => ({ value: String(t), label: `${si(t, 's')}/div` }))} />
        <Toggle label="Trigger enabled" checked={s.enabled} onChange={upd('enabled')} />
        <Seg label="Mode" value={s.mode} onChange={v => { upd('mode')(v); if (v === 'single') setAcq(a => ({ ...a, status: 'Ready' })); else setAcq(a => a.status === 'Stop' ? { ...a, status: 'Ready' } : a); setRunning(true); }}
          options={[{ value: 'auto', label: 'Auto' }, { value: 'normal', label: 'Normal' }, { value: 'single', label: 'Single' }]} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => { if (acq.status === 'Stop') { setAcq(x => ({ ...x, status: 'Ready' })); if (s.mode === 'single') upd('mode')('normal'); setRunning(true); } else setRunning(r => !r); }}>{running && acq.status !== 'Stop' ? 'Stop' : 'Run'}</button>
          <button className="btn btn-sm" style={{ flex: 1 }} onClick={single}>Arm single</button>
        </div>
        <Seg label="Trigger type" value={s.type} onChange={upd('type')} options={[{ value: 'edge', label: 'Edge' }, { value: 'glitch', label: 'Glitch' }, { value: 'runt', label: 'Runt' }]} />
        {s.type !== 'runt' && <Slider label="Trigger level" value={s.level} min={-1.2} max={1.2} step={0.01} unit="V" format={v => `${num(v, 3)} V`} onChange={upd('level')} />}
        {s.type === 'edge' && <Seg label="Slope" value={s.slope} onChange={upd('slope')} options={[{ value: 'rising', label: 'Rising ↗' }, { value: 'falling', label: 'Falling ↘' }]} />}
        {s.type === 'glitch' && <Slider label="Pulse narrower than" value={s.width} min={5e-6} max={600e-6} log unit="s" onChange={upd('width')} />}
        {s.type === 'runt' && <>
          <Slider label="Runt low threshold" value={s.runtLo} min={0} max={1} step={0.01} format={v => `${num(v, 3)} V`} onChange={v => upd('runtLo')(Math.min(v, s.runtHi - 0.05))} />
          <Slider label="Runt high threshold" value={s.runtHi} min={0} max={1.2} step={0.01} format={v => `${num(v, 3)} V`} onChange={v => upd('runtHi')(Math.max(v, s.runtLo + 0.05))} />
        </>}
        <Slider label="Noise reject (hysteresis)" value={s.hyst} min={0} max={0.6} step={0.01} format={v => `${num(v, 3)} V`} onChange={upd('hyst')} />
        <Slider label="Holdoff" value={s.holdoff} min={0} max={3e-3} step={10e-6} unit="s" onChange={upd('holdoff')} />
        <Note>Sampling at {si(1 / DT, 'Sa/s')}. Each sweep is 10 divisions with the trigger point at the centre. The last 8 sweeps are overlaid (persistence), so an unstable trigger looks smeared.</Note>
      </>}>
      <Screen traces={traces} level={s.level} trig={s.type} runt={[s.runtLo, s.runtHi]} status={running || acq.status === 'Stop' ? acq.status : 'Stop'} tdiv={s.tdiv} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <RegionBadge label={!s.enabled ? 'Untriggered: display rolls' : acq.records.length < 2 ? (acq.status === 'Ready' ? 'Waiting for a trigger' : 'Acquiring…') : stable ? 'Stable display' : 'Unstable display'} color={!s.enabled || (!stable && acq.records.length >= 2) ? 'bad' : stable ? 'ok' : 'warn'} />
        {s.enabled && <RegionBadge label={`Trigger: ${condText}`} color="info" />}
      </div>
      <Readouts>
        <Readout k="Status" v={running || acq.status === 'Stop' ? acq.status : 'Stop'} hl tone={acq.status === "Trig'd" ? 'ok' : acq.status === 'Stop' ? undefined : 'warn'} />
        <Readout k="Triggers / sweeps" v={`${acq.count} / ${acq.acq}`} />
        <Readout k="Sweep-to-sweep RMS diff" v={`${num(instab, 2)} V`} tone={stable ? 'ok' : acq.records.length >= 2 ? 'bad' : undefined} />
        <Readout k="Record length" v={si(10 * s.tdiv, 's')} />
        <Readout k="Holdoff" v={si(s.holdoff, 's')} />
      </Readouts>
      <EqBox>{s.type === 'edge'
        ? String.raw`\text{fire when } v[k]\,${s.slope === 'rising' ? '\\ge' : '\\le'}\,L=${num(s.level, 3)}\,\text{V after } v ${s.slope === 'rising' ? '<' : '>'} L ${s.slope === 'rising' ? '-' : '+'} h,\quad h=${num(s.hyst, 3)}\,\text{V};\quad t_{\text{re-arm}}\ge t_{\text{trig}}+${si(s.holdoff, 's').replace('µ', '\\mu ')}`
        : s.type === 'glitch' ? String.raw`\text{fire on trailing edge if } t_{\downarrow}-t_{\uparrow} < W = ${si(s.width, 's').replace('µ', '\\mu ')}`
          : String.raw`\text{fire when } v \uparrow L_{lo}=${num(s.runtLo, 3)}\text{ V then } \downarrow L_{lo} \text{ without reaching } L_{hi}=${num(s.runtHi, 3)}\text{ V}`}</EqBox>
      <Plot series={[{ x: phasePlot.xs, y: phasePlot.ys, label: 'one pattern period (noise-free)', color: 'muted' }]} points={trigPts}
        xUnit="s" xLabel="where in the waveform each recent sweep was triggered" yUnit="V" height={180}
        hlines={s.type === 'runt' ? [{ at: s.runtLo, label: 'lo', color: 'orange' }, { at: s.runtHi, label: 'hi', color: 'orange' }] : [{ at: s.level, label: 'level', color: 'orange' }]} />
      <Note>Dots mark the trigger point of the last sweeps (red = auto/free-run start). One tight cluster means a stable picture; scattered dots mean every sweep starts somewhere different.</Note>
    </SimShell>
  );
}
