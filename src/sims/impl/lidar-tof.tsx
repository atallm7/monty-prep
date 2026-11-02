// LiDAR time-of-flight: round-trip timing, bin-limited range resolution, PRF ambiguity, noisy multi-return waveform.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { simulate, maxRange, rangeRes, C } from '../models/lidar-tof';

function Timeline({ T, ech }: { T: number; ech: { d: number; a: number; t: number; tApp: number; pulsesLate: number }[] }) {
  const W = 600, x0 = 20, x1 = 580, view = 3 * T, X = (t: number) => x0 + t / view * (x1 - x0), base = 70;
  const marks: { x: number; m: number; a: number; i: number }[] = [];
  ech.forEach((e, i) => { for (let k = 0; k < 3; k++) { const ta = k * T + e.tApp; const m = k - e.pulsesLate; marks.push({ x: X(ta), m, a: e.a, i }); } });
  const e0 = ech[0]; const direct = e0.t <= view;
  return (
    <svg viewBox={`0 0 ${W} 112`} style={{ width: '100%' }} role="img" aria-label="Pulse timeline">
      <rect x={X(0)} y={18} width={X(T) - X(0)} height={base - 18} fill="var(--d-accent)" opacity={0.07} />
      <text x={X(0) + 6} y={13} fontSize={11} fill="var(--d-accent)">listening window 1/PRF → R_max = {si(C * T / 2, 'm')}</text>
      <line x1={x0} x2={x1} y1={base} y2={base} stroke="var(--d-ink)" strokeWidth={1.2} />
      {[0, 1, 2].map(k => <g key={k}>
        <rect x={X(k * T) - 2} y={base - 44} width={4} height={44} fill="var(--d-blue)" />
        <text x={X(k * T) + 3} y={base + 16} fontSize={11.5} fill="var(--d-blue)">TX #{k}</text>
      </g>)}
      {marks.map((m, j) => { const h = Math.max(6, Math.min(40, 10 + 8 * Math.log10(m.a * 100 + 1))); return <g key={j}>
        <rect x={m.x - 1.5} y={base - h} width={3} height={h} fill={m.i === 0 ? 'var(--d-orange)' : 'var(--d-purple)'} />
        {m.i === 0 && <text x={m.x + 4} y={base + 30} fontSize={10.5} fill="var(--d-orange)">{m.m >= 0 ? `echo of TX #${m.m}` : `echo of TX #${m.m} (earlier)`}</text>}
      </g>; })}
      {direct && <path d={`M${X(0)},${base - 46} Q${(X(0) + X(e0.t)) / 2},${4} ${X(e0.t)},${base - 42}`} fill="none" stroke="var(--d-orange)" strokeDasharray="4 3" strokeWidth={1.3} />}
    </svg>
  );
}

export default function LidarTof({ params }: SimProps) {
  const init = {
    d: Number(params.d ?? 30), tres: Number(params.tres ?? 1e-9), prf: Number(params.prf ?? 100e3),
    pulseW: 5e-9, refl: 0.5, power: 1, ambient: 0.3, second: false, d2gap: 4, frac2: 0.4, shots: 1,
    method: 'peak' as 'peak' | 'threshold', interp: false, thr: 0.25, seed: 1,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const r = useMemo(() => simulate({ ...s, d2: s.d + s.d2gap }), [s]);

  const rmax = maxRange(s.prf), dR = rangeRes(s.tres), sep = C * s.pulseW / 2;
  const ambiguous = r.ech[0].pulsesLate > 0;
  const err = r.first ? r.first.d - s.d : NaN;
  const status = !r.first ? { l: 'No return above threshold', c: 'bad' as const } : ambiguous ? { l: 'Range aliased: echo after next pulse', c: 'bad' as const } : Math.abs(err) <= dR ? { l: 'Locked: error within one bin', c: 'ok' as const } : { l: 'Detected, error > 1 bin', c: 'warn' as const };

  return (
    <SimShell title="LiDAR time-of-flight" onReset={() => set(init)}
      tryThis={<>push distance past R<sub>max</sub> = c/(2·PRF): the echo now arrives after the next pulse and the sensor reports a short, wrong range. Lower the PRF to recover it (at long range also raise the laser power, since the echo falls as 1/d²). Then set the bin to 10 ns: range steps in 1.5 m jumps until you enable sub-bin interpolation. Finally move the target to 150 m with high ambient light and average 16 to 64 shots to pull the weak 1/d² return out of the noise.</>}
      controls={<>
        <Slider label="Target distance d" value={s.d} min={0.5} max={3000} log unit="m" onChange={upd('d')} />
        <Slider label="Timing resolution (bin) Δt" value={s.tres} min={10e-12} max={20e-9} log unit="s" onChange={upd('tres')} />
        <Slider label="Pulse repetition rate" value={s.prf} min={1e3} max={10e6} log unit="Hz" onChange={upd('prf')} />
        <Slider label="Pulse width (FWHM)" value={s.pulseW} min={0.5e-9} max={20e-9} log unit="s" onChange={upd('pulseW')} />
        <Slider label="Target reflectivity ρ" value={s.refl} min={0.02} max={1} step={0.01} format={v => `${Math.round(v * 100)}%`} onChange={upd('refl')} />
        <Slider label="Laser power × receiver gain" value={s.power} min={0.1} max={1e4} log format={v => num(v, 3) + '×'} onChange={upd('power')} />
        <Slider label="Ambient light (background)" value={s.ambient} min={0} max={4} step={0.05} format={v => num(v, 3) + '×'} onChange={upd('ambient')} />
        <Slider label="Shots averaged" value={s.shots} min={1} max={256} log format={v => `${Math.round(v)}`} onChange={v => upd('shots')(Math.round(v))} />
        <Seg label="Detector" value={s.method} onChange={upd('method')} options={[{ value: 'peak', label: 'Peak' }, { value: 'threshold', label: 'Leading edge' }]} />
        <Slider label="Detection threshold" value={s.thr} min={0.02} max={2} log format={v => num(v, 3)} onChange={upd('thr')} />
        <Toggle label="Sub-bin interpolation" checked={s.interp} onChange={upd('interp')} />
        <Toggle label="Second (partial) return behind target" checked={s.second} onChange={upd('second')} />
        {s.second && <Slider label="Second target behind first by" value={s.d2gap} min={0.2} max={30} log unit="m" onChange={upd('d2gap')} />}
        {s.second && <Slider label="Beam fraction reaching 2nd target" value={s.frac2} min={0.05} max={0.95} step={0.05} format={v => `${Math.round(v * 100)}%`} onChange={upd('frac2')} />}
        <button className="btn btn-sm" onClick={() => set(p => ({ ...p, seed: p.seed + 1 }))}>Fire new shot (new noise)</button>
        <Note>Return amplitude scales as P·ρ/d² (1.0 at 30 m, ρ = 50%, 1× power; the detector saturates at 5). Leading-edge timing is walk-calibrated at amplitude 1.0, so weaker or stronger echoes show amplitude walk.</Note>
      </>}>
      <Timeline T={r.T} ech={r.ech} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><RegionBadge label={status.l} color={status.c} />{r.returns.length > 1 && <RegionBadge label={`${r.returns.length} returns`} color="info" />}</div>
      <Readouts>
        <Readout k="Round trip 2d/c" v={si(r.ech[0].t, 's')} />
        <Readout k="Measured range" v={r.first ? si(r.first.d, 'm') : '—'} hl tone={status.c === 'ok' ? 'ok' : status.c} />
        <Readout k="Error" v={isFinite(err) ? si(err, 'm') : '—'} tone={!isFinite(err) || Math.abs(err) > dR ? 'bad' : undefined} />
        <Readout k="Bin resolution cΔt/2" v={si(dR, 'm')} />
        <Readout k="Max range c/(2·PRF)" v={si(rmax, 'm')} tone={ambiguous ? 'bad' : undefined} />
        <Readout k="Two-target separation" v={`≈ ${si(sep, 'm')}`} />
        <Readout k="Peak SNR" v={`${num(r.snr, 3)} (${Math.round(20 * Math.log10(Math.max(r.snr, 1e-9)))} dB)`} tone={r.snr < 5 ? 'bad' : r.snr < 15 ? 'warn' : 'ok'} />
        {r.returns.length > 1 && <Readout k="Last return" v={si(r.returns[r.returns.length - 1].d, 'm')} />}
      </Readouts>
      <EqBox>{String.raw`t=\frac{2d}{c}=\frac{2\cdot${num(s.d, 4)}}{3\times10^8}=\text{${si(r.ech[0].t, 's')}},\quad \Delta R=\frac{c\,\Delta t}{2}=\text{${si(dR, 'm')}},\quad R_{max}=\frac{c}{2\,\text{PRF}}=\text{${si(rmax, 'm')}}`}</EqBox>
      <Plot series={[
        { x: r.analogT, y: r.analog, label: 'optical echo (noise-free)', color: 'muted', dashed: true },
        { x: [...r.binStart, r.t1], y: [...r.meas, r.meas[r.meas.length - 1]], label: `digitised, ${s.shots} shot${s.shots > 1 ? 's' : ''} avg`, color: 'accent', step: true },
      ]} xUnit="s" xLabel="time after the most recent pulse" yLabel="detector signal (a.u.)" height={250}
        hlines={[{ at: r.thrAbs, label: 'threshold', color: 'red' }]}
        vlines={[...r.ech.map((e, i) => ({ at: e.tApp, label: i === 0 ? 'true echo' : '2nd target', color: 'green' })), ...r.returns.map(q => ({ at: q.t, label: '', color: 'red' }))]} />
      <Note>Each step of the blue trace is one timing bin (Δt = {si(s.tres, 's')} ↔ {si(dR, 'm')} of range). Red vertical lines mark the reported returns.</Note>
    </SimShell>
  );
}
