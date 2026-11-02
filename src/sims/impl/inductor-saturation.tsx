// Inductor saturation & core materials: L vs DC current and the current runaway under a voltage pulse.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { linspace } from '../../lib/units';
import { makeL, ramp, CORES, Core } from '../models/inductor-saturation';

const CORE_OPTS: { value: Core; label: string }[] = [
  { value: 'ferrite', label: 'Ferrite' }, { value: 'powder', label: 'Powder' }, { value: 'nano', label: 'Nano' }, { value: 'air', label: 'Air' },
];
const CORE_COLOR: Record<Core, string> = { ferrite: 'accent', powder: 'green', nano: 'purple', air: 'muted' };
const num0 = (v: any, d: number, lo: number, hi: number) => { const n = Number(v); return isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : d; };
const tx = (v: number, u: string) => String.raw`\text{${si(v, u)}}`;

export default function InductorSaturation({ params }: SimProps) {
  const core: Core = (['ferrite', 'powder', 'air', 'nano'] as const).includes(params.core) ? params.core : 'ferrite';
  const l0 = num0(params.l0 ?? 10e-6, 10e-6, 1e-7, 0.1);
  const isat = num0(params.isat ?? 3, 3, 0.01, 200);
  const v = num0(params.v ?? 12, 12, 0.1, 1000);
  const init = { core, l0, isat, v, r: 0.05, tp: Math.min(1e-3, Math.max(1e-7, 1.25 * l0 * isat / v)), lim: false, ilim: 1.5 * isat, td: 100e-9 };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (val: (typeof s)[K]) => set(p => ({ ...p, [k]: val }));

  const r = useMemo(() => ramp({ core: s.core, l0: s.l0, isat: s.isat, v: s.v, r: s.r, tp: s.tp, ...(s.lim ? { ilim: s.ilim, td: s.td } : {}) }), [s]);
  const L = useMemo(() => makeL(s.core, s.l0, s.isat), [s.core, s.l0, s.isat]);

  const curves = useMemo(() => {
    const xMax = Math.max(3 * s.isat, Math.min(r.ipk * 1.25, 6 * s.isat));
    const xs = linspace(0, xMax, 240);
    return { xMax, xs, ys: (['ferrite', 'powder', 'nano', 'air'] as Core[]).map(c => { const f = makeL(c, s.l0, s.isat); return { c, y: xs.map(f) }; }) };
  }, [s.l0, s.isat, r.ipk]);

  const lRatio = r.lEnd / s.l0;
  const region = s.core === 'air' ? { l: 'Air core: linear at any current', c: 'info' as const }
    : lRatio > 0.9 ? { l: 'Linear region (L ≈ L0)', c: 'ok' as const }
    : lRatio > 0.5 ? { l: `Entering saturation: L = ${(lRatio * 100).toFixed(0)}% of L0`, c: 'warn' as const }
    : { l: `Saturated: L = ${(lRatio * 100).toFixed(1)}% of L0`, c: 'bad' as const };
  const idealPk = r.iIdeal[r.iIdeal.length - 1];
  const yTop = Math.max(r.ipk, idealPk, s.isat) * 1.1;

  const svg = useMemo(() => renderCircuit({ elements: [
    { t: 'V', a: [0, 2], b: [0, 6], label: 'V', value: si(s.v, 'V') },
    { t: 'wire', pts: [[0, 2], [0, 0], [1, 0]] },
    { t: 'SWclosed', a: [1, 0], b: [5, 0], label: 'SW', value: `on for ${si(s.tp, 's')}` },
    { t: 'wire', pts: [[5, 0], [6, 0]], flow: true },
    { t: 'R', a: [6, 0], b: [10, 0], label: 'R', value: si(s.r, 'Ω') + ' (DCR+R_{on})' },
    { t: 'wire', pts: [[10, 0], [12, 0], [12, 1]] },
    { t: s.core === 'air' ? 'L' : 'Lcore', a: [12, 1], b: [12, 7], label: 'L(I)', value: `L_0=${si(s.l0, 'H')}`, color: lRatio < 0.5 ? 'red' : lRatio < 0.9 ? 'orange' : 'accent' },
    { t: 'wire', pts: [[12, 7], [12, 8], [0, 8], [0, 6]] }, 
    { t: 'arrow', a: [9, 9.2], b: [3, 9.2], label: `I_{pk} = ${si(r.ipk, 'A')}` },
  ] }).svg, [s.v, s.tp, s.r, s.core, s.l0, lRatio, r.ipk]);

  const eq = String.raw`\frac{dI}{dt}=\frac{V-IR}{L(I)}:\quad \underbrace{\frac{${tx(s.v, 'V')}}{${tx(s.l0, 'H')}}=${tx(r.slope0 * 1e-6, 'A')}/\mu s}_{t=0}\;\to\;\underbrace{${tx(Math.max(0, r.slopeEnd) * 1e-6, 'A')}/\mu s}_{\text{end},\;L=${tx(r.lEnd, 'H')}}\qquad \lambda=\!\int\! V\,dt = L_0 I_{sat}\ \text{at}\ t\approx\frac{L_0 I_{sat}}{V}`;

  return (
    <SimShell title="Inductor saturation & core materials" onReset={() => set(init)}
      tryThis={<>with the ferrite core, lengthen the pulse past the dashed ideal line's I<sub>sat</sub> crossing: the current bends upward as L collapses, and the slope at the end is many times V/L<sub>0</sub>. Switch to powder iron at the same L<sub>0</sub> and I<sub>sat</sub>: it starts losing inductance earlier but never falls off a cliff. Then enable the current limit at 1.5·I<sub>sat</sub> with a 100 ns comparator delay and compare the overshoot with a limit set below I<sub>sat</sub>: the same delay costs far more current once the core is saturated.</>}
      controls={<>
        <Seg label="Core material" value={s.core} options={CORE_OPTS} onChange={upd('core')} />
        <Slider label="Small-signal inductance L0" value={s.l0} min={1e-7} max={1e-3} log unit="H" onChange={upd('l0')} />
        <Slider label="Saturation current Isat (L −30%)" value={s.isat} min={0.1} max={50} log unit="A" onChange={upd('isat')} />
        <Slider label="Applied voltage V" value={s.v} min={1} max={100} log unit="V" onChange={upd('v')} />
        <Slider label="Pulse width (switch on-time)" value={s.tp} min={1e-7} max={1e-3} log unit="s" onChange={upd('tp')} />
        <Slider label="Series R (DCR + switch)" value={s.r} min={0} max={2} step={0.01} unit="Ω" onChange={upd('r')} />
        <Toggle label="Peak current limit (switch turns off)" checked={s.lim} onChange={upd('lim')} />
        {s.lim && <>
          <Slider label="Current limit Ilim" value={s.ilim} min={0.1} max={100} log unit="A" onChange={upd('ilim')} />
          <Slider label="Comparator + driver delay" value={s.td} min={0} max={500e-9} step={5e-9} unit="s" onChange={upd('td')} />
        </>}
        <Note>{CORES[s.core].info}</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <RegionBadge label={region.l} color={region.c} />
        {s.lim && <RegionBadge label={r.limited ? `Limit tripped: overshoot ${si(r.ipk - s.ilim, 'A')}` : 'Limit not reached'} color={r.limited ? (r.ipk > 1.2 * s.ilim ? 'bad' : 'ok') : 'info'} />}
      </div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <Readouts>
        <Readout k="Peak current" v={si(r.ipk, 'A')} hl tone={r.ipk > 1.5 * s.isat && s.core !== 'air' ? 'bad' : r.ipk > s.isat && s.core !== 'air' ? 'warn' : 'ok'} />
        <Readout k="Ideal peak (L = L0)" v={si(r.limited ? NaN : idealPk, 'A')} />
        <Readout k="L at peak" v={`${si(r.lEnd, 'H')} (${(lRatio * 100).toFixed(1)}%)`} />
        <Readout k="Slope start → end" v={`${si(r.slope0 * 1e-6, 'A')}/µs → ${si(Math.max(0, r.slopeEnd) * 1e-6, 'A')}/µs`} />
        <Readout k="Reaches Isat at" v={isNaN(r.tSat) ? 'not reached' : `${si(r.tSat, 's')} (ideal ${si(r.tSatIdeal, 's')})`} />
        <Readout k="Flux linkage λ" v={si(r.lambda, 'Wb')} />
        <Readout k="Stored energy ∫I dλ" v={si(r.estored, 'J')} />
        <Readout k="½·L0·Isat²" v={si(0.5 * s.l0 * s.isat ** 2, 'J')} />
        <Readout k="Lost in R" v={si(r.eloss, 'J')} />
      </Readouts>
      <EqBox>{eq}</EqBox>
      <Plot height={240} xUnit="s" yUnit="A" xLabel="time since switch on" yLabel="inductor current" yRange={[0, yTop]}
        series={[
          { x: r.tIdeal, y: r.iIdeal, label: 'ideal: constant L0', color: 'muted', dashed: true },
          { x: r.t, y: r.i, label: `${CORES[s.core].label}`, color: CORE_COLOR[s.core] === 'muted' ? 'blue' : CORE_COLOR[s.core], width: 2.5 },
        ]}
        hlines={[{ at: s.isat, label: 'Isat', color: 'orange' }, ...(s.lim ? [{ at: s.ilim, label: 'Ilim', color: 'red' }] : [])]}
        vlines={isNaN(r.tSat) ? [] : [{ at: r.tSat, label: 'saturation', color: 'orange' }]} />
      <Plot height={220} xUnit="A" yUnit="H" xLabel="DC current" yLabel="inductance L(I)" xRange={[0, curves.xMax]} yRange={[0, s.l0 * 1.08]}
        series={curves.ys.map(c => ({ x: curves.xs, y: c.y, label: CORES[c.c].label, color: CORE_COLOR[c.c], dashed: c.c !== s.core, width: c.c === s.core ? 2.5 : 1.2 }))}
        vlines={[{ at: s.isat, label: 'Isat', color: 'orange' }]}
        hlines={[{ at: 0.7 * s.l0, label: '70% L0', color: 'muted' }]}
        points={r.ipk <= curves.xMax ? [{ x: r.ipk, y: L(r.ipk), label: 'peak now' }] : []} />
      <Note>Saturation is set by flux, not current: B ∝ λ = ∫V dt, so it is the volt-seconds applied that drive a core into saturation. Bsat also falls with temperature (ferrite loses roughly 20–30% from 25 °C to 100 °C), which is why a design that was fine on the bench can run away hot.</Note>
    </SimShell>
  );
}
