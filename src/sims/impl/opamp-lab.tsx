// Op-amp configurations lab: nine classic circuits, ideal vs real op-amp (A0, GBW, SR, rail headroom).
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Select, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot, { type Series } from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { simulate, measuredGain, idealGain, beta, finiteGain, CONFIGS, type Config, type Wave } from '../models/opamp-lab';

const LABELS: Record<Config, string> = {
  inverting: 'Inverting', noninverting: 'Non-inverting', buffer: 'Voltage follower (buffer)', difference: 'Difference amplifier', summing: 'Summing (inverting)',
  integrator: 'Integrator', differentiator: 'Differentiator', comparator: 'Open-loop comparator', schmitt: 'Schmitt trigger (inverting)',
};
// Component values that make each configuration show something sensible when selected
const DEFAULTS: Record<Config, { r1: number; r2: number; c: number; wave?: Wave }> = {
  inverting: { r1: 10e3, r2: 100e3, c: 10e-9 }, noninverting: { r1: 10e3, r2: 100e3, c: 10e-9 }, buffer: { r1: 10e3, r2: 100e3, c: 10e-9 },
  difference: { r1: 10e3, r2: 100e3, c: 10e-9 }, summing: { r1: 10e3, r2: 47e3, c: 10e-9 },
  integrator: { r1: 10e3, r2: 1e6, c: 10e-9, wave: 'square' }, differentiator: { r1: 100, r2: 10e3, c: 10e-9, wave: 'triangle' },
  comparator: { r1: 10e3, r2: 100e3, c: 10e-9 }, schmitt: { r1: 10e3, r2: 100e3, c: 10e-9, wave: 'sine' },
};

type El = Record<string, any>;
function schematic(cfg: Config, s: { r1: number; r2: number; c: number; v2: number; vpos: number; vneg: number }, vo: string, bad: boolean): string {
  const R = (v: number) => si(v, 'Ω'), Cv = si(s.c, 'F');
  const ox = cfg === 'differentiator' ? 10 : 8; // op-amp x
  const out = ox + 4, fx = ox + 5; // output pin x, feedback return column
  const swap = cfg === 'noninverting' || cfg === 'buffer' || cfg === 'comparator';
  const e: El[] = [{ t: 'opamp', at: [ox, 4], supply: true, vpos: `${si(s.vpos, 'V')}`, vneg: `${si(s.vneg, 'V')}`, swap }];
  // output
  e.push({ t: 'wire', pts: [[out, 4], [fx + 2, 4]] }, { t: 'term', at: [fx + 2, 4], label: 'V_{out}', side: 'right', color: bad ? 'red' : 'accent' });
  e.push({ t: 'text', at: [fx + 2, 5.4], text: vo, anchor: 'middle', color: bad ? 'red' : 'accent', size: 12 });
  const invFeedback = (els: El[]) => e.push(...els);
  const topFb = (y: number, part: El) => {
    // feedback element from the − node column (ox−1) at row y to the output column
    invFeedback([{ t: 'wire', pts: [[ox - 1, 3], [ox - 1, y]] }, { ...part, a: [ox - 1, y], b: [fx - 1, y] }, { t: 'wire', pts: [[fx - 1, y], [fx, y], [fx, 4]] }, { t: 'dot', at: [fx, 4] }]);
  };
  const plusGnd = () => e.push({ t: 'wire', pts: [[ox, 5], [ox - 1, 5], [ox - 1, 6.2]] }, { t: 'gnd', at: [ox - 1, 6.2] });
  const bottomNet = (withR1: boolean, label1: string) => {
    // − input at bottom (swap) or + input for Schmitt, node P at (ox−1, 7) with R1 to gnd and R2 to output
    e.push({ t: 'wire', pts: [[ox, 5], [ox - 1, 5], [ox - 1, 7]] });
    if (withR1) e.push({ t: 'R', a: [ox - 1, 7], b: [ox - 1, 10.5], label: label1, value: R(s.r1), labelSide: 'other' }, { t: 'gnd', at: [ox - 1, 10.5] }, { t: 'dot', at: [ox - 1, 7] });
    e.push({ t: 'wire', pts: [[ox - 1, 7], [ox, 7]] });
    if (withR1) e.push({ t: 'R', a: [ox, 7], b: [fx - 1, 7], label: 'R_2', value: R(s.r2), labelSide: 'other' });
    else e.push({ t: 'wire', pts: [[ox, 7], [fx - 1, 7]] });
    e.push({ t: 'wire', pts: [[fx - 1, 7], [fx, 7], [fx, 4]] }, { t: 'dot', at: [fx, 4] });
  };
  switch (cfg) {
    case 'inverting':
      e.push({ t: 'term', at: [1, 3], label: 'v_{in}', side: 'left' }, { t: 'R', a: [1, 3], b: [5, 3], label: 'R_1', value: R(s.r1) }, { t: 'wire', pts: [[5, 3], [ox, 3]] }, { t: 'dot', at: [ox - 1, 3] });
      topFb(0, { t: 'R', label: 'R_2', value: R(s.r2) }); plusGnd(); break;
    case 'summing':
      e.push({ t: 'term', at: [1, 3], label: 'v_{in}', side: 'left' }, { t: 'R', a: [1, 3], b: [5, 3], label: 'R_1', value: R(s.r1) }, { t: 'wire', pts: [[5, 3], [ox, 3]] }, { t: 'dot', at: [ox - 1, 3] });
      e.push({ t: 'term', at: [1, 1], label: `V_2 = ${si(s.v2, 'V')}`, side: 'left' }, { t: 'R', a: [1, 1], b: [5, 1], label: 'R_1', value: R(s.r1) }, { t: 'wire', pts: [[5, 1], [ox - 1, 1]] }, { t: 'dot', at: [ox - 1, 1] });
      topFb(-1.5, { t: 'R', label: 'R_2', value: R(s.r2) }); plusGnd(); break;
    case 'difference':
      e.push({ t: 'term', at: [1, 3], label: `V_1 = ${si(s.v2, 'V')}`, side: 'left' }, { t: 'R', a: [1, 3], b: [5, 3], label: 'R_1', value: R(s.r1) }, { t: 'wire', pts: [[5, 3], [ox, 3]] }, { t: 'dot', at: [ox - 1, 3] });
      topFb(0, { t: 'R', label: 'R_2', value: R(s.r2) });
      e.push({ t: 'term', at: [1, 5], label: 'V_2 = v_{in}', side: 'left' }, { t: 'R', a: [1, 5], b: [5, 5], label: 'R_1', value: R(s.r1), labelSide: 'other' }, { t: 'wire', pts: [[5, 5], [ox, 5]] }, { t: 'dot', at: [ox - 1, 5] },
        { t: 'R', a: [ox - 1, 5], b: [ox - 1, 9], label: 'R_2', value: R(s.r2) }, { t: 'gnd', at: [ox - 1, 9] });
      break;
    case 'integrator':
      e.push({ t: 'term', at: [1, 3], label: 'v_{in}', side: 'left' }, { t: 'R', a: [1, 3], b: [5, 3], label: 'R_1', value: R(s.r1) }, { t: 'wire', pts: [[5, 3], [ox, 3]] }, { t: 'dot', at: [ox - 1, 3] });
      topFb(-2.5, { t: 'R', label: 'R_2 (bleed)', value: R(s.r2) });
      e.push({ t: 'C', a: [ox - 1, 0.5], b: [fx - 1, 0.5], label: 'C', value: Cv }, { t: 'wire', pts: [[fx - 1, 0.5], [fx, 0.5]] }, { t: 'dot', at: [ox - 1, 0.5] }, { t: 'dot', at: [fx, 0.5] });
      plusGnd(); break;
    case 'differentiator':
      e.push({ t: 'term', at: [1, 3], label: 'v_{in}', side: 'left' }, { t: 'R', a: [1, 3], b: [4.5, 3], label: 'R_1', value: R(s.r1) }, { t: 'C', a: [4.5, 3], b: [8, 3], label: 'C', value: Cv }, { t: 'wire', pts: [[8, 3], [ox, 3]] }, { t: 'dot', at: [ox - 1, 3] });
      topFb(0, { t: 'R', label: 'R_2', value: R(s.r2) }); plusGnd(); break;
    case 'noninverting':
      e.push({ t: 'term', at: [1, 3], label: 'v_{in}', side: 'left' }, { t: 'wire', pts: [[1, 3], [ox, 3]] });
      bottomNet(true, 'R_1'); break;
    case 'buffer':
      e.push({ t: 'term', at: [1, 3], label: 'v_{in}', side: 'left' }, { t: 'wire', pts: [[1, 3], [ox, 3]] });
      bottomNet(false, ''); break;
    case 'comparator':
      e.push({ t: 'term', at: [1, 3], label: 'v_{in}', side: 'left' }, { t: 'wire', pts: [[1, 3], [ox, 3]] },
        { t: 'wire', pts: [[ox, 5], [ox - 2, 5]] }, { t: 'V', a: [ox - 2, 5], b: [ox - 2, 9], label: 'V_{ref}', value: si(s.v2, 'V') }, { t: 'gnd', at: [ox - 2, 9] });
      break;
    case 'schmitt':
      e.push({ t: 'term', at: [1, 3], label: 'v_{in}', side: 'left' }, { t: 'wire', pts: [[1, 3], [ox, 3]] });
      bottomNet(true, 'R_1'); break;
  }
  return renderCircuit({ elements: e }).svg;
}

export default function OpampLab({ params }: SimProps) {
  const cfg0 = (CONFIGS as string[]).includes(params.config) ? params.config as Config : 'inverting';
  const d0 = DEFAULTS[cfg0];
  const wave0: Wave = ['dc', 'sine', 'square', 'triangle'].includes(params.wave) ? params.wave : (d0.wave ?? 'sine');
  const init = {
    config: cfg0, r1: Number(params.r1 ?? d0.r1), r2: Number(params.r2 ?? d0.r2), c: Number(params.c ?? d0.c),
    vin: Number(params.vin ?? 1), wave: wave0, f: Number(params.f ?? 1e3), vpos: Number(params.vpos ?? 12), vneg: Number(params.vneg ?? -12),
    real: Boolean(params.real ?? false), a0: 1e5, gbw: 1e6, sr: 0.5e6, headroom: 1.5, v2: 0,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const setConfig = (c: Config) => set(p => ({ ...p, config: c, r1: DEFAULTS[c].r1, r2: DEFAULTS[c].r2, c: DEFAULTS[c].c, wave: DEFAULTS[c].wave ?? p.wave, v2: c === 'difference' ? 0.2 : 0 }));

  const o = useMemo(() => simulate(s), [s]);
  const gI = idealGain(s);
  const b = beta(s.config, s.r1, s.r2);
  const resistive = ['inverting', 'noninverting', 'buffer', 'difference', 'summing'].includes(s.config);
  const openLoop = s.config === 'comparator' || s.config === 'schmitt';
  const gMeas = measuredGain(o);
  const gFinite = resistive && s.real ? finiteGain(gI.mag, s.a0, b) : gI.mag;
  const fcl = s.real && resistive ? s.gbw * b : Infinity;
  const fpbw = s.real ? s.sr / (2 * Math.PI * Math.max(1e-6, Math.min(o.voutPk, Math.max(s.vpos, -s.vneg)))) : Infinity;
  const region = openLoop ? (o.slewLimited ? { l: 'Saturated (slew-limited edges)', c: 'warn' as const } : { l: 'Saturated: output at a rail', c: 'info' as const })
    : o.clipped ? { l: 'Clipping at the rail', c: 'bad' as const } : o.slewLimited ? { l: 'Slew-rate limited', c: 'warn' as const } : { l: 'Linear (virtual short holds)', c: 'ok' as const };

  const voText = s.wave === 'dc' && !(s.config === 'integrator') ? `${si(o.vout[o.vout.length - 1], 'V')}` : `${si(o.voutMax, 'V')} / ${si(o.voutMin, 'V')}`;
  const svg = useMemo(() => schematic(s.config, s, voText, o.clipped && !openLoop), [s, voText, o.clipped, openLoop]);

  const ms = o.t.map(t => t);
  const tUnit = 's';
  const series: Series[] = [
    { x: ms, y: o.vin, label: s.config === 'difference' ? 'V₂ = vin(t)' : 'vin(t)', color: 'green' },
    { x: ms, y: o.vout, label: 'vout(t)', color: 'accent', width: 2.4 },
  ];
  if (s.real && resistive) series.push({ x: ms, y: o.vminus, label: 'v− (inverting input)', color: 'orange', dashed: true });
  const hl: { at: number; label?: string; color?: string }[] = [
    { at: o.railHi, label: s.real ? 'max swing' : 'V+ rail', color: 'red' }, { at: o.railLo, label: s.real ? 'min swing' : 'V− rail', color: 'red' },
  ];
  if (s.config === 'comparator') hl.push({ at: s.v2, label: 'Vref', color: 'purple' });
  if (o.thresholds) hl.push({ at: o.thresholds[1], label: '±V_{TH}', color: 'purple' }, { at: o.thresholds[0], color: 'purple' });
  if (s.config === 'difference' || s.config === 'summing') hl.push({ at: s.v2, label: s.config === 'difference' ? 'V₁' : 'V₂', color: 'muted' });
  const yAbs = Math.max(o.railHi, -o.railLo, Math.abs(s.vin)) * 1.1;

  const eq = (() => {
    const r1 = si(s.r1, '\\Omega'), r2 = si(s.r2, '\\Omega'), c = si(s.c, 'F');
    switch (s.config) {
      case 'inverting': return String.raw`v_{out} = -\frac{R_2}{R_1}v_{in} = -\frac{${r2}}{${r1}}v_{in} = ${(-s.r2 / s.r1).toPrecision(3)}\,v_{in}`;
      case 'noninverting': return String.raw`v_{out} = \left(1+\frac{R_2}{R_1}\right)v_{in} = ${(1 + s.r2 / s.r1).toPrecision(3)}\,v_{in}`;
      case 'buffer': return String.raw`v_{out} = v_{in}\quad(\beta = 1,\ \text{BW} = \text{GBW})`;
      case 'difference': return String.raw`v_{out} = \frac{R_2}{R_1}(V_2 - V_1) = ${(s.r2 / s.r1).toPrecision(3)}\,(v_{in} - ${s.v2.toFixed(2)}\,\text{V})`;
      case 'summing': return String.raw`v_{out} = -\frac{R_2}{R_1}(v_{in} + V_2) = ${(-s.r2 / s.r1).toPrecision(3)}\,(v_{in} + ${s.v2.toFixed(2)}\,\text{V})`;
      case 'integrator': return String.raw`v_{out} = -\frac{1}{R_1C}\int v_{in}\,dt,\quad \frac{1}{R_1C} = \frac{1}{${r1}\cdot ${c}} = ${si(1 / (s.r1 * s.c), '')}\,\text{s}^{-1},\quad |H(f)| = ${gI.mag.toPrecision(3)}`;
      case 'differentiator': return String.raw`v_{out} = -R_2C\,\frac{dv_{in}}{dt},\quad R_2C = ${si(s.r2 * s.c, 's')},\quad |H(f)| = \frac{\omega R_2C}{\sqrt{1+(\omega R_1C)^2}} = ${gI.mag.toPrecision(3)}`;
      case 'comparator': return String.raw`v_{out} = \begin{cases} V_{OH} & v_{in} > V_{ref}=${s.v2.toFixed(2)}\,\text{V} \\ V_{OL} & v_{in} < V_{ref}\end{cases}`;
      case 'schmitt': return String.raw`V_{TH\pm} = V_{OH/OL}\frac{R_1}{R_1+R_2} = \pm ${(o.thresholds?.[1] ?? 0).toFixed(3)}\,\text{V},\quad \text{hysteresis} = ${((o.thresholds?.[1] ?? 0) - (o.thresholds?.[0] ?? 0)).toFixed(3)}\,\text{V}`;
    }
  })();

  const v2Label = s.config === 'difference' ? 'V1 (DC, inverting side)' : s.config === 'summing' ? 'V2 (DC, second input)' : 'Vref (comparator threshold)';
  const showC = s.config === 'integrator' || s.config === 'differentiator';
  const showR = s.config !== 'buffer' && s.config !== 'comparator';

  return (
    <SimShell title="Op-amp configurations lab" onReset={() => set(init)}
      tryThis={<>{s.config === 'inverting' || s.config === 'noninverting' ? <>raise v<sub>in</sub> until the output hits the rail and the waveform flattens; then enable the real op-amp and push f toward GBW/(1+R2/R1): the gain drops by 3 dB and v<sub>−</sub> stops tracking v<sub>+</sub>.</>
        : s.config === 'integrator' ? <>switch the input to DC: the integrator ramps straight into a rail, which is why practical integrators carry a bleed resistor R2 or a reset switch. A square wave gives a triangle of peak-to-peak V·T/(2R1C).</>
          : s.config === 'differentiator' ? <>feed a triangle (square out) and then a square (spikes). Shrink R1 to 10 Ω with the real op-amp on: the ringing shows why an unstabilised differentiator is a bad idea.</>
            : s.config === 'schmitt' ? <>use a 1 V sine: it never crosses the thresholds, so the output never switches. Raise it to 2 V and see the switching points at ±V<sub>TH</sub>, not at zero.</>
              : <>enable the real op-amp, set a 5 V sine at 100 kHz and drop SR to 0.5 V/µs: the output becomes a triangle because 2πfV<sub>p</sub> exceeds the slew rate.</>}</>}
      controls={<>
        <Select label="Configuration" value={s.config} options={CONFIGS.map(c => ({ value: c, label: LABELS[c] }))} onChange={setConfig} />
        <Seg label="Input waveform" value={s.wave} options={[{ value: 'dc', label: 'DC' }, { value: 'sine', label: 'Sine' }, { value: 'square', label: 'Square' }, { value: 'triangle', label: 'Tri' }]} onChange={upd('wave')} />
        <Slider label={s.wave === 'dc' ? 'vin (DC level)' : 'vin amplitude'} value={s.vin} min={-10} max={10} step={0.01} unit="V" onChange={upd('vin')} />
        <Slider label="Frequency f" value={s.f} min={1} max={1e6} log unit="Hz" onChange={upd('f')} />
        {(s.config === 'difference' || s.config === 'summing' || s.config === 'comparator') && <Slider label={v2Label} value={s.v2} min={-5} max={5} step={0.01} unit="V" onChange={upd('v2')} />}
        {showR && <Slider label={s.config === 'differentiator' ? 'R1 (series, HF limit)' : 'R1'} value={s.r1} min={10} max={10e6} log unit="Ω" onChange={upd('r1')} />}
        {showR && <Slider label={s.config === 'integrator' ? 'R2 (bleed, ∥ C)' : 'R2 (feedback)'} value={s.r2} min={100} max={100e6} log unit="Ω" onChange={upd('r2')} />}
        {showC && <Slider label="C" value={s.c} min={10e-12} max={10e-6} log unit="F" onChange={upd('c')} />}
        <Slider label="Positive rail V+" value={s.vpos} min={1} max={18} step={0.5} unit="V" onChange={upd('vpos')} />
        <Slider label="Negative rail V−" value={s.vneg} min={-18} max={0} step={0.5} unit="V" onChange={upd('vneg')} />
        <Toggle label="Real op-amp (A0, GBW, SR, swing)" checked={s.real} onChange={upd('real')} />
        {s.real && <>
          <Slider label="Open-loop gain A0" value={s.a0} min={10} max={1e7} log format={v => `${si(v, '')} V/V (${(20 * Math.log10(v)).toFixed(0)} dB)`} onChange={upd('a0')} />
          <Slider label="Gain-bandwidth GBW" value={s.gbw} min={1e4} max={1e8} log unit="Hz" onChange={upd('gbw')} />
          <Slider label="Slew rate SR" value={s.sr} min={1e4} max={1e8} log format={v => `${(v / 1e6).toPrecision(3)} V/µs`} onChange={upd('sr')} />
          <Slider label="Output headroom to each rail" value={s.headroom} min={0} max={3} step={0.05} unit="V" onChange={upd('headroom')} />
        </>}
        <Note>The op-amp is a single-pole macro-model (A0, pole at GBW/A0) with slew and swing limits, solved in the time domain together with the feedback network. Ideal mode uses A0 = 10⁸ and unlimited bandwidth and slew rate; the output still clips at the rails.</Note>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><RegionBadge label={region.l} color={region.c} /><span className="sim-note">{LABELS[s.config]}{s.real ? ' · real op-amp' : ' · ideal op-amp'}</span></div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <EqBox>{eq}</EqBox>
      <Plot series={series} xUnit={tUnit} yUnit="V" xLabel="time" yLabel="voltage" height={250} hlines={hl} yRange={[-yAbs, yAbs]} />
      <Readouts>
        {!openLoop && <Readout k={showC ? '|H| ideal (sine @ f)' : 'Ideal gain'} v={`${gI.phaseDeg === 180 && !showC ? '−' : ''}${gI.mag.toPrecision(4)} V/V`} />}
        {!openLoop && <Readout k={s.wave === 'dc' ? 'Actual gain (DC)' : showC && s.wave !== 'sine' ? 'Measured p-p ratio' : 'Actual gain (p-p ratio)'} v={`${(showC ? Math.abs(gMeas) : gMeas).toPrecision(4)} V/V`} hl tone={o.clipped || o.slewLimited ? 'bad' : undefined} />}
        {resistive && s.real && <Readout k="Finite-A0 gain (linear)" v={`${gFinite.toPrecision(5)} V/V`} />}
        <Readout k="vout max / min" v={`${si(o.voutMax, 'V')} / ${si(o.voutMin, 'V')}`} tone={o.clipped && !openLoop ? 'bad' : undefined} />
        <Readout k="|v+ − v−| peak" v={si(o.vdPeak, 'V')} tone={!openLoop && o.vdPeak > 0.01 ? 'warn' : undefined} />
        {!openLoop && <Readout k="Feedback β / noise gain" v={resistive ? `${b.toPrecision(3)} / ${(1 / b).toPrecision(3)}` : 'freq. dependent'} />}
        {s.real && resistive && <Readout k="Closed-loop BW ≈ GBW·β" v={si(fcl, 'Hz')} tone={s.f > fcl / 3 ? 'warn' : undefined} />}
        {s.real && <Readout k="Full-power BW SR/(2πVp)" v={si(fpbw, 'Hz')} tone={s.f > fpbw ? 'bad' : undefined} />}
        {openLoop && <Readout k="Output levels" v={`${si(o.railHi, 'V')} / ${si(o.railLo, 'V')}`} />}
      </Readouts>
    </SimShell>
  );
}
