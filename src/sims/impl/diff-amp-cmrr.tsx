// Difference amplifier: differential gain vs common-mode gain, CMRR set by resistor matching.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { gains, resistors, waveforms, type Mode } from '../models/diff-amp-cmrr';

export default function DiffAmpCmrr({ params }: SimProps) {
  const init = {
    vd: Number(params.vd ?? 0.1), vcm: Number(params.vcm ?? 2), mismatch: Math.max(1e-5, Number(params.mismatch ?? 0.01)),
    gain: Math.max(1, Number(params.gain ?? 10)), mode: 'single' as Mode,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const g = useMemo(() => gains(s), [s]);
  const R = resistors(s);
  const w = useMemo(() => waveforms({ ...s, fd: 500, fcm: 60, tEnd: 2 / 60 }, 1600), [s]);
  const cmOut = Math.abs(g.acm) * s.vcm, dOut = g.ad * s.vd;
  const snrDb = 20 * Math.log10(dOut / Math.max(1e-15, cmOut));

  const svg = useMemo(() => {
    const hi = (k: 'R1' | 'R2' | 'R3' | 'R4') => s.mode === 'worst' || k === 'R4' ? 'orange' : undefined;
    const pct = (v: number, nom: number) => { const d = (v / nom - 1) * 100; return Math.abs(d) < 1e-9 ? '' : ` (${d > 0 ? '+' : ''}${d.toPrecision(2)}%)`; };
    const r1n = 10e3, r2n = s.gain * 10e3;
    return renderCircuit({
      elements: [
        { t: 'opamp', at: [9, 4] },
        { t: 'term', at: [1, 3], label: 'V_1', side: 'left' }, { t: 'R', a: [1, 3], b: [6, 3], label: 'R_1', value: si(R.R1, 'Ω') + pct(R.R1, r1n), color: hi('R1') },
        { t: 'wire', pts: [[6, 3], [9, 3]] }, { t: 'dot', at: [8, 3] },
        { t: 'wire', pts: [[8, 3], [8, 0]] }, { t: 'R', a: [8, 0], b: [13, 0], label: 'R_2', value: si(R.R2, 'Ω') + pct(R.R2, r2n), color: hi('R2') }, { t: 'wire', pts: [[13, 0], [14, 0], [14, 4]] },
        { t: 'wire', pts: [[13, 4], [16, 4]] }, { t: 'dot', at: [14, 4] }, { t: 'term', at: [16, 4], label: 'V_{out}', side: 'right', color: 'accent' },
        { t: 'term', at: [1, 5], label: 'V_2', side: 'left' }, { t: 'R', a: [1, 5], b: [6, 5], label: 'R_3', value: si(R.R3, 'Ω') + pct(R.R3, r1n), labelSide: 'other', color: hi('R3') },
        { t: 'wire', pts: [[6, 5], [9, 5]] }, { t: 'dot', at: [8, 5] },
        { t: 'R', a: [8, 5], b: [8, 9.5], label: 'R_4', value: si(R.R4, 'Ω') + pct(R.R4, r2n), color: hi('R4') }, { t: 'gnd', at: [8, 9.5] },
        { t: 'text', at: [10.5, 9.2], text: `V_{cm} = ${si(s.vcm, 'V')} @ 60 Hz`, anchor: 'start', muted: true, size: 12 },
        { t: 'text', at: [10.5, 10.4], text: `V_d = ${si(s.vd, 'V')} @ 500 Hz`, anchor: 'start', muted: true, size: 12 },
      ],
    }).svg;
  }, [s, R.R1, R.R2, R.R3, R.R4]);

  const curve = useMemo(() => {
    const xs = logspace(1e-5, 0.2, 160);
    return { x: xs, y: xs.map(e => gains({ ...s, mismatch: e }).cmrrDb) };
  }, [s.gain, s.mode]);

  const tone = g.cmrrDb > 80 ? 'ok' : g.cmrrDb > 50 ? 'warn' : 'bad';
  return (
    <SimShell title="Differential vs common-mode gain" onReset={() => set(init)}
      tryThis={<>with 2 V of 60 Hz common-mode hum and a 100 mV differential signal, slide the mismatch from 1% down to 0.01%: each 10× better match buys 20 dB of CMRR and the hum riding on the output shrinks 10×. Then raise the gain: CMRR improves as (1 + G) because the same mismatch matters less relative to a larger Ad.</>}
      controls={<>
        <Slider label="Differential amplitude Vd" value={s.vd} min={0.001} max={1} log unit="V" onChange={upd('vd')} />
        <Slider label="Common-mode noise Vcm" value={s.vcm} min={0} max={10} step={0.05} unit="V" onChange={upd('vcm')} />
        <Slider label="Resistor mismatch ε" value={s.mismatch} min={1e-5} max={0.2} log format={v => `${(v * 100).toPrecision(2)} %`} onChange={upd('mismatch')} />
        <Slider label="Differential gain G = R2/R1" value={s.gain} min={1} max={100} log format={v => `${v.toPrecision(3)} V/V`} onChange={upd('gain')} />
        <Seg label="Mismatch pattern" value={s.mode} options={[{ value: 'single', label: 'R4 off by ε' }, { value: 'worst', label: 'All four ±ε (worst)' }]} onChange={upd('mode')} />
        <Note>Ideal op-amp, so all of the common-mode error comes from the resistor bridge. Real parts add their own CMRR (typically 80–120 dB), which combines with this one.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><RegionBadge label={`CMRR ${isFinite(g.cmrrDb) ? g.cmrrDb.toFixed(1) + ' dB' : '∞'}`} color={tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'bad'} /><RegionBadge label={`Signal / hum at output ${snrDb.toFixed(1)} dB`} color="info" /></div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <EqBox>{String.raw`A_{cm} = \frac{R_4}{R_3+R_4}\Big(1+\frac{R_2}{R_1}\Big) - \frac{R_2}{R_1} = ${g.acm.toExponential(3)},\quad \text{CMRR} = \left|\frac{A_d}{A_{cm}}\right| \approx \frac{1+G}{${s.mode === 'worst' ? '4' : ''}\varepsilon} = ${(20 * Math.log10(g.approx)).toFixed(1)}\,\text{dB}`}</EqBox>
      <Readouts>
        <Readout k="Ad (differential)" v={`${g.ad.toPrecision(5)} V/V`} />
        <Readout k="Acm (common mode)" v={`${g.acm.toExponential(3)} V/V`} tone={tone} />
        <Readout k="CMRR" v={isFinite(g.cmrrDb) ? `${g.cmrrDb.toFixed(1)} dB` : '∞'} hl tone={tone} />
        <Readout k="Desired output Ad·Vd" v={si(dOut, 'V')} />
        <Readout k="Hum at output Acm·Vcm" v={si(cmOut, 'V')} tone={tone} />
      </Readouts>
      <Plot series={[{ x: w.t, y: w.v1, label: 'V1', color: 'blue' }, { x: w.t, y: w.v2, label: 'V2', color: 'orange' }]} xUnit="s" yUnit="V" xLabel="time" yLabel="inputs" height={170} />
      <Plot series={[{ x: w.t, y: w.ideal, label: 'ideal G·Vd', color: 'muted', dashed: true }, { x: w.t, y: w.vo, label: 'Vout', color: 'accent', width: 2 }, { x: w.t, y: w.cmPart, label: 'Acm·Vcm part', color: 'red' }]} xUnit="s" yUnit="V" xLabel="time" yLabel="output" height={210} />
      <Plot series={[{ ...curve, label: 'CMRR vs mismatch', color: 'accent' }]} xLog xRange={[1e-5, 0.2]} xLabel="mismatch ε" yUnit="dB" yLabel="CMRR" height={190}
        xTickFormat={v => `${+(v * 100).toPrecision(2)}%`} points={[{ x: s.mismatch, y: g.cmrrDb, label: 'now' }]} hlines={[{ at: 60, label: '60 dB', color: 'muted' }]} />
    </SimShell>
  );
}
