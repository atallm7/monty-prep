// GPIO lab: push-pull vs open-drain outputs, floating/pulled inputs, output contention, switch debouncing.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { linspace } from '../../lib/units';
import { DRIVES, Drive, outputDC, outputWave, inputSim, contention, fetI, fetV, debounce } from '../models/gpio-lab';

type View = 'output' | 'input' | 'contention' | 'debounce';
const DRIVE_OPTS = (Object.keys(DRIVES) as Drive[]).map(k => ({ value: k, label: DRIVES[k].label }));
const ABS_MAX_PIN = 25e-3;
const Fig = ({ svg }: { svg: string }) => <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />;
const ms = (v: number) => si(v, 's');

export default function GpioLab({ params }: SimProps) {
  const v0 = String(params.view ?? 'output');
  const init = {
    view: (['output', 'input', 'contention', 'debounce'].includes(v0) ? v0 : 'output') as View,
    vdd: 3.3,
    // output
    mode: 'pushpull' as 'pushpull' | 'opendrain', level: 1 as 0 | 1, rpu: 4700, usePu: false, rl: 10e3, useRl: true, cl: 50e-12, drive: 'medium' as Drive, otherLow: false, fsw: 1e6,
    // input
    pull: 'none' as 'none' | 'up' | 'down', rpull: 40e3, ileak: 5e-9, cin: 5e-12, cc: 1e-12, fagg: 10e3,
    // contention
    aHigh: true, bHigh: false, driveA: 'strong' as Drive, driveB: 'strong' as Drive, rs: 0,
    // debounce
    tb: 2e-3, method: 'none' as 'none' | 'rc' | 'sw', r1: 10e3, r2: 1e3, c: 470e-9, schmitt: true, tsamp: 1e-3, nstable: 5, zoom: 'press' as 'press' | 'full',
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  return (
    <SimShell title="GPIO: outputs, inputs, contention & debouncing" onReset={() => set(init)}
      tryThis={TRY[s.view]}
      controls={<>
        <Select label="Scenario" value={s.view} options={[{ value: 'output', label: 'Output: push-pull vs open-drain' }, { value: 'input', label: 'Input: floating vs pulled' }, { value: 'contention', label: 'Contention: two drivers fight' }, { value: 'debounce', label: 'Debounce a mechanical switch' }]} onChange={upd('view')} />
        <Slider label="Supply VDD" value={s.vdd} min={1.8} max={5} step={0.1} unit="V" onChange={upd('vdd')} />
        {s.view === 'output' && <>
          <Seg label="Output type" value={s.mode} options={[{ value: 'pushpull', label: 'Push-pull' }, { value: 'opendrain', label: 'Open-drain' }]} onChange={upd('mode')} />
          <Seg label="Output register (ODR)" value={String(s.level) as '0' | '1'} options={[{ value: '0', label: 'Write 0' }, { value: '1', label: 'Write 1' }]} onChange={v => upd('level')(Number(v) as 0 | 1)} />
          <Select label="Drive strength" value={s.drive} options={DRIVE_OPTS} onChange={upd('drive')} />
          <Toggle label="Pull-up resistor" checked={s.usePu} onChange={upd('usePu')} />
          {s.usePu && <Slider label="Rpull-up" value={s.rpu} min={220} max={100e3} log unit="Ω" onChange={upd('rpu')} />}
          <Toggle label="Resistive load to GND" checked={s.useRl} onChange={upd('useRl')} />
          {s.useRl && <Slider label="RL" value={s.rl} min={100} max={1e6} log unit="Ω" onChange={upd('rl')} />}
          <Slider label="Load capacitance" value={s.cl} min={5e-12} max={1e-9} log unit="F" onChange={upd('cl')} />
          <Slider label="Toggle frequency (plot)" value={s.fsw} min={1e3} max={20e6} log unit="Hz" onChange={upd('fsw')} />
          <Toggle label="Another device pulls the line low" checked={s.otherLow} onChange={upd('otherLow')} />
        </>}
        {s.view === 'input' && <>
          <Seg label="Input configuration" value={s.pull} options={[{ value: 'none', label: 'Floating' }, { value: 'up', label: 'Pull-up' }, { value: 'down', label: 'Pull-down' }]} onChange={upd('pull')} />
          {s.pull !== 'none' && <Slider label="Pull resistor" value={s.rpull} min={1e3} max={1e6} log unit="Ω" onChange={upd('rpull')} />}
          <Slider label="Pin leakage current" value={s.ileak} min={-50e-9} max={50e-9} step={0.5e-9} unit="A" onChange={upd('ileak')} />
          <Slider label="Pin capacitance Cin" value={s.cin} min={1e-12} max={50e-12} log unit="F" onChange={upd('cin')} />
          <Slider label="Coupling to nearby trace Cc" value={s.cc} min={0.01e-12} max={30e-12} log unit="F" onChange={upd('cc')} />
          <Slider label="Aggressor frequency" value={s.fagg} min={100} max={1e6} log unit="Hz" onChange={upd('fagg')} />
        </>}
        {s.view === 'contention' && <>
          <Seg label="Driver A outputs" value={s.aHigh ? '1' : '0'} options={[{ value: '0', label: '0' }, { value: '1', label: '1' }]} onChange={v => upd('aHigh')(v === '1')} />
          <Seg label="Driver B outputs" value={s.bHigh ? '1' : '0'} options={[{ value: '0', label: '0' }, { value: '1', label: '1' }]} onChange={v => upd('bHigh')(v === '1')} />
          <Select label="Driver A strength" value={s.driveA} options={DRIVE_OPTS} onChange={upd('driveA')} />
          <Select label="Driver B strength" value={s.driveB} options={DRIVE_OPTS} onChange={upd('driveB')} />
          <Slider label="Series resistor Rs" value={s.rs} min={0} max={2000} step={10} unit="Ω" onChange={upd('rs')} />
        </>}
        {s.view === 'debounce' && <>
          <Seg label="Debounce method" value={s.method} options={[{ value: 'none', label: 'None' }, { value: 'rc', label: 'RC + Schmitt' }, { value: 'sw', label: 'Software' }]} onChange={upd('method')} />
          <Slider label="Bounce duration" value={s.tb} min={0} max={10e-3} step={0.1e-3} unit="s" onChange={upd('tb')} />
          {s.method === 'rc' && <>
            <Slider label="R1 (pull-up)" value={s.r1} min={1e3} max={100e3} log unit="Ω" onChange={upd('r1')} />
            <Slider label="R2 (discharge)" value={s.r2} min={10} max={100e3} log unit="Ω" onChange={upd('r2')} />
            <Slider label="C" value={s.c} min={10e-9} max={10e-6} log unit="F" onChange={upd('c')} />
            <Toggle label="Schmitt-trigger input (hysteresis)" checked={s.schmitt} onChange={upd('schmitt')} />
          </>}
          {s.method === 'sw' && <>
            <Slider label="Sample period" value={s.tsamp} min={0.1e-3} max={10e-3} log unit="s" onChange={upd('tsamp')} />
            <Slider label="Stable samples required" value={s.nstable} min={1} max={10} step={1} format={v => String(v)} onChange={v => upd('nstable')(Math.round(v))} />
          </>}
          <Seg label="Plot" value={s.zoom} options={[{ value: 'press', label: 'Zoom on press' }, { value: 'full', label: 'Press + release' }]} onChange={upd('zoom')} />
        </>}
      </>}>
      {s.view === 'output' && <OutputView s={s} />}
      {s.view === 'input' && <InputView s={s} />}
      {s.view === 'contention' && <ContentionView s={s} />}
      {s.view === 'debounce' && <DebounceView s={s} />}
    </SimShell>
  );
}

const TRY: Record<View, JSX.Element> = {
  output: <>(1) Choose <i>Open-drain</i> and write 1. With no pull-up the pin floats, because nothing drives it high. Add a 4.7 kΩ pull-up and look at the plot: the rising edge is now an R<sub>pu</sub>·C curve, hundreds of times slower than the push-pull edge. (2) Tick <i>Another device pulls low</i>. Open-drain gives a clean wired-AND. Push-pull driving 1 becomes a short circuit through two transistors.</>,
  input: <>(1) Leave the input floating. The leakage current ramps the pin, coupling kicks it on every aggressor edge, and the read value toggles at random. The crowbar current also rises while the pin sits mid-rail. (2) Enable a 40 kΩ pull-up: the pin snaps to V<sub>DD</sub> and small kicks die out in τ = R·C. Now raise C<sub>c</sub> to about 20 pF and even the pulled-up input glitches. Lower R<sub>pull</sub> to fix it.</>,
  contention: <>Set A = 1 and B = 0 with strong drives. About 40 to 60 mA flows straight from V<sub>DD</sub> to GND through two FETs, the pin sits at an undefined mid-level, and the abs-max pin current is exceeded. Add R<sub>s</sub> = 330 Ω and the current falls below 10 mA. That is why series resistors protect shared lines during development.</>,
  debounce: <>With no debouncing, one press gives a burst of edges, and an edge-triggered interrupt counts every one. Choose <i>RC + Schmitt</i>: the capacitor smooths the bounce, and the hysteresis prevents multiple crossings as the slow ramp passes the threshold. Untick Schmitt to watch the noise make it chatter. Choose <i>Software</i> and set the stable time (samples × period) longer than the bounce.</>,
};

type St = ReturnType<typeof useStateType>;
function useStateType() { return null as any as { [k: string]: any }; }

// ------------------------------------------------------------------ output
function OutputView({ s }: { s: St }) {
  const dc = useMemo(() => outputDC({ vdd: s.vdd, mode: s.mode, level: s.level, rpu: s.rpu, usePu: s.usePu, rl: s.rl, useRl: s.useRl, cl: s.cl, drive: s.drive, otherLow: s.otherLow }), [s]);
  const w = useMemo(() => outputWave({ vdd: s.vdd, mode: s.mode, level: s.level, rpu: s.rpu, usePu: s.usePu, rl: s.rl, useRl: s.useRl, cl: s.cl, drive: s.drive, otherLow: false }, s.fsw, 2, 800), [s]);
  const od = s.mode === 'opendrain';
  const d = DRIVES[s.drive as Drive];
  const pCol = od ? 'muted' : dc.pOn ? 'green' : undefined;
  const nCol = dc.nOn ? 'green' : undefined;
  const els: any[] = [
    { t: 'rail', at: [6, 1], label: 'V_{DD}', dir: 'up' },
    { t: 'pmos', at: [4, 3], label: od ? 'P (disabled)' : dc.pOn ? 'P on' : 'P off', color: pCol },
    { t: 'nmos', at: [4, 7], label: dc.nOn ? 'N on' : 'N off', color: nCol },
    { t: 'gnd', at: [6, 9] },
    { t: 'wire', pts: [[4, 3], [2, 3], [2, 7], [4, 7]] }, { t: 'dot', at: [2, 5] },
    { t: 'wire', pts: [[2, 5], [0, 5]] }, { t: 'term', at: [0, 5], label: od ? `gate: ${s.level ? 'N off' : 'N on'}` : `ODR = ${s.level}`, side: 'left' },
    { t: 'wire', pts: [[6, 5], [19, 5]], flow: !dc.floating && (dc.iP + dc.iPu > 1e-6 && !dc.nOn) ? true : !dc.floating && dc.nOn && dc.v > 0.01 ? 'reverse' : false },
    { t: 'dot', at: [6, 5] },
    { t: 'region', at: [0.6, 0.2], w: 8.6, h: 10.4, label: 'MCU pin driver', color: 'muted' },
    { t: 'C', a: [11, 5], b: [11, 9], label: 'C_L', value: si(s.cl, 'F') }, { t: 'dot', at: [11, 5] }, { t: 'gnd', at: [11, 9] },
    { t: 'term', at: [19, 5], label: dc.floating ? 'pin: floating' : `pin = ${si(dc.v, 'V')}`, side: 'right' },
  ];
  if (s.usePu) els.push({ t: 'rail', at: [14, 1], label: 'V_{DD}', dir: 'up' }, { t: 'R', a: [14, 1], b: [14, 5], label: 'R_{pu}', value: si(s.rpu, 'Ω'), color: dc.iPu > 1e-6 ? 'orange' : undefined }, { t: 'dot', at: [14, 5] });
  if (s.useRl) els.push({ t: 'R', a: [17, 5], b: [17, 9], label: 'R_L', value: si(s.rl, 'Ω') }, { t: 'dot', at: [17, 5] }, { t: 'gnd', at: [17, 9] });
  if (s.otherLow) els.push({ t: 'nmos', at: [24, 9], flip: true, label: 'other dev.', color: dc.contention ? 'red' : 'green' }, { t: 'wire', pts: [[19, 5], [22, 5], [22, 7]] }, { t: 'gnd', at: [22, 11] });
  const svg = useMemo(() => renderCircuit({ elements: els }).svg, [JSON.stringify(els)]);
  const vih = 0.7 * s.vdd, vil = 0.3 * s.vdd;
  const logic = dc.floating ? 'floating (undefined)' : dc.v >= vih ? 'logic 1' : dc.v <= vil ? 'logic 0' : 'INVALID level';
  const tr = (st: 'pushpull' | 'opendrain') => { const h = outputDC({ vdd: s.vdd, mode: st, level: 1, rpu: s.rpu, usePu: s.usePu, rl: s.rl, useRl: s.useRl, cl: s.cl, drive: s.drive, otherLow: false }); return h.floating ? Infinity : 2.2 * h.tau; };
  return <>
    <Fig svg={svg} />
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <RegionBadge label={`Pin reads ${logic}`} color={dc.floating || (!dc.floating && dc.v > vil && dc.v < vih) ? 'bad' : 'ok'} />
      {dc.contention && <RegionBadge label={`CONTENTION: ${si(dc.iP, 'A')} through P and the other device`} color="bad" />}
      {od && s.level === 1 && !s.usePu && <RegionBadge label="Open-drain '1' = released: needs a pull-up" color="warn" />}
    </div>
    <Readouts>
      <Readout k="Pin voltage" v={dc.floating ? 'floating' : si(dc.v, 'V')} hl />
      <Readout k="Current in P-FET" v={si(dc.iP, 'A')} tone={dc.iP > ABS_MAX_PIN ? 'bad' : undefined} />
      <Readout k="Current in N-FET" v={si(dc.iN, 'A')} tone={dc.iN > ABS_MAX_PIN ? 'bad' : undefined} />
      {s.usePu && <Readout k="Pull-up current" v={si(dc.iPu, 'A')} />}
      {s.useRl && <Readout k="Load current" v={si(dc.iL, 'A')} />}
      <Readout k="Rise 10–90% (PP / OD)" v={`${si(tr('pushpull'), 's')} / ${si(tr('opendrain'), 's')}`} />
      <Readout k="Node τ now" v={si(dc.tau, 's')} />
    </Readouts>
    <EqBox>{od
      ? String.raw`\text{OD high: } V_{pin} = V_{DD}\frac{R_L}{R_{pu}+R_L},\quad t_r = 2.2\,(R_{pu}\parallel R_L)\,C_L = ${si(tr('opendrain'), '\\text{s}')}`
      : String.raw`\text{PP high: } V_{pin} = V_{DD}\frac{R_L}{R_{on,P}+R_L},\quad t_r = 2.2\,(R_{on,P}\parallel R_L)\,C_L = 2.2\cdot ${si(d.ronP, '\\Omega')}\cdot ${si(s.cl, '\\text{F}')} \approx ${si(tr('pushpull'), '\\text{s}')}`}</EqBox>
    <Plot series={[{ x: w.t, y: w.pp, label: 'push-pull', color: s.mode === 'pushpull' ? 'accent' : 'muted', width: s.mode === 'pushpull' ? 2.6 : 1.4 }, { x: w.t, y: w.od, label: s.usePu ? 'open-drain + pull-up' : 'open-drain (no pull-up)', color: s.mode === 'opendrain' ? 'accent' : 'orange', width: s.mode === 'opendrain' ? 2.6 : 1.4, dashed: s.mode !== 'opendrain' }]}
      xUnit="s" yUnit="V" xLabel={`Time (toggling at ${si(s.fsw, 'Hz')})`} yLabel="Pin voltage" height={220} yRange={[-0.1 * s.vdd, 1.1 * s.vdd]}
      hlines={[{ at: vih, label: 'V_IH', color: 'green' }, { at: vil, label: 'V_IL', color: 'orange' }]} />
    <Note>FETs are modelled by their on-resistance (R<sub>on,P</sub> = {si(d.ronP, 'Ω')}, R<sub>on,N</sub> = {si(d.ronN, 'Ω')} for this drive setting), and the pin node is a single RC. Open-drain only ever pulls low, so its rising edge is set entirely by the pull-up.</Note>
  </>;
}

// ------------------------------------------------------------------ input
function InputView({ s }: { s: St }) {
  const r = useMemo(() => inputSim({ vdd: s.vdd, pull: s.pull, rpull: s.rpull, ileak: s.ileak, cin: s.cin, cc: s.cc, fagg: s.fagg, v0: 0.45 * s.vdd, periods: 4 }), [s]);
  const els: any[] = [
    { t: 'Vsq', a: [1, 5], b: [1, 9], label: 'aggressor', value: si(s.fagg, 'Hz') }, { t: 'gnd', at: [1, 9] },
    { t: 'wire', pts: [[1, 5], [1, 4], [3, 4]] },
    { t: 'C', a: [3, 4], b: [7, 4], label: 'C_c', value: si(s.cc, 'F'), color: 'orange' },
    { t: 'wire', pts: [[7, 4], [20, 4]] },
    { t: 'C', a: [9, 4], b: [9, 8], label: 'C_{in}', value: si(s.cin, 'F') }, { t: 'dot', at: [9, 4] }, { t: 'gnd', at: [9, 8] },
    { t: 'I', a: [12, 4], b: [12, 8], label: 'I_{leak}', value: si(s.ileak, 'A'), color: 'red' }, { t: 'dot', at: [12, 4] }, { t: 'gnd', at: [12, 8] },
    { t: 'buf', at: [20, 4], label: 'Schmitt' }, { t: 'wire', pts: [[24, 4], [25, 4]] }, { t: 'term', at: [25, 4], label: 'IDR', side: 'right' },
  ];
  if (s.pull === 'up') els.push({ t: 'rail', at: [16, 0], label: 'V_{DD}', dir: 'up' }, { t: 'R', a: [16, 0], b: [16, 4], label: 'R_{pu}', value: si(s.rpull, 'Ω'), color: 'green' }, { t: 'dot', at: [16, 4] });
  if (s.pull === 'down') els.push({ t: 'R', a: [16, 4], b: [16, 8], label: 'R_{pd}', value: si(s.rpull, 'Ω'), color: 'green' }, { t: 'dot', at: [16, 4] }, { t: 'gnd', at: [16, 8] });
  const svg = useMemo(() => renderCircuit({ elements: els }).svg, [JSON.stringify(els)]);
  const final = r.v[r.v.length - 1];
  return <>
    <Fig svg={svg} />
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <RegionBadge label={r.toggles > 0 ? `${r.toggles} spurious read changes` : 'Stable read value'} color={r.toggles > 0 ? 'bad' : 'ok'} />
      {s.pull === 'none' && <RegionBadge label="Floating: level set by leakage and coupling" color="warn" />}
    </div>
    <Readouts>
      <Readout k="Coupling kick ΔV" v={si(r.kick, 'V')} tone={r.kick > 0.3 * s.vdd ? 'bad' : r.kick > 0.1 * s.vdd ? 'warn' : 'ok'} hl />
      <Readout k="Leakage slew I/C" v={si(Math.abs(s.ileak) / (s.cin + s.cc), 'V/s')} />
      <Readout k="Recovery τ = R·C" v={isFinite(r.tau) ? si(r.tau, 's') : '∞ (floating)'} />
      <Readout k="DC level" v={isFinite(r.vInf) ? si(Math.max(-0.3, Math.min(s.vdd + 0.3, r.vInf)), 'V') : 'undefined'} />
      <Readout k="Avg crowbar current" v={si(r.iAvg, 'A')} tone={r.iAvg > 1e-6 ? 'bad' : 'ok'} />
      <Readout k="Pin at end" v={si(final, 'V')} />
    </Readouts>
    <EqBox>{String.raw`\Delta V_{kick} = V_{DD}\frac{C_c}{C_c + C_{in}} = ${si(r.kick, '\\text{V}')},\qquad \frac{dV}{dt}\Big|_{float} = \frac{I_{leak}}{C_{in}+C_c},\qquad \tau_{pull} = R_{pull}(C_{in}+C_c)`}</EqBox>
    <Plot series={[{ x: r.t, y: r.v, label: 'pin voltage', color: 'accent' }, { x: r.t, y: r.rd, label: 'value read (IDR)', color: 'red', step: true, dashed: true }, { x: r.t, y: r.agg.map(a => a * 0.25 - 0.6 * s.vdd * 0), label: 'aggressor (¼ scale)', color: 'muted', step: true }]}
      xUnit="s" yUnit="V" xLabel="Time" yLabel="Voltage" height={230} yRange={[-0.45, s.vdd + 0.45]}
      hlines={[{ at: 0.7 * s.vdd, label: 'V_IH', color: 'green' }, { at: 0.3 * s.vdd, label: 'V_IL', color: 'orange' }]} />
    <Note>When the pin sits between V<sub>IL</sub> and V<sub>IH</sub>, both transistors of the CMOS input buffer conduct and draw crowbar current. Unused pins should be tied off or pulled, or set to analog mode. ESD diodes clamp the pin at −0.3 V and V<sub>DD</sub> + 0.3 V.</Note>
  </>;
}

// ------------------------------------------------------------------ contention
function ContentionView({ s }: { s: St }) {
  const c = useMemo(() => contention({ vdd: s.vdd, aHigh: s.aHigh, bHigh: s.bHigh, driveA: s.driveA, driveB: s.driveB, rs: s.rs }), [s]);
  const hi = DRIVES[(s.aHigh ? s.driveA : s.driveB) as Drive], lo = DRIVES[(s.aHigh ? s.driveB : s.driveA) as Drive];
  const fight = c.fight;
  const colA = (on: boolean) => on ? (fight ? 'red' : 'green') : undefined;
  const els: any[] = [
    { t: 'rail', at: [4, 1], label: 'V_{DD}', dir: 'up' }, { t: 'rail', at: [16, 1], label: 'V_{DD}', dir: 'up' },
    { t: 'pmos', at: [2, 3], label: 'P_A', color: colA(s.aHigh) }, { t: 'nmos', at: [2, 7], label: 'N_A', color: colA(!s.aHigh) },
    { t: 'pmos', at: [18, 3], flip: true, label: 'P_B', color: colA(s.bHigh) }, { t: 'nmos', at: [18, 7], flip: true, label: 'N_B', color: colA(!s.bHigh) },
    { t: 'gnd', at: [4, 9] }, { t: 'gnd', at: [16, 9] },
    { t: 'term', at: [2, 5], label: `A = ${s.aHigh ? 1 : 0}`, side: 'left' }, { t: 'wire', pts: [[2, 3], [2, 7]] }, { t: 'dot', at: [2, 5] },
    { t: 'term', at: [18, 5], label: `B = ${s.bHigh ? 1 : 0}`, side: 'right' }, { t: 'wire', pts: [[18, 3], [18, 7]] }, { t: 'dot', at: [18, 5] },
    { t: 'dot', at: [4, 5] }, { t: 'dot', at: [16, 5] },
    ...(s.rs > 0 ? [{ t: 'wire', pts: [[4, 5], [8, 5]], flow: fight ? (s.aHigh ? true : 'reverse') : false }, { t: 'R', a: [8, 5], b: [12, 5], label: 'R_s', value: si(s.rs, 'Ω') }, { t: 'wire', pts: [[12, 5], [16, 5]], flow: fight ? (s.aHigh ? true : 'reverse') : false }]
      : [{ t: 'wire', pts: [[4, 5], [16, 5]], flow: fight ? (s.aHigh ? true : 'reverse') : false }]),
    { t: 'text', at: [10, 7.4], text: fight ? `I = ${si(c.i, 'A')}` : 'no current', color: fight ? 'red' : 'green', anchor: 'middle' },
  ];
  const svg = useMemo(() => renderCircuit({ elements: els }).svg, [JSON.stringify(els)]);
  // load lines: current available from the high-side P vs the pin voltage at the high driver, and current
  // drawn by (Rs + low-side N) vs the same voltage. Intersection = operating point.
  const ll = useMemo(() => {
    const vs = linspace(0, s.vdd, 200);
    const iP = vs.map(v => fetI(s.vdd - v, hi.ronP, hi.isatP));
    const is = linspace(0, Math.max(hi.isatP, lo.isatN) * 1.4, 300);
    const vN = is.map(i => fetV(i, lo.ronN, lo.isatN) + i * s.rs);
    return { vs, iP, is, vN };
  }, [s.vdd, s.rs, hi, lo]);
  const vHiPin = s.vdd - c.vdsP;
  const vih = 0.7 * s.vdd, vil = 0.3 * s.vdd;
  const lvl = (v: number) => v >= vih ? '1' : v <= vil ? '0' : 'undefined';
  return <>
    <Fig svg={svg} />
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {fight ? <RegionBadge label={c.i > ABS_MAX_PIN ? `Exceeds ${si(ABS_MAX_PIN, 'A')} abs-max pin current` : 'Contention, current limited'} color={c.i > ABS_MAX_PIN ? 'bad' : 'warn'} /> : <RegionBadge label="Drivers agree: no current" color="ok" />}
      {fight && <RegionBadge label={`Line reads: A-side ${lvl(c.vA)}, B-side ${lvl(c.vB)}`} color={lvl(c.vA) === 'undefined' || lvl(c.vB) === 'undefined' ? 'bad' : 'info'} />}
    </div>
    <Readouts>
      <Readout k="Fight current" v={si(c.i, 'A')} hl tone={c.i > ABS_MAX_PIN ? 'bad' : c.i > 5e-3 ? 'warn' : 'ok'} />
      <Readout k="Pin A voltage" v={si(c.vA, 'V')} />
      <Readout k="Pin B voltage" v={si(c.vB, 'V')} />
      <Readout k="Power in P-FET" v={si(c.pP, 'W')} />
      <Readout k="Power in N-FET" v={si(c.pN, 'W')} />
      {s.rs > 0 && <Readout k="Power in Rs" v={si(c.pRs, 'W')} />}
      <Readout k="Total from supply" v={si(c.i * s.vdd, 'W')} />
    </Readouts>
    <EqBox>{String.raw`V_{DD} = V_{DS,P}(I) + I R_s + V_{DS,N}(I) \;\Rightarrow\; I = ${si(c.i, '\\text{A}')}\quad(\approx \tfrac{V_{DD}}{R_{on,P}+R_s+R_{on,N}} = ${si(s.vdd / (hi.ronP + s.rs + lo.ronN), '\\text{A}')}\ \text{if linear})`}</EqBox>
    {fight && <Plot series={[{ x: ll.vs, y: ll.iP, label: 'P (high side) can source', color: 'red' }, { x: ll.vN, y: ll.is, label: 'Rs + N (low side) sinks', color: 'blue' }]}
      xUnit="V" yUnit="A" xLabel="Voltage at the high-driving pin" yLabel="Current" height={220} xRange={[0, s.vdd]}
      hlines={[{ at: ABS_MAX_PIN, label: 'abs-max pin current', color: 'orange' }]}
      points={[{ x: vHiPin, y: c.i, label: 'operating point', color: 'accent' }]} />}
    <Note>FETs use a square-law model: linear (R<sub>on</sub>) at small V<sub>DS</sub>, saturating at I<sub>sat</sub>. Strong drivers saturate in a dead short. The current is then set by I<sub>sat</sub>, not by R<sub>on</sub>, which is why the linear estimate overshoots.</Note>
  </>;
}

// ------------------------------------------------------------------ debounce
function DebounceView({ s }: { s: St }) {
  const r = useMemo(() => debounce({ vdd: s.vdd, tb: s.tb, method: s.method, r1: s.r1, r2: s.r2, c: s.c, schmitt: s.schmitt, tsamp: s.tsamp, nstable: s.nstable, noise: 0.03 * s.vdd }), [s]);
  const els: any[] = s.method === 'rc' ? [
    { t: 'rail', at: [4, 0], label: 'V_{DD}', dir: 'up' }, { t: 'R', a: [4, 0], b: [4, 4], label: 'R_1', value: si(s.r1, 'Ω') },
    { t: 'PB', a: [4, 4], b: [4, 8], label: 'SW' }, { t: 'gnd', at: [4, 8] }, { t: 'dot', at: [4, 4] },
    { t: 'wire', pts: [[4, 4], [6, 4]] }, { t: 'R', a: [6, 4], b: [10, 4], label: 'R_2', value: si(s.r2, 'Ω') },
    { t: 'wire', pts: [[10, 4], [14, 4]] }, { t: 'C', a: [12, 4], b: [12, 8], label: 'C', value: si(s.c, 'F') }, { t: 'dot', at: [12, 4] }, { t: 'gnd', at: [12, 8] },
    { t: s.schmitt ? 'buf' : 'buf', at: [14, 4], label: s.schmitt ? 'Schmitt' : 'plain' }, { t: 'wire', pts: [[18, 4], [19, 4]] }, { t: 'term', at: [19, 4], label: 'MCU', side: 'right' },
  ] : [
    { t: 'rail', at: [4, 0], label: 'V_{DD}', dir: 'up' }, { t: 'R', a: [4, 0], b: [4, 4], label: 'R_{pu}', value: '10 kΩ' },
    { t: 'PB', a: [4, 4], b: [4, 8], label: 'SW' }, { t: 'gnd', at: [4, 8] }, { t: 'dot', at: [4, 4] },
    { t: 'wire', pts: [[4, 4], [9, 4]] }, { t: 'box', at: [9, 2], w: 6, h: 4, label: s.method === 'sw' ? `sample every\n${ms(s.tsamp)}, need ${s.nstable}` : 'EXTI\n(edge IRQ)', pins: [{ side: 'left', pos: 2, name: '' }] },
  ];
  const svg = useMemo(() => renderCircuit({ elements: els }).svg, [JSON.stringify(els)]);
  const xr: [number, number] = s.zoom === 'press' ? [1.5e-3, Math.min(20e-3, 2e-3 + Math.max(s.tb, 0.5e-3) + Math.max(isFinite(r.delay) ? r.delay : 0, 1e-3) + 1.5e-3)] : [0, 42e-3];
  const tauC = (s.r1 + s.r2) * s.c, tauD = s.r2 * s.c;
  const series: any[] = [{ x: r.t, y: r.raw.map((v: number) => v + 0.04 * s.vdd), label: 'switch node (raw)', color: 'muted', step: true }];
  if (s.method === 'rc') series.push({ x: r.t, y: r.node, label: 'capacitor voltage', color: 'blue' });
  series.push({ x: r.t, y: r.out.map((v: number) => v * 0.92), label: s.method === 'none' ? 'what the IRQ sees' : 'debounced output', color: 'red', step: true, width: 2.4 });
  return <>
    <Fig svg={svg} />
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <RegionBadge label={r.outEdges === 2 ? 'Clean: 1 press + 1 release' : `${r.outEdges} edges for 1 press + 1 release`} color={r.outEdges === 2 ? 'ok' : 'bad'} />
    </div>
    <Readouts>
      <Readout k="Raw edges (2 expected)" v={String(r.rawEdges)} tone={r.rawEdges > 2 ? 'warn' : 'ok'} />
      <Readout k="Output edges" v={String(r.outEdges)} hl tone={r.outEdges === 2 ? 'ok' : 'bad'} />
      <Readout k="Press → output delay" v={isFinite(r.delay) ? ms(r.delay) : 'never'} />
      {s.method === 'rc' && <Readout k="τ discharge R2·C" v={ms(tauD)} />}
      {s.method === 'rc' && <Readout k="τ charge (R1+R2)·C" v={ms(tauC)} />}
      {s.method === 'sw' && <Readout k="Stable window" v={ms(s.tsamp * s.nstable)} tone={s.tsamp * s.nstable > s.tb ? 'ok' : 'bad'} />}
    </Readouts>
    {s.method === 'rc' ? <EqBox>{String.raw`v_C(t) = V_{DD}\,e^{-t/R_2C}\ (\text{closed}),\quad t_{release} = (R_1+R_2)C\,\ln\frac{V_{DD}}{V_{DD}-V_{T+}} = ${ms(tauC * Math.log(1 / (1 - r.vtp / s.vdd)))}`}</EqBox>
      : s.method === 'sw' ? <EqBox>{String.raw`t_{stable} = N\cdot T_s = ${s.nstable}\cdot ${ms(s.tsamp)} = ${ms(s.nstable * s.tsamp)}\ \stackrel{?}{>}\ t_{bounce} = ${ms(s.tb)}`}</EqBox>
      : <EqBox>{String.raw`\text{edges seen} = ${r.rawEdges}\ \text{for 2 real transitions}`}</EqBox>}
    <Plot series={series} xUnit="s" yUnit="V" xLabel="Time" yLabel="Voltage" height={230} xRange={xr} yRange={[-0.2, s.vdd * 1.15]}
      hlines={s.method === 'rc' ? (s.schmitt ? [{ at: r.vtp, label: 'V_T+', color: 'green' }, { at: r.vtn, label: 'V_T−', color: 'orange' }] : [{ at: r.vtp, label: 'single threshold', color: 'orange' }]) : []}
      xspans={[{ from: 2e-3, to: 2e-3 + s.tb, label: 'bounce', color: 'orange' }, { from: 22e-3, to: 22e-3 + s.tb, label: 'bounce', color: 'orange' }]} />
    <Note>Bounce is generated as a seeded random burst of contact openings and closings with shrinking gaps. Typical tactile switches bounce for 0.1 to 5 ms. The RC node is solved exactly between contact events and includes 3% input noise.</Note>
  </>;
}
