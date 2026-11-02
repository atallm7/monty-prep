// Reference implementation: voltage divider with optional load.
// Pattern for all sims: pure physics in a useMemo, schematic via renderCircuit, readouts + plot + equations.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Toggle, Readout, Readouts, EqBox, Note, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { divider } from '../models/divider';

export default function Divider({ params }: SimProps) {
  const init = { vin: Number(params.vin ?? 12), r1: Number(params.r1 ?? 10000), r2: Number(params.r2 ?? 4700), rl: Number(params.rl ?? 10000), load: Boolean(params.load ?? false) };
  const [s, set] = useState(init);
  const upd = (k: keyof typeof s) => (v: number | boolean) => set(p => ({ ...p, [k]: v }));

  const r = useMemo(() => { const d = divider(s); return { ...d, eff: d.pl / (s.vin * d.i1) }; }, [s]);

  const schematic = useMemo(() => renderCircuit({
    elements: [
      { t: 'V', a: [0, 2], b: [0, 6], label: 'V_{in}', value: si(s.vin, 'V') },
      { t: 'wire', pts: [[0, 2], [0, 0], [4, 0], [4, 1]], flow: true },
      { t: 'R', a: [4, 1], b: [4, 4], label: 'R_1', value: si(s.r1, 'Ω') },
      { t: 'R', a: [4, 4], b: [4, 7], label: 'R_2', value: si(s.r2, 'Ω') },
      { t: 'wire', pts: [[4, 4], [8, 4]] }, { t: 'dot', at: [4, 4] },
      ...(s.load ? [{ t: 'wire', pts: [[8, 4], [8, 4.5]] }, { t: 'R', a: [8, 4.5], b: [8, 7.5], label: 'R_L', value: si(s.rl, 'Ω'), color: 'orange' }, { t: 'wire', pts: [[8, 7.5], [8, 8], [4, 8]] }, { t: 'dot', at: [8, 4] }] : [{ t: 'term', at: [8, 4], label: 'V_{out}', side: 'right' }]),
      { t: 'wire', pts: [[0, 6], [0, 8], [4, 8], [4, 7]] }, { t: 'gnd', at: [2, 8] },
      { t: 'text', at: [s.load ? 9.6 : 10.6, 3.2], text: `V_{out} = ${si(r.vout, 'V')}`, color: 'accent', anchor: 'start' },
      { t: 'arrow', a: [1.4, -0.6], b: [2.8, -0.6], label: `I = ${si(r.i1, 'A')}` },
    ],
  }).svg, [s, r]);

  // Vout vs load resistance: shows why a divider is a poor supply
  const curve = useMemo(() => {
    const xs = logspace(10, 1e7, 240);
    return { x: xs, y: xs.map(rl => { const p = s.r2 * rl / (s.r2 + rl); return s.vin * p / (s.r1 + p); }) };
  }, [s.vin, s.r1, s.r2]);

  return (
    <SimShell title="Voltage divider: loaded vs unloaded" onReset={() => set(init)}
      tryThis={<>connect the load and slide R<sub>L</sub> down toward R<sub>2</sub>. The output sags because R<sub>L</sub> sits in parallel with R<sub>2</sub>. By Thevenin's theorem the loading error is exactly R<sub>th</sub>/(R<sub>th</sub> + R<sub>L</sub>) with R<sub>th</sub> = R<sub>1</sub>‖R<sub>2</sub>, so R<sub>L</sub> = 10·R<sub>th</sub> gives 9.1% and R<sub>L</sub> = 100·R<sub>th</sub> gives about 1%.</>}
      controls={<>
        <Slider label="Input voltage Vin" value={s.vin} min={0} max={24} step={0.1} unit="V" onChange={upd('vin')} />
        <Slider label="R1 (top)" value={s.r1} min={100} max={1e6} log unit="Ω" onChange={upd('r1')} />
        <Slider label="R2 (bottom)" value={s.r2} min={100} max={1e6} log unit="Ω" onChange={upd('r2')} />
        <Toggle label="Connect load RL" checked={s.load} onChange={upd('load')} />
        {s.load && <Slider label="Load RL" value={s.rl} min={10} max={1e7} log unit="Ω" onChange={upd('rl')} />}
        <Note>All values are computed exactly from Ohm's law and KCL. R<sub>L</sub> appears in parallel with R<sub>2</sub>.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <Readouts>
        <Readout k="Vout" v={si(r.vout, 'V')} hl />
        <Readout k="Unloaded Vout" v={si(r.vUnloaded, 'V')} />
        {s.load && <Readout k="Loading error" v={(r.err * 100).toFixed(1) + '%'} tone={Math.abs(r.err) > 0.1 ? 'bad' : Math.abs(r.err) > 0.01 ? 'warn' : 'ok'} />}
        <Readout k="I through R1" v={si(r.i1, 'A')} />
        <Readout k="P in R1 / R2" v={`${si(r.p1, 'W')} / ${si(r.p2, 'W')}`} />
        <Readout k="R_th = R1‖R2" v={si(r.rth, 'Ω')} />
        {s.load && <Readout k="Power to load" v={`${si(r.pl, 'W')} (${(r.eff * 100).toFixed(1)}% eff.)`} />}
      </Readouts>
      <EqBox>{s.load ? String.raw`V_{out} = V_{in}\,\frac{R_2\parallel R_L}{R_1 + R_2\parallel R_L},\quad R_2\parallel R_L = \frac{R_2R_L}{R_2+R_L}` : String.raw`V_{out} = V_{in}\,\frac{R_2}{R_1+R_2} = ${s.vin.toFixed(2)}\cdot\frac{${si(s.r2, '\\Omega')}}{${si(s.r1 + s.r2, '\\Omega')}} = ${r.vout.toFixed(3)}\,\text{V}`}</EqBox>
      <Plot series={[{ ...curve, label: 'Vout vs load resistance' }]} xLog xUnit="Ω" yUnit="V" xLabel="Load resistance RL" yLabel="Vout" height={210}
        hlines={[{ at: r.vUnloaded, label: 'unloaded', color: 'muted' }]} vlines={[{ at: r.rth, label: 'RL = R1‖R2', color: 'orange' }]}
        points={s.load ? [{ x: s.rl, y: r.vout, label: 'now', color: 'accent' }] : []} />
    </SimShell>
  );
}
