// Sample & hold: tracking RC, acquisition time to N bits, droop, charge-injection pedestal, kT/C.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { shMetrics, shSimulate, settleCurve } from '../models/sample-hold';

const n = (v: any, d: number) => { const x = Number(v); return isFinite(x) && v !== null && v !== '' ? x : d; };

export default function SampleHold({ params }: SimProps) {
  const init = {
    ron: n(params.ron, 100), ch: n(params.ch, 10e-12), tsample: n(params.tsample, 100e-9), ileak: n(params.ileak, 1e-9),
    bits: Math.round(n(params.bits, 12)), qinj: 2e-15, thold: 900e-9, vfs: 2.5, input: 'step' as 'step' | 'sine', fin: 1e5,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const m = useMemo(() => shMetrics(s), [s]);
  const w = useMemo(() => shSimulate(s, s.input, s.fin, 3, 160), [s]);
  const sc = useMemo(() => settleCurve(s), [s]);

  const lsbOf = (v: number) => v / m.lsb;
  const settleL = lsbOf(m.settleErr), pedL = lsbOf(Math.abs(m.pedestal)), droopL = lsbOf(m.droop), noiseL = lsbOf(m.ktc);
  const tone = (x: number) => (x <= 0.5 ? 'ok' : x <= 2 ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad';
  const worst = Math.max(settleL, pedL + droopL, noiseL * 3);
  const verdict = settleL > 0.5 ? { l: 'Not settled: sample too short', c: 'bad' as const }
    : pedL + droopL > 0.5 ? { l: 'Hold error > ½ LSB', c: 'warn' as const }
    : noiseL * 3 > 0.5 ? { l: 'kT/C noise limits accuracy', c: 'warn' as const }
    : { l: `${m.N}-bit accurate`, c: 'ok' as const };

  // error during hold, in LSB, relative to the input value at the sampling instant
  const holdErr = useMemo(() => {
    const x: number[] = [], y: number[] = [];
    for (let i = 0; i < w.t.length; i++) {
      if (w.sampling[i]) { x.push(w.t[i]); y.push(NaN); continue; }
      const c = w.cycle[i];
      x.push(w.t[i]); y.push((w.vh[i] - w.held[c].vin) / m.lsb);
    }
    return { x, y };
  }, [w, m.lsb]);
  const T = s.tsample + s.thold;
  const spans = [0, 1, 2].map(c => ({ from: c * T, to: c * T + s.tsample, label: c === 0 ? 'sample' : undefined, color: 'green' }));

  const schematic = useMemo(() => renderCircuit({
    elements: [
      { t: 'Vac', a: [0, 3], b: [0, 7], label: 'V_{in}', value: s.input === 'sine' ? si(s.fin, 'Hz') : 'step' },
      { t: 'wire', pts: [[0, 3], [0, 1], [2, 1]] },
      { t: 'R', a: [2, 1], b: [6, 1], label: 'R_{on}', value: si(s.ron, 'Ω') },
      { t: 'SW', a: [6, 1], b: [9, 1], label: 'φ_S', value: si(s.tsample, 's'), color: 'green' },
      { t: 'wire', pts: [[9, 1], [11, 1], [11, 3]] },
      { t: 'C', a: [11, 3], b: [11, 7], label: 'C_H', value: si(s.ch, 'F') },
      { t: 'dot', at: [11, 1] },
      { t: 'wire', pts: [[11, 1], [15, 1], [15, 3]] }, { t: 'dot', at: [15, 1] },
      { t: 'I', a: [15, 3], b: [15, 7], label: 'I_{leak}', value: si(s.ileak, 'A'), color: 'orange' },
      { t: 'wire', pts: [[15, 1], [19, 1], [19, 2]] },
      { t: 'opamp', at: [19, 3], swap: true, label: '×1' },
      { t: 'wire', pts: [[23, 3], [25, 3]] }, { t: 'dot', at: [24.2, 3] },
      { t: 'term', at: [25, 3], label: 'V_{out}', side: 'right' },
      { t: 'wire', pts: [[19, 4], [18.4, 4], [18.4, 5.6], [24.2, 5.6], [24.2, 3]] },
      { t: 'wire', pts: [[0, 7], [0, 8], [15, 8], [15, 7]] }, { t: 'wire', pts: [[11, 7], [11, 8]] }, { t: 'dot', at: [11, 8] },
      { t: 'gnd', at: [6, 8] },
      { t: 'text', at: [5, 3.6], text: `τ = R_{on}C_H = ${si(m.tau, 's')}`, color: 'accent', anchor: 'start' },
      { t: 'text', at: [5, 4.9], text: `Q_{inj} = ${si(s.qinj, 'C')}`, color: 'red', anchor: 'start' },
    ],
  }).svg, [s, m.tau]);

  return (
    <SimShell title="Sample & hold: acquisition, droop and pedestal" onReset={() => set(init)}
      tryThis={<>(1) Shrink t<sub>sample</sub> below t<sub>acq</sub> (≈ {((m.N + 1) * Math.LN2).toFixed(1)}·τ for {m.N} bits): the held value no longer reaches the new level and the hold-error plot jumps far outside ±½ LSB. (2) Now make C<sub>H</sub> 10× smaller to settle faster: acquisition improves, but droop (I<sub>leak</sub>/C<sub>H</sub>), pedestal (Q<sub>inj</sub>/C<sub>H</sub>) and kT/C noise all grow. That is the core S/H trade-off.</>}
      controls={<>
        <Seg label="Input" value={s.input} options={[{ value: 'step', label: 'FS steps' }, { value: 'sine', label: 'Sine' }]} onChange={upd('input')} />
        {s.input === 'sine' && <Slider label="Input frequency" value={s.fin} min={1e3} max={5e7} log unit="Hz" onChange={upd('fin')} />}
        <Slider label="Switch on-resistance Ron" value={s.ron} min={1} max={10e3} log unit="Ω" onChange={upd('ron')} />
        <Slider label="Hold capacitor CH" value={s.ch} min={0.1e-12} max={10e-9} log unit="F" onChange={upd('ch')} />
        <Slider label="Sample (track) time" value={s.tsample} min={1e-9} max={10e-6} log unit="s" onChange={upd('tsample')} />
        <Slider label="Hold time" value={s.thold} min={10e-9} max={1e-3} log unit="s" onChange={upd('thold')} />
        <Slider label="Leakage current Ileak" value={s.ileak} min={1e-12} max={1e-6} log unit="A" onChange={upd('ileak')} />
        <Slider label="Injected charge Qinj" value={s.qinj} min={0} max={500e-15} step={1e-15} unit="C" onChange={upd('qinj')} />
        <Slider label="Resolution N" value={s.bits} min={6} max={18} step={1} format={v => `${v} bits`} onChange={v => upd('bits')(Math.round(v))} />
        <Select label="ADC full scale" value={String(s.vfs)} options={[1, 2.5, 3.3, 5].map(v => ({ value: String(v), label: `${v} V (1 LSB = ${si(v / 2 ** s.bits, 'V')})` }))} onChange={v => upd('vfs')(Number(v))} />
        <Note>Tracking is an exact first-order RC update; droop is linear at I<sub>leak</sub>/C<sub>H</sub>; the pedestal is a step of Q<sub>inj</sub>/C<sub>H</sub> at switch-off (a near-constant offset that dummy switches or bottom-plate sampling cancel). Errors are compared with ½ LSB.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegionBadge label={verdict.l} color={verdict.c} />
        <span className="faint" style={{ fontSize: 12.5 }}>worst error ≈ {worst.toFixed(2)} LSB</span>
      </div>
      <Readouts>
        <Readout k="τ = Ron·CH" v={si(m.tau, 's')} />
        <Readout k={`t_acq (${m.N}-bit, ½ LSB)`} v={si(m.tacq, 's')} hl tone={s.tsample >= m.tacq ? 'ok' : 'bad'} />
        <Readout k="Settling error" v={settleL < 0.01 ? '< 0.01 LSB' : `${settleL.toPrecision(3)} LSB`} tone={tone(settleL)} />
        <Readout k="Bits settled in t_sample" v={m.settledBits > 40 ? '> 40' : m.settledBits.toFixed(1)} tone={m.settledBits >= m.N ? 'ok' : 'bad'} />
        <Readout k="Pedestal Qinj/CH" v={`${si(m.pedestal, 'V')} (${pedL.toFixed(2)} LSB)`} tone={tone(pedL)} />
        <Readout k="Droop rate" v={si(m.droopRate, 'V/s')} />
        <Readout k="Droop over hold" v={`${si(m.droop, 'V')} (${droopL.toFixed(2)} LSB)`} tone={tone(droopL)} />
        <Readout k="Max hold for ½ LSB" v={si(m.tholdMax, 's')} />
        <Readout k="kT/C noise (rms)" v={`${si(m.ktc, 'V')} (${noiseL.toFixed(2)} LSB)`} tone={tone(noiseL * 3)} />
        <Readout k="Track bandwidth" v={si(m.f3db, 'Hz')} />
        <Readout k="Sample rate" v={si(m.fs, 'S/s')} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}t_{acq} = (N+1)\ln 2\cdot R_{on}C_H = ${m.N + 1}\cdot 0.693\cdot ${si(m.tau, '\\text{s}')} = ${si(m.tacq, '\\text{s}')}\\ \Delta V_{droop} = \frac{I_{leak}\,t_{hold}}{C_H} = ${si(m.droop, '\\text{V}')},\quad \Delta V_{ped} = \frac{Q_{inj}}{C_H} = ${si(m.pedestal, '\\text{V}')}\end{gathered}`}</EqBox>
      <Plot series={[{ x: w.t, y: w.vin, label: 'V_in', color: 'muted', dashed: true }, { x: w.t, y: w.vh, label: 'V_hold (C_H)', color: 'accent' }]}
        xUnit="s" yUnit="V" xLabel="Time" yLabel="Voltage" height={220} xspans={spans}
        points={w.held.map(h => ({ x: h.t, y: h.v, color: 'red' }))} />
      <Plot series={[{ x: holdErr.x, y: holdErr.y, label: 'V_hold − V_in(sample instant)', color: 'red' }]}
        xUnit="s" xLabel="Time" yLabel="Hold error (LSB)" height={190} xRange={[0, 3 * T]} xspans={spans}
        hlines={[{ at: 0.5, label: '±½ LSB', color: 'green' }, { at: -0.5, color: 'green' }]} />
      <Plot series={[{ x: sc.t, y: sc.e.map(e => e / m.lsb), label: 'FS-step settling error', color: 'blue' }]}
        yLog xUnit="s" xLabel="Time into sample phase" yLabel="Error (LSB)" height={190}
        yRange={[1e-3, 2 ** m.N * 1.5]}
        hlines={[{ at: 0.5, label: '½ LSB', color: 'green' }]}
        vlines={[{ at: m.tacq, label: 't_acq', color: 'orange' }, { at: s.tsample, label: 't_sample', color: 'accent' }]} />
    </SimShell>
  );
}
