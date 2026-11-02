// Ground bounce / simultaneous switching noise through shared package ground inductance.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { simulate } from '../models/ground-bounce';

export default function GroundBounce({ params }: SimProps) {
  const init = { n: Number(params.n ?? 8), l: Number(params.l ?? 2e-9), cl: Number(params.cl ?? 15e-12), tr: Number(params.tr ?? 1e-9), vdd: Number(params.vdd ?? 3.3), cd: 5e-12, pins: 1 };
  const [s, set] = useState(init);
  const upd = (k: keyof typeof s) => (v: number) => set(p => ({ ...p, [k]: v }));
  const r = useMemo(() => simulate(s), [s]);
  const ns = (x: number[]) => x.map(v => v * 1e9);
  const slow = useMemo(() => { const tr = s.tr * 3; return { tr, r: simulate({ ...s, tr }) }; }, [s]);
  const pin4 = useMemo(() => simulate({ ...s, pins: 4 }), [s]);
  const worst = Math.max(r.peak, -r.trough);

  const schematic = useMemo(() => renderCircuit({
    elements: [
      { t: 'nmos', at: [1, 4], label: `Q ×${s.n}` },
      { t: 'wire', pts: [[3, 2], [11, 2]], flow: true },
      { t: 'term', at: [11, 2], label: 'out pin', side: 'right' },
      { t: 'dot', at: [8, 2] },
      { t: 'wire', pts: [[8, 2], [8, 3]] },
      { t: 'C', a: [8, 3], b: [8, 7], label: 'C_L', value: si(s.cl, 'F') },
      { t: 'wire', pts: [[3, 6], [3, 7]] },
      { t: 'dot', at: [3, 6] },
      { t: 'wire', pts: [[3, 6], [1.2, 6], [1.2, 8]] },
      { t: 'C', a: [1.2, 8], b: [1.2, 11], label: 'C_d', value: si(s.cd, 'F'), labelSide: 'other', color: 'purple' },
      { t: 'L', a: [3, 7], b: [3, 11], label: 'L_{gnd}', value: si(s.l / s.pins, 'H'), color: 'orange' },
      { t: 'wire', pts: [[1.2, 11], [1.2, 12], [3, 12]] },
      { t: 'wire', pts: [[3, 11], [3, 12], [8, 12], [8, 7]] },
      { t: 'dot', at: [3, 12] },
      { t: 'gnd', at: [5.5, 12] },
      { t: 'text', at: [3.7, 5.4], text: 'V_g', anchor: 'start', color: 'red' },
      { t: 'region', at: [-2.6, 0.6], w: 9, h: 12.4, label: 'chip (internal ground)', color: 'blue' },
    ],
  }).svg, [s, r.peak]);

  const badge = r.falseTrigger ? { l: 'False trigger: quiet-low line exceeds Vil', c: 'bad' as const } : r.margin < 0.3 * s.vdd ? { l: 'Little margin to Vil', c: 'warn' as const } : { l: 'Bounce within noise margin', c: 'ok' as const };
  const viewEnd = Math.min(r.t[r.t.length - 1], 2 * s.tr + 4 * s.cl * 30 + 2e-9) * 1e9;

  return (
    <SimShell title="Ground bounce (simultaneous switching)" onReset={() => set(init)}
      tryThis={<>with the current settings, {s.n} outputs falling together push the on-chip ground up by {si(r.peak, 'V')}; the quiet-low threshold is 0.3·V<sub>DD</sub> = {si(r.vil, 'V')}, so it {r.falseTrigger ? 'flips' : 'does not flip'} the line. Experiment 1: with the same settings but edge time slowed to {si(slow.tr, 's')}, the bounce becomes {si(slow.r.peak, 'V')} ({slow.r.falseTrigger ? 'still above' : 'below'} the threshold; open-loop it scales as 1/t<sub>r</sub>²). Experiment 2: with 4 parallel ground pins (L/4 = {si(s.l / 4, 'H')}) the bounce is {si(pin4.peak, 'V')}. Compare with the open-loop estimate N·L·di/dt ({si(r.openLoop, 'V')}): the driver’s own feedback makes the real bounce lower.</>}
      controls={<>
        <Slider label="Simultaneous outputs N" value={s.n} min={1} max={32} step={1} format={v => v.toFixed(0)} onChange={upd('n')} />
        <Slider label="Ground inductance L" value={s.l} min={0.2e-9} max={20e-9} log unit="H" onChange={upd('l')} />
        <Slider label="Ground pins in parallel" value={s.pins} min={1} max={8} step={1} format={v => v.toFixed(0)} onChange={upd('pins')} />
        <Slider label="Load C per output" value={s.cl} min={1e-12} max={100e-12} log unit="F" onChange={upd('cl')} />
        <Slider label="Edge time tr" value={s.tr} min={0.2e-9} max={10e-9} log unit="s" onChange={upd('tr')} />
        <Slider label="Supply VDD" value={s.vdd} min={1} max={5} step={0.1} unit="V" onChange={upd('vdd')} />
        <Slider label="On-die decoupling Cd (ground node)" value={s.cd} min={1e-12} max={2e-9} log unit="F" onChange={upd('cd')} />
        <Note>Effective ground inductance L/pins = {si(s.l / s.pins, 'H')}. Drivers are modelled as 30 Ω pull-downs with a raised-cosine gate ramp, bond-wire resistance 0.1 Ω. C<sub>d</sub> is the capacitance at the on-die ground node: it absorbs part of the current spike but forms an L–C ring with the package inductance.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><RegionBadge label={badge.l} color={badge.c} /></div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <Readouts>
        <Readout k="Bounce peak (+)" v={si(r.peak, 'V')} hl tone={r.falseTrigger ? 'bad' : 'ok'} />
        <Readout k="Undershoot (−)" v={si(r.trough, 'V')} />
        <Readout k="Peak ground current" v={si(r.iPeak, 'A')} />
        <Readout k="Peak di/dt" v={si(r.didtPeak, 'A/s')} />
        <Readout k="Open-loop N·L·di/dt" v={si(r.openLoop, 'V')} />
        <Readout k="Margin to Vil" v={si(r.margin, 'V')} tone={r.margin < 0 ? 'bad' : 'ok'} />
        <Readout k="LC ring (L·Cd)" v={si(r.ringF, 'Hz')} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}V_g = L_{eff}\frac{dI}{dt}+R I,\quad I=N\,i_{drv}\\ \hat V_{open}=N\,L_{eff}\,C_L V_{DD}\frac{\pi^2}{2t_r^2}=${r.openLoop.toFixed(2)}\,\text{V}\end{gathered}`}</EqBox>
      <Plot series={[{ x: ns(r.t), y: r.vg, label: 'Quiet-low line (ground bounce)', color: 'red' }, { x: ns(r.t), y: r.vo, label: 'Switching output', color: 'accent' }]}
        xRange={[0, viewEnd]} xUnit="ns" yUnit="V" xLabel="time" yLabel="Voltage" height={240}
        hlines={[{ at: r.vil, label: '0.3·VDD (Vil)', color: 'orange' }, { at: 0, color: 'muted' }]} />
      <Plot series={[{ x: ns(r.t), y: r.il, label: 'Ground current IL', color: 'blue' }]} xRange={[0, viewEnd]} xUnit="ns" yTickFormat={v => (v * 1000).toFixed(0)} xLabel="time" yLabel="Current (mA)" height={170} />
    </SimShell>
  );
}
