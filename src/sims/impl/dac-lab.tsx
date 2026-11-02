// DAC lab: R-2R ladder and binary-weighted DAC with resistor mismatch (DNL/INL). Model: models/dac-lab.ts
import { useEffect, useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { Type, transfer, vout } from '../models/dac-lab';

const bin = (c: number, n: number) => c.toString(2).padStart(n, '0');

function schematic(type: Type, bits: number, code: number, vref: number, vo: number, e: number[]) {
  const nd = Math.min(bits, 6), lo = bits - nd; // draw MSB-side nd bits
  const els: any[] = [];
  const bit = (i: number) => (code >> i) & 1;
  if (type === 'r2r') {
    const X = (k: number) => 8 + 6 * k;
    for (let k = 0; k < nd; k++) {
      const i = lo + k, x = X(k), on = bit(i) === 1;
      els.push({ t: 'R', a: [x, 3], b: [x, 7], label: '2R', color: on ? 'accent' : undefined });
      if (on) els.push({ t: 'term', at: [x, 7], label: 'V_{ref}', side: 'bottom' }); else els.push({ t: 'gnd', at: [x, 7] });
      els.push({ t: 'text', at: [x + 0.6, 9.6], text: `b${i}=${on ? 1 : 0}`, color: on ? 'accent' : 'muted', anchor: 'middle' });
      if (k > 0) { els.push({ t: 'R', a: [X(k - 1), 3], b: [x, 3], label: 'R' }); els.push({ t: 'dot', at: [x, 3] }); }
    }
    els.push({ t: 'dot', at: [X(0), 3] });
    if (lo === 0) { els.push({ t: 'wire', pts: [[X(0), 3], [2, 3]] }, { t: 'R', a: [2, 3], b: [2, 7], label: '2R' }, { t: 'gnd', at: [2, 7] }); }
    else els.push({ t: 'wire', pts: [[X(0), 3], [3, 3]], dashed: true }, { t: 'text', at: [3, 2.2], text: `…${lo} lower stages`, muted: true, anchor: 'start' });
    els.push({ t: 'wire', pts: [[X(nd - 1), 3], [X(nd - 1) + 4, 3]], flow: true }, { t: 'term', at: [X(nd - 1) + 4, 3], label: 'V_{out}', side: 'top' }, { t: 'text', at: [X(nd - 1) + 4, 5], text: si(vo, 'V', 4), color: 'accent', anchor: 'middle' });
  } else {
    const Y = (k: number) => 2 + 3 * k;
    for (let k = 0; k < nd; k++) {
      const i = bits - 1 - k, y = Y(k), on = bit(i) === 1; // MSB on top
      els.push({ t: 'term', at: [1, y], label: on ? 'V_{ref}' : '0 V', side: 'left' });
      const mult = 2 ** (bits - 1 - i);
      els.push({ t: 'R', a: [1, y], b: [11, y], label: `${mult === 1 ? '' : mult}R (b${i}=${on ? 1 : 0})`, color: on ? 'accent' : undefined });
      els.push({ t: 'wire', pts: [[11, y], [13, y]], flow: on });
    }
    const yTop = Y(0), yBot = Y(nd - 1), ym = Math.round((yTop + yBot) / 2);
    els.push({ t: 'wire', pts: [[13, yTop], [13, yBot]] });
    for (let k = 0; k < nd; k++) els.push({ t: 'dot', at: [13, Y(k)] });
    if (nd < bits) els.push({ t: 'text', at: [1.5, yBot + 1.6], text: `…${bits - nd} lower bits`, muted: true, anchor: 'start' });
    const oy = ym + 1;
    els.push({ t: 'wire', pts: [[13, ym], [17, ym]] }, { t: 'opamp', at: [17, oy] }, { t: 'wire', pts: [[17, oy + 1], [15, oy + 1]] }, { t: 'gnd', at: [15, oy + 1] });
    els.push({ t: 'wire', pts: [[15, ym], [15, ym - 3]] }, { t: 'R', a: [15, ym - 3], b: [22, ym - 3], label: 'R_f = R/2' }, { t: 'wire', pts: [[22, ym - 3], [22, oy]] }, { t: 'dot', at: [15, ym] }, { t: 'dot', at: [22, oy] });
    els.push({ t: 'wire', pts: [[21, oy], [26, oy]], flow: true }, { t: 'term', at: [26, oy], label: '|V_{out}|', side: 'top' }, { t: 'text', at: [26, oy + 2], text: si(vo, 'V', 4), color: 'accent', anchor: 'middle' });
  }
  void vref; void e;
  return renderCircuit({ elements: els }).svg;
}

export default function DacLab({ params }: SimProps) {
  const init = { type: (params.type === 'weighted' ? 'weighted' : 'r2r') as Type, bits: Math.min(10, Math.max(2, Math.round(Number(params.bits ?? 4)))), vref: Number(params.vref ?? 3.3), mismatch: Math.max(0, Number(params.mismatch ?? 0)), seed: 1, code: -1 };
  const [s, setS] = useState(init);
  const [play, setPlay] = useState(false);
  const { type, bits, vref, mismatch } = s; const N = 2 ** bits;
  const code = s.code < 0 ? Math.round(0.625 * N) : Math.min(s.code, N - 1);
  const tf = useMemo(() => transfer(type, bits, vref, mismatch, s.seed), [type, bits, vref, mismatch, s.seed]);
  useEffect(() => { if (!play) return; const id = setInterval(() => setS(p => ({ ...p, code: ((p.code < 0 ? Math.round(0.625 * 2 ** p.bits) : p.code) + 1) % 2 ** p.bits })), Math.max(60, 1600 / N)); return () => clearInterval(id); }, [play, N]);
  const vo = tf.v[code], ideal = vref * code / N, L = tf.lsb;
  const ks = useMemo(() => tf.v.map((_, i) => i), [tf]);
  const svg = useMemo(() => schematic(type, bits, code, vref, vo, tf.e), [type, bits, code, vref, vo, tf.e]);
  const bitsOf = (c: number) => bin(c, bits);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => setS(p => ({ ...p, [k]: v }));
  const worst = tf.worstCode;
  const tone = (x: number) => (Math.abs(x) < 0.5 ? 'ok' : Math.abs(x) < 1 ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad';
  const eq = type === 'r2r'
    ? String.raw`V_{out}=V_{ref}\sum_{i=0}^{N-1}\frac{b_i}{2^{N-i}}=V_{ref}\frac{\text{code}}{2^{N}}=${vref}\cdot\frac{${code}}{${N}}=\text{${si(ideal, 'V')}}\ (\text{ideal})`
    : String.raw`|V_{out}|=V_{ref}\,R_f\sum_i \frac{b_i}{R_i},\ R_i=\frac{R\,2^{N-1}}{2^{i}},\ R_f=\frac{R}{2}\ \Rightarrow\ V_{ref}\frac{\text{code}}{2^{N}}=\text{${si(ideal, 'V')}}\ (\text{ideal})`;

  return (
    <SimShell title={type === 'r2r' ? 'DAC: R-2R ladder' : 'DAC: binary-weighted resistors'} onReset={() => { setS(init); setPlay(false); }}
      tryThis={<>set <b>mismatch</b> to 5 % and drag the code through the mid-scale <b>0111 → 1000</b> transition: the biggest DNL error sits where the MSB switches. Compare R-2R and binary-weighted at the same mismatch and 8 bits; the weighted DAC needs a resistor ratio of 2<sup>N−1</sup> and goes non-monotonic much sooner (DNL &lt; −1).</>}
      controls={<>
        <Seg label="Architecture" value={type} onChange={upd('type')} options={[{ value: 'r2r', label: 'R-2R ladder' }, { value: 'weighted', label: 'Binary-weighted' }]} />
        <Slider label="Resolution N" value={bits} min={2} max={10} step={1} format={v => `${Math.round(v)} bits`} onChange={v => setS(p => ({ ...p, bits: Math.round(v), code: -1 }))} />
        <Slider label="Reference Vref" value={vref} min={1} max={5.5} step={0.05} unit="V" onChange={upd('vref')} />
        <Slider label="Resistor mismatch (± max error)" value={mismatch} min={0} max={0.1} step={0.0005} format={v => (v * 100).toFixed(2) + ' %'} onChange={upd('mismatch')} />
        <Slider label="Digital code" value={code} min={0} max={N - 1} step={1} format={v => `${Math.round(v)} (${bitsOf(Math.round(v))})`} onChange={v => setS(p => ({ ...p, code: Math.round(v) }))} />
        <div className="seg"><button type="button" onClick={() => setPlay(v => !v)}>{play ? 'Pause ramp' : 'Play ramp'}</button><button type="button" onClick={() => setS(p => ({ ...p, seed: p.seed + 1 }))}>New random mismatch</button></div>
        {bits > 6 && <Note>Schematic shows the {type === 'r2r' ? 'top' : 'top'} 6 bits; the full {bits}-bit network is solved.</Note>}
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <Readouts>
        <Readout k="Vout" v={si(vo, 'V', 4)} hl />
        <Readout k="Ideal Vout" v={si(ideal, 'V', 4)} />
        <Readout k="Error" v={`${((vo - ideal) / L).toFixed(3)} LSB`} tone={tone((vo - ideal) / L)} />
        <Readout k="LSB = Vref/2^N" v={si(L, 'V', 4)} />
        <Readout k="Codes / resolution" v={`${N} / ${(100 / N).toFixed(2)} % FS`} />
        <Readout k="Max |DNL|" v={`${tf.maxDnl.toFixed(3)} LSB`} tone={tone(tf.maxDnl)} />
        <Readout k="Max |INL|" v={`${tf.maxInl.toFixed(3)} LSB`} tone={tone(tf.maxInl)} />
        <Readout k="Worst step at code" v={tf.maxDnl > 1e-9 && worst > 0 ? `${bitsOf(worst - 1)} → ${bitsOf(worst)}` : 'none (ideal)'} />
      </Readouts>
      <div style={{ marginTop: 6 }}><RegionBadge label={tf.monotonic ? (tf.maxDnl < 0.5 ? 'Monotonic, DNL within ±½ LSB' : 'Monotonic') : 'NON-MONOTONIC (DNL < −1 LSB)'} color={tf.monotonic ? (tf.maxDnl < 0.5 ? 'ok' : 'warn') : 'bad'} /></div>
      <EqBox>{eq}</EqBox>
      <Plot series={[{ x: ks, y: tf.v, label: 'actual Vout', color: 'accent', step: true }, { x: ks, y: ks.map(k => vref * k / N), label: 'ideal', color: 'muted', dashed: true }]}
        xLabel="digital code" yUnit="V" yLabel="Vout" height={210} points={[{ x: code, y: vo, label: `code ${code}` }]} />
      <Plot series={[{ x: ks, y: tf.dnl, label: 'DNL', color: 'orange', step: true }, { x: ks, y: tf.inl, label: 'INL', color: 'purple' }]}
        xLabel="digital code" yUnit="LSB" yLabel="error (LSB)" height={190} hlines={[{ at: 1, label: '+1', color: 'muted' }, { at: -1, label: '−1: non-monotonic below', color: 'red' }]} points={tf.maxDnl > 1e-9 ? [{ x: worst, y: tf.dnl[worst], label: 'worst DNL' }] : []} yTickFormat={v => v.toFixed(1)} />
    </SimShell>
  );
}
