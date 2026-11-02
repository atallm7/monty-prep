// Current-sensing chain: shunt → current-sense amplifier → ADC. Static design calculator with transfer & error plots.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { currentSense, AMPS, AmpKind, Side } from '../models/current-sense';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };

export default function CurrentSense({ params }: SimProps) {
  const init = {
    imax: n(params.imax, 5), imin: n(params.imin, 0.01), rsense: n(params.rsense, 0.01), gain: n(params.gain, 50),
    bits: String(Math.round(n(params.bits, 12))), vref: n(params.vref, 3.3), side: (params.side === 'high' ? 'high' : 'low') as Side,
    vbus: 12, vcc: '3.3', amp: 'ina180' as AmpKind, prating: '1', offsetCal: false,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const vcc = Math.max(Number(s.vcc), 0.1);
  const bits = Number(s.bits);
  const r = useMemo(() => currentSense({ ...s, bits, vcc, prating: Number(s.prating) }), [s, bits, vcc]);

  const iHi = Math.max(s.imax, Math.min(r.ifs, s.imax * 3)) * 1.25;
  const transfer = useMemo(() => {
    const x: number[] = [], y: number[] = [], yi: number[] = [];
    for (let k = 0; k <= 500; k++) { const i = iHi * k / 500; x.push(i); y.push(r.codeAt(i)); yi.push(s.gain * (i * s.rsense) / r.lsb); }
    return { x, y, yi };
  }, [r, iHi, s.gain, s.rsense]);
  const err = useMemo(() => {
    const x = logspace(Math.max(1e-6, Math.min(s.imin, s.imax) / 20), s.imax * 1.2, 220);
    return { x, y: x.map(i => Math.min(10, r.errAt(i))) };
  }, [r, s.imin, s.imax]);

  const pTone = r.pRs > r.pRating ? 'bad' : r.pRs > 0.6 * r.pRating ? 'warn' : 'ok';
  const status = r.clipped ? { l: `Clipping above ${si(r.ifs, 'A')}`, c: 'bad' as const }
    : !r.cmOk ? { l: 'Common mode out of range', c: 'bad' as const }
    : s.imin < r.iDead ? { l: 'Imin inside output dead zone', c: 'warn' as const }
    : r.iminLsb < 4 ? { l: 'Imin under 4 LSB: poor resolution', c: 'warn' as const }
    : r.headroom > 0.5 ? { l: 'Under-using ADC range', c: 'warn' as const }
    : { l: 'Chain OK', c: 'ok' as const };

  const schematic = useMemo(() => {
    const flow = true;
    const rsLbl = { label: 'R_{sense}', value: si(s.rsense, 'Ω'), color: 'orange' };
    const adc = (y: number) => ({ t: 'box', at: [13, y], w: 4, h: 4, label: `ADC\n${bits}-bit`, pins: [{ side: 'left', pos: 2, name: 'IN' }] });
    const common = [
      { t: 'V', a: [0, 6], b: [0, 10], label: 'V_{bus}', value: si(s.vbus, 'V'), labelSide: 'other' },
      { t: 'R', a: [19, 6], b: [19, 10], label: 'Load', value: si(s.imax, 'A') + ' max' },
      { t: 'text', at: [15, 13.2], text: `V_{amp} = ${si(r.vamp, 'V')} @ I_{max}`, color: r.clipped ? 'red' : 'accent', anchor: 'middle' },
    ];
    const els = s.side === 'high' ? [
      ...common,
      { t: 'wire', pts: [[0, 6], [0, 5], [2, 5]], flow }, { t: 'R', a: [2, 5], b: [6, 5], ...rsLbl, labelSide: 'other' },
      { t: 'wire', pts: [[6, 5], [19, 5], [19, 6]], flow }, { t: 'wire', pts: [[19, 10], [19, 11], [0, 11], [0, 10]], flow }, { t: 'gnd', at: [9, 11] },
      { t: 'opamp', at: [7, 2], swap: true, label: `G=${s.gain}` },
      { t: 'wire', pts: [[2, 5], [2, 1], [7, 1]] }, { t: 'dot', at: [2, 5] }, { t: 'wire', pts: [[6, 5], [6, 3], [7, 3]] }, { t: 'dot', at: [6, 5] },
      { t: 'wire', pts: [[11, 2], [13, 2]] }, adc(0),
      { t: 'text', at: [4, -0.4], text: `V_{CM} ≈ ${si(r.vcm, 'V')}`, color: r.cmOk ? 'green' : 'red', anchor: 'middle' },
    ] : [
      ...common,
      { t: 'wire', pts: [[0, 6], [0, 5], [19, 5], [19, 6]], flow }, { t: 'wire', pts: [[19, 10], [19, 11], [6, 11]], flow },
      { t: 'R', a: [6, 11], b: [2, 11], ...rsLbl }, { t: 'wire', pts: [[2, 11], [0, 11], [0, 10]], flow }, { t: 'gnd', at: [1, 11] },
      { t: 'opamp', at: [7, 8], label: `G=${s.gain}` },
      { t: 'wire', pts: [[6, 11], [6, 9], [7, 9]] }, { t: 'dot', at: [6, 11] }, { t: 'wire', pts: [[2, 11], [2, 7], [7, 7]] }, { t: 'dot', at: [2, 11] },
      { t: 'wire', pts: [[11, 8], [13, 8]] }, adc(6),
      { t: 'text', at: [4, 13.2], text: `load ground lifted ${si(r.groundShift, 'V')}`, color: 'orange', anchor: 'middle' },
    ];
    return renderCircuit({ elements: els }).svg;
  }, [s, r, bits]);

  const applyGain = () => set(p => ({ ...p, gain: r.gRec }));
  const applyRs = () => set(p => ({ ...p, rsense: r.rsRec }));

  return (
    <SimShell title="Current sensing: Rsense → CSA → ADC" onReset={() => set(init)}
      tryThis={<>(1) Raise R<sub>sense</sub> to 50 mΩ: resolution improves 5×, but the shunt now burns {si(s.imax * s.imax * 0.05, 'W')} and the amplifier clips. Then use "Fit gain" to bring I<sub>max</sub> back to 90% of full scale. (2) Switch to high side with a 48 V bus: the INA180-class part is outside its 26 V common-mode range. Pick the INA240-class amplifier.</>}
      controls={<>
        <Seg label="Shunt position" value={s.side} options={[{ value: 'low', label: 'Low side' }, { value: 'high', label: 'High side' }]} onChange={upd('side')} />
        <Slider label="Max current Imax" value={s.imax} min={0.05} max={100} log unit="A" onChange={upd('imax')} />
        <Slider label="Min current to resolve Imin" value={s.imin} min={1e-4} max={10} log unit="A" onChange={upd('imin')} />
        <Slider label="Sense resistor Rsense" value={s.rsense} min={1e-4} max={1} log unit="Ω" onChange={upd('rsense')} />
        <Slider label="Amplifier gain G" value={s.gain} min={1} max={1000} log format={v => `${Number(v.toPrecision(3))} V/V`} onChange={upd('gain')} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={applyGain}>Fit gain → {r.gRec}</button>
          <button type="button" className="btn btn-sm" onClick={applyRs}>Fit Rsense → {si(r.rsRec, 'Ω')}</button>
        </div>
        <Select label="ADC resolution" value={s.bits} options={[8, 10, 12, 14, 16].map(b => ({ value: String(b), label: `${b} bits` }))} onChange={upd('bits')} />
        <Slider label="ADC reference Vref" value={s.vref} min={1} max={5} step={0.05} unit="V" onChange={upd('vref')} />
        <Select label="Amplifier" value={s.amp} options={(Object.keys(AMPS) as AmpKind[]).map(k => ({ value: k, label: `${AMPS[k].name} (Vos ${si(AMPS[k].vos, 'V')})` }))} onChange={upd('amp')} />
        <Select label="Amplifier supply" value={s.vcc} options={['3.3', '5'].map(v => ({ value: v, label: `${v} V` }))} onChange={upd('vcc')} />
        {s.side === 'high' && <Slider label="Bus voltage (common mode)" value={s.vbus} min={0} max={100} step={0.5} unit="V" onChange={upd('vbus')} />}
        {s.side === 'low' && <Slider label="Bus voltage" value={s.vbus} min={0} max={100} step={0.5} unit="V" onChange={upd('vbus')} />}
        <Toggle label="Offset calibrated at zero current" checked={s.offsetCal} onChange={upd('offsetCal')} />
        <Select label="Shunt power rating" value={s.prating} options={['0.25', '0.5', '1', '2', '3'].map(v => ({ value: v, label: `${v} W` }))} onChange={upd('prating')} />
        <Note>Gain error 0.5% is included in the codes and the error plot. The amp output can't reach its rails: it swings from {si(r.vomin, 'V')} to {si(r.vomax, 'V')}.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <RegionBadge label={status.l} color={status.c} />
        <RegionBadge label={s.side === 'high' ? `High side: V_CM = ${si(r.vcm, 'V')} (amp range ${r.amp.cmMin}…${si(r.cmMax, 'V')})` : 'Low side: V_CM ≈ 0 V'} color={r.cmOk ? 'info' : 'bad'} />
      </div>
      <Readouts>
        <Readout k="Vsense @ Imax" v={si(r.vsense, 'V')} />
        <Readout k="P in Rsense" v={`${si(r.pRs, 'W')} / ${s.prating} W`} tone={pTone} />
        <Readout k="Vamp @ Imax" v={si(r.vampIdeal, 'V')} tone={r.clipped ? 'bad' : 'ok'} hl />
        <Readout k="Headroom to full scale" v={`${(r.headroom * 100).toFixed(0)} %`} tone={r.headroom < 0 ? 'bad' : r.headroom > 0.5 ? 'warn' : 'ok'} />
        <Readout k="Full-scale current" v={si(r.ifs, 'A')} />
        <Readout k="Resolution" v={`${si(r.ilsb, 'A')}/LSB`} hl />
        <Readout k="Imin in LSBs" v={r.iminLsb.toPrecision(3)} tone={r.iminLsb < 1 ? 'bad' : r.iminLsb < 4 ? 'warn' : 'ok'} />
        <Readout k="Offset as current Vos/R" v={si(r.ioffset, 'A')} tone={r.ioffset > s.imin ? 'bad' : r.ioffset > s.imin * 0.2 ? 'warn' : 'ok'} />
        <Readout k="Dead zone (output floor)" v={`< ${si(r.iDead, 'A')}`} tone={r.iDead > s.imin ? 'warn' : undefined} />
        <Readout k="Error @ Imin / Imax" v={`${r.errMin >= 1 ? '≥100' : (r.errMin * 100).toPrecision(2)} % / ${(r.errMax * 100).toPrecision(2)} %`} tone={r.errMin > 0.2 ? 'bad' : r.errMin > 0.05 ? 'warn' : 'ok'} />
        <Readout k="Codes used Imin→Imax" v={`${r.codesUsed} of ${2 ** bits}`} />
        <Readout k="Recommended (90% FS)" v={`G ≈ ${r.gIdeal.toPrecision(3)} or R ≈ ${si(r.rsIdeal, 'Ω')}`} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered} V_{amp} = G\,I_{max}R_s \\ = ${num3(s.gain)}\cdot ${num3(s.imax)}\,\text{A}\cdot ${tq(s.rsense, 'Ω')}= ${(s.gain * r.vsense).toFixed(3)}\,\text{V}\ (+G V_{os} = ${tq(s.gain * r.amp.vos, 'V')}) \\ I_{LSB} = \frac{V_{ref}}{2^N G R_s} \\ = \frac{${s.vref}}{2^{${bits}}\cdot ${num3(s.gain)}\cdot ${num3(s.rsense)}} = ${tq(r.ilsb, 'A')} \\ P = I_{max}^2R_s = ${tq(r.pRs, 'W')}\end{gathered}`}</EqBox>
      <Plot series={[
        { x: transfer.x, y: transfer.yi, label: 'ideal (no limits)', color: 'muted', dashed: true },
        { x: transfer.x, y: transfer.y, label: 'ADC code', color: 'accent' },
      ]} xUnit="A" xLabel="load current" yLabel="ADC code" height={220} yRange={[0, 2 ** bits * 1.15]}
        hlines={[{ at: 2 ** bits - 1, label: 'full scale', color: 'red' }]}
        vlines={[{ at: s.imax, label: 'Imax', color: 'orange' }, ...(r.ifs < iHi ? [{ at: r.ifs, label: 'clip', color: 'red' }] : [])]} yTickFormat={v => String(Math.round(v))} />
      <Plot series={[{ x: err.x, y: err.y, label: 'worst-case reading error', color: 'red' }]} xLog yLog xUnit="A" xLabel="load current" yLabel="error" height={200} yRange={[1e-3, 10]}
        yTickFormat={v => `${Number((v * 100).toPrecision(2))}%`} vlines={[{ at: s.imin, label: 'Imin', color: 'green' }, { at: s.imax, label: 'Imax', color: 'orange' }]} hlines={[{ at: 0.01, label: '1 %', color: 'muted' }]} />
      <Note>{s.side === 'low'
        ? <>Low side: the amplifier sees ≈ 0 V common mode, so any rail-to-rail op-amp works, but the load's ground is lifted by I·R<sub>sense</sub> and a short from the load to chassis ground bypasses the shunt unseen.</>
        : <>High side: the load stays grounded and shorts to ground are detected, but both inputs sit at V<sub>bus</sub> = {si(s.vbus, 'V')}. The amplifier needs a common-mode range above that, and CMRR matters: a CMRR of 100 dB gives {si(s.vbus * 1e-5, 'V')} of input-referred error, which is {si(s.vbus * 1e-5 / s.rsense, 'A')} as a current.</>}</Note>
    </SimShell>
  );
}
const tq = (v: number, u: string) => { const t = si(v, u); const i = t.lastIndexOf(' '); return i < 0 ? t : `${t.slice(0, i)}\\,\\text{${t.slice(i + 1)}}`; };
function num3(v: number) { return Number(v.toPrecision(3)).toString(); }
