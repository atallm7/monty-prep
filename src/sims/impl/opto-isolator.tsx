// Opto-isolator design: LED drive current, CTR (ageing / temperature), saturation, pull-up and speed trade-off.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { design, sweepRpull, ctrCurve, simulate } from '../models/opto-isolator';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };

export default function OptoIsolator({ params }: SimProps) {
  const init = { vgpio: n(params.vgpio, 3.3), rled: n(params.rled, 330), ctr: n(params.ctr, 0.5), rpull: n(params.rpull, 4700), vcc: n(params.vcc, 5), aging: 0, temp: 25, cload: 20e-12, fsig: 20e3 };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const d = useMemo(() => design(s), [s]);
  const wc = useMemo(() => design({ ...s, aging: Math.max(s.aging, 0.5), temp: Math.max(s.temp, 85), ctr: s.ctr * 0.5 }), [s]);  // end-of-life, hot, low-bin check
  const sw = useMemo(() => { const rs = logspace(100, 1e6, 60); return { rs, v: sweepRpull(s, rs) }; }, [s]);
  const cc = useMemo(() => { const xs = logspace(0.1e-3, 60e-3, 80); return { xs, y: ctrCurve(s, xs).map(v => v * 100) }; }, [s]);
  const wave = useMemo(() => simulate(s, s.fsig, 2), [s]);

  const schematic = useMemo(() => renderCircuit({ elements: [
    { t: 'box', at: [0, 1], w: 4, h: 4, label: 'MCU', pins: [{ side: 'right', pos: 1, name: 'GPIO' }, { side: 'bottom', pos: 2, name: 'GND' }] },
    { t: 'wire', pts: [[4, 2], [5, 2]], flow: d.iF > 0 }, { t: 'R', a: [5, 2], b: [8, 2], label: 'R_{LED}', value: si(s.rled, 'Ω') },
    { t: 'wire', pts: [[8, 2], [9, 2]], flow: d.iF > 0 },
    { t: 'opto', at: [9, 2] }, { t: 'wire', pts: [[9, 5], [9, 7]], flow: d.iF > 0 }, { t: 'dot', at: [9, 7] },
    { t: 'wire', pts: [[2, 5], [2, 7], [14, 7], [14, 5]], flow: d.iF > 0 }, { t: 'gnd', at: [6, 7] },
    { t: 'text', at: [10.6, 8.8], text: `I_F = ${si(d.iF, 'A')}`, anchor: 'start', color: 'accent' },
    { t: 'rail', at: [14, -1], label: `V_{CC} = ${si(s.vcc, 'V')}`, dir: 'up' }, { t: 'wire', pts: [[14, -1], [14, 0]] },
    { t: 'R', a: [14, 0], b: [14, 2], label: 'R_{pull}', value: si(s.rpull, 'Ω'), color: 'orange' },
    { t: 'wire', pts: [[14, 2], [17, 2]] }, { t: 'dot', at: [14, 2] }, { t: 'term', at: [17, 2], label: 'OUT', side: 'right' },
    { t: 'text', at: [15, 4.2], text: `V_{OL} = ${si(d.vol, 'V')}`, anchor: 'start', color: d.volOk ? 'green' : 'red' },
  ] }).svg, [s, d]);

  const state = d.iF <= 0 ? { l: 'LED off: no light, output high', c: 'info' as const }
    : !d.ledOk ? { l: `I_F = ${si(d.iF, 'A')} exceeds the 50 mA LED rating`, c: 'bad' as const }
    : !d.saturated ? { l: `Not saturated: Ic,max ${si(d.icMax, 'A')} < needed ${si(d.icReq, 'A')}, VOL = ${si(d.vol, 'V')}`, c: 'bad' as const }
    : d.depth < 2 ? { l: `Saturated, depth ${d.depth.toFixed(1)}×: thin margin over CTR spread`, c: 'warn' as const } : { l: `Saturated, depth ${d.depth.toFixed(1)}×: solid low level`, c: 'ok' as const };
  const wcOk = wc.saturated;

  return (
    <SimShell title="Opto-isolator design" onReset={() => set(init)}
      tryThis={<>(1) Increase R<sub>pull</sub> from 4.7 kΩ to 47 kΩ: the output gets a stronger low (deeper saturation) but the rise time grows 10× and the switch-off storage delay grows. (2) Decrease R<sub>pull</sub> to 470 Ω: I<sub>C</sub> needed exceeds CTR·I<sub>F</sub>, so V<sub>OL</sub> no longer reaches ground. (3) Slide ageing to 50 % and temperature to 85 °C and see the end-of-life margin vanish.</>}
      controls={<>
        <Slider label="GPIO voltage" value={s.vgpio} min={1.8} max={12} step={0.1} unit="V" onChange={upd('vgpio')} />
        <Slider label="LED resistor RLED" value={s.rled} min={47} max={10e3} log unit="Ω" onChange={upd('rled')} />
        <Slider label="CTR at 5 mA (nominal)" value={s.ctr} min={0.1} max={2} step={0.05} onChange={upd('ctr')} format={v => (v * 100).toFixed(0) + ' %'} />
        <Slider label="Pull-up RPULL" value={s.rpull} min={100} max={1e6} log unit="Ω" onChange={upd('rpull')} />
        <Slider label="Output supply VCC" value={s.vcc} min={1.8} max={24} step={0.1} unit="V" onChange={upd('vcc')} />
        <Slider label="CTR ageing loss" value={s.aging} min={0} max={0.7} step={0.01} onChange={upd('aging')} format={v => (v * 100).toFixed(0) + ' %'} />
        <Slider label="Temperature" value={s.temp} min={-40} max={110} step={1} unit="°C" format={v => v.toFixed(0) + ' °C'} onChange={upd('temp')} />
        <Slider label="Output load capacitance" value={s.cload} min={1e-12} max={1e-9} log unit="F" onChange={upd('cload')} />
        <Slider label="Signal frequency (waveform)" value={s.fsig} min={1e3} max={500e3} log unit="Hz" onChange={upd('fsig')} />
        <Note>PC817-class: V<sub>F</sub> = 1.2 V @ 20 mA, V<sub>CE(sat)</sub> = 0.2 V, phototransistor lag τ = 2.5 µs, C<sub>CE</sub> = 5 pF. CTR peaks near 5 mA and falls at very low and very high I<sub>F</sub>.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
        <RegionBadge label={state.l} color={state.c} />
        <RegionBadge label={wcOk ? 'Worst case (50 % aged, 85 °C, CTR bin ×0.5) still saturates' : 'Worst case (50 % aged, 85 °C, CTR bin ×0.5) FAILS to saturate'} color={wcOk ? 'ok' : 'bad'} />
      </div>
      <Readouts>
        <Readout k="LED current IF" v={si(d.iF, 'A')} hl tone={d.ledOk ? undefined : 'bad'} />
        <Readout k="LED forward voltage" v={si(d.vf, 'V')} />
        <Readout k="Effective CTR" v={`${(d.ctr * 100).toFixed(0)} %`} />
        <Readout k="Max collector current CTR·IF" v={si(d.icMax, 'A')} />
        <Readout k="Needed (Vcc−Vsat)/Rpull" v={si(d.icReq, 'A')} />
        <Readout k="Saturation depth" v={`${isFinite(d.depth) ? d.depth.toFixed(2) : '∞'}×`} tone={d.saturated ? (d.depth >= 2 ? 'ok' : 'warn') : 'bad'} />
        <Readout k="Output low VOL" v={si(d.vol, 'V')} tone={d.volOk ? 'ok' : 'bad'} />
        <Readout k="Logic-low limit (0.3·Vcc)" v={si(d.vilLimit, 'V')} />
        <Readout k="Rise time (10–90 %)" v={si(d.tr, 's')} />
        <Readout k="Storage / on delay" v={`${si(d.tOffDelay, 's')} / ${isFinite(d.tOnDelay) ? si(d.tOnDelay, 's') : '∞'}`} />
        <Readout k="Min RPULL for saturation" v={si(d.rMinSat, 'Ω')} />
        <Readout k="Approx. max signal frequency" v={si(d.fMax, 'Hz')} />
      </Readouts>
      <EqBox>{String.raw`I_F=\frac{V_{GPIO}-V_F}{R_{LED}}=${(d.iF * 1e3).toFixed(2)}\,\text{mA},\quad I_{C,max}=CTR\cdot I_F=${(d.icMax * 1e3).toFixed(2)}\,\text{mA}\ \ ${d.saturated ? '\\ge' : '<'}\ \ \frac{V_{CC}-V_{sat}}{R_{pull}}=${(d.icReq * 1e3).toFixed(2)}\,\text{mA}`}</EqBox>
      <Plot series={[{ x: wave.t, y: wave.led.map(v => v * s.vcc * 0.2), label: 'LED drive (scaled)', color: 'muted', step: true }, { x: wave.t, y: wave.out, label: 'Output', color: 'accent' }]} xUnit="s" yUnit="V" xLabel={`Output at ${si(s.fsig, 'Hz')}`} yLabel="Voltage" height={210} hlines={[{ at: d.vilLimit, label: 'logic-low limit', color: 'red' }]} />
      <Plot series={[{ x: sw.rs, y: sw.v.map(v => v.tr), label: 'Rise time', color: 'orange' }]} xLog yLog xUnit="Ω" yUnit="s" xLabel="Pull-up resistance" yLabel="Rise time" height={190} vlines={[{ at: d.rMinSat, label: 'min R (saturates)', color: 'red' }]} points={[{ x: s.rpull, y: d.tr, label: 'now', color: 'accent' }]} />
      <Plot series={[{ x: sw.rs, y: sw.v.map(v => v.vol), label: 'VOL', color: 'accent' }]} xLog xUnit="Ω" yUnit="V" xLabel="Pull-up resistance" yLabel="Output low voltage" height={190} hlines={[{ at: d.vilLimit, label: 'logic-low limit', color: 'red' }]} vlines={[{ at: d.rMinSat, label: 'saturation limit', color: 'orange' }]} points={[{ x: s.rpull, y: d.vol, label: 'now', color: 'accent' }]} />
      <Plot series={[{ x: cc.xs, y: cc.y, label: 'CTR (%)', color: 'blue' }]} xLog xUnit="A" xLabel="LED forward current" yLabel="CTR (%)" height={180} vlines={[{ at: d.iF, label: 'IF now', color: 'accent' }]} />
    </SimShell>
  );
}
