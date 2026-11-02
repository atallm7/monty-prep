// Rotating phasors vs time-domain sinusoids; phase of current in pure R, L, C.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { wave, phaseDiff, rms, sumInfo, rlc, reactance } from '../models/phasor-viewer';
import type { Wave, El } from '../models/phasor-viewer';

type Mode = 'compare' | 'rlc';
type St = { mode: Mode; w1: Wave; w2: Wave; showSum: boolean; el: El; vals: Record<El, number>; f: number; vp: number; speed: number };
const D2R = Math.PI / 180;
const T = (v: number, u: string) => `\\text{${si(v, u)}}`;

function initState(params: Record<string, any>): St {
  const mode: Mode = params.mode === 'rlc' ? 'rlc' : 'compare';
  const el: El = ['R', 'L', 'C'].includes(params.element) ? params.element : 'C';
  const fRaw = Number(params.f); const f = isFinite(fRaw) && fRaw > 0 ? fRaw : mode === 'rlc' ? 1000 : 50;
  return {
    mode, el, f, vp: 10, speed: 0.25, showSum: true,
    w1: { A: 1, f, phi: 0, off: 0 }, w2: { A: 0.7, f, phi: -60, off: 0 },
    vals: { R: 100, L: 10e-3, C: 1e-6 },
  };
}

/** Arrow from (x0,y0) to (x1,y1) in SVG units. */
function Arrow({ x0, y0, x1, y1, color, dashed, width = 2.4 }: { x0: number; y0: number; x1: number; y1: number; color: string; dashed?: boolean; width?: number }) {
  const L = Math.hypot(x1 - x0, y1 - y0); if (L < 0.5) return null;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L; const h = Math.min(10, L * 0.4);
  const bx = x1 - ux * h, by = y1 - uy * h;
  return <g>
    <line x1={x0} y1={y0} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeDasharray={dashed ? '5 4' : undefined} />
    <polygon points={`${x1},${y1} ${bx - uy * h * 0.45},${by + ux * h * 0.45} ${bx + uy * h * 0.45},${by - ux * h * 0.45}`} fill={color} />
  </g>;
}

type Ph = { A: number; ang: number; color: string; label: string; from?: [number, number]; dashed?: boolean };
/** Phasor diagram: vectors drawn in data units (scale = max magnitude), with projections onto the vertical axis. */
function PhasorDiagram({ phs, scale, title }: { phs: Ph[]; scale: number; title: string }) {
  const S = 260, cx = 120, cy = 130, R = 100; const k = scale > 0 ? R / scale : 0;
  const P = (re: number, im: number): [number, number] => [cx + re * k, cy - im * k];
  return (
    <svg viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', maxWidth: 300, height: 'auto', display: 'block' }} role="img" aria-label={title}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--d-muted)" strokeDasharray="3 4" opacity={0.6} />
      <line x1={cx - R - 8} x2={cx + R + 8} y1={cy} y2={cy} stroke="var(--d-muted)" strokeWidth={1} />
      <line x1={cx} x2={cx} y1={cy - R - 8} y2={cy + R + 8} stroke="var(--d-muted)" strokeWidth={1} />
      <text x={cx + R + 10} y={cy + 4} fontSize={11} fill="var(--d-muted)">Re</text>
      <text x={cx + 4} y={cy - R - 10} fontSize={11} fill="var(--d-muted)">Im</text>
      {/* projection axis on the right: the instantaneous values */}
      <line x1={cx + R + 26} x2={cx + R + 26} y1={cy - R} y2={cy + R} stroke="var(--d-ink)" strokeWidth={1} opacity={0.5} />
      <text x={cx + R + 26} y={S - 6} fontSize={10} fill="var(--d-muted)" textAnchor="middle">value</text>
      {phs.map((p, i) => {
        const o = p.from ?? [0, 0];
        const re = o[0] + p.A * Math.cos(p.ang * D2R), im = o[1] + p.A * Math.sin(p.ang * D2R);
        const [x0, y0] = P(o[0], o[1]); const [x1, y1] = P(re, im);
        const c = `var(--d-${p.color})`;
        return <g key={i}>
          {!p.from && <line x1={x1} y1={y1} x2={cx + R + 26} y2={y1} stroke={c} strokeDasharray="2 3" strokeWidth={1} opacity={0.8} />}
          {!p.from && <circle cx={cx + R + 26} cy={y1} r={3.5} fill={c} />}
          <Arrow x0={x0} y0={y0} x1={x1} y1={y1} color={c} dashed={p.dashed} />
          <text x={x1 + (re >= o[0] ? 6 : -6)} y={y1 + (im >= o[1] ? -6 : 14)} fontSize={12} fontWeight={600} fill={c} textAnchor={re >= o[0] ? 'start' : 'end'}>{p.label}</text>
        </g>;
      })}
    </svg>
  );
}

export default function PhasorViewer({ params }: SimProps) {
  const init = useMemo(() => initState(params), [params]);
  const [s, set] = useState<St>(init);
  const [theta, setTheta] = useState(0); // reference angle ωt in degrees (wave 1 / source)
  const [play, setPlay] = useState(true);
  const raf = useRef(0);

  useEffect(() => {
    if (!play) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      setTheta(th => (th + dt * s.speed * 360) % (360 * 1e6));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [play, s.speed]);

  const upd = <K extends keyof St>(k: K) => (v: St[K]) => set(p => ({ ...p, [k]: v }));
  const updW = (w: 'w1' | 'w2', k: keyof Wave) => (v: number) => set(p => ({ ...p, [w]: { ...p[w], [k]: v } }));
  const reset = () => { set(init); setTheta(0); setPlay(true); };

  const fRef = s.mode === 'compare' ? s.w1.f : s.f;
  const t = theta / 360 / fRef; // simulated time (s)

  // ---------------- compare mode ----------------
  const cmp = useMemo(() => {
    const info = sumInfo(s.w1, s.w2); const pd = phaseDiff(s.w1, s.w2);
    const fmin = Math.min(s.w1.f, s.w2.f), fmax = Math.max(s.w1.f, s.w2.f);
    let win = 2 / s.w1.f;
    if (!info.same) win = Math.min(Math.max(2 / fmin, 1.2 / info.beat), 40 / fmax);
    const n = Math.min(1600, Math.max(400, Math.round(win * fmax * 40)));
    const ts = Array.from({ length: n }, (_, i) => (i / (n - 1)) * win);
    return { info, pd, win, ts, y1: ts.map(x => wave(s.w1, x)), y2: ts.map(x => wave(s.w2, x)), ys: ts.map(x => wave(s.w1, x) + wave(s.w2, x)) };
  }, [s.w1, s.w2]);

  // ---------------- rlc mode ----------------
  const val = s.vals[s.el];
  const r = useMemo(() => rlc(s.el, val, s.f, s.vp), [s.el, val, s.f, s.vp]);
  const rw = useMemo(() => {
    const n = 400, win = 2 / s.f; const ts = Array.from({ length: n }, (_, i) => (i / (n - 1)) * win);
    const v = ts.map(x => Math.sin(2 * Math.PI * s.f * x));
    const i = ts.map(x => Math.sin(2 * Math.PI * s.f * x + r.iPhase * D2R));
    const p = ts.map((_, k) => v[k] * i[k]);
    return { ts, v, i, p, win };
  }, [s.f, r.iPhase]);
  const xcurve = useMemo(() => { const fs = logspace(1, 1e6, 200); return { x: fs, y: fs.map(f => reactance(s.el, val, f)) }; }, [s.el, val]);

  const schematic = useMemo(() => s.mode !== 'rlc' ? '' : renderCircuit({
    elements: [
      { t: 'Vac', a: [0, 1], b: [0, 5], label: 'v(t)', value: `${si(s.vp, 'V')} pk, ${si(s.f, 'Hz')}` },
      { t: 'wire', pts: [[0, 1], [0, 0], [10, 0], [10, 1]], flow: true },
      { t: s.el, a: [10, 1], b: [10, 5], label: s.el === 'R' ? 'R' : s.el === 'L' ? 'L' : 'C', value: si(val, s.el === 'R' ? 'Ω' : s.el === 'L' ? 'H' : 'F'), color: 'accent' },
      { t: 'wire', pts: [[10, 5], [10, 6], [0, 6], [0, 5]] },
      { t: 'arrow', a: [4.2, -0.7], b: [5.8, -0.7], label: `i: ${si(r.ip, 'A')} pk` },
      { t: 'text', at: [13, 3], text: s.el === 'R' ? `R = ${si(val, 'Ω')}` : `X_${s.el} = ${si(r.zm, 'Ω')}`, anchor: 'start', color: 'accent' },
    ],
  }).svg, [s.mode, s.el, s.vp, s.f, val, r]);

  const playCtl = <div className="ctl" style={{ flexDirection: 'row', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <button type="button" className="btn btn-sm" onClick={() => setPlay(p => !p)} aria-label={play ? 'Pause rotation' : 'Play rotation'}>{play ? 'Pause' : 'Play'}</button>
    <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setPlay(false); setTheta(0); }}>t = 0</button>
  </div>;
  const timeCtl = <>
    <Slider label="ωt (reference)" value={((theta % 720) + 720) % 720} min={0} max={720} step={1} format={v => v.toFixed(0) + '°'} onChange={v => { setPlay(false); setTheta(v); }} />
    <Slider label="Rotation speed (cycles/s)" value={s.speed} min={0.05} max={2} step={0.05} format={v => v.toFixed(2)} onChange={upd('speed')} />
  </>;

  // ---------------- render ----------------
  if (s.mode === 'compare') {
    const { info, pd } = cmp;
    const a1 = 360 * s.w1.f * t + s.w1.phi, a2 = 360 * s.w2.f * t + s.w2.phi;
    const scale = Math.max(s.w1.A + (s.showSum ? s.w2.A : 0), s.w1.A, s.w2.A, 1e-9);
    const sumRe = s.w1.A * Math.cos(a1 * D2R) + s.w2.A * Math.cos(a2 * D2R), sumIm = s.w1.A * Math.sin(a1 * D2R) + s.w2.A * Math.sin(a2 * D2R);
    const phs: Ph[] = [
      { A: s.w1.A, ang: a1, color: 'blue', label: 'x₁' },
      { A: s.w2.A, ang: a2, color: 'orange', label: 'x₂' },
      ...(s.showSum ? [{ A: s.w2.A, ang: a2, color: 'orange', label: '', from: [s.w1.A * Math.cos(a1 * D2R), s.w1.A * Math.sin(a1 * D2R)] as [number, number], dashed: true },
        { A: Math.hypot(sumRe, sumIm), ang: Math.atan2(sumIm, sumRe) / D2R, color: 'green', label: 'x₁+x₂' }] : []),
    ];
    const tw = t % cmp.win;
    const lead = Math.abs(pd.deg) < 0.05 ? 'in phase' : Math.abs(Math.abs(pd.deg) - 180) < 0.05 ? 'antiphase (180°)' : pd.deg > 0 ? 'x₂ leads x₁' : 'x₂ lags x₁';
    return (
      <SimShell title="Phasors, phase shift & reactance" onReset={reset}
        tryThis={<>set both amplitudes to 1 and φ₂ to 180°: the phasors point opposite ways and the sum vanishes. At φ₂ = 90° the sum is √2 ≈ 1.414 at 45°, not 2. Then nudge f₂ about 10% above f₁: x₂ slowly rotates relative to x₁ and the sum <i>beats</i> at |f₁ − f₂|.</>}
        controls={<>
          <Seg label="Mode" value={s.mode} onChange={upd('mode')} options={[{ value: 'compare', label: 'Two sinusoids' }, { value: 'rlc', label: 'R / L / C' }]} />
          {playCtl}
          <div className="small" style={{ color: 'var(--d-blue)', fontWeight: 700 }}>Wave x₁(t)</div>
          <Slider label="Amplitude A₁" value={s.w1.A} min={0} max={2} step={0.01} onChange={updW('w1', 'A')} format={v => v.toFixed(2)} />
          <Slider label="Frequency f₁" value={s.w1.f} min={1} max={1e6} log unit="Hz" onChange={updW('w1', 'f')} />
          <Slider label="Phase φ₁" value={s.w1.phi} min={-180} max={180} step={1} format={v => v.toFixed(0) + '°'} onChange={updW('w1', 'phi')} />
          <Slider label="Offset" value={s.w1.off} min={-1} max={1} step={0.01} format={v => v.toFixed(2)} onChange={updW('w1', 'off')} />
          <div className="small" style={{ color: 'var(--d-orange)', fontWeight: 700 }}>Wave x₂(t)</div>
          <Slider label="Amplitude A₂" value={s.w2.A} min={0} max={2} step={0.01} onChange={updW('w2', 'A')} format={v => v.toFixed(2)} />
          <Slider label="Frequency f₂" value={s.w2.f} min={1} max={1e6} log unit="Hz" onChange={updW('w2', 'f')} />
          <Slider label="Phase φ₂" value={s.w2.phi} min={-180} max={180} step={1} format={v => v.toFixed(0) + '°'} onChange={updW('w2', 'phi')} />
          <Slider label="Offset" value={s.w2.off} min={-1} max={1} step={0.01} format={v => v.toFixed(2)} onChange={updW('w2', 'off')} />
          <button type="button" className="btn btn-sm" onClick={() => set(p => ({ ...p, w2: { ...p.w2, f: p.w1.f } }))}>Set f₂ = f₁</button>
          <Toggle label="Show sum x₁ + x₂" checked={s.showSum} onChange={upd('showSum')} />
          {timeCtl}
          <Note>Phasors show only the AC part; a DC offset shifts the waveform up/down but does not rotate.</Note>
        </>}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: '1 1 220px', maxWidth: 300, margin: '0 auto' }}><PhasorDiagram phs={phs} scale={scale} title="Phasor diagram of x1, x2 and their sum" /></div>
          <div style={{ flex: '2 1 280px', minWidth: 0 }}>
            <Plot height={240} xUnit="s" xLabel="Time" yLabel="Value" xRange={[0, cmp.win]}
              series={[{ x: cmp.ts, y: cmp.y1, label: 'x₁', color: 'blue' }, { x: cmp.ts, y: cmp.y2, label: 'x₂', color: 'orange' }, ...(s.showSum ? [{ x: cmp.ts, y: cmp.ys, label: 'x₁ + x₂', color: 'green', width: 2.4 }] : [])]}
              vlines={[{ at: tw, color: 'muted' }]}
              points={[{ x: tw, y: wave(s.w1, tw), color: 'blue' }, { x: tw, y: wave(s.w2, tw), color: 'orange' }, ...(s.showSum ? [{ x: tw, y: wave(s.w1, tw) + wave(s.w2, tw), color: 'green' }] : [])]} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {info.same ? <RegionBadge label={lead} color={Math.abs(pd.deg) < 0.05 ? 'ok' : 'info'} /> : <RegionBadge label={`different frequencies: beats at ${si(info.beat, 'Hz')}`} color="warn" />}
        </div>
        <Readouts>
          <Readout k="Phase of x₂ vs x₁" v={info.same ? `${pd.deg >= 0 ? '+' : ''}${pd.deg.toFixed(1)}°` : 'drifting'} hl />
          <Readout k="Time shift Δt" v={info.same ? si(Math.abs(pd.dt), 's') : '—'} />
          <Readout k="Sum amplitude" v={info.same ? num(info.A, 4) : `${num(info.envMin, 3)} … ${num(info.envMax, 3)}`} />
          <Readout k="Sum phase" v={info.same ? `${info.phi.toFixed(1)}°` : '—'} />
          <Readout k="RMS x₁ / x₂" v={`${num(rms(s.w1), 3)} / ${num(rms(s.w2), 3)}`} />
          <Readout k="Period T₁" v={si(1 / s.w1.f, 's')} />
        </Readouts>
        <EqBox>{info.same
          ? String.raw`${s.w1.A.toFixed(2)}\angle ${s.w1.phi.toFixed(0)}^\circ + ${s.w2.A.toFixed(2)}\angle ${s.w2.phi.toFixed(0)}^\circ = ${info.A.toFixed(3)}\angle ${info.phi.toFixed(1)}^\circ,\qquad \Delta t = \frac{\Delta\phi}{360^\circ}\,T = \frac{${pd.deg.toFixed(1)}^\circ}{360^\circ}\cdot ${T(1 / s.w1.f, 's')} = ${T(pd.dt, 's')}`
          : String.raw`x_1 + x_2 \text{ beats at } |f_1 - f_2| = ${T(info.beat, 'Hz')},\quad \text{envelope } |A_1 - A_2| \ldots A_1 + A_2 = ${info.envMin.toFixed(2)} \ldots ${info.envMax.toFixed(2)}`}</EqBox>
      </SimShell>
    );
  }

  // rlc mode
  const unit = s.el === 'R' ? 'Ω' : s.el === 'L' ? 'H' : 'F';
  const range: Record<El, [number, number]> = { R: [1, 1e5], L: [1e-6, 1], C: [1e-9, 1e-3] };
  const vAng = theta; const iAng = theta + r.iPhase;
  const tw = t % rw.win;
  const eq = s.el === 'R' ? String.raw`Z_R = R = ${T(val, 'Ω')},\quad I_p = \frac{V_p}{R} = ${T(r.ip, 'A')},\quad \theta_i - \theta_v = 0^\circ`
    : s.el === 'L' ? String.raw`X_L = 2\pi f L = 2\pi\cdot ${T(s.f, 'Hz')}\cdot ${T(val, 'H')} = ${T(r.zm, 'Ω')},\quad Z_L = jX_L,\quad I_p = \frac{V_p}{X_L} = ${T(r.ip, 'A')},\quad \theta_i - \theta_v = -90^\circ`
      : String.raw`X_C = \frac{1}{2\pi f C} = \frac{1}{2\pi\cdot ${T(s.f, 'Hz')}\cdot ${T(val, 'F')}} = ${T(r.zm, 'Ω')},\quad Z_C = -jX_C,\quad I_p = ${T(r.ip, 'A')},\quad \theta_i - \theta_v = +90^\circ`;
  return (
    <SimShell title="Phasors, phase shift & reactance" onReset={reset}
      tryThis={s.el === 'C' ? <>double the frequency: X<sub>C</sub> halves and the current doubles, but it still leads by exactly 90°. Watch p(t): the capacitor takes energy for a quarter cycle and gives it back the next, so the average power is zero. Then switch to L and see the current lag instead ("ELI the ICE man").</>
        : s.el === 'L' ? <>double the frequency: X<sub>L</sub> doubles and the current halves, always lagging by 90°. The power curve swings equally above and below zero, so the inductor dissipates nothing on average. Compare with R, where p(t) never goes negative.</>
          : <>sweep the frequency over six decades: a pure resistor's current stays in phase and its amplitude doesn't change. p(t) is always ≥ 0 and averages V<sub>p</sub>I<sub>p</sub>/2. Then switch to C or L.</>}
      controls={<>
        <Seg label="Mode" value={s.mode} onChange={upd('mode')} options={[{ value: 'compare', label: 'Two sinusoids' }, { value: 'rlc', label: 'R / L / C' }]} />
        <Seg label="Element" value={s.el} onChange={upd('el')} options={[{ value: 'R', label: 'Resistor' }, { value: 'L', label: 'Inductor' }, { value: 'C', label: 'Capacitor' }]} />
        <Slider label={s.el === 'R' ? 'Resistance R' : s.el === 'L' ? 'Inductance L' : 'Capacitance C'} value={val} min={range[s.el][0]} max={range[s.el][1]} log unit={unit} onChange={v => set(p => ({ ...p, vals: { ...p.vals, [p.el]: v } }))} />
        <Slider label="Frequency f" value={s.f} min={1} max={1e6} log unit="Hz" onChange={upd('f')} />
        <Slider label="Source amplitude Vp" value={s.vp} min={0.1} max={20} step={0.1} unit="V" onChange={upd('vp')} />
        {playCtl}
        {timeCtl}
        <Note>Phasor lengths are normalised (V and I have different units). Waveforms are plotted as v/V<sub>p</sub>, i/I<sub>p</sub> and p/(V<sub>p</sub>I<sub>p</sub>); true amplitudes are in the readouts.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: '1 1 220px', maxWidth: 300, margin: '0 auto' }}>
          <PhasorDiagram scale={1} title="Voltage and current phasors" phs={[{ A: 1, ang: vAng, color: 'blue', label: 'V' }, { A: 0.7, ang: iAng, color: 'orange', label: 'I' }]} />
        </div>
        <div style={{ flex: '2 1 280px', minWidth: 0 }}>
          <Plot height={240} xUnit="s" xLabel="Time" yLabel="normalised" xRange={[0, rw.win]} yRange={[-1.15, 1.15]}
            series={[{ x: rw.ts, y: rw.v, label: 'v(t)', color: 'blue' }, { x: rw.ts, y: rw.i, label: 'i(t)', color: 'orange' }, { x: rw.ts, y: rw.p, label: 'p(t) = v·i', color: 'purple', dashed: true }]}
            hlines={[{ at: r.argZ === 0 ? 0.5 : 0, label: 'avg power', color: 'purple' }]} vlines={[{ at: tw, color: 'muted' }]}
            points={[{ x: tw, y: Math.sin(vAng * D2R), color: 'blue' }, { x: tw, y: Math.sin(iAng * D2R), color: 'orange' }]} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegionBadge label={r.relation} color={s.el === 'R' ? 'ok' : s.el === 'L' ? 'warn' : 'info'} />
      </div>
      <Readouts>
        <Readout k={s.el === 'R' ? 'Resistance' : `Reactance X_${s.el}`} v={si(r.zm, 'Ω')} hl />
        <Readout k="Current Ip" v={si(r.ip, 'A')} />
        <Readout k="Phase i vs v" v={`${r.iPhase > 0 ? '+' : ''}${r.iPhase.toFixed(0)}°`} />
        <Readout k="Time shift" v={si(Math.abs(r.iPhase) / 360 / s.f, 's')} />
        <Readout k="Average power" v={si(r.pAvg, 'W')} />
        <Readout k="Reactive power" v={si(Math.abs(r.q), 'var')} />
      </Readouts>
      <EqBox>{eq}</EqBox>
      <Plot height={190} xLog yLog xUnit="Hz" yUnit="Ω" xLabel="Frequency" yLabel={s.el === 'R' ? 'R' : `X_${s.el}`}
        series={[{ ...xcurve, label: s.el === 'R' ? 'R (flat)' : s.el === 'L' ? 'X_L = 2πfL (rises)' : 'X_C = 1/(2πfC) (falls)', color: 'accent' }]}
        points={[{ x: s.f, y: r.zm, label: si(r.zm, 'Ω'), color: 'accent' }]} vlines={[{ at: s.f, color: 'muted' }]} />
    </SimShell>
  );
}

