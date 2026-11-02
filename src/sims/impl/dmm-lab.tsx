// DMM measurement artifacts: input-resistance loading, current-range burden voltage, 2-wire vs 4-wire resistance.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { loading, rsForError, burden, RANGES, fourWire } from '../models/dmm-lab';

type View = 'loading' | 'burden' | '4wire';
const RINS = [{ value: '1e6', label: '1 MΩ (analog)' }, { value: '1e7', label: '10 MΩ (DMM)' }, { value: '1e10', label: '10 GΩ (low ranges)' }];
const pc = (x: number, d = 2) => Math.abs(x) < 1e-7 ? '≈ 0 %' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + ' %';

export default function DmmLab({ params }: SimProps) {
  const v0: View = params.view === 'loading' || params.view === 'burden' ? params.view : '4wire';
  const init = { view: v0, vs: 5, rs: 1e6, rin: '1e7', vsI: 5, rload: 1000, rsrc: 0, range: '20m', rdut: 0.1, rlead: 0.3, rcon: 0.05, itest: 1e-3, show4: true };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const rin = Number(s.rin);
  const L = useMemo(() => loading(s.vs, s.rs, rin), [s.vs, s.rs, rin]);
  const rng = RANGES.find(r => r.id === s.range)!;
  const B = useMemo(() => burden(s.vsI, s.rload, s.rsrc, rng.rsh, rng.full), [s.vsI, s.rload, s.rsrc, rng]);
  const W = useMemo(() => fourWire(s.rdut, s.rlead, s.rcon, s.itest, 1e10, s.rlead), [s.rdut, s.rlead, s.rcon, s.itest]);

  let controls: any, stage: any, tryThis: any, badge: any, title = '';
  if (s.view === 'loading') {
    title = 'DMM loading: input resistance on a high-impedance node';
    const tone = Math.abs(L.err) < 0.01 ? 'ok' : Math.abs(L.err) < 0.1 ? 'warn' : 'bad';
    badge = Math.abs(L.err) < 0.01 ? { l: 'Negligible loading (<1 %)', c: 'ok' as const } : Math.abs(L.err) < 0.1 ? { l: 'Visible loading error', c: 'warn' as const } : { l: 'Meter dominates the node', c: 'bad' as const };
    const sch = renderCircuit({ elements: [
      { t: 'V', a: [0, 2], b: [0, 6], label: 'V_s', value: si(s.vs, 'V') },
      { t: 'wire', pts: [[0, 2], [0, 0], [1, 0]] },
      { t: 'R', a: [1, 0], b: [6, 0], label: 'R_s', value: si(s.rs, 'Ω') },
      { t: 'wire', pts: [[6, 0], [10, 0]], flow: true }, { t: 'dot', at: [10, 0] },
      { t: 'R', a: [10, 0], b: [10, 5], label: 'R_in', value: si(rin, 'Ω'), color: 'accent' },
            { t: 'wire', pts: [[0, 6], [0, 7], [10, 7], [10, 5]] }, { t: 'gnd', at: [5, 7] },
      { t: 'region', at: [8.6, -2], w: 4.4, h: 8.4, label: 'DMM', color: 'accent' },
      { t: 'text', at: [14.5, 2.6], text: `reads ${si(L.vread, 'V')}`, anchor: 'start', color: tone === 'ok' ? 'green' : 'red' },
    ] }).svg;
    const xs = logspace(100, 1e9, 160);
    controls = <>
      <Slider label="Source voltage Vs" value={s.vs} min={0.1} max={20} step={0.1} unit="V" onChange={upd('vs')} />
      <Slider label="Source resistance Rs" value={s.rs} min={100} max={1e9} log unit="Ω" onChange={upd('rs')} />
      <Seg label="Meter input resistance" value={s.rin} onChange={upd('rin')} options={RINS} />
      <Note>High-impedance nodes (bias dividers, sensors, oscillator pins, charge on a capacitor) need Rin ≫ Rs. The 10 GΩ setting exists only on the lowest voltage ranges.</Note>
    </>;
    stage = <>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: sch }} />
      <Readouts>
        <Readout k="Meter reads" v={si(L.vread, 'V')} hl tone={tone} />
        <Readout k="True open-circuit Vs" v={si(s.vs, 'V')} />
        <Readout k="Loading error" v={pc(L.err)} tone={tone} />
        <Readout k="Meter input current" v={si(L.i, 'A')} />
        <Readout k="Rs for 1 % error" v={si(rsForError(rin, 0.01), 'Ω')} />
      </Readouts>
      <EqBox>{String.raw`V_{read}=V_s\,\frac{R_{in}}{R_s+R_{in}}=${L.ratio.toFixed(4)}\,V_s,\qquad \varepsilon=-\frac{R_s}{R_s+R_{in}}=${(L.err * 100).toFixed(2)}\%`}</EqBox>
      <Plot series={RINS.map((r, i) => ({ x: xs, y: xs.map(rs => 100 * loading(1, rs, Number(r.value)).vread), label: r.label, color: ['orange', 'accent', 'green'][i], width: r.value === s.rin ? 2.6 : 1.2, dashed: r.value !== s.rin }))}
        xLog xUnit="Ω" yUnit="%" xLabel="Source resistance Rs" yLabel="Reading (% of true)" height={240} yRange={[0, 105]} points={[{ x: s.rs, y: 100 * L.ratio, label: 'now', color: 'accent' }]} hlines={[{ at: 99, label: '1 % error', color: 'muted' }]} />
    </>;
    tryThis = <>set R<sub>s</sub> to 10 MΩ with the 10 MΩ meter: it reads exactly half (the two resistors form a 1:1 divider). Drop to 100 kΩ and the error is only 1 %. Select the 10 GΩ input and the same 10 MΩ node reads within 0.1 %. This is why you cannot measure a floating high-Z node (e.g. a gate or crystal pin) with an ordinary meter: probing it changes it.</>;
  } else if (s.view === 'burden') {
    title = 'DMM current mode: shunt burden voltage';
    const tone = Math.abs(B.err) < 0.01 ? 'ok' : Math.abs(B.err) < 0.05 ? 'warn' : 'bad';
    badge = B.over ? { l: `Over range (I > ${si(rng.full, 'A')} full scale)`, c: 'bad' as const } : Math.abs(B.err) < 0.01 ? { l: 'Burden negligible (<1 %)', c: 'ok' as const } : Math.abs(B.err) < 0.05 ? { l: 'Noticeable burden error', c: 'warn' as const } : { l: 'Meter drops too much voltage', c: 'bad' as const };
    const sch = renderCircuit({ elements: [
      { t: 'V', a: [0, 2], b: [0, 6], label: 'V_s', value: si(s.vsI, 'V') },
      { t: 'wire', pts: [[0, 2], [0, 0], [4, 0]] },
      { t: 'R', a: [4, 0], b: [9, 0], label: 'R_{load}', value: si(s.rload + s.rsrc, 'Ω') },
      { t: 'wire', pts: [[9, 0], [12, 0], [12, 1]], flow: true },
      { t: 'A', a: [12, 1], b: [12, 4], label: 'DMM' },
      { t: 'R', a: [12, 4], b: [12, 7], label: 'R_{sh}', value: si(rng.rsh, 'Ω'), color: 'orange' },
      { t: 'wire', pts: [[12, 7], [12, 8], [0, 8], [0, 6]] }, { t: 'gnd', at: [6, 8] },
      { t: 'region', at: [10.4, 0.2], w: 4.4, h: 7.6, label: rng.label + ' range', color: 'accent' },
      { t: 'text', at: [15.6, 3], text: `I = ${si(B.im, 'A')}`, anchor: 'start', color: 'accent' },
      { t: 'text', at: [15.6, 4.6], text: `V_{burden} = ${si(B.vb, 'V')}`, anchor: 'start', color: 'orange' },
    ] }).svg;
    const xs = logspace(1, 1e7, 160);
    controls = <>
      <Slider label="Source voltage Vs" value={s.vsI} min={0.1} max={30} step={0.1} unit="V" onChange={upd('vsI')} />
      <Slider label="Circuit resistance (load)" value={s.rload} min={0.1} max={1e7} log unit="Ω" onChange={upd('rload')} />
      <Seg label="Current range (shunt)" value={s.range} onChange={upd('range')} options={RANGES.map(r => ({ value: r.id, label: r.label }))} />
      <Note>Current ranges put a shunt in series (here {si(rng.rsh, 'Ω')}) so the meter reads the voltage across it. The circuit then carries I = V/(R + R<sub>sh</sub>), not V/R. Full-scale burden on this range ≈ {si(rng.full * rng.rsh, 'V')}.</Note>
    </>;
    stage = <>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: sch }} />
      <Readouts>
        <Readout k="Meter reads" v={si(B.im, 'A')} hl tone={tone} />
        <Readout k="True current (no meter)" v={si(B.i0, 'A')} />
        <Readout k="Burden error" v={pc(B.err)} tone={tone} />
        <Readout k="Burden voltage" v={si(B.vb, 'V')} tone={B.vb > 0.5 ? 'bad' : 'ok'} />
        <Readout k="Power in shunt" v={si(B.pshunt, 'W')} />
        <Readout k="% of full scale" v={(100 * B.im / rng.full).toFixed(0) + ' %'} tone={B.over ? 'bad' : 'ok'} />
      </Readouts>
      <EqBox>{String.raw`I_{meas}=\frac{V_s}{R+R_{sh}},\quad \varepsilon=-\frac{R_{sh}}{R+R_{sh}}=${(B.err * 100).toFixed(2)}\%,\quad V_{burden}=I_{meas}R_{sh}=${B.vb.toPrecision(3)}\,\text{V}`}</EqBox>
      <Plot series={RANGES.map((r, i) => ({ x: xs, y: xs.map(rl => 100 * burden(s.vsI, rl, s.rsrc, r.rsh, r.full).err), label: `${r.label} (${si(r.rsh, 'Ω')})`, color: ['red', 'orange', 'accent', 'green'][i], width: r.id === s.range ? 2.6 : 1.2, dashed: r.id !== s.range }))}
        xLog xUnit="Ω" yUnit="%" xLabel="Circuit resistance R" yLabel="Reading error" height={240} yRange={[-100, 0]} points={[{ x: s.rload + s.rsrc, y: 100 * B.err, label: 'now', color: 'accent' }]} hlines={[{ at: -1, label: '−1 %', color: 'muted' }]} />
    </>;
    tryThis = <>on the 200 µA range the shunt is 1 kΩ. Put it in a 5 V / 10 kΩ circuit: the real current is 0.5 mA, the meter reads 0.4545 mA (−9 %) and 0.45 V disappears across the meter. Switch to the 20 mA range (10 Ω): the error drops to −0.1 %. The rule: the burden resistance must be ≪ the circuit resistance, so pick a range whose R<sub>sh</sub> is at least 100× smaller than the circuit resistance, or measure with a clamp/shunt and voltmeter instead.</>;
  } else {
    title = '2-wire vs 4-wire (Kelvin) resistance';
    const e2 = W.e2, e4 = W.e4;
    badge = Math.abs(e2) < 0.01 ? { l: '2-wire adequate (lead R ≪ DUT)', c: 'ok' as const } : Math.abs(e2) < 0.1 ? { l: '2-wire off by a few %', c: 'warn' as const } : { l: '2-wire dominated by lead resistance', c: 'bad' as const };
    const four = s.show4;
    const el: any[] = four ? [
      { t: 'I', a: [0, 6], b: [0, 2], label: 'I_{test}', value: si(s.itest, 'A') },
      { t: 'wire', pts: [[0, 2], [0, 0], [2, 0]], flow: true },
      { t: 'R', a: [2, 0], b: [6, 0], label: 'R_{lead}', value: si(s.rlead, 'Ω'), color: 'orange' },
      { t: 'wire', pts: [[6, 0], [8, 0], [8, 2]], flow: true },
      { t: 'R', a: [8, 2], b: [8, 5], label: 'R_{DUT}', value: si(s.rdut, 'Ω'), color: 'accent' },
      { t: 'wire', pts: [[8, 5], [8, 7], [6, 7]] },
      { t: 'R', a: [6, 7], b: [2, 7], label: 'R_{lead}', value: si(s.rlead, 'Ω'), color: 'orange', labelSide: 'other' },
      { t: 'wire', pts: [[2, 7], [0, 7], [0, 6]] },
      { t: 'dot', at: [8, 1] }, { t: 'dot', at: [8, 6] },
      { t: 'wire', pts: [[8, 1], [9, 1]] },
      { t: 'R', a: [9, 1], b: [13, 1], label: 'R_{sense}', value: si(s.rlead, 'Ω'), color: 'muted' },
      { t: 'wire', pts: [[13, 1], [15, 1], [15, 2]] },
      { t: 'VM', a: [15, 2], b: [15, 5] },
      { t: 'wire', pts: [[15, 5], [15, 6], [13, 6]] },
      { t: 'R', a: [13, 6], b: [9, 6], label: 'R_{sense}', value: si(s.rlead, 'Ω'), color: 'muted', labelSide: 'other' },
      { t: 'wire', pts: [[9, 6], [8, 6]] },
      { t: 'text', at: [17, 3.5], text: `V = ${si(W.v4, 'V')}`, anchor: 'start', color: 'green' },
    ] : [
      { t: 'VM', a: [-4, 2], b: [-4, 6] },
      { t: 'I', a: [0, 6], b: [0, 2], label: 'I_{test}', value: si(s.itest, 'A') },
      { t: 'wire', pts: [[-4, 2], [-4, 0], [2, 0]] }, { t: 'wire', pts: [[0, 2], [0, 0]], flow: true }, { t: 'dot', at: [0, 0] },
      { t: 'R', a: [2, 0], b: [6, 0], label: 'R_{lead}', value: si(s.rlead, 'Ω'), color: 'orange' },
      { t: 'wire', pts: [[6, 0], [8, 0], [8, 2]], flow: true },
      { t: 'R', a: [8, 2], b: [8, 5], label: 'R_{DUT}', value: si(s.rdut, 'Ω'), color: 'accent' },
      { t: 'wire', pts: [[8, 5], [8, 7], [6, 7]] },
      { t: 'R', a: [6, 7], b: [2, 7], label: 'R_{lead}', value: si(s.rlead, 'Ω'), color: 'orange', labelSide: 'other' },
      { t: 'wire', pts: [[2, 7], [-4, 7], [-4, 6]] }, { t: 'wire', pts: [[0, 6], [0, 7]] }, { t: 'dot', at: [0, 7] },
      { t: 'text', at: [10.5, 3.5], text: `V = ${si(W.v2, 'V')}`, anchor: 'start', color: 'red' },
    ];
    const sch = renderCircuit({ elements: el }).svg;
    const xs = logspace(1e-3, 1e3, 120);
    controls = <>
      <Seg label="Show wiring" value={s.show4 ? '4' : '2'} onChange={v => upd('show4')(v === '4')} options={[{ value: '2', label: '2-wire' }, { value: '4', label: '4-wire (Kelvin)' }]} />
      <Slider label="DUT resistance" value={s.rdut} min={1e-3} max={1e3} log unit="Ω" onChange={upd('rdut')} />
      <Slider label="Lead resistance (each)" value={s.rlead} min={0.001} max={5} log unit="Ω" onChange={upd('rlead')} />
      <Slider label="Contact resistance (each)" value={s.rcon} min={0} max={1} step={0.005} unit="Ω" onChange={upd('rcon')} />
      <Slider label="Test current" value={s.itest} min={100e-6} max={1} log unit="A" onChange={upd('itest')} />
      <Note>The 2-wire reading adds both leads and both contacts to the DUT. In 4-wire mode the voltmeter (10 GΩ) senses directly at the DUT, so lead and contact drops are outside the measurement. DUT dissipation: {si(W.pdut, 'W')}.</Note>
    </>;
    stage = <>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: sch }} />
      <Readouts>
        <Readout k="True R_DUT" v={si(s.rdut, 'Ω')} />
        <Readout k="2-wire reads" v={si(W.r2, 'Ω')} hl tone={Math.abs(e2) < 0.01 ? 'ok' : 'bad'} />
        <Readout k="2-wire error" v={pc(e2, e2 > 10 ? 0 : 1)} tone={Math.abs(e2) < 0.01 ? 'ok' : 'bad'} />
        <Readout k="4-wire reads" v={si(W.r4, 'Ω')} hl tone="ok" />
        <Readout k="4-wire error" v={pc(e4, 6)} tone="ok" />
        <Readout k="Lead + contact drop" v={si(W.vleads, 'V')} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}R_{2w}=R_{DUT}+2R_{lead}+2R_{c}=${num(W.r2, 4)}\,\Omega\\ R_{4w}=\frac{V_{sense}}{I}=R_{DUT}\frac{R_{in}}{R_{in}+2R_{sense}}\approx R_{DUT}\end{gathered}`}</EqBox>
      <Plot series={[{ x: xs, y: xs, label: 'True R_DUT', color: 'muted', dashed: true }, { x: xs, y: xs.map(r => fourWire(r, s.rlead, s.rcon, s.itest, 1e10, s.rlead).r2), label: '2-wire reading', color: 'red' }, { x: xs, y: xs.map(r => fourWire(r, s.rlead, s.rcon, s.itest, 1e10, s.rlead).r4), label: '4-wire reading', color: 'green' }]}
        xLog yLog xUnit="Ω" yUnit="Ω" xLabel="True DUT resistance" yLabel="Meter reading" height={250}
        hlines={[{ at: 2 * s.rlead + 2 * s.rcon, label: 'lead + contact R (2-wire floor)', color: 'orange' }]} points={[{ x: s.rdut, y: W.r2, label: '2-wire now', color: 'red' }, { x: s.rdut, y: W.r4, label: '4-wire now', color: 'green' }]} />
    </>;
    tryThis = <>measure a 0.1 Ω shunt with 0.3 Ω leads: the 2-wire reading is {si(0.1 + 0.6 + 0.1, 'Ω')} (+700 %), nearly all of it the test leads. Switch to 4-wire and the same part reads 0.100 Ω because no sense-lead current flows. Sweep the DUT resistance up to 1 kΩ: the 2-wire error shrinks as R<sub>DUT</sub> ≫ lead resistance, which is why 4-wire matters mostly below about 100 Ω (shunts, traces, relay contacts, cell/connector resistance).</>;
  }

  return (
    <SimShell title={title} onReset={() => set(init)} tryThis={tryThis}
      controls={<><Seg label="Measurement" value={s.view} onChange={upd('view')} options={[{ value: 'loading', label: 'Loading' }, { value: 'burden', label: 'Burden' }, { value: '4wire', label: '4-wire' }]} />{controls}</>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><RegionBadge label={badge.l} color={badge.c} /></div>
      {stage}
    </SimShell>
  );
}
