// RC / RL charging with step or square drive: τ, the 63 % / 5τ rule and continuity of vC and iL.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { simulate, tauOf, squareSteady, finalState, Kind, Drive } from '../models/rc-transient';

const T = (v: number, u: string) => isFinite(v) ? `\\text{${si(v, u).replace('−', '-')}}` : '\\infty';

export default function RcTransient({ params }: SimProps) {
  const init = {
    kind: (params.kind === 'rl' ? 'rl' : 'rc') as Kind,
    r: Number(params.r ?? 1000), c: Number(params.c ?? 1e-6), l: Number(params.l ?? 1e-3),
    vs: Number(params.vs ?? 5), f: Number(params.f ?? 100),
    drive: (params.drive === 'step' ? 'step' : 'square') as Drive,
    start: 'zero' as 'zero' | 'steady', view: 'periods' as 'periods' | 'edge',
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const rc = s.kind === 'rc';
  const tau = tauOf(s);
  const X = finalState(s.kind, s.vs, s.r);
  const Tp = 1 / s.f;
  const ss = squareSteady(s);

  // time window: step or "zoom on edge" shows −0.5τ..6τ; square shows 3 periods (more from zero if τ is long)
  const win = useMemo<[number, number]>(() => {
    if (s.drive === 'step') return [-0.5 * tau, 6 * tau];
    if (s.view === 'edge') { const span = Math.min(6 * tau, Tp / 2); return [-span / 10, span]; }
    const periods = s.start === 'zero' ? Math.min(12, Math.max(3, Math.ceil(5 * tau / Tp))) : 3;
    return [0, periods * Tp];
  }, [s.drive, s.view, s.start, tau, Tp]);
  // zooming on the first edge starting from zero is exactly a step response; from steady state zoom on an edge at T
  const w = useMemo(() => {
    const zoomSteady = s.drive === 'square' && s.view === 'edge' && s.start === 'steady';
    if (zoomSteady) {
      const ww = simulate(s, 0, Tp + win[1], 1400, 'steady');
      const keep = ww.t.map((t, i) => t >= Tp + win[0] ? i : -1).filter(i => i >= 0);
      const pick = (a: number[]) => keep.map(i => a[i]);
      return { t: keep.map(i => ww.t[i] - Tp), vin: pick(ww.vin), x: pick(ww.x), vR: pick(ww.vR), y: pick(ww.y) };
    }
    return simulate(s, win[0], win[1], 700, s.drive === 'square' ? s.start : 'zero');
  }, [s, win, Tp]);

  const xUnit = rc ? 'V' : 'A', yUnit = rc ? 'A' : 'V';
  const xName = rc ? 'v_C' : 'i_L', yName = rc ? 'i_C' : 'v_L';
  const a = Tp / (2 * tau); // half-period in time constants
  const regime = s.drive === 'step' ? null : a >= 4 ? { l: 'τ ≪ T/2: fully charges each half-cycle', c: 'ok' as const } : a > 0.5 ? { l: 'τ ~ T/2: rounded edges, partial charge', c: 'warn' as const } : { l: 'τ ≫ T: integrator, small triangle ripple', c: 'info' as const };

  const schematic = useMemo(() => {
    const flowing = s.vs > 0;
    const src = s.drive === 'square'
      ? [{ t: 'Vsq', a: [0, 1.5], b: [0, 6.5], label: 'v_{in}', value: `0↔${si(s.vs, 'V')}\n${si(s.f, 'Hz')}` }]
      : [{ t: 'V', a: [0, 1.5], b: [0, 6.5], label: 'V_s', value: si(s.vs, 'V') }];
    return renderCircuit({ elements: [
      ...src,
      { t: 'wire', pts: [[0, 1.5], [0, 0], [2, 0]], flow: flowing },
      ...(s.drive === 'step' ? [{ t: 'SWclosed', a: [2, 0], b: [5, 0], label: 't = 0' }, { t: 'wire', pts: [[5, 0], [6, 0]], flow: flowing }] : [{ t: 'wire', pts: [[2, 0], [6, 0]], flow: flowing }]),
      { t: 'R', a: [6, 0], b: [10, 0], label: 'R', value: si(s.r, 'Ω') },
      { t: 'wire', pts: [[10, 0], [12, 0], [12, 1.5]], flow: flowing },
      rc ? { t: 'C', a: [12, 1.5], b: [12, 6.5], label: 'C', value: si(s.c, 'F'), color: 'accent' } : { t: 'L', a: [12, 1.5], b: [12, 6.5], label: 'L', value: si(s.l, 'H'), color: 'accent' },
      { t: 'wire', pts: [[12, 6.5], [12, 8], [0, 8], [0, 6.5]], flow: flowing },
      { t: 'gnd', at: [6, 8] },
      { t: 'text', at: [6.5, 5], text: `τ = ${rc ? 'RC' : 'L/R'} = ${si(tau, 's')}`, color: 'accent' },
    ] }).svg;
  }, [s, rc, tau]);

  const tauMarks = s.drive === 'step' || s.view === 'edge'
    ? [{ at: 0, label: 't = 0', color: 'muted' }, { at: tau, label: 'τ', color: 'accent' }, { at: 5 * tau, label: '5τ', color: 'accent' }].filter(m => m.at <= win[1])
    : Array.from({ length: Math.min(24, Math.round((win[1] - win[0]) / (Tp / 2))) }, (_, k) => ({ at: (k + 1) * Tp / 2, color: 'muted' }));
  const xH = s.drive === 'step' || (s.view === 'edge' && s.start === 'zero')
    ? [{ at: X, label: rc ? 'final = Vs' : 'final = Vs/R', color: 'muted' }, { at: 0.632 * X, label: '63.2% at τ', color: 'accent' }]
    : [{ at: ss.hi, label: 'steady-state max', color: 'muted' }, { at: ss.lo, label: ss.hi - ss.lo > 0.12 * X ? 'steady-state min' : undefined, color: 'muted' }];
  const showTauPt = s.drive === 'step' || (s.view === 'edge' && s.start === 'zero');

  return (
    <SimShell title="RC / RL charging & continuity" onReset={() => set(init)}
      tryThis={<>with a step into RC, read v<sub>C</sub> at the τ mark: 63.2% of V<sub>s</sub>, and 99.3% at 5τ. Notice i<sub>C</sub> jumps from 0 to V<sub>s</sub>/R at t = 0 while v<sub>C</sub> starts smoothly from 0 (the capacitor acts as a short at first and an open at DC). Now choose square drive and raise f until T/2 &lt; τ: the output becomes a small triangle around V<sub>s</sub>/2 (an integrator). Switch to RL: now i<sub>L</sub> is continuous and v<sub>L</sub> jumps to V<sub>s</sub>.</>}
      controls={<>
        <Seg label="Circuit" value={s.kind} onChange={upd('kind')} options={[{ value: 'rc', label: 'RC' }, { value: 'rl', label: 'RL' }]} />
        <Seg label="Drive" value={s.drive} onChange={upd('drive')} options={[{ value: 'step', label: 'Step at t = 0' }, { value: 'square', label: 'Square wave' }]} />
        <Slider label="R" value={s.r} min={1} max={1e6} log unit="Ω" onChange={upd('r')} />
        {rc ? <Slider label="C" value={s.c} min={1e-9} max={1e-3} log unit="F" onChange={upd('c')} />
          : <Slider label="L" value={s.l} min={1e-6} max={10} log unit="H" onChange={upd('l')} />}
        <Slider label="Source amplitude Vs" value={s.vs} min={0} max={24} step={0.1} unit="V" onChange={upd('vs')} />
        {s.drive === 'square' && <>
          <Slider label="Square frequency f" value={s.f} min={0.1} max={1e6} log unit="Hz" onChange={upd('f')} />
          <Seg label="Start from" value={s.start} onChange={upd('start')} options={[{ value: 'zero', label: 'Discharged' }, { value: 'steady', label: 'Steady state' }]} />
          <Seg label="View" value={s.view} onChange={upd('view')} options={[{ value: 'periods', label: 'Whole periods' }, { value: 'edge', label: 'Zoom on an edge' }]} />
        </>}
        <Note>Exact piecewise-exponential solution. Each input edge is sampled twice (just before and just after) so true jumps show as vertical lines.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={rc ? 'vC is continuous; iC can jump' : 'iL is continuous; vL can jump'} color="accent" />
        {regime && <RegionBadge label={regime.l} color={regime.c} />}
      </div>
      <EqBox>{rc
        ? String.raw`\begin{gathered}v_C(t) = V_f + \big(v_C(0^+) - V_f\big)\,e^{-t/\tau},\\ \tau = RC = ${T(s.r, 'Ω')}\cdot ${T(s.c, 'F')} = ${T(tau, 's')}\end{gathered}`
        : String.raw`\begin{gathered}i_L(t) = I_f + \big(i_L(0^+) - I_f\big)\,e^{-t/\tau},\\ I_f=\tfrac{V_s}{R},\quad \tau = \tfrac{L}{R} = \tfrac{${T(s.l, 'H')}}{${T(s.r, 'Ω')}} = ${T(tau, 's')}\end{gathered}`}</EqBox>
      <Readouts>
        <Readout k="Time constant τ" v={si(tau, 's')} hl />
        <Readout k={rc ? 'Final vC = Vs' : 'Final iL = Vs/R'} v={si(X, xUnit)} />
        <Readout k={rc ? 'vC at t = τ (63.2%)' : 'iL at t = τ (63.2%)'} v={si(0.632121 * X, xUnit)} />
        <Readout k={rc ? 'Initial iC = Vs/R' : 'Initial vL = Vs'} v={si(rc ? s.vs / s.r : s.vs, yUnit)} />
        <Readout k="5τ (≈ settled, 99.3%)" v={si(5 * tau, 's')} />
        {s.drive === 'square' && <Readout k="Half-period / τ" v={a < 1e4 ? a.toPrecision(3) : '> 10⁴'} />}
        {s.drive === 'square' && <Readout k={`Steady ${rc ? 'vC' : 'iL'} min / max`} v={`${si(ss.lo, xUnit)} / ${si(ss.hi, xUnit)}`} />}
        {rc && <Readout k="Energy stored ½CV²" v={si(0.5 * s.c * s.vs * s.vs, 'J')} />}
        {!rc && <Readout k="Energy stored ½LI²" v={si(0.5 * s.l * X * X, 'J')} />}
      </Readouts>
      <Plot series={[
        { x: w.t, y: rc ? w.vin : w.vin.map(v => v / s.r), label: rc ? 'v_in' : 'v_in / R', color: 'muted', dashed: true },
        { x: w.t, y: w.x, label: `${xName} (continuous)`, color: 'accent' },
      ]} xUnit="s" yUnit={xUnit} xLabel="Time t" yLabel={rc ? 'Voltage' : 'Current'} height={230} xRange={win}
        vlines={tauMarks} hlines={xH}
        points={showTauPt ? [{ x: tau, y: 0.632121 * X, label: '63.2%', color: 'accent' }, { x: 5 * tau, y: 0.99326 * X, label: '99.3%', color: 'accent' }].filter(q => q.x <= win[1]) : []} />
      <Plot series={[{ x: w.t, y: w.y, label: `${yName} (can jump)`, color: 'red' }, { x: w.t, y: w.vR.map(v => rc ? v : v), label: 'v_R', color: 'blue', dashed: true }].filter(q => rc ? q.label !== 'v_R' : true)}
        xUnit="s" yUnit={yUnit} xLabel="Time t" yLabel={rc ? 'Capacitor current' : 'Voltage'} height={190} xRange={win}
        vlines={s.drive === 'step' || s.view === 'edge' ? [{ at: 0, color: 'muted' }, { at: tau, color: 'accent' }] : []} />
      <Note>{rc
        ? 'A capacitor voltage cannot change instantly (i = C·dv/dt would need infinite current), so at the instant the input steps, all of the step appears across R and the current jumps. At DC steady state the capacitor is an open circuit: iC → 0.'
        : 'An inductor current cannot change instantly (v = L·di/dt would need infinite voltage), so at the instant the input steps, all of the step appears across L. At DC steady state the inductor is a short: vL → 0 and iL = Vs/R.'}</Note>
    </SimShell>
  );
}
