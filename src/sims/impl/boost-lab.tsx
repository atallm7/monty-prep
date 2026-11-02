// Boost converter: switched time-domain simulation (periodic steady state), ideal vs real gain, CCM/DCM, losses.
import { useDeferredValue, useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { linspace } from '../../lib/units';
import { simulateBoost, boostDefaults, voutVsD, BLosses } from '../models/boost-lab';

const T = (s: string) => String.raw`\text{${s}}`;
const LOSS: { k: keyof BLosses; label: string; color: string }[] = [
  { k: 'fet', label: 'FET I²Rds', color: 'var(--d-red)' }, { k: 'diode', label: 'Diode Vf·I', color: 'var(--d-purple)' },
  { k: 'dcr', label: 'Inductor DCR', color: 'var(--d-blue)' }, { k: 'esr', label: 'Cap ESR', color: 'var(--d-green)' },
  { k: 'sw', label: 'Switching + Coss', color: 'var(--d-accent)' }, { k: 'gate', label: 'Gate drive', color: 'var(--d-muted)' },
];

export default function BoostLab({ params }: SimProps) {
  const d0 = boostDefaults();
  const init = {
    vin: Number(params.vin ?? 3.7), d: Number(params.d ?? 0.3), l: Number(params.l ?? d0.l), c: Number(params.c ?? d0.c),
    iout: Number(params.iout ?? d0.iout), fsw: Number(params.fsw ?? d0.fsw), esr: d0.esr, dcr: d0.dcr, rds: d0.rds, vf: d0.vf,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const ds = useDeferredValue(s);
  const inp = useMemo(() => ({ ...d0, ...ds, vdrv: Math.max(3.3, ds.vin) }), [ds]);
  const r = useMemo(() => simulateBoost(inp), [inp]);

  const W = useMemo(() => {
    const t: number[] = [], iL: number[] = [], id: number[] = [], isw: number[] = [], vsw: number[] = [], vo: number[] = [];
    for (let k = 0; k < 2; k++) for (const x of r.S) { t.push(x.t + k * r.T); iL.push(x.iL); id.push(x.id); isw.push(x.isw); vsw.push(x.vsw); vo.push(x.vout - r.voutAvg); }
    return { t, iL, id, isw, vsw, vo };
  }, [r]);

  const gain = useMemo(() => {
    const Ds = linspace(0, 0.92, 140);
    return { Ds, ideal: Ds.map(D => ds.vin / (1 - D)), real: Ds.map(D => { const v = voutVsD(inp, D); return v > 0 ? v : NaN; }) };
  }, [inp, ds.vin]);

  const schematic = useMemo(() => renderCircuit({
    elements: [
      { t: 'V', a: [0, 2], b: [0, 6], label: 'V_{in}', value: si(ds.vin, 'V') },
      { t: 'wire', pts: [[0, 2], [0, 0], [2, 0]] },
      { t: 'L', a: [2, 0], b: [7, 0], label: 'L', value: si(ds.l, 'H'), color: 'accent' },
      { t: 'wire', pts: [[7, 0], [9, 0]] }, { t: 'dot', at: [9, 0] },
      { t: 'wire', pts: [[9, 0], [9, 2]] },
      { t: 'nmos', at: [7, 4], label: 'Q_1', color: 'red' },
      { t: 'wire', pts: [[9, 6], [9, 8]] },
      { t: 'Schottky', a: [9, 0], b: [14, 0], label: 'D_1', value: 'V_f ' + si(ds.vf, 'V'), color: 'purple' },
      { t: 'wire', pts: [[14, 0], [20, 0]] }, { t: 'dot', at: [16, 0] },
      { t: 'C', a: [16, 0], b: [16, 4], label: 'C', value: si(ds.c, 'F') },
      { t: 'R', a: [16, 4], b: [16, 8], label: 'ESR', value: si(ds.esr, 'Ω') },
      { t: 'I', a: [20, 0], b: [20, 8], label: 'I_{out}', value: si(ds.iout, 'A'), color: 'orange' },
      { t: 'wire', pts: [[0, 6], [0, 8], [20, 8]] }, { t: 'dot', at: [9, 8] }, { t: 'dot', at: [16, 8] }, { t: 'gnd', at: [4, 8] },
      { t: 'text', at: [8.6, -0.9], text: 'SW', anchor: 'end', muted: true },
      { t: 'text', at: [6.6, 6.4], text: `PWM D = ${(ds.d * 100).toFixed(0)}%`, anchor: 'end', muted: true },
      { t: 'text', at: [17.4, -1.4], text: r.collapsed ? 'V_{out}: collapsed' : `V_{out} = ${si(r.voutAvg, 'V')}`, color: r.collapsed ? 'red' : 'accent', anchor: 'start' },
    ],
  }).svg, [ds, r.voutAvg, r.collapsed]);

  const tp = { xUnit: 's', xLabel: 't', height: 160, xRange: [0, 2 * r.T] as [number, number] };
  const vl = [{ at: ds.d * r.T, color: 'muted' }, { at: r.T, color: 'muted' }, { at: r.T + ds.d * r.T, color: 'muted' }];

  return (
    <SimShell title="Boost converter: switching simulation" onReset={() => set(init)}
      tryThis={<>(1) Push D toward 0.9 at 1 A: the ideal 1/(1−D) gain keeps climbing, but the real curve peaks and falls because the inductor current I<sub>out</sub>/(1−D) explodes and its I·R drop eats the input. (2) Drop I<sub>out</sub> below {si(r.iCrit, 'A')} to enter DCM: V<sub>out</sub> rises above V<sub>in</sub>/(1−D) because each cycle dumps a fixed ½LI²<sub>pk</sub> into a lighter load.</>}
      controls={<>
        <Slider label="Input voltage Vin" value={s.vin} min={0.8} max={24} step={0.1} unit="V" onChange={upd('vin')} />
        <Slider label="Duty cycle D" value={s.d} min={0} max={0.92} step={0.005} format={v => (v * 100).toFixed(1) + '%'} onChange={upd('d')} />
        <Slider label="Load current Iout" value={s.iout} min={0.005} max={5} log unit="A" onChange={upd('iout')} />
        <Slider label="Inductance L" value={s.l} min={0.22e-6} max={100e-6} log unit="H" onChange={upd('l')} />
        <Slider label="Capacitance C" value={s.c} min={1e-6} max={1000e-6} log unit="F" onChange={upd('c')} />
        <Slider label="Switching freq fsw" value={s.fsw} min={50e3} max={5e6} log unit="Hz" onChange={upd('fsw')} />
        <Slider label="Capacitor ESR" value={s.esr} min={0.0005} max={0.5} log unit="Ω" onChange={upd('esr')} />
        <Slider label="Inductor DCR" value={s.dcr} min={0.001} max={0.5} log unit="Ω" onChange={upd('dcr')} />
        <Slider label="FET Rds(on)" value={s.rds} min={0.001} max={0.5} log unit="Ω" onChange={upd('rds')} />
        <Slider label="Diode Vf" value={s.vf} min={0} max={1} step={0.01} unit="V" onChange={upd('vf')} />
        <Note>Open-loop duty, constant-current load, exact switched simulation (RK4) of the periodic steady state.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {r.collapsed ? <RegionBadge label="Output collapsed: losses exceed what Vin can supply" color="bad" />
          : r.mode === 'DCM' ? <RegionBadge label="DCM" color="warn" /> : r.mode === 'BCM' ? <RegionBadge label="Boundary (BCM)" color="accent" /> : <RegionBadge label="CCM" color="ok" />}
      </div>
      <Readouts>
        <Readout k="Vout simulated" v={r.collapsed ? '—' : si(r.voutAvg, 'V', 4)} hl />
        <Readout k="Ideal Vin/(1−D)" v={si(r.vIdeal, 'V', 4)} />
        <Readout k="Input current (= iL avg)" v={si(r.iin, 'A')} />
        <Readout k="Output current" v={si(ds.iout, 'A')} />
        <Readout k="ΔI sim / Vin·D/(Lf)" v={`${si(r.dI, 'A')} / ${si(r.dIanalytic, 'A')}`} />
        <Readout k="Diode peak / avg" v={`${si(r.idPk, 'A')} / ${si(r.idAvg, 'A')}`} />
        <Readout k="ΔVout p-p" v={si(r.dV, 'V')} />
        <Readout k="Efficiency" v={r.collapsed ? '—' : (r.eff * 100).toFixed(1) + '%'} tone={r.eff > 0.9 ? 'ok' : r.eff > 0.8 ? 'warn' : 'bad'} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}V_{out}=\frac{V_{in}}{1-D}=\frac{${ds.vin.toFixed(2)}}{1-${ds.d.toFixed(3)}}=${T(si(r.vIdeal, 'V'))}\ \text{(ideal)}\\ I_{in}=\frac{I_{out}}{1-D}=${T(si(ds.iout / (1 - ds.d), 'A'))}\\ \Delta I_L=\frac{V_{in}D}{Lf_{sw}}=${T(si(r.dIanalytic, 'A'))}\\ \Delta V\approx\frac{I_{out}D}{Cf_{sw}}+ESR\cdot I_{pk}=${T(si(r.dVcap, 'V'))}+${T(si(r.dVesr, 'V'))}\end{gathered}`}</EqBox>
      {r.collapsed ? <Note>No steady state exists: with this load the required inductor current I<sub>out</sub>/(1−D) = {si(ds.iout / (1 - ds.d), 'A')} drops more than V<sub>in</sub> across the DCR and Rds(on). Reduce D or the load.</Note> : <>
        <Plot {...tp} height={190} yUnit="A" yLabel="current" vlines={vl} series={[
          { x: W.t, y: W.iL, label: 'inductor = input current', color: 'accent', width: 2.2 },
          { x: W.t, y: W.isw, label: 'FET current', color: 'red', dashed: true },
          { x: W.t, y: W.id, label: 'diode current (pulsed)', color: 'purple' },
        ]} hlines={[{ at: ds.iout, label: 'I_out (diode average)', color: 'orange' }, { at: r.iin, label: 'I_in', color: 'muted' }]} />
        <Plot {...tp} yUnit="V" yLabel="V_{SW}" vlines={vl} series={[{ x: W.t, y: W.vsw, label: 'switch node', color: 'red' }]} hlines={[{ at: ds.vin, label: 'V_in', color: 'muted' }]} />
        <Plot {...tp} yUnit="V" yLabel="ΔV_{out}" vlines={vl} series={[{ x: W.t, y: W.vo, label: `output ripple around ${si(r.voutAvg, 'V', 4)}`, color: 'purple' }]} hlines={[{ at: 0, color: 'muted' }]} />
      </>}
      <Plot xLabel="duty cycle D" yUnit="V" yLabel="V_{out}" height={220} xRange={[0, 0.92]} yRange={[0, Math.min(12 * ds.vin, Math.max(...gain.ideal.filter((_, i) => gain.Ds[i] <= 0.9)))]}
        series={[{ x: gain.Ds, y: gain.ideal, label: 'ideal V_in/(1−D)', color: 'muted', dashed: true }, { x: gain.Ds, y: gain.real, label: 'with DCR, Rds, Vf (CCM avg.)', color: 'accent' }]}
        points={r.collapsed ? [] : [{ x: ds.d, y: r.voutAvg, label: r.mode === 'DCM' ? 'sim (DCM)' : 'sim', color: 'red' }]} vlines={[{ at: ds.d, color: 'red' }]} />
      <div>
        <div className="faint" style={{ fontSize: 12.5, marginBottom: 6 }}>Loss breakdown (total {si(r.lossTotal, 'W')}, P<sub>out</sub> = {si(r.pout, 'W')})</div>
        {LOSS.map(m => <div key={m.k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,8fr) minmax(0,10fr) 64px', gap: 8, alignItems: 'center', fontSize: 12.5, marginBottom: 4 }}>
          <span>{m.label}</span>
          <span style={{ background: 'var(--d-box)', borderRadius: 4, height: 12, overflow: 'hidden' }}><span style={{ display: 'block', width: `${r.lossTotal > 0 ? Math.max(0, r.losses[m.k] / r.lossTotal * 100).toFixed(1) : 0}%`, height: '100%', background: m.color }} /></span>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{si(r.losses[m.k], 'W')}</span></div>)}
      </div>
      <Note>Why the diode current is pulsed: the output only receives current while the switch is off, so the diode (and output capacitor) see a square-ish pulse of height ≈ I<sub>L</sub> = I<sub>out</sub>/(1−D) for (1−D)·T. The input current is the smooth inductor current: that is why a boost has low input ripple but a noisy output, the opposite of a buck.</Note>
    </SimShell>
  );
}
