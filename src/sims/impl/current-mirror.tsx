// Two-transistor current mirror (MOSFET or BJT): Iout vs Vout with λ/Early effect, compliance, ratio and β error.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { operatingPoint, sweep, textbookIout, type MirrorType } from '../models/current-mirror';

export default function CurrentMirror({ params }: SimProps) {
  const init = {
    type: (params.type === 'bjt' ? 'bjt' : 'mos') as MirrorType, iref: Number(params.iref ?? 1e-3), ratio: Number(params.ratio ?? 1),
    vout: 2.5, lambda: 0.05, kp: 8e-3, vt: 0.5, beta: 100, va: 50, vmax: 5,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const p = { type: s.type, iref: s.iref, ratio: s.ratio, lambda: s.lambda, kp: s.kp, vt: s.vt, beta: s.beta, va: s.va, is: 1e-15 };
  const op = useMemo(() => operatingPoint(p, s.vout), [s]);
  const sw = useMemo(() => sweep(p, s.vmax), [s.type, s.iref, s.ratio, s.lambda, s.kp, s.vt, s.beta, s.va, s.vmax]);
  const tb = useMemo(() => sw.v.map(v => v >= op.compliance ? textbookIout(p, v) : NaN), [sw]);
  const ideal = s.ratio * s.iref;
  const err = op.iout / ideal - 1;
  const isMos = s.type === 'mos';
  const vMatch = op.vctl; // Vout where the two devices see the same VDS/VCE

  const svg = useMemo(() => {
    const dev = isMos ? 'nmos' : 'npn';
    const lbl1 = isMos ? 'M_1' : 'Q_1', lbl2 = isMos ? `M_2 (×${s.ratio.toPrecision(3)})` : `Q_2 (×${s.ratio.toPrecision(3)})`;
    return renderCircuit({
      elements: [
        { t: 'rail', at: [3, -3], label: 'V_{DD}' },
        { t: 'I', a: [3, -3], b: [3, 1.5], label: 'I_{ref}', value: si(s.iref, 'A'), labelSide: 'other' },
        { t: 'wire', pts: [[3, 1.5], [3, 3]] }, { t: 'wire', pts: [[3, 1.5], [6, 1.5], [6, 5]] }, { t: 'dot', at: [3, 1.5] },
        { t: dev, at: [5, 5], flip: true, label: lbl1 }, { t: dev, at: [7, 5], label: lbl2, color: op.saturated ? undefined : 'red' },
        { t: 'wire', pts: [[5, 5], [7, 5]] }, { t: 'dot', at: [6, 5] },
        { t: 'wire', pts: [[3, 7], [3, 8]] }, { t: 'gnd', at: [3, 8] }, { t: 'wire', pts: [[9, 7], [9, 8]] }, { t: 'gnd', at: [9, 8] },
        { t: 'wire', pts: [[9, 3], [9, 0], [14, 0], [14, 1]], flow: op.iout > 0 ? true : 'reverse' },
        { t: 'V', a: [14, 1], b: [14, 6], label: 'V_{out}', value: si(s.vout, 'V') }, { t: 'wire', pts: [[14, 6], [14, 8]] }, { t: 'gnd', at: [14, 8] },
        { t: 'arrow', a: [12.5, -0.7], b: [10.5, -0.7], label: `I_{out} = ${si(op.iout, 'A')}` },
        { t: 'text', at: [6, 9.8], text: `${isMos ? 'V_{GS}' : 'V_{BE}'} = ${si(op.vctl, 'V')}`, muted: true, size: 12 },
      ],
    }).svg;
  }, [s, op.iout, op.vctl, op.saturated]);

  const region = !op.saturated ? { l: isMos ? 'M2 in triode: below compliance' : 'Q2 saturated: below compliance', c: 'bad' as const }
    : Math.abs(err) < 0.01 ? { l: 'Mirroring accurately (<1% error)', c: 'ok' as const } : { l: `Mirroring with ${(err * 100).toFixed(1)}% error`, c: 'warn' as const };

  return (
    <SimShell title="Current mirror" onReset={() => set(init)}
      tryThis={isMos ? <>set V<sub>out</sub> equal to V<sub>GS</sub> ({si(vMatch, 'V')}): the copy is exact because both devices see the same V<sub>DS</sub>. Move V<sub>out</sub> away and the error grows by λ·ΔV. Then drop V<sub>out</sub> below V<sub>OV</sub> and watch M2 fall into triode.</>
        : <>with β = 100 the 1:1 mirror is already 2% low because Q1 must also feed both base currents: I<sub>out</sub>/I<sub>ref</sub> = 1/(1 + 2/β). Raise the ratio to 8 and the error grows to (1 + m)/β ≈ 9%. That is why a β-helper transistor or a MOS mirror is used.</>}
      controls={<>
        <Seg label="Device" value={s.type} options={[{ value: 'mos', label: 'MOSFET' }, { value: 'bjt', label: 'BJT' }]} onChange={upd('type')} />
        <Slider label="Reference current Iref" value={s.iref} min={1e-6} max={10e-3} log unit="A" onChange={upd('iref')} />
        <Slider label={isMos ? 'Size ratio (W/L)₂/(W/L)₁' : 'Emitter area ratio A₂/A₁'} value={s.ratio} min={0.25} max={8} log format={v => `${v.toPrecision(3)} : 1`} onChange={upd('ratio')} />
        <Slider label="Output voltage Vout" value={s.vout} min={0} max={s.vmax} step={0.01} unit="V" onChange={upd('vout')} />
        {isMos ? <>
          <Slider label="Channel-length modulation λ" value={s.lambda} min={0} max={0.2} step={0.005} format={v => `${v.toFixed(3)} V⁻¹`} onChange={upd('lambda')} />
          <Slider label="Threshold Vt" value={s.vt} min={0.2} max={1.2} step={0.01} unit="V" onChange={upd('vt')} />
          <Slider label="k'·(W/L)₁ of M1" value={s.kp} min={1e-4} max={0.1} log format={v => `${si(v, 'A/V²')}`} onChange={upd('kp')} />
        </> : <>
          <Slider label="Current gain β" value={s.beta} min={10} max={500} log format={v => v.toFixed(0)} onChange={upd('beta')} />
          <Slider label="Early voltage VA" value={s.va} min={5} max={300} log unit="V" onChange={upd('va')} />
        </>}
        <Note>{isMos ? 'Square-law MOSFETs with channel-length modulation; the output device moves into triode when VDS < VOV.' : 'Ebers–Moll BJTs (Is = 1 fA) with Early effect, so Q2 saturates softly near VCE ≈ 0.1–0.2 V. At VCE = 0 the forward-biased B–C junction makes the collector current reverse.'}</Note>
      </>}>
      <div><RegionBadge label={region.l} color={region.c} /></div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <EqBox>{isMos
        ? String.raw`I_{out} = I_{ref}\,\frac{(W/L)_2}{(W/L)_1}\,\frac{1+\lambda V_{out}}{1+\lambda V_{GS}} = ${si(s.iref, '\\text{A}')}\cdot ${s.ratio.toPrecision(3)}\cdot\frac{1+${s.lambda.toFixed(3)}\cdot ${s.vout.toFixed(2)}}{1+${s.lambda.toFixed(3)}\cdot ${op.vctl.toFixed(3)}},\quad V_{out}\ge V_{OV} = ${op.vov.toFixed(3)}\,\text{V}`
        : String.raw`I_{out} \approx \frac{m\,I_{ref}}{1+\frac{1+m}{\beta}}\cdot\frac{1+V_{out}/V_A}{1+V_{BE}/V_A},\quad \frac{m}{1+(1+m)/\beta} = ${(s.ratio / (1 + (1 + s.ratio) / s.beta)).toFixed(4)}`}</EqBox>
      <Plot series={[{ x: sw.v, y: sw.i, label: 'Iout (full model)', color: 'accent', width: 2.4 }, { x: sw.v, y: tb, label: 'textbook saturation formula', color: 'orange', dashed: true }]}
        xUnit="V" yUnit="A" xLabel="Vout" yLabel="Iout" height={250} yRange={[Math.min(0, ...sw.i), Math.max(...sw.i, ideal) * 1.12]}
        hlines={[{ at: ideal, label: `ratio × Iref = ${si(ideal, 'A')}`, color: 'green' }]}
        vlines={[{ at: op.compliance, label: 'compliance', color: 'red' }, { at: vMatch, label: isMos ? 'Vout = VGS' : 'Vout = VBE', color: 'muted' }]}
        xspans={[{ from: 0, to: op.compliance, label: isMos ? 'triode' : 'sat.', color: 'red' }]}
        points={[{ x: s.vout, y: op.iout, label: 'now' }]} />
      <Readouts>
        <Readout k="Iout" v={si(op.iout, 'A')} hl />
        <Readout k="Error vs ratio·Iref" v={`${(err * 100).toFixed(2)} %`} tone={Math.abs(err) < 0.01 ? 'ok' : Math.abs(err) < 0.05 ? 'warn' : 'bad'} />
        <Readout k={isMos ? 'VGS (both devices)' : 'VBE (both devices)'} v={si(op.vctl, 'V')} />
        {isMos && <Readout k="Overdrive VOV" v={si(op.vov, 'V')} />}
        <Readout k="Compliance Vout,min" v={si(op.compliance, 'V')} tone={op.saturated ? undefined : 'bad'} />
        <Readout k="Output resistance ro" v={si(op.rout, 'Ω')} />
        {!isMos && <Readout k="Base current / Iref" v={`${(op.baseErr * 100).toFixed(2)} %`} />}
      </Readouts>
    </SimShell>
  );
}
