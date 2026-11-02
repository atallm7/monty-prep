// Quadrature encoder: A/B channels 90° apart, direction from phase order, 1×/2×/4× decoding, M vs T speed methods.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { channels, waveforms, speedMetrics, errorCurves, Decode } from '../models/encoder-lab';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };
const CYCLES = 4; // electrical cycles shown in the time window

function Disk({ rev, cpr }: { rev: number; cpr: number }) {
  const cx = 80, cy = 80, R1 = 70, R0 = 52;
  const drawn = Math.min(cpr, 96);
  const ang = rev * 360;
  const slots = [];
  for (let k = 0; k < drawn; k++) {
    const a0 = (k / drawn) * 2 * Math.PI, a1 = ((k + 0.5) / drawn) * 2 * Math.PI;
    const p = (a: number, r: number) => `${(cx + r * Math.sin(a)).toFixed(2)},${(cy - r * Math.cos(a)).toFixed(2)}`;
    slots.push(<path key={k} d={`M${p(a0, R0)} L${p(a0, R1)} A${R1},${R1} 0 0 1 ${p(a1, R1)} L${p(a1, R0)} A${R0},${R0} 0 0 0 ${p(a0, R0)}Z`} fill="var(--d-bg)" />);
  }
  return (
    <svg viewBox="0 0 160 172" style={{ width: '100%', maxWidth: 190 }} role="img" aria-label="Encoder disk">
      <g transform={`rotate(${(-ang).toFixed(3)} ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={R1 + 3} fill="var(--d-ink)" opacity={0.85} />
        {slots}
        <circle cx={cx} cy={cy} r={R0 - 4} fill="var(--d-box)" stroke="var(--d-ink)" />
        <line x1={cx} y1={cy} x2={cx} y2={cy - R0 + 8} stroke="var(--d-red)" strokeWidth={2} />
      </g>
      <circle cx={cx} cy={cy} r={6} fill="var(--d-ink)" />
      <rect x={cx - 9} y={cy - R1 - 9} width={18} height={24} rx={3} fill="none" stroke="var(--d-accent)" strokeWidth={2} />
      <text x={cx} y={168} textAnchor="middle" fontSize={10} fill="var(--d-muted)">{cpr > drawn ? `drawn with ${drawn} of ${cpr} lines` : `${cpr} lines`}</text>
    </svg>
  );
}

/** Zoomed linear view of the slot track under the two sensors. */
function Strip({ ph, a, b }: { ph: number; a: number; b: number }) {
  const W = 320, pitch = 64, xA = 210, xB = xA - 1.25 * pitch; // B sits (1 + ¼) pitch from A → 90° electrical
  const rects = [];
  const qMin = Math.floor(ph - xA / pitch) - 1, qMax = Math.ceil(ph + (W - xA) / pitch) + 1;
  for (let q = qMin; q <= qMax; q++) {
    const x = xA + (q - ph) * pitch; // window open for frac ∈ [0, 0.5)
    rects.push(<rect key={q} x={x} y={40} width={pitch / 2} height={34} fill="var(--d-bg)" stroke="var(--d-muted)" strokeWidth={0.6} />);
  }
  const sensor = (x: number, lbl: string, on: number, color: string) => (
    <g>
      <line x1={x} y1={28} x2={x} y2={86} stroke={color} strokeWidth={2} />
      <circle cx={x} cy={24} r={6} fill={on ? color : 'var(--d-box)'} stroke={color} strokeWidth={1.5} />
      <text x={x} y={104} textAnchor="middle" fontSize={11} fill={color}>{lbl} = {on}</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} 112`} style={{ width: '100%' }} role="img" aria-label={`Slot track under sensors, A=${a} B=${b}`}>
      <defs><clipPath id="enc-strip"><rect x={0} y={0} width={W} height={112} /></clipPath></defs>
      <rect x={0} y={40} width={W} height={34} fill="var(--d-ink)" opacity={0.85} />
      <g clipPath="url(#enc-strip)">{rects}</g>
      {sensor(xB, 'B', b, 'var(--d-blue)')}
      {sensor(xA, 'A', a, 'var(--d-orange)')}
      <text x={4} y={10} fontSize={10} fill="var(--d-muted)">zoom: track under the optical sensors</text>
      <line x1={xB} y1={93} x2={xA} y2={93} stroke="var(--d-muted)" strokeWidth={0.8} />
      <text x={(xA + xB) / 2} y={90} textAnchor="middle" fontSize={9} fill="var(--d-muted)">1¼ pitch = 90° el.</text>
    </svg>
  );
}

export default function EncoderLab({ params }: SimProps) {
  const init = { cpr: Math.max(1, Math.round(n(params.cpr, 64))), rpm: n(params.rpm, 600), mode: '4' as '1' | '2' | '4', tw: 0.01, fclk: '1000000' };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const mode = Number(s.mode) as Decode; const fclk = Number(s.fclk);

  const rpsAbs = Math.max(Math.abs(s.rpm), 1) / 60;
  const tWin = CYCLES / (rpsAbs * s.cpr);
  const w = useMemo(() => waveforms(s.rpm, s.cpr, mode, tWin, 1600), [s.rpm, s.cpr, mode, tWin]);
  const m = useMemo(() => speedMetrics(s.rpm, s.cpr, mode, s.tw, fclk), [s.rpm, s.cpr, mode, s.tw, fclk]);
  const ec = useMemo(() => errorCurves(s.cpr, mode, s.tw, fclk, 0.1, 1e5), [s.cpr, mode, s.tw, fclk]);

  // slow-motion playback: one electrical cycle per second of wall time
  const [frac, setFrac] = useState(0.3);
  const [playing, setPlaying] = useState(true);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => { const dt = (now - last) / 1000; last = now; setFrac(f => (f + dt / CYCLES) % 1); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);
  const tc = frac * tWin;
  const revNow = (s.rpm / 60) * tc + 1e-9;
  const chNow = channels(revNow, s.cpr);
  const idx = Math.min(w.C.length - 1, Math.round(frac * (w.C.length - 1)));

  const dir = s.rpm > 0 ? 'Forward: A leads B' : s.rpm < 0 ? 'Reverse: B leads A' : 'Stopped';
  const better = Math.abs(s.rpm) < m.crossover ? 'T-method (edge timing) is more precise here' : 'M-method (counting) is more precise here';
  const pctS = (x: number) => (isFinite(x) ? (x * 100 < 0.01 ? (x * 100).toExponential(1) : String(Number((x * 100).toPrecision(2)))) + ' %' : '∞');

  return (
    <SimShell title="Quadrature encoder: direction, decoding and speed" onReset={() => { set(init); setPlaying(true); }}
      tryThis={<>(1) Flip the speed negative: B now leads A and the counter walks down. Direction comes only from which channel changes first. (2) Drop to 20 rpm with a 10 ms window: the M-method sees less than one count per window (resolution {si(60 / (s.cpr * mode * s.tw), 'rpm')}), while timing a single edge period with the {si(fclk, 'Hz')} timer is still accurate. Above ≈ {Math.round(m.crossover)} rpm the opposite is true.</>}
      controls={<>
        <Slider label="Lines per rev (CPR)" value={s.cpr} min={4} max={4096} log format={v => `${Math.round(v)}`} onChange={v => upd('cpr')(Math.max(1, Math.round(v)))} />
        <Slider label="Speed (negative = reverse)" value={s.rpm} min={-6000} max={6000} step={10} format={v => `${v.toFixed(0)} rpm`} onChange={upd('rpm')} />
        <Seg label="Decoding" value={s.mode} options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }]} onChange={upd('mode')} />
        <Slider label="M-method gate window Tw" value={s.tw} min={1e-3} max={1} log unit="s" onChange={upd('tw')} />
        <Select label="T-method timer clock" value={s.fclk} options={[1e5, 1e6, 1e7, 7.2e7].map(f => ({ value: String(f), label: si(f, 'Hz') }))} onChange={upd('fclk')} />
        <button className="btn btn-sm" type="button" onClick={() => setPlaying(p => !p)}>{playing ? 'Pause animation' : 'Play animation'}</button>
        <Note>CPR here means lines (cycles) per revolution on each channel. Vendors also use "CPR" for quadrature counts (4× lines), so always check which one a datasheet means. The animation is slowed to one electrical cycle per second.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 1 170px', minWidth: 130 }}><Disk rev={revNow} cpr={s.cpr} /></div>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <Strip ph={revNow * s.cpr} a={chNow.a} b={chNow.b} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <RegionBadge label={dir} color={s.rpm === 0 ? 'info' : s.rpm > 0 ? 'ok' : 'warn'} />
            <RegionBadge label={`count = ${w.C[idx]}`} color="accent" />
          </div>
        </div>
      </div>
      <Plot series={[
        { x: w.t, y: w.A.map(v => v + 1.5), label: 'A', color: 'orange', step: true },
        { x: w.t, y: w.B, label: 'B', color: 'blue', step: true },
      ]} xUnit="s" xLabel={`time (${CYCLES} electrical cycles)`} yLabel="channels" height={170} yRange={[-0.3, 2.8]} vlines={[{ at: tc, color: 'muted' }]}
        yTickFormat={v => (v === 0 ? 'B0' : v === 1 ? 'B1' : Math.abs(v - 1.5) < 1e-6 ? 'A0' : Math.abs(v - 2.5) < 1e-6 ? 'A1' : '')} />
      <Plot series={[{ x: w.t, y: w.C, label: `${mode}× counter`, color: 'accent', step: true }]} xUnit="s" xLabel="time" yLabel="count" height={150} vlines={[{ at: tc, color: 'muted' }]} />
      <Readouts>
        <Readout k="Counts / rev" v={`${m.Nc} (${mode}× · ${s.cpr})`} hl />
        <Readout k="Angle per count" v={`${m.degPerCount.toPrecision(3)}°`} />
        <Readout k="Channel A frequency" v={si(m.fA, 'Hz')} />
        <Readout k="Counted edge rate" v={si(m.fEdge, 'Hz')} tone={m.fEdge > 1e6 ? 'warn' : undefined} />
        <Readout k={`M: counts in ${si(s.tw, 's')}`} v={`${m.nCount} → ${(Math.sign(s.rpm) * m.rpmM).toFixed(1)} rpm`} tone={m.relM > 0.05 ? 'bad' : m.relM > 0.01 ? 'warn' : 'ok'} />
        <Readout k="M resolution (±1 count)" v={`${m.resM.toPrecision(3)} rpm (${pctS(m.relM)})`} />
        <Readout k="T: ticks per edge" v={isFinite(m.m) ? `${m.m} → ${(Math.sign(s.rpm) * m.rpmT).toFixed(1)} rpm` : '—'} tone={m.relT > 0.05 ? 'bad' : m.relT > 0.01 ? 'warn' : 'ok'} />
        <Readout k="T resolution (±1 tick)" v={pctS(m.relT)} />
        <Readout k="Crossover speed" v={`${m.crossover >= 100 ? Math.round(m.crossover) : m.crossover.toPrecision(3)} rpm`} />
      </Readouts>
      <Note>{better}. Edge timing (T-method) also has a latency of one edge period ({isFinite(m.tEdge) ? si(m.tEdge, 's') : '∞'}); at very low speed it must time out, which is why real firmware blends both methods.</Note>
      <EqBox>{String.raw`\begin{gathered}\text{M: } \text{rpm} = \frac{60\,n}{N_c T_w} \\ \Delta_M = \frac{60}{N_c T_w} = \frac{60}{${m.Nc}\cdot \text{${si(s.tw, 's')}}} = ${m.resM.toPrecision(3)}\ \text{rpm} \\ \text{T: } \text{rpm} = \frac{60 f_{clk}}{N_c\,m} \\ \frac{\Delta_T}{\text{rpm}} = \frac{1}{m} = \frac{1}{${isFinite(m.m) ? m.m : '\\infty'}}\end{gathered}`}</EqBox>
      <Plot series={[{ x: ec.x, y: ec.eM, label: 'M-method (count in Tw)', color: 'accent' }, { x: ec.x, y: ec.eT, label: 'T-method (time one edge)', color: 'red' }]}
        xLog yLog xLabel="speed (rpm)" yLabel="relative resolution" height={220} yRange={[1e-6, 10]}
        xTickFormat={v => si(v, '')} yTickFormat={v => (v >= 1 ? `${v * 100}%` : `${Number((v * 100).toPrecision(2))}%`)}
        vlines={[{ at: Math.max(0.1, Math.abs(s.rpm)), label: 'now', color: 'green' }, { at: m.crossover, label: 'crossover', color: 'muted' }]} hlines={[{ at: 0.01, label: '1 %', color: 'muted' }]} />
    </SimShell>
  );
}
