// Why transmission loss is about current: fixed load power through a resistive line at different voltages.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { transmit, Mode } from '../models/power-loss';

const T = (v: number, u: string) => isFinite(v) ? `\\text{${si(v, u).replace('−', '-')}}` : '\\infty';

export default function PowerLoss({ params }: SimProps) {
  const init = { p: Number(params.p ?? 100), rw: Number(params.rw ?? 0.5), v: Number(params.v ?? 12), mode: 'load' as Mode };
  const [s, set] = useState(init);
  const upd = (k: 'p' | 'rw' | 'v') => (x: number) => set(q => ({ ...q, [k]: x }));
  const r = useMemo(() => transmit(s), [s]);

  const curves = useMemo(() => {
    const xs = logspace(1, 100000, 240);
    const res = xs.map(v => transmit({ ...s, v }));
    return {
      loss: { x: xs, y: res.map(o => o.feasible ? o.pLoss : NaN), label: 'True loss I²R_w', color: 'red' },
      wrong: { x: xs, y: xs.map(v => s.rw > 0 ? v * v / s.rw : NaN), label: 'Wrong: V²/R_w', color: 'muted', dashed: true },
      eff: { x: xs, y: res.map(o => o.feasible ? o.eff * 100 : NaN), label: 'Efficiency', color: 'green' },
      cur: { x: xs, y: res.map(o => o.feasible ? o.i : NaN), label: 'Line current I', color: 'blue' },
    };
  }, [s.p, s.rw, s.mode]);

  const tone = r.eff > 0.97 ? 'ok' : r.eff > 0.85 ? 'warn' : 'bad';
  const badge = !r.feasible ? <RegionBadge label="Impossible: P > V²/4R_w" color="bad" /> : r.eff > 0.97 ? <RegionBadge label="Efficient transmission" color="ok" /> : r.eff > 0.85 ? <RegionBadge label="Noticeable loss" color="warn" /> : r.eff > 0.5 ? <RegionBadge label="Heavy loss" color="bad" /> : <RegionBadge label="Most power heats the wire" color="bad" />;

  const schematic = useMemo(() => renderCircuit({ elements: [
    { t: 'V', a: [0, 1.5], b: [0, 6.5], label: 'V_s', value: si(r.vSource, 'V') },
    { t: 'wire', pts: [[0, 1.5], [0, 0], [2, 0]], flow: r.i > 0 },
    { t: 'R', a: [2, 0], b: [7, 0], label: 'R_w/2', value: si(r.pLoss / 2, 'W') + ' heat', color: 'red' },
    { t: 'wire', pts: [[7, 0], [11, 0], [11, 1.5]], flow: r.i > 0 },
    { t: 'R', a: [11, 1.5], b: [11, 6.5], label: 'Load', value: `${si(r.feasible ? s.p : r.vLoad * r.i, 'W')}\n${si(r.rLoad, 'Ω')}`, color: 'green' },
    { t: 'wire', pts: [[11, 6.5], [11, 8], [7, 8]], flow: r.i > 0 },
    { t: 'R', a: [7, 8], b: [2, 8], label: 'R_w/2', value: '', color: 'red', labelSide: 'other' },
    { t: 'wire', pts: [[2, 8], [0, 8], [0, 6.5]], flow: r.i > 0 },
    { t: 'arrow', a: [8, -1.6], b: [10, -1.6], label: `I = ${si(r.i, 'A')}` },
    { t: 'text', at: [5.5, 4], text: `V_{load} = ${si(r.vLoad, 'V')}`, color: 'green' },
    { t: 'text', at: [5.5, 5.2], text: `ΔV_{wire} = ${si(r.dv, 'V')}`, color: 'red' },
  ] }).svg, [r, s.p]);

  const pdel = r.feasible ? s.p : r.vLoad * r.i;
  const pctDel = r.pIn > 0 ? pdel / r.pIn : 1;

  return (
    <SimShell title="Why power loss is about current (I²R)" onReset={() => set(init)}
      tryThis={<>keep P = 100 W and move V from 12 V to 120 V: current falls 10×, loss falls 100× (slope −2 on the log plot). Then look at the dashed "V²/R<sub>w</sub>" curve: it claims loss <i>rises</i> with voltage. It is wrong because the voltage across the wire is ΔV = I·R<sub>w</sub>, not V. Switch to "V at source" and lower V until P exceeds V²/4R<sub>w</sub>: no amount of load current can deliver it.</>}
      controls={<>
        <Slider label="Delivered power P" value={s.p} min={1} max={10000} log unit="W" onChange={upd('p')} />
        <Slider label="Wire resistance Rw (total)" value={s.rw} min={0.001} max={100} log unit="Ω" onChange={upd('rw')} />
        <Slider label="Transmission voltage V" value={s.v} min={1} max={100000} log unit="V" onChange={upd('v')} />
        <Seg label="V is measured at" value={s.mode} onChange={m => set(q => ({ ...q, mode: m }))} options={[{ value: 'load', label: 'Load' }, { value: 'source', label: 'Source' }]} />
        <Note>"Load": the load sees exactly V, so I = P/V. "Source": the sender produces V and the load gets V − I·R<sub>w</sub>; then I solves V·I − I²R<sub>w</sub> = P.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{badge}<span className="sim-note">{(pctDel * 100).toFixed(1)}% of the source power reaches the load.</span></div>
      <div aria-label="power split" style={{ display: 'flex', height: 16, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ width: `${pctDel * 100}%`, background: 'var(--d-green)', opacity: 0.75 }} title="delivered" />
        <div style={{ flex: 1, background: 'var(--d-red)', opacity: 0.75 }} title="lost in wire" />
      </div>
      <EqBox>{String.raw`\begin{aligned}I&=\tfrac{P}{V_{load}}=${T(r.i, 'A')}\\ P_{loss}&=I^2R_w=${T(r.pLoss, 'W')}=\tfrac{\Delta V^2}{R_w}\\ &\neq \tfrac{V^2}{R_w}=${T(r.wrongLoss, 'W')}\ (\text{wrong})\end{aligned}`}</EqBox>
      <Readouts>
        <Readout k="Line current I" v={si(r.i, 'A')} hl />
        <Readout k="Wire loss I²Rw" v={si(r.pLoss, 'W')} tone={tone} />
        <Readout k="Efficiency" v={(r.eff * 100).toFixed(2) + '%'} tone={tone} />
        <Readout k="Wire drop ΔV" v={si(r.dv, 'V')} />
        <Readout k={s.mode === 'load' ? 'Source must make Vs' : 'Load receives'} v={si(s.mode === 'load' ? r.vSource : r.vLoad, 'V')} />
        <Readout k="Max deliverable V²/4Rw" v={si(r.pMax, 'W')} tone={r.feasible ? undefined : 'bad'} />
      </Readouts>
      <Plot series={[curves.loss, curves.wrong]} xLog yLog xUnit="V" yUnit="W" xLabel="Transmission voltage V" yLabel="Power" height={240}
        yRange={[s.p * 1e-6, s.p * 100]}
        hlines={[{ at: s.p, label: 'P delivered', color: 'green' }]} vlines={[{ at: s.v, label: 'now', color: 'accent' }]}
        points={r.feasible ? [{ x: s.v, y: r.pLoss, label: si(r.pLoss, 'W'), color: 'red' }] : []} />
      <Plot series={[curves.eff]} xLog xUnit="V" xLabel="Transmission voltage V" yLabel="Efficiency (%)" height={170} yRange={[0, 100]}
        vlines={[{ at: s.v, color: 'accent' }]} points={[{ x: s.v, y: r.eff * 100, color: 'green' }]} />
      <Note>This is why the grid steps up to 100s of kV for long lines, why USB-PD raises the bus to 20–48 V for 100–240 W, and why EVs and data-centres move to 400–800 V and 48 V buses: the same power at higher voltage needs less current, and loss goes as current squared.</Note>
    </SimShell>
  );
}
