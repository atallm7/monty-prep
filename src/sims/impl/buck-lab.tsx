// Buck converter: switched time-domain simulation (periodic steady state by shooting), losses and ripple.
import { useDeferredValue, useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Toggle, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { linspace, logspace } from '../../lib/units';
import { simulateBuck, effSweep, defaults, BuckIn, Losses } from '../models/buck-lab';

type View = 'waveforms' | 'efficiency' | 'ripple';
const bool = (v: unknown, d: boolean) => v === undefined ? d : v === true || v === 'true' || v === 1 || v === '1';

const LOSS_META: { k: keyof Losses; label: string; color: string }[] = [
  { k: 'hs', label: 'HS conduction I²Rds', color: 'var(--d-red)' },
  { k: 'ls', label: 'LS conduction I²Rds', color: 'var(--d-orange)' },
  { k: 'diode', label: 'Diode (Vf·I)', color: 'var(--d-purple)' },
  { k: 'dcr', label: 'Inductor DCR', color: 'var(--d-blue)' },
  { k: 'esr', label: 'Cap ESR', color: 'var(--d-green)' },
  { k: 'sw', label: 'Switching (V·I overlap, Coss, Qrr)', color: 'var(--d-accent)' },
  { k: 'gate', label: 'Gate drive Qg·V·f', color: 'var(--d-muted)' },
];

export default function BuckLab({ params }: SimProps) {
  const d0 = defaults();
  const init = {
    vin: Number(params.vin ?? 12), vout: Number(params.vout ?? 3.3), l: Number(params.l ?? 4.7e-6), c: Number(params.c ?? 22e-6),
    esr: Number(params.esr ?? 0.005), fsw: Number(params.fsw ?? 500e3), iout: Number(params.iout ?? 2), sync: bool(params.sync, true),
    view: (['waveforms', 'efficiency', 'ripple'].includes(params.view) ? params.view : 'waveforms') as View,
    mode: 'target' as 'target' | 'duty', d: Math.min(0.95, Number(params.vout ?? 3.3) / Number(params.vin ?? 12)),
    rdsHi: d0.rdsHi, rdsLo: d0.rdsLo, dcr: d0.dcr, td: d0.td, vfBody: d0.vfBody, vfDiode: d0.vfDiode, tsw: d0.tr,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const ds = useDeferredValue(s);

  const inp: BuckIn = useMemo(() => ({
    ...d0, vin: ds.vin, vout: Math.min(ds.vout, ds.vin * 1.2), d: ds.d, mode: ds.mode, l: ds.l, c: ds.c, esr: ds.esr, dcr: ds.dcr, fsw: ds.fsw,
    iout: ds.iout, sync: ds.sync, rdsHi: ds.rdsHi, rdsLo: ds.rdsLo, td: ds.td, vfBody: ds.vfBody, vfDiode: ds.vfDiode, tr: ds.tsw, tf: ds.tsw,
  }), [ds]);
  const r = useMemo(() => simulateBuck(inp), [inp]);

  // two periods of the steady-state waveform
  const W = useMemo(() => {
    const t: number[] = [], o = { vsw: [] as number[], iL: [] as number[], ilow: [] as number[], iin: [] as number[], ic: [] as number[], vout: [] as number[], vcap: [] as number[], vesr: [] as number[] };
    let vcAvg = 0; for (const x of r.samples) vcAvg += x.vC; vcAvg /= r.samples.length;
    for (let p = 0; p < 2; p++) for (const x of r.samples) {
      t.push(x.t + p * r.T); o.vsw.push(x.vsw); o.iL.push(x.iL); o.ilow.push(x.ilow); o.iin.push(x.iin); o.ic.push(x.ic); o.vout.push(x.vout);
      o.vcap.push(x.vC - vcAvg); o.vesr.push(inp.esr * x.ic);
    }
    return { t, ...o };
  }, [r, inp.esr]);

  const sweep = useMemo(() => {
    if (ds.view !== 'efficiency') return null;
    const top = Math.max(ds.iout * 2, 1);
    const loads = logspace(Math.min(0.02, ds.iout / 4), top, 9);
    return { loads, me: effSweep(inp, loads), other: effSweep({ ...inp, sync: !inp.sync }, loads) };
  }, [inp, ds.view, ds.iout]);

  const modeBadge = r.mode === 'DCM' ? <RegionBadge label="DCM (diode blocks at 0 A)" color="warn" /> : r.mode === 'FCCM' ? <RegionBadge label="Forced CCM: iL goes negative" color="info" /> : r.mode === 'BCM' ? <RegionBadge label="Boundary (BCM)" color="accent" /> : <RegionBadge label="CCM" color="ok" />;

  const schematic = useMemo(() => {
    const els: any[] = [
      { t: 'V', a: [0, 3], b: [0, 7], label: 'V_{in}', value: si(ds.vin, 'V') },
      { t: 'wire', pts: [[0, 3], [0, 0], [5, 0]] },
      { t: 'nmos', at: [3, 2], label: 'Q_H', bodyDiode: true, color: 'accent' },
      { t: 'wire', pts: [[5, 4], [5, 5.6]] }, { t: 'dot', at: [5, 4.8] },
      { t: 'wire', pts: [[5, 4.8], [8, 4.8]] },
      { t: 'L', a: [8, 4.8], b: [12, 4.8], label: 'L', value: si(ds.l, 'H') },
      { t: 'wire', pts: [[12, 4.8], [19, 4.8]] }, { t: 'dot', at: [14, 4.8] },
      { t: 'C', a: [14, 4.8], b: [14, 7.8], label: 'C', value: si(ds.c, 'F') },
      { t: 'R', a: [14, 7.8], b: [14, 11], label: 'ESR', value: si(ds.esr, 'Ω') },
      { t: 'I', a: [19, 4.8], b: [19, 11], label: 'I_{out}', value: si(ds.iout, 'A'), color: 'orange' },
      { t: 'wire', pts: [[0, 7], [0, 11], [19, 11]] }, { t: 'dot', at: [5, 11] }, { t: 'dot', at: [14, 11] },
      { t: 'gnd', at: [9, 11] },
      { t: 'text', at: [6.4, 4.1], text: 'SW', anchor: 'start', muted: true },
      { t: 'text', at: [15.6, 3.6], text: `V_{out} = ${si(r.voutAvg, 'V')}`, color: 'accent', anchor: 'start' },
      { t: 'text', at: [1.2, -1], text: `D = ${(r.D * 100).toFixed(1)}%, f_{sw} = ${si(ds.fsw, 'Hz')}`, anchor: 'start', muted: true },
    ];
    if (ds.sync) els.push({ t: 'nmos', at: [3, 7.6], label: 'Q_L', bodyDiode: true, color: 'orange' }, { t: 'wire', pts: [[5, 9.6], [5, 11]] });
    else els.push({ t: 'Schottky', a: [5, 9.6], b: [5, 5.6], label: 'D_1', value: si(ds.vfDiode, 'V'), color: 'orange' }, { t: 'wire', pts: [[5, 9.6], [5, 11]] });
    return renderCircuit({ elements: els }).svg;
  }, [ds.vin, ds.l, ds.c, ds.esr, ds.iout, ds.sync, ds.vfDiode, ds.fsw, r.voutAvg, r.D]);

  const tPlot = { xUnit: 's', xLabel: 't', height: 150, xRange: [0, 2 * r.T] as [number, number] };
  const vlines = [{ at: r.D * r.T, color: 'muted' }, { at: r.T, color: 'muted' }, { at: r.T + r.D * r.T, color: 'muted' }];
  const vtxt = ds.mode === 'target' ? si(ds.vout, 'V') : null;
  const effPts = (sweep?.me ?? []).map(x => x.eff * 100);

  return (
    <SimShell title="Buck converter: switching simulation" onReset={() => set(init)}
      tryThis={<>
        (1) Switch to <b>async</b> and lower I<sub>out</sub> below ΔI/2 = {si(r.iBoundary, 'A')}: the diode stops the inductor current at 0 and the switch node jumps to V<sub>out</sub> (DCM). In sync mode the same load gives negative inductor current instead.
        (2) In the <b>efficiency</b> view, compare sync and async at 5 A: the diode&apos;s V<sub>f</sub>·I loss dwarfs I²R<sub>ds(on)</sub>. Then raise f<sub>sw</sub> to 3 MHz and watch switching loss take over.
      </>}
      controls={<>
        <Seg label="View" value={s.view} onChange={upd('view')} options={[{ value: 'waveforms', label: 'Waveforms' }, { value: 'efficiency', label: 'Efficiency' }, { value: 'ripple', label: 'Ripple' }]} />
        <Seg label="Duty control" value={s.mode} onChange={upd('mode')} options={[{ value: 'target', label: 'Target Vout' }, { value: 'duty', label: 'Manual D' }]} />
        <Slider label="Input voltage Vin" value={s.vin} min={1} max={48} step={0.1} unit="V" onChange={upd('vin')} />
        {s.mode === 'target'
          ? <Slider label="Target Vout" value={s.vout} min={0.5} max={Math.max(1, s.vin)} step={0.05} unit="V" onChange={upd('vout')} />
          : <Slider label="Duty cycle D" value={s.d} min={0.01} max={0.99} step={0.005} format={v => (v * 100).toFixed(1) + '%'} onChange={upd('d')} />}
        <Slider label="Load current Iout" value={s.iout} min={0.01} max={10} log unit="A" onChange={upd('iout')} />
        <Slider label="Inductance L" value={s.l} min={0.22e-6} max={100e-6} log unit="H" onChange={upd('l')} />
        <Slider label="Capacitance C" value={s.c} min={1e-6} max={1000e-6} log unit="F" onChange={upd('c')} />
        <Slider label="Capacitor ESR" value={s.esr} min={0.0005} max={0.5} log unit="Ω" onChange={upd('esr')} />
        <Slider label="Switching freq fsw" value={s.fsw} min={50e3} max={5e6} log unit="Hz" onChange={upd('fsw')} />
        <Toggle label="Synchronous rectifier (low-side FET)" checked={s.sync} onChange={upd('sync')} />
        <Slider label="High-side Rds(on)" value={s.rdsHi} min={0.001} max={0.5} log unit="Ω" onChange={upd('rdsHi')} />
        {s.sync && <Slider label="Low-side Rds(on)" value={s.rdsLo} min={0.001} max={0.5} log unit="Ω" onChange={upd('rdsLo')} />}
        <Slider label="Inductor DCR" value={s.dcr} min={0.001} max={0.5} log unit="Ω" onChange={upd('dcr')} />
        {s.sync
          ? <><Slider label="Dead time (each edge)" value={s.td} min={0} max={100e-9} step={1e-9} unit="s" onChange={upd('td')} />
            <Slider label="Body-diode Vf" value={s.vfBody} min={0.3} max={1.2} step={0.01} unit="V" onChange={upd('vfBody')} /></>
          : <Slider label="Schottky diode Vf" value={s.vfDiode} min={0} max={1} step={0.01} unit="V" onChange={upd('vfDiode')} />}
        <Slider label="Switch rise/fall time" value={s.tsw} min={1e-9} max={50e-9} log unit="s" onChange={upd('tsw')} />
        <Note>Exact switched simulation (RK4) of the periodic steady state, with a constant-current load. Gate charge Qg = 8 nC at 5 V, Coss = 300 pF, Qrr = 10 nC.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {modeBadge}
        {r.dropout && <RegionBadge label="Dropout: target unreachable, D at max" color="bad" />}
        {ds !== s && <span className="faint" style={{ fontSize: 12 }}>updating…</span>}
      </div>
      <Readouts>
        <Readout k="Duty D" v={(r.D * 100).toFixed(2) + '%'} hl />
        <Readout k="Vout (avg)" v={si(r.voutAvg, 'V', 4)} hl />
        <Readout k="ΔI sim / analytic" v={`${si(r.dI, 'A')} / ${si(r.dIanalytic, 'A')}`} />
        <Readout k="ΔVout sim / analytic" v={`${si(r.dV, 'V')} / ${si(r.dVanalytic, 'V')}`} />
        <Readout k="Efficiency" v={(r.eff * 100).toFixed(1) + '%'} tone={r.eff > 0.9 ? 'ok' : r.eff > 0.8 ? 'warn' : 'bad'} />
        <Readout k="Pout / total loss" v={`${si(r.pout, 'W')} / ${si(r.lossTotal, 'W')}`} />
        <Readout k="Input current (avg)" v={si(r.pin / ds.vin, 'A')} />
        <Readout k="iL peak / valley" v={`${si(r.iLmax, 'A')} / ${si(r.iLmin, 'A')}`} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}\Delta I_L=\frac{(V_{in}-V_{out})\,D}{L\,f_{sw}}=\frac{(${ds.vin.toFixed(1)}-${r.voutAvg.toFixed(2)})\cdot ${r.D.toFixed(3)}}{\text{${si(ds.l, 'H')}}\cdot \text{${si(ds.fsw, 'Hz')}}}=\text{${si(r.dIanalytic, 'A')}}\\ \Delta V\approx\frac{\Delta I}{8Cf_{sw}}+\Delta I\cdot ESR=\text{${si(r.dVcap, 'V')}}+\text{${si(r.dVesr, 'V')}}=\text{${si(r.dVanalytic, 'V')}}\end{gathered}`}</EqBox>

      {ds.view === 'waveforms' && <>
        <Plot {...tPlot} yUnit="V" yLabel="V_{SW}" series={[{ x: W.t, y: W.vsw, label: 'switch node V_SW', color: 'accent' }]} vlines={vlines}
          hlines={[{ at: ds.vin, label: 'V_in', color: 'muted' }, { at: 0, color: 'muted' }]} />
        <Plot {...tPlot} height={190} yUnit="A" yLabel="current" series={[
          { x: W.t, y: W.iL, label: 'inductor i_L', color: 'accent', width: 2.2 },
          { x: W.t, y: W.ilow, label: ds.sync ? 'low-side FET / body diode' : 'diode current', color: 'orange', dashed: true },
          { x: W.t, y: W.iin, label: 'input current (HS)', color: 'blue', dashed: true },
        ]} hlines={[{ at: ds.iout, label: 'I_out', color: 'muted' }, { at: 0, color: 'muted' }]} />
        <Plot {...tPlot} yUnit="A" yLabel="i_C" series={[{ x: W.t, y: W.ic, label: 'capacitor current i_C = i_L − I_out', color: 'green' }]} hlines={[{ at: 0, color: 'muted' }]} />
        <Plot {...tPlot} yUnit="V" yLabel="V_{out} − avg" series={[{ x: W.t, y: W.vout.map(v => v - r.voutAvg), label: `output ripple around ${si(r.voutAvg, 'V', 4)}`, color: 'purple' }]}
          hlines={[{ at: 0, color: 'muted' }]} />
        <Note>Dashed verticals mark HS turn-off (t = DT) and turn-on. {ds.sync ? `During each ${si(ds.td, 's')} dead time the low-side body diode (or, with negative current, the high-side one) carries i_L: see the ${si(ds.vfBody, 'V')} dips on V_SW.` : 'When the diode current reaches 0 A, both devices are off; V_SW is drawn at V_out (real converters ring here with L and Coss).'}</Note>
      </>}

      {ds.view === 'efficiency' && <>
        <div>
          <div className="faint" style={{ fontSize: 12.5, marginBottom: 6 }}>Loss breakdown at {si(ds.iout, 'A')} (total {si(r.lossTotal, 'W')}, η = {(r.eff * 100).toFixed(1)}%)</div>
          {LOSS_META.filter(m => ds.sync || m.k !== 'ls').map(m => {
            const v = r.losses[m.k]; const frac = r.lossTotal > 0 ? v / r.lossTotal : 0;
            return <div key={m.k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,9fr) minmax(0,10fr) 64px', gap: 8, alignItems: 'center', fontSize: 12.5, marginBottom: 4 }}>
              <span>{m.label}</span>
              <span style={{ background: 'var(--d-box)', borderRadius: 4, height: 12, overflow: 'hidden' }}><span style={{ display: 'block', width: `${(frac * 100).toFixed(1)}%`, height: '100%', background: m.color }} /></span>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{si(v, 'W')}</span>
            </div>;
          })}
        </div>
        {sweep && <Plot xLog xUnit="A" xLabel="load current I_out" yLabel="efficiency (%)" yRange={[Math.max(0, Math.min(...effPts, ...sweep.other.map(x => x.eff * 100)) - 5), 100]} height={230}
          series={[{ x: sweep.loads, y: effPts, label: ds.sync ? 'synchronous (this design)' : 'diode rectifier (this design)', color: 'accent', points: true },
            { x: sweep.loads, y: sweep.other.map(x => x.eff * 100), label: ds.sync ? 'same with diode rectifier' : 'same with sync FET', color: 'muted', dashed: true, points: true }]}
          points={[{ x: ds.iout, y: r.eff * 100, label: 'now', color: 'accent' }]} />}
        <Note>Each point is a full switched simulation regulated to the same V<sub>out</sub>. At light load, fixed losses (gate drive, Coss) dominate; at heavy load, I²R and diode V<sub>f</sub>·I dominate. Conduction losses come from integrating i² over the simulated waveform, so ripple current (RMS {si(r.iLrms, 'A')} vs DC {si(r.iLavg, 'A')}) is included.</Note>
      </>}

      {ds.view === 'ripple' && <>
        <Plot {...tPlot} height={200} yUnit="V" yLabel="ΔV_{out}" series={[
          { x: W.t, y: W.vout.map(v => v - r.voutAvg), label: 'total ripple', color: 'purple', width: 2.2 },
          { x: W.t, y: W.vcap, label: 'capacitive part (∫i_C/C)', color: 'blue', dashed: true },
          { x: W.t, y: W.vesr, label: 'ESR part (i_C·ESR)', color: 'green', dashed: true },
        ]} hlines={[{ at: 0, color: 'muted' }]} />
        {(() => {
          const Ds = linspace(0.01, 0.99, 120);
          const dIfn = (D: number) => ds.vin * (1 - D) * D / (ds.l * ds.fsw);
          return <Plot xLabel="duty cycle D = V_out/V_in (ideal)" yUnit="A" yLabel="ΔI_L" height={200} series={[{ x: Ds, y: Ds.map(dIfn), label: 'analytic ΔI = Vin·D(1−D)/(L·f)', color: 'accent' }]}
            vlines={[{ at: 0.5, label: 'max at D = 0.5', color: 'muted' }]} points={[{ x: r.D, y: r.dI, label: 'simulated', color: 'red' }]} hlines={[{ at: 2 * ds.iout, label: 'DCM below this (ΔI > 2·Iout)', color: 'orange' }]} />;
        })()}
        <Readouts>
          <Readout k="Capacitive ΔI/(8Cf)" v={si(r.dVcap, 'V')} />
          <Readout k="ESR part ΔI·ESR" v={si(r.dVesr, 'V')} />
          <Readout k="Simulated p-p" v={si(r.dV, 'V')} hl />
          <Readout k="Cap RMS current" v={si(r.icRms, 'A')} />
        </Readouts>
        <Note>The capacitive ripple is a parabola-shaped wave lagging i<sub>C</sub> by 90°, the ESR ripple is a triangle in phase with i<sub>C</sub>, so the simulated peak-to-peak is at most their sum. In DCM the triangle formula no longer applies.</Note>
      </>}
    </SimShell>
  );
}
