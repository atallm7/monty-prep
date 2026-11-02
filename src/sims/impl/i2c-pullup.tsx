// I²C pull-up sizing: Rp(min) from VOL/IOL, Rp(max) from rise time; RC bus waveform vs 30/70 % thresholds.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace, E12 } from '../../lib/units';
import { pullup, busWave, SPEC, LN_73, I2cMode } from '../models/i2c-pullup';

function suggest(rpMin: number, rpMax: number) {
  // largest E12 value with ~20 % margin below Rp(max) (Cb is rarely known well) that still meets Rp(min)
  let best = NaN;
  for (let d = 10; d <= 1e5; d *= 10) for (const e of E12) { const v = Math.round(e * d); if (v <= 0.8 * rpMax && v >= rpMin * 1.05) best = isFinite(best) ? Math.max(best, v) : v; }
  return best;
}

export default function I2cPullup({ params }: SimProps) {
  const m0 = String(params.mode ?? 'fast');
  const init = {
    vdd: Number(params.vdd ?? 3.3) || 3.3, cb: Number(params.cb ?? 200e-12) || 200e-12, rp: Number(params.rp ?? 4700) || 4700,
    mode: (['standard', 'fast', 'fastplus'].includes(m0) ? m0 : 'fast') as I2cMode,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const r = useMemo(() => pullup(s), [s]);
  const w = useMemo(() => busWave(s, 2, 800), [s]);
  const sug = suggest(r.rpMin, r.rpMax);

  const window = useMemo(() => {
    const cbs = logspace(10e-12, 1e-9, 120);
    return { cbs, max: cbs.map(c => r.sp.tr / (LN_73 * c)) };
  }, [r.sp.tr]);

  const status = r.status === 'strong' ? { l: `Too strong: VOL = ${si(r.vLow, 'V')} > ${si(r.VOL, 'V')} at the ${si(r.sp.iol, 'A')} sink limit`, c: 'bad' as const }
    : r.status === 'weak' ? { l: `Too weak: tr = ${si(r.tr, 's')} > ${si(r.sp.tr, 's')} spec`, c: 'bad' as const }
    : { l: 'Pull-up within spec window', c: 'ok' as const };

  const schematic = useMemo(() => renderCircuit({
    elements: [
      { t: 'rail', at: [4, 1], label: `V_{DD} = ${si(s.vdd, 'V')}`, dir: 'up' },
      { t: 'R', a: [4, 1], b: [4, 5], label: 'R_p', value: si(s.rp, 'Ω'), color: r.status === 'ok' ? 'green' : 'red' },
      { t: 'wire', pts: [[4, 5], [16, 5]], flow: false }, { t: 'dot', at: [4, 5] },
      { t: 'wire', pts: [[4, 5], [1, 5]] }, { t: 'term', at: [1, 5], label: 'SDA', side: 'left' },
      { t: 'C', a: [8, 5], b: [8, 9], label: 'C_b', value: si(s.cb, 'F') }, { t: 'dot', at: [8, 5] },
      { t: 'wire', pts: [[8, 9], [8, 11]] }, { t: 'gnd', at: [8, 11] },
      { t: 'wire', pts: [[13, 5], [13, 7]] }, { t: 'dot', at: [13, 5] },
      { t: 'nmos', at: [11, 9], label: 'open-drain' },
      { t: 'wire', pts: [[13, 11], [13, 12]] }, { t: 'gnd', at: [13, 12] },
      { t: 'term', at: [11, 9], label: 'drive', side: 'left' },
      { t: 'box', at: [16, 3], w: 4, h: 4, label: 'other\ndevices', pins: [{ side: 'left', pos: 2, name: '' }] },
      { t: 'text', at: [10, 2.6], text: `τ = R_pC_b = ${si(s.rp * s.cb, 's')}`, color: 'accent', anchor: 'start' },
    ],
  }).svg, [s, r]);

  const T = w.T;
  return (
    <SimShell title="I²C pull-up sizing & rise time" onReset={() => set(init)}
      tryThis={<>(1) At the default 200 pF in Fast-mode, the classic 4.7 kΩ gives t<sub>r</sub> ≈ 0.8 µs, nearly three times the 300 ns limit. The waveform never spends long above V<sub>IH</sub>. Drag R<sub>p</sub> down into the green window ({si(r.rpMin, 'Ω')} to {si(r.rpMax, 'Ω')}). (2) Keep going below R<sub>p(min)</sub>: the driver can no longer pull the line below 0.4 V at 3 mA. Switch to Fast-mode Plus to see how its 20 mA sink widens the window.</>}
      controls={<>
        <Seg label="Speed mode" value={s.mode} options={[{ value: 'standard', label: 'Sm 100k' }, { value: 'fast', label: 'Fm 400k' }, { value: 'fastplus', label: 'Fm+ 1M' }]} onChange={upd('mode')} />
        <Slider label="Supply VDD" value={s.vdd} min={1.2} max={5.5} step={0.1} unit="V" onChange={upd('vdd')} />
        <Slider label="Bus capacitance Cb" value={s.cb} min={10e-12} max={1e-9} log unit="F" onChange={upd('cb')} />
        <Slider label="Pull-up Rp" value={s.rp} min={100} max={100e3} log unit="Ω" onChange={upd('rp')} />
        {isFinite(sug) ? <button className="btn btn-sm" type="button" onClick={() => upd('rp')(sug)} style={{ whiteSpace: 'normal' }}>Use {si(sug, 'Ω')} (largest E12 with 20% tr margin)</button>
          : <Note>No standard value fits with margin. Reduce C<sub>b</sub>, lower the speed, or use a bus buffer or active (current-source) pull-up.</Note>}
        <Note>Cb is the sum of pin capacitances (≈ 10 pF each), trace (≈ 1 pF/cm) and cable. The limits are {si(r.sp.cbMax, 'F')} max and t<sub>r</sub> ≤ {si(r.sp.tr, 's')} for {r.sp.label}.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <RegionBadge label={status.l} color={status.c} />
        {!r.cbOk && <RegionBadge label={`Cb exceeds ${si(r.sp.cbMax, 'F')} spec`} color="bad" />}
        {!r.window && <RegionBadge label="No valid Rp: Rp(min) > Rp(max)" color="bad" />}
      </div>
      <Readouts>
        <Readout k="Rp(min) = (VDD−VOL)/IOL" v={si(r.rpMin, 'Ω')} tone={s.rp >= r.rpMin ? 'ok' : 'bad'} />
        <Readout k="Rp(max) = tr/(0.8473·Cb)" v={si(r.rpMax, 'Ω')} tone={s.rp <= r.rpMax ? 'ok' : 'bad'} />
        <Readout k="Rise time 30→70%" v={si(r.tr, 's')} hl tone={r.tr <= r.sp.tr ? 'ok' : 'bad'} />
        <Readout k="Spec tr(max)" v={si(r.sp.tr, 's')} />
        <Readout k="Low level VOL" v={si(r.vLow, 'V')} tone={r.vLow <= r.VOL + 1e-9 ? 'ok' : 'bad'} />
        <Readout k="Sink current (low)" v={si(r.iLow, 'A')} />
        <Readout k="Fall time 70→30%" v={si(r.tf, 's')} />
        <Readout k="Power while low" v={si(r.pStatic, 'W')} />
        <Readout k="Max SCL (tHIGH after rise)" v={si(r.fMaxRise, 'Hz')} tone={r.fMaxRise >= r.sp.f ? 'ok' : 'warn'} />
      </Readouts>
      <EqBox>{String.raw`\frac{V_{DD}-V_{OL}}{I_{OL}} = ${si(r.rpMin, '\\Omega')} \;\le\; R_p = ${si(s.rp, '\\Omega')} \;\le\; \frac{t_r}{0.8473\,C_b} = \frac{${si(r.sp.tr, '\\text{s}')}}{0.8473\cdot ${si(s.cb, '\\text{F}')}} = ${si(r.rpMax, '\\Omega')}`}</EqBox>
      <Plot series={[{ x: w.t, y: w.v, label: 'bus voltage', color: 'accent' },
        { x: w.t, y: w.t.map(t => ((t % T) / T < 0.5 ? s.vdd : 0)), label: 'driver released / pulling', color: 'muted', dashed: true, step: true }]}
        xUnit="s" yUnit="V" xLabel={`Time (SCL at ${si(r.sp.f, 'Hz')})`} yLabel="SDA / SCL" height={220} yRange={[-0.1 * s.vdd, 1.12 * s.vdd]}
        hlines={[{ at: 0.7 * s.vdd, label: 'V_IH = 0.7 VDD', color: 'green' }, { at: 0.3 * s.vdd, label: 'V_IL = 0.3 VDD', color: 'orange' }, { at: r.VOL, label: 'VOL max', color: 'red' }]}
        xspans={[{ from: 0, to: Math.min(T / 2, r.tr / LN_73 * Math.log(1 / 0.3)), label: '0→70 %', color: r.tr <= r.sp.tr ? 'green' : 'red' }]} />
      <Plot series={[{ x: window.cbs, y: window.max, label: 'Rp(max) = tr/(0.8473 Cb)', color: 'blue' }, { x: window.cbs, y: window.cbs.map(() => r.rpMin), label: 'Rp(min)', color: 'red', dashed: true }]}
        xLog yLog xUnit="F" yUnit="Ω" xLabel="Bus capacitance Cb" yLabel="Rp" height={210} yRange={[50, 2e5]}
        vlines={[{ at: r.sp.cbMax, label: 'Cb max', color: 'orange' }]}
        points={[{ x: s.cb, y: s.rp, label: 'design', color: r.status === 'ok' ? 'green' : 'red' }]} />
      <Note>The valid design region lies between the red Rp(min) line and the blue Rp(max) curve. A larger Rp saves power, because each low bit burns V<sub>DD</sub>²/R<sub>p</sub>. A smaller Rp gives faster edges.</Note>
    </SimShell>
  );
}
