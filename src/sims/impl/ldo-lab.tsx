// LDO regulator: regulation vs dropout, efficiency, pass-device dissipation & junction temperature, PSRR sketch.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { linspace, logspace } from '../../lib/units';
import { operatingPoint, outputAt, psrr, maxCurrentThermal, VREF, LOOP } from '../models/ldo-lab';

type View = 'vin' | 'load' | 'psrr';

export default function LdoLab({ params }: SimProps) {
  const init = {
    vin: Number(params.vin ?? 5), vout: Number(params.vout ?? 3.3), iout: Number(params.iout ?? 0.2), vdo: Number(params.vdo ?? 0.2),
    iq: Number(params.iq ?? 50e-6), theta: Number(params.theta ?? 60), ta: 25, view: 'vin' as View,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const op = useMemo(() => operatingPoint(s), [s]);
  const tsd = op.tj >= 150, hot = op.tj >= 125;
  const imaxTh = maxCurrentThermal(s);

  const vinSweep = useMemo(() => {
    const vmax = Math.max(15, s.vin * 1.2); const xs = linspace(0, vmax, 301);
    const vo = xs.map(v => outputAt(s, v, s.iout).vo);
    const eff = xs.map((v, i) => v > 0 ? 100 * vo[i] * s.iout / (v * (s.iout + s.iq)) : 0);
    return { xs, vo, eff, vmax };
  }, [s.vout, s.iout, s.vdo, s.iq, s.vin]);
  const loadSweep = useMemo(() => {
    const xs = logspace(1e-3, Math.max(3, s.iout * 2), 200);
    const pd = xs.map(i => { const vo = outputAt(s, s.vin, i).vo; return (s.vin - vo) * i + s.vin * s.iq; });
    return { xs, pd, tj: pd.map(p => s.ta + s.theta * p) };
  }, [s]);
  const psrrCurve = useMemo(() => { const fs = logspace(10, 1e8, 220); return { fs, y: fs.map(f => psrr(s, f)) }; }, [s]);

  const region = tsd ? { l: 'Thermal shutdown (Tj ≥ 150 °C)', c: 'bad' as const } : op.dropout ? { l: 'Dropout: pass FET fully on', c: 'warn' as const } : hot ? { l: 'Regulating, but Tj > 125 °C', c: 'warn' as const } : { l: 'Regulating', c: 'ok' as const };

  const svg = useMemo(() => renderCircuit({
    elements: [
      { t: 'V', a: [-3, 1], b: [-3, 8], label: 'V_{in}', value: si(s.vin, 'V') }, { t: 'gnd', at: [-3, 8] },
      { t: 'wire', pts: [[-3, 1], [10, 1]], flow: true },
      { t: 'pmos', at: [8, 3], label: 'pass', color: op.dropout ? 'orange' : tsd ? 'red' : undefined },
      { t: 'wire', pts: [[10, 5], [10, 6], [21, 6]], flow: true }, { t: 'dot', at: [13, 6] }, { t: 'dot', at: [16, 6] },
      { t: 'opamp', at: [3, 4], label: 'EA' }, { t: 'wire', pts: [[7, 4], [7.5, 4], [7.5, 3], [8, 3]] },
      { t: 'wire', pts: [[3, 3], [1, 3]] }, { t: 'V', a: [1, 3], b: [1, 7], label: 'V_{ref}', value: `${VREF} V`, labelSide: 'other' }, { t: 'gnd', at: [1, 7] },
      { t: 'R', a: [13, 6], b: [13, 9.5], label: 'R_1', value: si(op.r1, 'Ω') }, { t: 'R', a: [13, 9.5], b: [13, 13], label: 'R_2', value: si(op.r2, 'Ω') }, { t: 'gnd', at: [13, 13] },
      { t: 'wire', pts: [[13, 9.5], [2.5, 9.5], [2.5, 5], [3, 5]] }, { t: 'dot', at: [13, 9.5] }, { t: 'text', at: [8, 9], text: 'FB', muted: true, size: 11 },
      { t: 'C', a: [16, 6], b: [16, 9.5], label: 'C_{out}', value: si(LOOP.cout, 'F') }, { t: 'gnd', at: [16, 9.5] },
      { t: 'wire', pts: [[21, 6], [21, 6.5]] }, { t: 'I', a: [21, 6.5], b: [21, 10], label: 'I_{load}', value: si(s.iout, 'A') }, { t: 'gnd', at: [21, 10] },
      { t: 'term', at: [19, 6], label: `V_{out} = ${si(op.vo, 'V')}`, side: 'top', color: op.dropout ? 'orange' : 'accent' },
      { t: 'text', at: [10, -0.5], text: `P_{pass} = ${si(op.pPass, 'W')}`, color: hot ? 'red' : 'muted', size: 12 },
    ],
  }).svg, [s, op]);

  return (
    <SimShell title="LDO regulator" onReset={() => set(init)}
      tryThis={<>lower V<sub>in</sub> toward V<sub>out</sub> + V<sub>DO</sub> ({si(op.vinMin, 'V')}): below it the output just follows V<sub>in</sub> − I·R<sub>on</sub>, and in the PSRR view the rejection collapses. Then raise V<sub>in</sub> to 12 V at 0.5 A: efficiency drops to V<sub>out</sub>/V<sub>in</sub> and the pass FET has to dump (V<sub>in</sub> − V<sub>out</sub>)·I as heat, so check T<sub>j</sub>.</>}
      controls={<>
        <Seg label="Plot" value={s.view} options={[{ value: 'vin', label: 'Vout vs Vin' }, { value: 'load', label: 'Thermal vs Iout' }, { value: 'psrr', label: 'PSRR' }]} onChange={upd('view')} />
        <Slider label="Input voltage Vin" value={s.vin} min={0} max={15} step={0.01} unit="V" onChange={upd('vin')} />
        <Slider label="Output setpoint Vout" value={s.vout} min={VREF} max={12} step={0.05} unit="V" onChange={upd('vout')} />
        <Slider label="Load current Iout" value={s.iout} min={1e-3} max={3} log unit="A" onChange={upd('iout')} />
        <Slider label="Dropout voltage at this load" value={s.vdo} min={0.03} max={1.5} step={0.01} unit="V" onChange={upd('vdo')} />
        <Slider label="Quiescent current Iq" value={s.iq} min={1e-6} max={5e-3} log unit="A" onChange={upd('iq')} />
        <Slider label="θJA (package + PCB)" value={s.theta} min={10} max={250} step={1} format={v => `${v.toFixed(0)} °C/W`} onChange={upd('theta')} />
        <Slider label="Ambient Ta" value={s.ta} min={-40} max={85} step={1} format={v => `${v.toFixed(0)} °C`} onChange={upd('ta')} />
        <Note>The PMOS pass device behaves as R<sub>on</sub> = V<sub>DO</sub>/I<sub>out</sub> in dropout. PSRR is a sketch from loop gain (60 dB, 1 kHz pole) and a 1 µF / 10 mΩ output capacitor. Real parts differ in detail, but the shape is right.</Note>
      </>}>
      <div><RegionBadge label={region.l} color={region.c} /></div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <EqBox>{String.raw`\eta = \frac{V_{out}I_{out}}{V_{in}(I_{out}+I_q)} = ${(op.eff * 100).toFixed(1)}\%,\quad P_D = (V_{in}-V_{out})I_{out} + V_{in}I_q = ${si(op.pd, 'W')},\quad T_j = T_a + \theta_{JA}P_D = ${op.tj.toFixed(1)}\,^\circ\text{C}`}</EqBox>
      {s.view === 'vin' && <Plot series={[{ x: vinSweep.xs, y: vinSweep.vo, label: 'Vout', color: 'accent', width: 2.4 }, { x: vinSweep.xs, y: vinSweep.xs, label: 'Vin', color: 'muted', dashed: true }]}
        xUnit="V" yUnit="V" xLabel="Vin" yLabel="Vout" height={250} yRange={[0, Math.max(s.vout * 1.4, 1)]} xRange={[0, vinSweep.vmax]}
        xspans={[{ from: 0, to: Math.min(op.vinMin, vinSweep.vmax), label: 'dropout', color: 'orange' }]} vlines={[{ at: op.vinMin, label: 'Vout + VDO', color: 'orange' }]}
        points={[{ x: s.vin, y: op.vo, label: 'now' }]} />}
      {s.view === 'vin' && <Plot series={[{ x: vinSweep.xs, y: vinSweep.eff, label: 'efficiency', color: 'green', width: 2 }]} xUnit="V" yUnit="%" xLabel="Vin" yLabel="η" height={170} yRange={[0, 100]} xRange={[0, vinSweep.vmax]}
        points={[{ x: s.vin, y: op.eff * 100, label: `${(op.eff * 100).toFixed(0)}%` }]} legend={false} />}
      {s.view === 'load' && <Plot series={[{ x: loadSweep.xs, y: loadSweep.tj, label: 'junction temperature Tj', color: 'red', width: 2.4 }]} xLog xUnit="A" yUnit="°C" xLabel="Iout" yLabel="Tj" height={250}
        hlines={[{ at: 125, label: '125 °C max', color: 'orange' }, { at: 150, label: 'thermal shutdown', color: 'red' }, { at: s.ta, label: 'Ta', color: 'muted' }]}
        vlines={imaxTh > 1e-3 && imaxTh < loadSweep.xs[loadSweep.xs.length - 1] ? [{ at: imaxTh, label: 'I max (125 °C)', color: 'orange' }] : []} points={[{ x: s.iout, y: op.tj, label: 'now' }]} />}
      {s.view === 'load' && <Plot series={[{ x: loadSweep.xs, y: loadSweep.pd, label: 'pass-device dissipation', color: 'orange', width: 2 }]} xLog yLog xUnit="A" yUnit="W" xLabel="Iout" yLabel="P_D" height={170} legend={false} points={[{ x: s.iout, y: op.pd }]} />}
      {s.view === 'psrr' && <Plot series={[{ x: psrrCurve.fs, y: psrrCurve.y, label: 'PSRR', color: 'accent', width: 2.4 }]} xLog xUnit="Hz" yUnit="dB" xLabel="ripple frequency" yLabel="PSRR" height={260} yRange={[0, Math.max(90, ...psrrCurve.y) + 5]}
        vlines={[{ at: LOOP.fa, label: 'EA pole', color: 'muted' }, { at: LOOP.fa * LOOP.T0, label: 'loop crossover', color: 'orange' }]} />}
      <Readouts>
        <Readout k="Vout" v={si(op.vo, 'V')} hl tone={op.dropout ? 'warn' : 'ok'} />
        <Readout k="Headroom Vin − Vout" v={si(s.vin - op.vo, 'V')} />
        <Readout k="Min Vin to regulate" v={si(op.vinMin, 'V')} />
        <Readout k="Efficiency" v={`${(op.eff * 100).toFixed(1)} % (Vout/Vin = ${(op.effApprox * 100).toFixed(1)} %)`} />
        <Readout k="Pass dissipation" v={si(op.pd, 'W')} tone={hot ? 'bad' : undefined} />
        <Readout k="Junction temp Tj" v={`${op.tj.toFixed(1)} °C`} tone={tsd ? 'bad' : hot ? 'warn' : 'ok'} />
        <Readout k="Ground current Iq" v={si(s.iq, 'A')} />
        <Readout k="Thermal max Iout (125 °C)" v={si(imaxTh, 'A')} />
        <Readout k="Divider R1 / R2" v={`${si(op.r1, 'Ω')} / ${si(op.r2, 'Ω')}`} />
        <Readout k="PSRR @ 100 Hz / 100 kHz" v={`${psrr(s, 100).toFixed(0)} / ${psrr(s, 1e5).toFixed(0)} dB`} />
      </Readouts>
    </SimShell>
  );
}
