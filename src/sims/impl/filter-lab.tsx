// Passive filter lab: topology, component values, schematic, Bode magnitude/phase, fc/f0/Q, sine in vs out.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Select, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { H, mag, phaseDeg, dB, characteristics, bode, sineResponse, defaultsFor, isSecondOrder, kindOf, TYPES, FType } from '../models/filter-lab';

const T = (v: number, u: string) => isFinite(v) ? `\\text{${si(v, u).replace('−', '-')}}` : '\\infty';
const NAMES: Record<FType, string> = {
  'rc-lpf': 'RC low-pass', 'rc-hpf': 'RC high-pass', 'rl-lpf': 'RL low-pass', 'rl-hpf': 'RL high-pass',
  'rlc-bpf': 'RLC band-pass (out across R)', 'rlc-bsf': 'RLC band-stop / notch (out across LC)', 'rlc-lpf': 'RLC 2nd-order low-pass (out across C)', 'rlc-hpf': 'RLC 2nd-order high-pass (out across L)',
};
const family = (t: FType) => t.split('-')[0];
const TF: Record<FType, string> = {
  'rc-lpf': String.raw`H(s)=\frac{1}{1+sRC}`, 'rc-hpf': String.raw`H(s)=\frac{sRC}{1+sRC}`,
  'rl-lpf': String.raw`H(s)=\frac{R}{R+sL}`, 'rl-hpf': String.raw`H(s)=\frac{sL}{R+sL}`,
  'rlc-bpf': String.raw`H(s)=\frac{sRC}{s^2LC+sRC+1}`, 'rlc-bsf': String.raw`H(s)=\frac{s^2LC+1}{s^2LC+sRC+1}`,
  'rlc-lpf': String.raw`H(s)=\frac{1}{s^2LC+sRC+1}`, 'rlc-hpf': String.raw`H(s)=\frac{s^2LC}{s^2LC+sRC+1}`,
};

export default function FilterLab({ params }: SimProps) {
  const type0: FType = TYPES.includes(params.type) ? params.type : 'rc-lpf';
  const d = defaultsFor(type0);
  const init = { type: type0, r: Number(params.r ?? d.r), c: Number(params.c ?? d.c), l: Number(params.l ?? d.l), f: Number(params.f ?? d.f) };
  const [s, set] = useState(init);
  const upd = (k: 'r' | 'c' | 'l' | 'f') => (v: number) => set(p => ({ ...p, [k]: v }));
  const setType = (t: FType) => set(p => family(t) === family(p.type) ? { ...p, type: t } : { ...p, ...defaultsFor(t), type: t });
  const so = isSecondOrder(s.type); const kind = kindOf(s.type);
  const usesC = s.type.startsWith('rc') || so, usesL = !s.type.startsWith('rc');

  const ch = useMemo(() => characteristics(s), [s.type, s.r, s.c, s.l]);
  // ±2.5 decades around f0, widened to keep the test frequency on the plot
  const fmin = Math.min(ch.f0 / 300, s.f / 2), fmax = Math.max(ch.f0 * 300, s.f * 2);
  const b = useMemo(() => bode(s, fmin, fmax, 900), [s.type, s.r, s.c, s.l, fmin, fmax]);
  const h = H(s, s.f); const g = mag(h), gdb = dB(g), ph = phaseDeg(h);
  const sine = useMemo(() => sineResponse(s, s.f, 1, 3, 500), [s]);

  const region = kind === 'lpf' ? (s.f < (ch.cut[0] ?? ch.f0) ? 'Passband' : 'Stopband (rolling off)')
    : kind === 'hpf' ? (s.f > (ch.cut[ch.cut.length - 1] ?? ch.f0) ? 'Passband' : 'Stopband (rolling off)')
      : kind === 'bpf' ? (ch.cut.length === 2 && s.f > ch.cut[0] && s.f < ch.cut[1] ? 'Inside the passband' : 'Outside the passband')
        : (ch.cut.length === 2 && s.f > ch.cut[0] && s.f < ch.cut[1] ? 'Inside the notch' : 'Passes');
  const regionColor = gdb > -3.02 ? 'ok' : gdb > -20 ? 'warn' : 'bad';

  const schematic = useMemo(() => {
    const els: any[] = [
      { t: 'Vac', a: [0, 1.5], b: [0, 6.5], label: 'v_{in}', value: si(s.f, 'Hz') },
      { t: 'wire', pts: [[0, 1.5], [0, 0], [1, 0]] },
      { t: 'wire', pts: [[0, 6.5], [0, 8]] },
      { t: 'gnd', at: [0, 8] },
    ];
    const R = { t: 'R', label: 'R', value: si(s.r, 'Ω') }, C = { t: 'C', label: 'C', value: si(s.c, 'F') }, L = { t: 'L', label: 'L', value: si(s.l, 'H') };
    const series: any[] = { 'rc-lpf': [R], 'rc-hpf': [C], 'rl-lpf': [L], 'rl-hpf': [R], 'rlc-bpf': [L, C], 'rlc-bsf': [R], 'rlc-lpf': [R, L], 'rlc-hpf': [R, C] }[s.type];
    const shunt: any[] = { 'rc-lpf': [C], 'rc-hpf': [R], 'rl-lpf': [R], 'rl-hpf': [L], 'rlc-bpf': [R], 'rlc-bsf': [L, C], 'rlc-lpf': [C], 'rlc-hpf': [L] }[s.type];
    let x = 1;
    for (const e of series) { els.push({ ...e, a: [x, 0], b: [x + 4, 0] }); x += 4; }
    const X = x + 2;
    els.push({ t: 'wire', pts: [[x, 0], [X + 3, 0]] }, { t: 'dot', at: [X, 0] }, { t: 'term', at: [X + 3, 0], label: 'v_{out}', side: 'right', color: 'accent' });
    if (shunt.length === 1) els.push({ t: 'wire', pts: [[X, 0], [X, 1.5]] }, { ...shunt[0], a: [X, 1.5], b: [X, 6.5], color: 'accent' }, { t: 'wire', pts: [[X, 6.5], [X, 8]] });
    else els.push({ t: 'wire', pts: [[X, 0], [X, 0.6]] }, { ...shunt[0], a: [X, 0.6], b: [X, 4.2], color: 'accent' }, { ...shunt[1], a: [X, 4.2], b: [X, 7.6], color: 'accent' }, { t: 'wire', pts: [[X, 7.6], [X, 8]] });
    els.push({ t: 'wire', pts: [[0, 8], [X + 3, 8]] }, { t: 'term', at: [X + 3, 8], side: 'right' });
    return renderCircuit({ elements: els }).svg;
  }, [s]);

  const marks = so
    ? [{ at: ch.f0, label: 'f_0', color: 'accent' }, ...ch.cut.map((f, i) => ({ at: f, label: kind === 'bpf' || kind === 'bsf' ? (i ? 'f_2' : 'f_1') : 'f_{-3dB}', color: 'muted' }))]
    : [{ at: ch.f0, label: 'f_c', color: 'accent' }];
  const magLo = Math.max(-80, Math.min(...b.m) - 5);

  return (
    <SimShell title="Passive filter lab" onReset={() => set(init)}
      tryThis={<>set the test frequency to f<sub>c</sub> on the RC low-pass: the output is 0.707× the input (−3 dB) and lags by exactly 45° (an eighth of a period). Go one decade higher: −20 dB, about −84°. Then pick the RLC band-pass and lower R: Q = (1/R)√(L/C) rises and the bandwidth f<sub>0</sub>/Q narrows while the peak stays at 0 dB.</>}
      controls={<>
        <Select label="Topology" value={s.type} onChange={setType} options={TYPES.map(t => ({ value: t, label: NAMES[t] }))} />
        <Slider label="R" value={s.r} min={1} max={1e6} log unit="Ω" onChange={upd('r')} />
        {usesC && <Slider label="C" value={s.c} min={1e-12} max={1e-3} log unit="F" onChange={upd('c')} />}
        {usesL && <Slider label="L" value={s.l} min={1e-7} max={10} log unit="H" onChange={upd('l')} />}
        <Slider label="Test-signal frequency f" value={s.f} min={0.1} max={1e9} log unit="Hz" onChange={upd('f')} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={() => set(p => ({ ...p, f: ch.f0 }))}>f = {so ? 'f₀' : 'fc'}</button>
          <button type="button" className="btn btn-sm" onClick={() => set(p => ({ ...p, f: ch.f0 / 10 }))}>f₀ ÷ 10</button>
          <button type="button" className="btn btn-sm" onClick={() => set(p => ({ ...p, f: ch.f0 * 10 }))}>f₀ × 10</button>
        </div>
        <Note>Ideal components, source impedance 0 and an unloaded output. The output node is highlighted.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={`${region} at ${si(s.f, 'Hz')}`} color={regionColor} />
        <span className="sim-note">{so ? `${ch.slope} dB/decade skirts (2nd order)` : '20 dB/decade roll-off (1st order)'}</span>
      </div>
      <EqBox>{so
        ? String.raw`\begin{gathered}${TF[s.type]}\\ f_0=\tfrac{1}{2\pi\sqrt{LC}}=${T(ch.f0, 'Hz')}\\ Q=\tfrac{1}{R}\sqrt{\tfrac{L}{C}}=${num(ch.Q, 3)},\quad \text{BW}=\tfrac{f_0}{Q}=${T(ch.bw, 'Hz')}\end{gathered}`
        : String.raw`\begin{gathered}${TF[s.type]}\\ f_c=${s.type.startsWith('rc') ? String.raw`\tfrac{1}{2\pi RC}` : String.raw`\tfrac{R}{2\pi L}`}=${T(ch.f0, 'Hz')}\\ |H(f)| = ${num(g, 3)}\ (${num(gdb, 3)}\,\text{dB}),\ \angle H = ${num(ph, 3)}^\circ\end{gathered}`}</EqBox>
      <Readouts>
        <Readout k={so ? 'Resonance f₀' : 'Cutoff fc'} v={si(ch.f0, 'Hz')} hl />
        {so && <Readout k="Q / ζ" v={`${num(ch.Q, 3)} / ${num(ch.zeta, 3)}`} />}
        {so && (kind === 'bpf' || kind === 'bsf') && <Readout k="Bandwidth f₀/Q" v={si(ch.bw, 'Hz')} />}
        {so && (kind === 'lpf' || kind === 'hpf') && <Readout k="−3 dB frequency" v={ch.cut.length ? si(ch.cut[ch.cut.length - 1], 'Hz') : '—'} />}
        {so && (kind === 'lpf' || kind === 'hpf') && <Readout k="Peaking" v={ch.peak > 1 ? `+${num(dB(ch.peak), 3)} dB` : 'none'} tone={ch.peak > 1.4 ? 'warn' : undefined} />}
        <Readout k="|H| at f" v={`${num(g, 3)} (${num(gdb, 3)} dB)`} tone={regionColor} />
        <Readout k="Phase at f" v={`${num(ph, 3)}°`} />
        <Readout k="Time shift" v={si(sine.delay, 's')} />
      </Readouts>
      <Plot series={[{ x: b.f, y: b.m, label: '|H| (dB)', color: 'accent' }]} xLog xUnit="Hz" xLabel="Frequency" yLabel="Magnitude (dB)" height={220}
        yRange={[magLo, Math.max(5, Math.max(...b.m) + 5)]} yTickFormat={v => `${Math.round(v)}`}
        hlines={[{ at: -3.0103, label: '−3 dB', color: 'muted' }]} vlines={marks}
        points={[{ x: s.f, y: gdb, label: `${num(gdb, 3)} dB`, color: 'red' }]} />
      <Plot series={[{ x: b.f, y: b.ph, label: 'phase ∠H (°)', color: 'purple' }]} xLog xUnit="Hz" xLabel="Frequency" yLabel="Phase (°)" height={180}
        yRange={so ? [-185, 185] : [-95, 95]} yTickFormat={v => `${Math.round(v)}°`} vlines={marks.slice(0, 1)}
        points={[{ x: s.f, y: ph, color: 'red' }]} />
      <Plot series={[{ x: sine.t, y: sine.vin, label: 'v_in (1 V peak)', color: 'muted' }, { x: sine.t, y: sine.vout, label: 'v_out', color: 'red' }]}
        xUnit="s" yUnit="V" xLabel="Time (3 cycles, steady state)" yLabel="Voltage" height={200} yRange={[-Math.max(1.1, g * 1.1), Math.max(1.1, g * 1.1)]}
        hlines={[{ at: g, label: `|H| = ${num(g, 3)}`, color: 'red' }]} />
      <Note>The time plot is the steady-state sinusoid: v<sub>out</sub> = |H|·sin(2πft + ∠H). A negative phase means the output lags (shifts right); a positive phase means it leads.</Note>
    </SimShell>
  );
}
