// Crosstalk between two coupled traces: NEXT / FEXT, spacing, height, coupled length and rise time.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Toggle, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { crosstalk, waveforms, traceWidth } from '../models/crosstalk';
import { logspace } from '../../lib/units';

export default function Crosstalk({ params }: SimProps) {
  const init = { spacing: Number(params.spacing ?? 0.2), h: Number(params.h ?? 0.1), len: Number(params.len ?? 50), tr: Number(params.tr ?? 200e-12), vagg: 3.3, stripline: false, guard: false };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const c = useMemo(() => crosstalk(s), [s]);
  const w = useMemo(() => waveforms(s, 500), [s]);
  const sw = useMemo(() => { const xs = logspace(0.05, 5, 70); return { x: xs, y: xs.map(sp => 100 * crosstalk({ ...s, spacing: sp }).nextFrac), yf: xs.map(sp => 100 * Math.abs(crosstalk({ ...s, spacing: sp }).fextFrac)) }; }, [s]);
  const lw = useMemo(() => { const xs = logspace(1, 500, 60); return { x: xs, y: xs.map(l => 100 * crosstalk({ ...s, len: l }).nextFrac), yf: xs.map(l => 100 * Math.abs(crosstalk({ ...s, len: l }).fextFrac)) }; }, [s]);
  const w3 = c.threeW; // 3W rule: centre spacing 3W -> edge spacing 2W
  const pct = (f: number) => (f * 100).toFixed(2) + ' %';
  const tone = (f: number) => Math.abs(f) > 0.05 ? 'bad' as const : Math.abs(f) > 0.02 ? 'warn' as const : 'ok' as const;
  const ps = (x: number) => x * 1e12;
  const badge = Math.abs(c.nextFrac) > 0.05 ? { l: 'High crosstalk: increase spacing / lower height', c: 'bad' as const } : Math.abs(c.nextFrac) > 0.02 ? { l: 'Marginal crosstalk', c: 'warn' as const } : { l: 'Low crosstalk', c: 'ok' as const };

  return (
    <SimShell title="Crosstalk between traces" onReset={() => set(init)}
      tryThis={<>double the spacing from 0.2 mm to 0.4 mm: the coupling coefficient k<sub>L</sub> = 1/(1+(s/h)²) drops from 0.20 to 0.06 and near-end crosstalk falls by about 3×. Then shrink the coupled length below the saturation length ({si(c.Lsat / 1000, 'm')} here): NEXT shrinks in proportion to length, but past it adding more parallel run no longer raises NEXT, while FEXT keeps growing. Finally tick “Grounded guard trace” or switch to stripline (FEXT drops to zero).</>}
      controls={<>
        <Slider label="Edge-to-edge spacing s" value={s.spacing} min={0.05} max={5} log unit="m" format={v => v.toPrecision(2) + ' mm'} onChange={upd('spacing')} />
        <Slider label="Height above plane h" value={s.h} min={0.05} max={1} log format={v => v.toPrecision(2) + ' mm'} onChange={upd('h')} />
        <Slider label="Coupled length" value={s.len} min={1} max={500} log format={v => v.toPrecision(3) + ' mm'} onChange={upd('len')} />
        <Slider label="Rise time (10–90 %)" value={s.tr} min={50e-12} max={10e-9} log unit="s" onChange={upd('tr')} />
        <Slider label="Aggressor swing" value={s.vagg} min={0.5} max={5} step={0.1} unit="V" onChange={upd('vagg')} />
        <Seg label="Stackup" value={s.stripline ? 'strip' : 'micro'} onChange={v => upd('stripline')(v === 'strip')} options={[{ value: 'micro', label: 'Microstrip' }, { value: 'strip', label: 'Stripline' }]} />
        <Toggle label="Grounded guard trace between lines (stitched vias)" checked={s.guard} onChange={upd('guard')} />
        <Note>Trace width is set for ≈50 Ω (w ≈ 1.8·h = {traceWidth(s.h).toPrecision(2)} mm). The 3W rule needs centre-to-centre ≥ 3w, i.e. edge spacing ≥ {w3.toPrecision(2)} mm. FR-4, εr = 4.3, v = {si(c.v, 'm/s')}.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><RegionBadge label={badge.l} color={badge.c} /><RegionBadge label={c.saturated ? 'NEXT saturated (len ≥ Lsat)' : 'NEXT still growing with length'} color={c.saturated ? 'info' : 'accent'} /></div>
      <Readouts>
        <Readout k="NEXT (near-end) peak" v={`${si(c.next, 'V')} (${pct(c.nextFrac)})`} hl tone={tone(c.nextFrac)} />
        <Readout k="FEXT (far-end) peak" v={`${si(c.fext, 'V')} (${pct(c.fextFrac)})`} hl tone={tone(c.fextFrac)} />
        <Readout k="kL = Lm/L, kC = Cm/C" v={`${c.kL.toFixed(3)}, ${c.kC.toFixed(3)}`} />
        <Readout k="Kb = (kC+kL)/4" v={c.Kb.toFixed(4)} />
        <Readout k="Saturation length tr·v/2" v={si(c.Lsat / 1000, 'm')} />
        <Readout k="One-way delay Td" v={si(c.Td, 's')} />
      </Readouts>
      <EqBox>{String.raw`V_{NEXT}=K_b\,V\min\!\left(1,\tfrac{2T_d}{t_r}\right)=${c.nextFrac.toFixed(4)}V,\quad V_{FEXT}=\tfrac12\left(\tfrac{C_m}{C}-\tfrac{L_m}{L}\right)\tfrac{T_d}{t_r}V=${c.fextFrac.toFixed(4)}V`}</EqBox>
      <Plot series={[{ x: w.t.map(ps), y: w.va, label: 'Aggressor', color: 'muted', dashed: true }, { x: w.t.map(ps), y: w.next, label: 'Victim near end (NEXT)', color: 'red' }, { x: w.t.map(ps), y: w.fext, label: 'Victim far end (FEXT)', color: 'blue' }]}
        xUnit="ps" yUnit="V" xLabel="time" yLabel="Voltage" height={230} vlines={[{ at: ps(2 * c.Td), label: '2Td', color: 'muted' }]} />
      <Plot series={[{ x: sw.x, y: sw.y, label: 'NEXT vs spacing', color: 'red' }, { x: sw.x, y: sw.yf, label: '|FEXT| vs spacing', color: 'blue' }]}
        xLog xUnit="m" xTickFormat={v => v.toPrecision(1) + ' mm'} yUnit="%" xLabel="Edge spacing s" yLabel="Crosstalk (% of swing)" height={210}
        vlines={[{ at: w3, label: '3W rule', color: 'green' }]} points={[{ x: s.spacing, y: 100 * c.nextFrac, label: 'now', color: 'accent' }]} />
      <Plot series={[{ x: lw.x, y: lw.y, label: 'NEXT vs coupled length', color: 'red' }, { x: lw.x, y: lw.yf, label: '|FEXT| vs coupled length', color: 'blue' }]}
        xLog yUnit="%" xTickFormat={v => (v >= 10 ? v.toFixed(0) : v.toPrecision(2)) + ' mm'} xLabel="Coupled length" yLabel="Crosstalk (% of swing)" height={210}
        vlines={[{ at: c.Lsat, label: 'Lsat', color: 'orange' }]} points={[{ x: s.len, y: 100 * c.nextFrac, label: 'now', color: 'accent' }]} />
    </SimShell>
  );
}
