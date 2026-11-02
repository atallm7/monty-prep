// RLC step & natural response: α, ω0, ζ, damping class, vC and iL, overshoot and settling, s-plane poles.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { params as rlcParams, response, overshoot, settlingTime, window as tWindow, Topology } from '../models/rlc-transient';

const T = (v: number, u: string) => isFinite(v) ? `\\text{${si(v, u).replace('−', '-')}}` : '\\infty';

/** s-plane pole map drawn with equal axis scaling so the ω0 circle is round. */
function PoleMap({ poles, w0, ext, zeta }: { poles: { x: number; y: number }[]; w0: number; ext: number; zeta: number }) {
  const W = 300, H = 230, cx = 236, cy = H / 2, sc = (H / 2 - 18) / ext; // px per (rad/s)
  const X = (v: number) => cx + v * sc, Y = (v: number) => cy - v * sc;
  const offscreen = (q: { x: number }) => X(q.x) < 6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 340, height: 'auto', alignSelf: 'center' }} role="img" aria-label="s-plane pole locations">
      <line x1={6} x2={W - 6} y1={cy} y2={cy} stroke="var(--d-muted)" />
      <line x1={cx} x2={cx} y1={6} y2={H - 6} stroke="var(--d-muted)" />
      <text x={W - 8} y={cy - 6} fontSize={11} textAnchor="end" fill="var(--d-muted)">Re s</text>
      <text x={cx + 6} y={16} fontSize={11} fill="var(--d-muted)">jω</text>
      <path d={`M ${X(0)} ${Y(w0)} A ${w0 * sc} ${w0 * sc} 0 0 0 ${X(0)} ${Y(-w0)}`} fill="none" stroke="var(--d-muted)" strokeDasharray="4 4" />
      <text x={X(-w0 * 0.72)} y={Y(w0 * 0.72) - 6} fontSize={11} textAnchor="end" fill="var(--d-muted)">|s| = ω₀ = {si(w0, 'rad/s')}</text>
      {zeta < 1 && poles.slice(0, 1).map((q, k) => <line key={k} x1={cx} y1={cy} x2={X(q.x)} y2={Y(q.y)} stroke="var(--d-accent)" strokeDasharray="2 3" />)}
      {poles.map((q, k) => offscreen(q)
        ? <text key={k} x={8} y={cy + (k ? 16 : -6)} fontSize={11} fill="var(--d-red)">◀ pole at {si(q.x, '/s')}</text>
        : <g key={k} stroke="var(--d-red)" strokeWidth={2.4}><line x1={X(q.x) - 6} y1={Y(q.y) - 6} x2={X(q.x) + 6} y2={Y(q.y) + 6} /><line x1={X(q.x) - 6} y1={Y(q.y) + 6} x2={X(q.x) + 6} y2={Y(q.y) - 6} /></g>)}
      <text x={8} y={H - 8} fontSize={11} fill="var(--d-ink)">poles: {poles[0].y !== 0 ? `−α ± jω_d = ${si(poles[0].x, '')} ± j${si(Math.abs(poles[0].y), '')}` : `${si(poles[0].x, '')}, ${si(poles[1].x, '')}`} s⁻¹</text>
    </svg>
  );
}

export default function RlcTransient({ params }: SimProps) {
  const init = {
    topology: (params.topology === 'parallel' ? 'parallel' : 'series') as Topology,
    r: Number(params.r ?? 20), l: Number(params.l ?? 1e-3), c: Number(params.c ?? 1e-6), vs: Number(params.vs ?? 5),
  };
  const [s, set] = useState(init);
  const [env, setEnv] = useState(true);
  const upd = (k: 'r' | 'l' | 'c' | 'vs') => (v: number) => set(p => ({ ...p, [k]: v }));
  const series = s.topology === 'series';
  const p = useMemo(() => rlcParams(s), [s]);
  const tEnd = useMemo(() => tWindow(s), [s]);
  const w = useMemo(() => response(s, tEnd, 900, -tEnd * 0.04), [s, tEnd]);
  const os = overshoot(p.zeta, p.wd);
  const ts = useMemo(() => settlingTime(p.alpha, p.w0), [p.alpha, p.w0]);
  const rCrit = series ? 2 * Math.sqrt(s.l / s.c) : 0.5 * Math.sqrt(s.l / s.c);
  const final = series ? s.vs : s.vs / s.r; // final value of the "integrating" state (vC series / iL parallel)
  const badge = p.kind === 'underdamped' ? 'warn' : p.kind === 'critically damped' ? 'ok' : p.kind === 'overdamped' ? 'info' : 'bad';

  const schematic = useMemo(() => renderCircuit({ elements: series ? [
    { t: 'V', a: [0, 1.5], b: [0, 6.5], label: 'V_s', value: `${si(s.vs, 'V')} step` },
    { t: 'wire', pts: [[0, 1.5], [0, 0], [1, 0]], flow: true },
    { t: 'R', a: [1, 0], b: [5, 0], label: 'R', value: si(s.r, 'Ω') },
    { t: 'L', a: [5, 0], b: [9, 0], label: 'L', value: si(s.l, 'H'), color: 'blue' },
    { t: 'wire', pts: [[9, 0], [11, 0], [11, 1.5]], flow: true },
    { t: 'C', a: [11, 1.5], b: [11, 6.5], label: 'C', value: si(s.c, 'F'), color: 'accent' },
    { t: 'wire', pts: [[11, 6.5], [11, 8], [0, 8], [0, 6.5]], flow: true },
    { t: 'gnd', at: [5.5, 8] },
    { t: 'vmark', a: [13.6, 2], b: [13.6, 6], label: 'v_C', dx: 0.2 },
    { t: 'arrow', a: [9.6, -1.2], b: [11.4, -1.2], label: 'i_L', color: 'blue' },
  ] : [
    { t: 'V', a: [0, 1.5], b: [0, 6.5], label: 'V_s', value: `${si(s.vs, 'V')} step` },
    { t: 'wire', pts: [[0, 1.5], [0, 0], [1, 0]], flow: true },
    { t: 'R', a: [1, 0], b: [5, 0], label: 'R', value: si(s.r, 'Ω') },
    { t: 'wire', pts: [[5, 0], [12, 0], [12, 1.5]], flow: true },
    { t: 'wire', pts: [[8, 0], [8, 1.5]] }, { t: 'dot', at: [8, 0] },
    { t: 'C', a: [8, 1.5], b: [8, 6.5], label: 'C', value: si(s.c, 'F'), color: 'accent' },
    { t: 'L', a: [12, 1.5], b: [12, 6.5], label: 'L', value: si(s.l, 'H'), color: 'blue' },
    { t: 'wire', pts: [[12, 6.5], [12, 8], [0, 8], [0, 6.5]], flow: true },
    { t: 'wire', pts: [[8, 6.5], [8, 8]] }, { t: 'dot', at: [8, 8] },
    { t: 'gnd', at: [4, 8] },
  ] }).svg, [s, series]);

  // exponential envelope e^{-αt} around the final value for the oscillating state
  const envSeries = (scale: number, around: number) => {
    if (!env || p.kind !== 'underdamped') return [];
    const xs = w.t.filter(t => t >= 0); const A = Math.sqrt(1 + (p.alpha / p.wd) ** 2) * scale;
    return [
      { x: xs, y: xs.map(t => around + A * Math.exp(-p.alpha * t)), color: 'muted', dashed: true, label: 'envelope e^{−αt}' },
      { x: xs, y: xs.map(t => around - A * Math.exp(-p.alpha * t)), color: 'muted', dashed: true },
    ];
  };
  const vPlot = [
    { x: w.t, y: w.t.map(t => (t >= 0 ? s.vs : 0)), label: 'V_s step', color: 'muted' },
    { x: w.t, y: w.vC, label: series ? 'v_C(t)' : 'v_C = v_L (tank)', color: 'accent' },
    ...(series ? envSeries(s.vs, s.vs) : []),
  ];
  const iPlot = [
    { x: w.t, y: w.iL, label: 'i_L(t)', color: 'blue' },
    ...(!series ? envSeries(s.vs / s.r, s.vs / s.r) : []),
  ];

  // s-plane: poles s = −α ± jωd (or two real poles)
  const poles = p.kind === 'underdamped' || p.kind === 'undamped'
    ? [{ x: -p.alpha, y: p.wd }, { x: -p.alpha, y: -p.wd }]
    : [{ x: p.s1, y: 0 }, { x: p.s2, y: 0 }];
  const ext = Math.max(p.w0 * 1.25, Math.min(Math.abs(p.s2) * 1.1, p.w0 * 3));

  const ringEq0 = p.kind === 'underdamped'
    ? String.raw`${series ? 'v_C' : 'i_L'}(t) = X_f\Big[1 - e^{-\alpha t}\big(\cos\omega_d t + \tfrac{\alpha}{\omega_d}\sin\omega_d t\big)\Big]\\ \omega_d = \sqrt{\omega_0^2-\alpha^2} = ${T(p.wd, 'rad/s')}`
    : p.kind === 'critically damped' ? String.raw`${series ? 'v_C' : 'i_L'}(t) = X_f\big[1 - e^{-\alpha t}(1+\alpha t)\big]`
      : String.raw`${series ? 'v_C' : 'i_L'}(t) = X_f\Big[1 + \tfrac{s_2e^{s_1t} - s_1e^{s_2t}}{s_1-s_2}\Big]\\ s_{1,2} = -\alpha \pm\sqrt{\alpha^2-\omega_0^2}`;

  const ringEq = `\\begin{gathered}${ringEq0}\\end{gathered}`;
  return (
    <SimShell title="RLC step & natural response" onReset={() => set(init)}
      tryThis={<>in series mode raise R toward R<sub>crit</sub> = 2√(L/C) (or press "Set R = R<sub>crit</sub>"): the ringing disappears and the response is the fastest one without overshoot. Then lower R: ζ falls, overshoot rises toward 100% and the poles slide along the ω<sub>0</sub> circle toward the jω axis. Switch to parallel: now <i>larger</i> R means <i>less</i> damping (α = 1/2RC), the opposite of series.</>}
      controls={<>
        <Seg label="Topology" value={s.topology} onChange={t => set(q => ({ ...q, topology: t }))} options={[{ value: 'series', label: 'Series RLC' }, { value: 'parallel', label: 'Parallel RLC' }]} />
        <Slider label="R" value={s.r} min={0.1} max={10000} log unit="Ω" onChange={upd('r')} />
        <Slider label="L" value={s.l} min={1e-6} max={1} log unit="H" onChange={upd('l')} />
        <Slider label="C" value={s.c} min={1e-9} max={1e-3} log unit="F" onChange={upd('c')} />
        <Slider label="Step amplitude Vs" value={s.vs} min={0.1} max={24} step={0.1} unit="V" onChange={upd('vs')} />
        <button className="btn btn-sm" type="button" onClick={() => set(q => ({ ...q, r: rCrit }))}>Set R = Rcrit ({si(rCrit, 'Ω')})</button>
        <Toggle label="Show decay envelope" checked={env} onChange={setEnv} />
        <Note>{series ? 'Series: the step Vs drives R, L, C in one loop. Initially relaxed: vC(0) = 0, iL(0) = 0.' : 'Parallel: Vs steps through R into an L‖C tank. By Norton this is Is = Vs/R driving R‖L‖C. The inductor shorts DC, so the tank voltage ends at 0 and iL → Vs/R.'}</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={p.kind[0].toUpperCase() + p.kind.slice(1) + ` (ζ = ${num(p.zeta, 3)})`} color={badge} />
        {p.kind === 'underdamped' && <span className="sim-note">rings at f<sub>d</sub> = {si(p.fd, 'Hz')}, overshoot {(os.mp * 100).toFixed(1)}%</span>}
        {p.kind === 'overdamped' && <span className="sim-note">two real poles; slow one at s = {si(p.s1, '/s')}</span>}
      </div>
      <EqBox>{String.raw`\begin{gathered}\alpha = ${series ? String.raw`\tfrac{R}{2L}` : String.raw`\tfrac{1}{2RC}`} = ${T(p.alpha, '/s')},\\ \omega_0 = \tfrac{1}{\sqrt{LC}} = ${T(p.w0, 'rad/s')},\quad \zeta = \tfrac{\alpha}{\omega_0} = ${num(p.zeta, 3)}\end{gathered}`}</EqBox>
      <EqBox>{ringEq}</EqBox>
      <Readouts>
        <Readout k="Damping ratio ζ" v={num(p.zeta, 3)} hl />
        <Readout k="Q = 1/(2ζ)" v={isFinite(p.Q) ? num(p.Q, 3) : '∞'} />
        <Readout k="f₀ = ω₀/2π" v={si(p.f0, 'Hz')} />
        <Readout k="Neper freq. α" v={si(p.alpha, '/s')} />
        <Readout k="Overshoot Mp" v={(os.mp * 100).toFixed(1) + '%'} tone={os.mp > 0.3 ? 'bad' : os.mp > 0.05 ? 'warn' : 'ok'} />
        <Readout k="Peak time tp" v={isFinite(os.tp) ? si(os.tp, 's') : '—'} />
        <Readout k="2% settling ts" v={si(ts, 's')} />
        <Readout k="R for critical" v={si(rCrit, 'Ω')} />
        <Readout k={series ? 'Peak vC' : 'Peak iL'} v={si(final * (1 + os.mp), series ? 'V' : 'A')} />
      </Readouts>
      <Plot series={vPlot} xUnit="s" yUnit="V" xLabel="Time t" yLabel="Voltage" height={220}
        hlines={series ? [{ at: s.vs * 1.02, color: 'muted' }, { at: s.vs * 0.98, label: '±2% band', color: 'muted' }] : []}
        vlines={[...(isFinite(ts) && ts < tEnd ? [{ at: ts, label: 't_s', color: 'green' }] : []), ...(series && isFinite(os.tp) && os.tp < tEnd ? [{ at: os.tp, label: 't_p', color: 'orange' }] : [])]}
        points={series && isFinite(os.tp) && os.tp < tEnd ? [{ x: os.tp, y: s.vs * (1 + os.mp), label: `+${(os.mp * 100).toFixed(1)}%`, color: 'orange' }] : []} />
      <Plot series={iPlot} xUnit="s" yUnit="A" xLabel="Time t" yLabel="Inductor current" height={190}
        hlines={!series ? [{ at: s.vs / s.r, label: 'final Vs/R', color: 'muted' }] : [{ at: 0, color: 'muted' }]}
        points={!series && isFinite(os.tp) && os.tp < tEnd ? [{ x: os.tp, y: (s.vs / s.r) * (1 + os.mp), label: `+${(os.mp * 100).toFixed(1)}%`, color: 'orange' }] : []} />
      <PoleMap poles={poles} w0={p.w0} ext={ext} zeta={p.zeta} />
      <Note>Pole map: underdamped poles sit on the circle of radius ω₀ at angle θ with cos θ = ζ; the real part −α sets the decay, the imaginary part ω<sub>d</sub> sets the ringing frequency. At ζ = 1 the poles meet on the real axis and then split into two real poles.</Note>
    </SimShell>
  );
}
