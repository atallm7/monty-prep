// Rectifiers & bridge rectifier: half-wave / center-tap / bridge into a reservoir capacitor and load.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { rectifier, RectType } from '../models/rectifier-lab';

const TYPES: { value: RectType; label: string }[] = [
  { value: 'half', label: 'Half' }, { value: 'center', label: 'Center-tap' }, { value: 'bridge', label: 'Bridge' },
];
const tx = (v: number, u: string) => String.raw`\text{${si(v, u)}}`;
const pos = (v: number, a: number, b: number, d: number) => (isFinite(v) && v > 0 ? Math.min(b, Math.max(a, v)) : d);

function schematic(type: RectType, s: { vpk: number; c: number; rl: number; vf: number }, vdc: number, phasePos: boolean) {
  const vl = si(s.vpk, 'V') + ' pk';
  const out = (x0: number, top: number, bot: number): any[] => [
    { t: 'wire', pts: [[x0, top], [x0 + 3, top]] },
    { t: 'wire', pts: [[x0 + 3, top], [x0 + 7, top]] },
    { t: 'dot', at: [x0 + 3, top] },
    { t: 'Cpol', a: [x0 + 3, top], b: [x0 + 3, bot], label: 'C', value: si(s.c, 'F'), color: 'blue' },
    { t: 'R', a: [x0 + 7, top], b: [x0 + 7, bot], label: 'R_L', value: si(s.rl, 'Ω'), color: 'orange' },
    { t: 'wire', pts: [[x0, bot], [x0 + 3, bot], [x0 + 7, bot]] }, { t: 'dot', at: [x0 + 3, bot] },
    { t: 'text', at: [x0 + 7, bot + 1.6], text: `V_{dc} ≈ ${si(vdc, 'V')}`, anchor: 'middle', color: 'accent' },
  ];
  if (type === 'half') {
    return renderCircuit({ elements: [
      { t: 'Vac', a: [1, 3], b: [1, 7], label: 'v_s', value: vl },
      { t: 'wire', pts: [[1, 3], [1, 1], [3, 1]] },
      { t: 'D', a: [3, 1], b: [7, 1], label: 'D_1', value: `V_f=${s.vf.toFixed(2)} V`, color: 'accent' },
      { t: 'wire', pts: [[7, 1], [8, 1]], flow: true },
      ...out(8, 1, 9),
      { t: 'wire', pts: [[1, 7], [1, 9], [8, 9]] }, { t: 'gnd', at: [4, 9] },
    ] }).svg;
  }
  if (type === 'center') {
    // two series half-windings, center tap = ground; + at the top of each
    return renderCircuit({ elements: [
      { t: 'Vac', a: [2, 1], b: [2, 5], label: 'v_s', value: vl },
      { t: 'Vac', a: [2, 5], b: [2, 9], label: 'v_s', value: vl },
      { t: 'wire', pts: [[2, 5], [4, 5]] }, { t: 'dot', at: [2, 5] }, { t: 'gnd', at: [4, 5] },
      { t: 'D', a: [5, 1], b: [9, 1], label: 'D_1', color: 'accent' },
      { t: 'wire', pts: [[2, 1], [5, 1]] },
      { t: 'D', a: [5, 9], b: [9, 9], label: 'D_2', labelSide: 'other', color: 'orange' },
      { t: 'wire', pts: [[2, 9], [5, 9]] },
      { t: 'wire', pts: [[9, 9], [10, 9], [10, 1]] },
      { t: 'wire', pts: [[9, 1], [12, 1]] }, { t: 'dot', at: [10, 1] },
      ...out(12, 1, 6),
      { t: 'gnd', at: [12, 6] },
    ] }).svg;
  }
  // bridge: AC source across the bridge mid-points A (6,5) and B (10,5)
  const on = (d: number) => (d === 1 || d === 4) === phasePos ? 'accent' : 'orange';
  return renderCircuit({ elements: [
    { t: 'D', a: [6, 5], b: [6, 1], label: 'D_1', labelSide: 'other', color: on(1) },
    { t: 'D', a: [6, 9], b: [6, 5], label: 'D_3', labelSide: 'other', color: on(3) },
    { t: 'D', a: [10, 5], b: [10, 1], label: 'D_2', color: on(2) },
    { t: 'D', a: [10, 9], b: [10, 5], label: 'D_4', color: on(4) },
    { t: 'Vac', a: [6, 5], b: [10, 5], label: 'v_s', value: vl },
    { t: 'dot', at: [6, 5] }, { t: 'dot', at: [10, 5] },
    { t: 'wire', pts: [[6, 1], [10, 1]] }, { t: 'wire', pts: [[10, 1], [13, 1]], flow: true }, { t: 'dot', at: [10, 1] },
    { t: 'wire', pts: [[6, 9], [10, 9]] }, { t: 'wire', pts: [[13, 9], [10, 9]], flow: true }, { t: 'dot', at: [10, 9] },
    ...out(13, 1, 9), { t: 'gnd', at: [8, 9] },
  ] }).svg;
}

export default function RectifierLab({ params }: SimProps) {
  const t0 = (['half', 'center', 'bridge'] as const).includes(params.type) ? (params.type as RectType) : 'bridge';
  const init = {
    type: t0,
    vpk: pos(Number(params.vpk ?? 17), 0.5, 400, 17),
    f: pos(Number(params.f ?? 60), 1, 100e3, 60),
    c: pos(Number(params.c ?? 1000e-6), 1e-7, 0.1, 1000e-6),
    rl: pos(Number(params.rl ?? 100), 1, 1e6, 100),
    vf: Math.min(3, Math.max(0, Number(params.vf ?? 0.7) || 0)),
    rs: 0.5, startup: false,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const r = useMemo(() => rectifier(s), [s.type, s.vpk, s.f, s.c, s.rl, s.vf, s.rs]);
  const full = s.type !== 'half';
  const ripplePct = r.vdc > 0 ? r.ripple / r.vdc : 0;
  const nVf = r.nDrops * s.vf;
  const region = r.vdc <= 1e-6 ? { l: 'No output (Vpk < drops)', c: 'bad' as const }
    : ripplePct > 0.3 ? { l: 'Barely filtered (C too small)', c: 'bad' as const }
    : ripplePct > 0.1 ? { l: `Large ripple ${(ripplePct * 100).toFixed(0)}%`, c: 'warn' as const }
    : { l: `Well filtered, ripple ${(ripplePct * 100).toFixed(1)}%`, c: 'ok' as const };

  const svg = useMemo(() => schematic(s.type, s, r.vdc, true), [s.type, s.vpk, s.c, s.rl, s.vf, r.vdc]);

  const T = 1 / s.f;
  const wave = s.startup
    ? [
      { x: r.startT, y: r.startT.map(t => { const v = s.vpk * Math.sin(2 * Math.PI * s.f * t); return full ? Math.abs(v) : v; }), label: full ? '|v_s|' : 'v_s', color: 'muted', dashed: true },
      { x: r.startT, y: r.startV, label: 'v_out', color: 'accent' },
    ]
    : [
      { x: r.t, y: full ? r.vs.map(Math.abs) : r.vs, label: full ? '|v_s|' : 'v_s', color: 'muted', dashed: true },
      { x: r.t, y: r.vrect, label: `rectified − ${si(nVf, 'V')}`, color: 'purple' },
      { x: r.t, y: r.vout, label: 'v_out', color: 'accent' },
    ];
  const iwave = s.startup ? { x: r.startT, y: r.startI } : { x: r.t, y: r.id };
  const spans = s.startup ? [] : r.intervals.map(iv => ({ from: iv.from, to: iv.to, color: 'orange' }));

  const eq = full
    ? String.raw`V_{pp}\approx\frac{I_{load}}{2fC}=\frac{${tx(r.iload, 'A')}}{2\cdot${tx(s.f, 'Hz')}\cdot${tx(s.c, 'F')}}=${tx(r.rippleEst, 'V')}\quad V_{dc}\approx V_{pk}-${r.nDrops > 1 ? r.nDrops : ''}V_f-\tfrac{V_{pp}}{2}`
    : String.raw`V_{pp}\approx\frac{I_{load}}{fC}=\frac{${tx(r.iload, 'A')}}{${tx(s.f, 'Hz')}\cdot${tx(s.c, 'F')}}=${tx(r.rippleEst, 'V')}\quad V_{dc}\approx V_{pk}-V_f-\tfrac{V_{pp}}{2}`;

  return (
    <SimShell title="Rectifiers & bridge rectifier" onReset={() => set(init)}
      tryThis={<>with the bridge selected, halve C and watch the ripple double (V<sub>pp</sub> ∝ 1/C) while the diode conduction window gets wider and the peak current drops. Then switch to half-wave at the same C: the capacitor must now carry the load for a whole period, so the ripple roughly doubles, but you lose only one V<sub>f</sub> instead of two. Finally turn on "power-on transient" to see the inrush current that charges an empty C.</>}
      controls={<>
        <Seg label="Topology" value={s.type} options={TYPES} onChange={upd('type')} />
        <Slider label="Source peak Vpk" value={s.vpk} min={1} max={60} step={0.5} unit="V" onChange={upd('vpk')} />
        <Slider label="Line frequency f" value={s.f} min={10} max={10e3} log unit="Hz" onChange={upd('f')} />
        <Slider label="Filter capacitor C" value={s.c} min={1e-6} max={22e-3} log unit="F" onChange={upd('c')} />
        <Slider label="Load RL" value={s.rl} min={10} max={10e3} log unit="Ω" onChange={upd('rl')} />
        <Slider label="Diode drop Vf" value={s.vf} min={0} max={1.5} step={0.05} unit="V" onChange={upd('vf')} />
        <Slider label="Source / winding resistance Rs" value={s.rs} min={0.05} max={20} log unit="Ω" onChange={upd('rs')} />
        <Toggle label="Show power-on transient (C starts at 0 V)" checked={s.startup} onChange={upd('startup')} />
        <Note>Diodes are ideal switches with a fixed drop V<sub>f</sub>; R<sub>s</sub> (transformer winding + wiring) limits the peak and inrush current. Steady state is found by simulating cycles until the waveform repeats (backward-Euler integration).</Note>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <RegionBadge label={region.l} color={region.c} />
        <RegionBadge label={`${r.pulses} pulse${r.pulses > 1 ? 's' : ''}/cycle · ripple at ${si(r.pulses * s.f, 'Hz')}`} color="info" />
      </div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <Readouts>
        <Readout k="Vdc (average)" v={si(r.vdc, 'V')} hl />
        <Readout k="Ripple Vpp (sim)" v={si(r.ripple, 'V')} tone={ripplePct > 0.3 ? 'bad' : ripplePct > 0.1 ? 'warn' : 'ok'} />
        <Readout k={full ? 'Estimate I/(2fC)' : 'Estimate I/(fC)'} v={si(r.rippleEst, 'V')} />
        <Readout k="Load current" v={si(r.iload, 'A')} />
        <Readout k="Peak diode current" v={`${si(r.idPeak, 'A')} (${(r.idPeak / Math.max(1e-12, r.iload)).toFixed(1)}× I_load)`} tone={r.idPeak > 10 * r.iload ? 'warn' : undefined} />
        <Readout k="Avg / RMS per diode" v={`${si(r.idAvg, 'A')} / ${si(r.idRms, 'A')}`} />
        <Readout k="Conduction angle / pulse" v={`${r.conductDeg.toFixed(1)}°`} />
        <Readout k="Diode PIV" v={si(r.piv, 'V')} />
        <Readout k="Inrush peak (C = 0 V)" v={si(r.inrushPeak, 'A')} />
        <Readout k="Diode loss / load power" v={`${si(r.pDiode, 'W')} / ${si(r.pLoad, 'W')}`} />
      </Readouts>
      <EqBox>{eq}</EqBox>
      <Plot series={wave} xUnit="s" yUnit="V" xLabel={s.startup ? 'time from power-on' : 'time (3 steady-state cycles)'} yLabel="voltage" height={230}
        xspans={spans}
        hlines={s.startup ? [{ at: Math.max(0, s.vpk - nVf), label: 'Vpk − drops', color: 'muted' }] : [{ at: r.vdc, label: 'Vdc', color: 'green' }]} />
      <Plot series={[{ ...iwave, label: 'diode-path current i_D', color: 'orange', fill: true }]} xUnit="s" yUnit="A" xLabel={s.startup ? 'time from power-on' : 'time'} height={170}
        xspans={spans} hlines={[{ at: r.iload, label: 'I_load', color: 'muted' }]} />
      <Note>Orange bands mark diode conduction intervals: the capacitor is recharged only near each peak, so the diodes deliver the whole load charge in short, tall pulses (peak ≫ average). This is why rectifier diodes and transformer windings are rated for RMS and surge current, not just I<sub>load</sub>. Period T = {si(T, 's')}.{s.type !== 'half' && <> In the schematic, blue diodes conduct on the positive half-cycle and orange ones on the negative half-cycle; the load current always flows the same way.</>}</Note>
    </SimShell>
  );
}
