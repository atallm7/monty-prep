// Differential vs single-ended signaling: inject common-mode noise, skew and ground offset.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { simulate } from '../models/diff-signaling';

const SHOW = 16; // bits shown

export default function DiffSignaling({ params }: SimProps) {
  const init = { noise: Number(params.noise ?? 0.5), skew: Number(params.skew ?? 0), fn: 0.15, kind: 'sine' as 'sine' | 'random', vgnd: 0, cmrr: 60 };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const r = useMemo(() => simulate(s), [s]);

  const cut = r.t.findIndex(t => t > SHOW); const n = cut < 0 ? r.t.length : cut;
  const t = r.t.slice(0, n);
  const errSE = r.dec.filter(d => d.seErr && d.t < SHOW).map(d => ({ x: d.t, y: d.se, color: 'red' }));
  const errD = r.dec.filter(d => d.dErr && d.t < SHOW).map(d => ({ x: d.t, y: d.diff, color: 'red' }));
  const okSE = r.seErr === 0, okD = r.dErr === 0;
  const pctSE = (100 * r.seErr / r.n).toFixed(0), pctD = (100 * r.dErr / r.n).toFixed(0);
  const cmHi = Math.max(...r.CM), cmLo = Math.min(...r.CM);
  const cmOK = cmLo >= r.cmMin && cmHi <= r.cmMax;
  const badge = !okD ? { l: cmOK ? 'Differential link failing (skew/CMRR leakage)' : 'Receiver common-mode range exceeded', c: 'bad' as const }
    : !okSE ? { l: 'Single-ended fails, differential clean', c: 'ok' as const } : { l: 'Both links clean', c: 'info' as const };

  return (
    <SimShell title="Differential vs single-ended signaling" onReset={() => set(init)}
      tryThis={<>leave skew at 0 and raise the common-mode noise past 0.2 V (the single-ended swing): the single-ended receiver starts making bit errors while the differential receiver still decodes every bit, because the same noise is on both wires and cancels in V<sub>+</sub> − V<sub>−</sub>. Now add 0.15 UI of skew: noise on the two legs is no longer in step, so part of it becomes differential (mode conversion, 2·V<sub>n</sub>·sin(πfτ)) and the clean eye closes. Finally push the ground offset past about 1 V: the differential link only fails when the common mode leaves the receiver's input range.</>}
      controls={<>
        <Slider label="Common-mode noise Vn (peak)" value={s.noise} min={0} max={1.2} step={0.01} unit="V" onChange={upd('noise')} />
        <Slider label="Skew between legs" value={s.skew} min={0} max={0.5} step={0.005} format={v => (v * 100).toFixed(1) + ' % of a bit'} onChange={upd('skew')} />
        <Slider label="Ground offset TX→RX" value={s.vgnd} min={-1.5} max={1.5} step={0.05} unit="V" onChange={upd('vgnd')} />
        <Slider label="Receiver CMRR" value={s.cmrr} min={0} max={80} step={1} format={v => v.toFixed(0) + ' dB'} onChange={upd('cmrr')} />
        <Seg label="Noise type" value={s.kind} onChange={upd('kind')} options={[{ value: 'sine', label: 'Sine tone' }, { value: 'random', label: 'Random burst' }]} />
        <Slider label="Noise frequency" value={s.fn} min={0.02} max={0.6} step={0.01} format={v => v.toFixed(2) + ' cycles / bit'} onChange={upd('fn')} />
        <Note>Each leg swings ±{si(r.a, 'V')} around a {si(r.vcm, 'V')} common-mode level. The differential receiver needs the input common mode between {si(r.cmMin, 'V')} and {si(r.cmMax, 'V')}.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><RegionBadge label={badge.l} color={badge.c} /></div>
      <Readouts>
        <Readout k="Single-ended bit errors" v={`${r.seErr} / ${r.n} (${pctSE}%)`} tone={okSE ? 'ok' : 'bad'} hl />
        <Readout k="Differential bit errors" v={`${r.dErr} / ${r.n} (${pctD}%)`} tone={okD ? 'ok' : 'bad'} hl />
        <Readout k="Vdiff swing (p-p)" v={si(Math.max(...r.D) - Math.min(...r.D), 'V')} />
        <Readout k="Worst-case margin: SE / diff" v={`${si(r.minSe, 'V')} / ${isFinite(r.minD) ? si(r.minD, 'V') : 'CM out of range'}`} tone={r.minSe > 0 && r.minD > 0 ? 'ok' : 'warn'} />
        <Readout k="Input common mode" v={`${si(cmLo, 'V')} … ${si(cmHi, 'V')}`} tone={cmOK ? 'ok' : 'bad'} />
        <Readout k="Skew mode conversion" v={isFinite(r.convAmp) ? si(r.convAmp, 'V') + ' diff' : 'see eye'} tone={r.convAmp > 0.05 ? 'warn' : 'ok'} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}V_{diff}=V_+-V_-=2a\,s(t);\text{(noise cancels)},\quad V_{cm}=\tfrac{V_++V_-}{2}\\ V_{n,diff}\approx 2V_n\sin(\pi f\tau)=${isFinite(r.convAmp) ? r.convAmp.toFixed(3) + String.raw`\,\text{V}` : String.raw`\text{n/a (random burst)}`}\end{gathered}`}</EqBox>
      <Plot series={[{ x: t, y: r.P.slice(0, n), label: 'V+ (at receiver)', color: 'accent' }, { x: t, y: r.N.slice(0, n), label: 'V− (at receiver)', color: 'blue' }]}
        yUnit="V" xLabel="time (bits)" yLabel="Leg voltage" height={200} xRange={[0, SHOW]} hlines={[{ at: r.vcm, label: 'Vcm', color: 'muted' }]} />
      <Plot series={[{ x: t, y: r.SE.slice(0, n), label: 'Single-ended: V+ − Vref', color: 'orange' }, { x: t, y: r.D.slice(0, n), label: 'Differential: V+ − V−', color: 'green' }]}
        yUnit="V" xLabel="time (bits)" yLabel="Receiver input" height={220} xRange={[0, SHOW]} hlines={[{ at: 0, label: 'decision threshold', color: 'muted' }]}
        points={[...errSE.map(p => ({ ...p, label: '' })), ...errD.map(p => ({ ...p, label: '' }))]} />
      <Note>Red dots mark bits sampled on the wrong side of the threshold (bit centre, shifted by half the skew).</Note>
    </SimShell>
  );
}
