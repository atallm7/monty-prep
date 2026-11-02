// Two-phase bipolar stepper: full / half / micro stepping, coil currents, rotor and field angle, torque and dynamics.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { Mode, NR, STEP_DEG, DEFAULT_J, position, sequence, holdingTorque, torqueVsDisplacement, staticDeflection, dynamics, modeStepsPerFull, resonanceHz } from '../models/stepper-lab';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };
const deg = (r: number) => (r * 180) / Math.PI;
const MICRO = [2, 4, 8, 16, 32, 64];

export default function StepperLab({ params }: SimProps) {
  const m0: Mode = params.mode === 'half' || params.mode === 'micro' ? params.mode : 'full';
  const micro0 = MICRO.includes(Math.round(n(params.microsteps, 8))) ? Math.round(n(params.microsteps, 8)) : 8;
  const init = { mode: m0, micro: micro0, th: 0.4, tload: 0.1, irated: 1.5, rate: 200, hz: 3 };
  const [s, set] = useState(init);
  const [k, setK] = useState(0);
  const [play, setPlay] = useState(false);
  const [dirn, setDirn] = useState<1 | -1>(1);
  const upd = <K extends keyof typeof s>(key: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [key]: v }));
  const spf = modeStepsPerFull(s.mode, s.micro), N = 4 * spf;

  const tick = useRef<() => void>(() => {}); tick.current = () => setK(v => v + dirn);
  useEffect(() => {
    if (!play) return;
    let id = 0, last = performance.now(), acc = 0; const period = 1000 / (s.hz * (s.mode === 'micro' ? Math.min(spf, 8) : 1));
    const loop = (t: number) => { acc += t - last; last = t; if (acc >= period) { acc = 0; tick.current(); } id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id);
  }, [play, s.hz, s.mode, spf]);
  useEffect(() => { setK(0); }, [s.mode, s.micro]);

  const idx = ((k % N) + N) % N, wraps = Math.floor(k / N);
  const pos = position(s.mode, s.micro, k), phiU = pos.phi + wraps * 2 * Math.PI;
  const seq = useMemo(() => sequence(s.mode, s.micro), [s.mode, s.micro]);
  const tq = useMemo(() => holdingTorque(s.mode, s.micro, s.th), [s.mode, s.micro, s.th]);
  const tc = useMemo(() => torqueVsDisplacement(s.mode, s.micro, idx, s.th), [s.mode, s.micro, idx, s.th]);
  const sd = staticDeflection(s.mode, s.micro, idx, s.tload, s.th);
  const dyn = useMemo(() => dynamics({ mode: s.mode, micro: s.micro, rate: s.rate, tload: s.tload, th: s.th, steps: 12 * (s.mode === 'full' ? 2 : s.mode === 'half' ? 2 : 1) }), [s.mode, s.micro, s.rate, s.tload, s.th]);
  const reso = resonanceHz(s.th, DEFAULT_J);
  const tmin = Math.min(...tq), tmax = Math.max(...tq);
  const shaft = ((k * STEP_DEG) / spf);
  // rotor display angle: field angle minus the static deflection under load (electrical → drawn 1:1)
  const rotorA = deg(phiU) - (sd.stalled ? 90 : deg(sd.elec));
  const R = 112, ctr = 130;

  const poleFill = (i: number) => (i > 0 ? 'var(--d-accent)' : i < 0 ? 'var(--d-red)' : 'var(--d-box)');
  const pole = (x: number, y: number, w: number, h: number, cur: number, label: string, key: string) => (
    <g key={key}><rect x={x} y={y} width={w} height={h} rx={6} fill={poleFill(cur)} opacity={cur === 0 ? 1 : 0.25 + 0.75 * Math.min(1, Math.abs(cur))} stroke="var(--d-ink)" strokeWidth={1.4} />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--d-ink)">{Math.abs(cur) < 1e-9 ? '–' : label}</text></g>
  );
  const polA = pos.ia, polB = pos.ib;
  const fl = 70 * (pos.mag / Math.SQRT2) + 15;
  const ax = ctr + fl * Math.sin(phiU), ay = ctr - fl * Math.cos(phiU);
  const stateName = s.mode === 'full' ? 'Full step (two phases on)' : s.mode === 'half' ? (pos.mag > 1.2 ? 'Half step: both phases' : 'Half step: one phase') : `Microstep 1/${s.micro}`;

  return (
    <SimShell title="Stepper motor driving" onReset={() => { set(init); setK(0); setPlay(false); setDirn(1); }}
      tryThis={<>(1) In <b>Half</b> mode press Step and watch the torque alternate between 100 % and 71 % (one coil vs two). (2) In <b>Micro</b> mode every position has the same torque T<sub>h</sub>/√2, but each step is only 1.8°/{s.micro}. (3) Raise the step rate near the {si(reso, 'Hz')} resonance with a load of 0.2 N·m and read the lost-step count in the dynamic response: when the load exceeds the available torque the rotor falls out of sync.</>}
      controls={<>
        <Seg label="Drive mode" value={s.mode} options={[{ value: 'full', label: 'Full' }, { value: 'half', label: 'Half' }, { value: 'micro', label: 'Micro' }]} onChange={upd('mode')} />
        {s.mode === 'micro' && <Seg label="Microsteps per full step" value={String(s.micro)} options={MICRO.map(v => ({ value: String(v), label: String(v) }))} onChange={v => upd('micro')(Number(v))} />}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => { setPlay(false); setK(v => v - 1); }}>◀ Step back</button>
          <button className="btn btn-sm" onClick={() => { setPlay(false); setK(v => v + 1); }}>Step ▶</button>
          <button className="btn btn-sm" onClick={() => setPlay(p => !p)} aria-pressed={play}>{play ? 'Pause' : 'Play'}</button>
          <button className="btn btn-sm" onClick={() => setDirn(d => (d === 1 ? -1 : 1))}>Direction: {dirn === 1 ? 'CW' : 'CCW'}</button>
        </div>
        <Slider label="Animation speed (steps/s, slow-mo)" value={s.hz} min={0.5} max={20} step={0.5} onChange={upd('hz')} format={v => v.toFixed(1)} />
        <Slider label="Rated phase current" value={s.irated} min={0.2} max={3} step={0.1} unit="A" onChange={upd('irated')} />
        <Slider label="Holding torque Th (2 phases on)" value={s.th} min={0.05} max={1.5} step={0.01} unit="N·m" onChange={upd('th')} />
        <Slider label="Load torque" value={s.tload} min={0} max={1} step={0.005} unit="N·m" onChange={upd('tload')} />
        <Slider label="Step rate (dynamic run)" value={s.rate} min={10} max={10000} log unit="step/s" format={v => `${v.toFixed(0)} step/s`} onChange={upd('rate')} />
        <Note>200 steps/rev ({STEP_DEG}°); N<sub>r</sub> = {NR} rotor teeth, so 4 full steps = 1 electrical cycle = {(4 * STEP_DEG).toFixed(1)}° of shaft. The drawing shows the electrical angle (1 turn = 4 full steps).</Note>
      </>}>
      <svg viewBox="0 0 260 260" width="100%" style={{ maxWidth: 300, display: 'block', margin: '0 auto' }} role="img" aria-label={`Stepper rotor at position ${idx}, field angle ${deg(pos.phi).toFixed(0)} degrees`}>
        <circle cx={ctr} cy={ctr} r={R - 18} fill="none" stroke="var(--d-muted)" strokeWidth={1} strokeDasharray="3 4" />
        {pole(ctr - 18, 6, 36, 34, polA, polA >= 0 ? 'N' : 'S', 'a1')}{pole(ctr - 18, 220, 36, 34, -polA, polA >= 0 ? 'S' : 'N', 'a2')}
        {pole(220, ctr - 18, 34, 36, polB, polB >= 0 ? 'N' : 'S', 'b1')}{pole(6, ctr - 18, 34, 36, -polB, polB >= 0 ? 'S' : 'N', 'b2')}
        <text x={ctr + 24} y={26} fontSize={11} fill="var(--d-muted)">coil A</text><text x={ctr - 24} y={ctr - 24} fontSize={11} fill="var(--d-muted)" textAnchor="end" transform={`rotate(0)`}> </text>
        <text x={222} y={ctr - 24} fontSize={11} fill="var(--d-muted)">coil B</text>
        <g style={{ transform: `rotate(${rotorA}deg)`, transformOrigin: `${ctr}px ${ctr}px`, transition: play ? 'none' : 'transform .25s ease' }}>
          <circle cx={ctr} cy={ctr} r={62} fill="var(--d-box)" stroke="var(--d-ink)" strokeWidth={2} />
          <path d={`M ${ctr} ${ctr - 62} A 62 62 0 0 1 ${ctr} ${ctr + 62} Z`} fill="var(--d-red)" opacity={0.28} />
          <path d={`M ${ctr} ${ctr - 62} A 62 62 0 0 0 ${ctr} ${ctr + 62} Z`} fill="var(--d-blue)" opacity={0.28} />
          <line x1={ctr} y1={ctr} x2={ctr} y2={ctr - 58} stroke="var(--d-ink)" strokeWidth={3} strokeLinecap="round" />
          <text x={ctr} y={ctr - 36} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--d-red)">N</text>
          <text x={ctr} y={ctr + 46} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--d-blue)">S</text>
        </g>
        <line x1={ctr} y1={ctr} x2={ax} y2={ay} stroke="var(--d-accent)" strokeWidth={3.5} markerEnd="url(#fa)" strokeLinecap="round" />
        <defs><marker id="fa" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="var(--d-accent)" /></marker></defs>
        <circle cx={ctr} cy={ctr} r={4} fill="var(--d-ink)" />
        <text x={8} y={254} fontSize={11} fill="var(--d-accent)">field B-vector</text>
      </svg>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
        <RegionBadge label={stateName} color="info" />
        {sd.stalled ? <RegionBadge label="Load exceeds holding torque: rotor slips" color="bad" /> : sd.ratio > 0.7 ? <RegionBadge label="Heavy load: little torque margin" color="warn" /> : <RegionBadge label="Holding with margin" color="ok" />}
        {dyn.lostFullSteps > 0.5 && <RegionBadge label={`Dynamic run: lost ${dyn.lostFullSteps.toFixed(1)} full steps`} color="bad" />}
      </div>
      <Readouts>
        <Readout k="Position in cycle" v={`${idx + 1} / ${N}`} hl />
        <Readout k="Ia / Ib" v={`${si(pos.ia * s.irated, 'A')} / ${si(pos.ib * s.irated, 'A')}`} />
        <Readout k="Field angle (electrical)" v={`${deg(pos.phi).toFixed(1)}°`} />
        <Readout k="Shaft angle (commanded)" v={`${shaft.toFixed(2)}°`} />
        <Readout k="Step size" v={`${(STEP_DEG / spf).toFixed(3)}°`} />
        <Readout k="Steps per revolution" v={String(200 * spf)} />
        <Readout k="Holding torque here" v={si(sd.peak, 'N·m')} tone={sd.stalled ? 'bad' : undefined} />
        <Readout k="Deflection under load" v={sd.stalled ? 'stalled' : `${sd.mechDeg.toFixed(3)}° (${(sd.fullSteps * 100).toFixed(0)} % of a step)`} />
        <Readout k="Torque min / max over cycle" v={`${si(tmin, 'N·m')} / ${si(tmax, 'N·m')}`} />
        <Readout k="Resonance (√(Th·Nr/J))" v={si(reso, 'Hz')} />
      </Readouts>
      <EqBox>{String.raw`T=T_m|\mathbf I|\sin(\varphi-\theta_e),\;\; \mathbf I=(\cos\varphi,\sin\varphi)\ \text{(micro)},\;\; T_m=\tfrac{T_h}{\sqrt2}\;\Rightarrow\; \delta=\arcsin\frac{T_L}{T_m|\mathbf I|}=${sd.stalled ? '\\text{slip}' : deg(sd.elec).toFixed(1) + '^\\circ_{el}'}`}</EqBox>
      <Plot series={[{ x: [...seq.map((_, i) => i), N], y: [...seq.map(p => p.ia * s.irated), seq[0].ia * s.irated], label: 'Ia', color: 'accent', step: s.mode !== 'micro' }, { x: [...seq.map((_, i) => i), N], y: [...seq.map(p => p.ib * s.irated), seq[0].ib * s.irated], label: 'Ib', color: 'orange', step: s.mode !== 'micro' }]}
        xUnit="" yUnit="A" xLabel="Position index in one electrical cycle" yLabel="Coil current" height={190} vlines={[{ at: idx, label: 'now', color: 'muted' }]} />
      <Plot series={[{ x: tc.x, y: tc.y, label: 'Torque on rotor', color: 'accent' }]} yUnit="N·m" xLabel="Rotor displacement from this position (full steps)" yLabel="Torque" height={200}
        hlines={[{ at: s.tload, label: 'load', color: 'red' }, { at: -s.tload, color: 'red' }]} points={sd.stalled ? [] : [{ x: -sd.fullSteps, y: -s.tload, label: 'rest', color: 'red' }]} vlines={[{ at: 0, color: 'muted' }]} />
      <Plot series={[{ x: tq.map((_, i) => i), y: tq, label: 'Peak holding torque', color: 'green', step: true, points: true }]} yUnit="N·m" xLabel="Position index" yLabel="Torque" height={160} yRange={[0, s.th * 1.1]} hlines={[{ at: s.th, label: 'datasheet Th', color: 'muted' }, { at: s.tload, label: 'load', color: 'red' }]} />
      <Plot series={[{ x: dyn.t, y: dyn.angleMech, label: 'Rotor', color: 'accent' }, { x: dyn.t, y: dyn.cmdMech, label: 'Commanded', color: 'red', dashed: true, step: true }]} xUnit="s" yUnit="°" xLabel={`Dynamic response at ${s.rate.toFixed(0)} full steps/s`} yLabel="Shaft angle" height={210} />
    </SimShell>
  );
}
