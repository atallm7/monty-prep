// Ringing from parasitic L and C: probe ground lead, trace stub, MOSFET gate loop.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { analyze, overshootOf, CONTEXTS, RingContext, rCrit } from '../models/ringing-lc';

const ctxOf = (v: any): RingContext => (v === 'trace' || v === 'gate' ? v : 'probe');

export default function RingingLC({ params }: SimProps) {
  const ctx0 = ctxOf(params.context); const d0 = CONTEXTS[ctx0];
  const init = { ctx: ctx0, l: Number(params.l ?? d0.l), c: Number(params.c ?? d0.c), r: Number(params.r ?? d0.r), tr: Number(params.tr ?? d0.tr), v: d0.v };
  const [s, set] = useState(init);
  const upd = (k: 'l' | 'c' | 'r' | 'tr' | 'v') => (v: number) => set(p => ({ ...p, [k]: v }));
  const pick = (c: RingContext) => { const d = CONTEXTS[c]; set({ ctx: c, l: d.l, c: d.c, r: d.r, tr: d.tr, v: d.v }); };
  const cx = CONTEXTS[s.ctx];
  const a = useMemo(() => analyze({ l: s.l, c: s.c, r: s.r, tr: s.tr, v: s.v }), [s]);
  const sweep = useMemo(() => {
    const rc = rCrit(s.l, s.c), xs = logspace(rc / 100, rc * 5, 36);
    return { x: xs, y: xs.map(r => 100 * overshootOf({ l: s.l, c: s.c, r, tr: s.tr, v: 1 })) };
  }, [s.l, s.c, s.tr]);

  const schematic = useMemo(() => renderCircuit({
    elements: [
      { t: 'Vsq', a: [0, 2], b: [0, 6], label: 'edge', value: `t_r ${si(s.tr, 's')}` },
      { t: 'wire', pts: [[0, 2], [0, 0], [1, 0]] },
      { t: 'R', a: [1, 0], b: [5, 0], label: 'R', value: si(s.r, 'Ω'), color: a.zeta >= 1 ? 'green' : 'orange' },
      { t: 'L', a: [5, 0], b: [10, 0], label: 'L', value: si(s.l, 'H'), color: 'red' },
      { t: 'wire', pts: [[10, 0], [13, 0]], flow: true },
      { t: 'dot', at: [13, 0] },
      { t: 'C', a: [13, 0], b: [13, 5], label: 'C', value: si(s.c, 'F'), color: 'blue' },
      { t: 'term', at: [16, 0], label: 'V_C', side: 'right' }, { t: 'wire', pts: [[13, 0], [16, 0]] },
      { t: 'wire', pts: [[0, 6], [0, 7], [13, 7], [13, 5]] }, { t: 'gnd', at: [6, 7] },
      { t: 'region', at: [4.4, -2.2], w: 9.4, h: 3.4, label: `${cx.lLabel} / ${cx.cLabel}`, color: 'orange' },
    ],
  }).svg, [s, a.zeta, cx]);

  const badge = a.zeta < 0.2 ? { l: `Severe ringing, Q = ${a.q.toFixed(1)}`, c: 'bad' as const } : a.zeta < 0.7 ? { l: `Underdamped, ζ = ${a.zeta.toFixed(2)}`, c: 'warn' as const } : a.zeta < 1 ? { l: `Near-optimal damping, ζ = ${a.zeta.toFixed(2)}`, c: 'ok' as const } : { l: a.regime === 'overdamped' ? 'Overdamped (slow, no ring)' : 'Critically damped', c: 'info' as const };
  const ns = a.t; const [f0n, f0u] = si(a.f0, 'Hz').split(' '); const f0tex = `${f0n}\\,\\text{${f0u}}`;

  return (
    <SimShell title={`Ringing from parasitic L and C: ${cx.name}`} onReset={() => set(init)}
      tryThis={<>start with the {cx.name.toLowerCase()} preset and look at the overshoot ({(a.overshoot * 100).toFixed(0)} % here). Raise the series resistance toward R<sub>crit</sub> = 2√(L/C) = {si(a.rcrit, 'Ω')}: ζ → 1 and the ring disappears. Alternatively slow the edge until t<sub>r</sub> ≳ T<sub>0</sub> ({si(a.T0, 's')}): the edge no longer excites the resonance. Finally cut L by 4× (a shorter loop): f<sub>0</sub> doubles and the amplitude of the ring drops. In practice: {cx.fix}.</>}
      controls={<>
        <Seg label="Context (loads typical values)" value={s.ctx} onChange={pick} options={(Object.keys(CONTEXTS) as RingContext[]).map(k => ({ value: k, label: k === 'probe' ? 'Probe' : k === 'trace' ? 'Trace' : 'Gate' }))} />
        <Slider label={`Parasitic L (${cx.lLabel})`} value={s.l} min={0.5e-9} max={1e-6} log unit="H" onChange={upd('l')} />
        <Slider label={`C (${cx.cLabel})`} value={s.c} min={0.5e-12} max={20e-9} log unit="F" onChange={upd('c')} />
        <Slider label={`Series R (${cx.rLabel})`} value={s.r} min={0.01} max={1000} log unit="Ω" onChange={upd('r')} />
        <Slider label="Edge rise time (10–90 %)" value={s.tr} min={50e-12} max={100e-9} log unit="s" onChange={upd('tr')} />
        <Slider label="Step amplitude" value={s.v} min={0.5} max={20} step={0.1} unit="V" onChange={upd('v')} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => set(p => ({ ...p, r: rCrit(p.l, p.c) }))}>Set R = R<sub>crit</sub></button>
          <button className="btn btn-sm" onClick={() => set(p => ({ ...p, l: Math.max(0.5e-9, p.l / 4) }))}>Shorten loop (L ÷ 4)</button>
        </div>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><RegionBadge label={badge.l} color={badge.c} /></div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <Readouts>
        <Readout k="Ring frequency f₀" v={si(a.f0, 'Hz')} hl />
        <Readout k="Damping ζ  (Q)" v={`${a.zeta.toFixed(3)}  (${isFinite(a.q) ? a.q.toFixed(2) : '∞'})`} tone={a.zeta < 0.5 ? 'bad' : a.zeta < 0.7 ? 'warn' : 'ok'} />
        <Readout k="Overshoot (this edge)" v={`${(a.overshoot * 100).toFixed(1)} %  (${si(a.peak, 'V')})`} hl tone={a.overshoot > 0.2 ? 'bad' : a.overshoot > 0.05 ? 'warn' : 'ok'} />
        <Readout k="Overshoot (ideal step)" v={`${(a.stepOS * 100).toFixed(1)} %`} />
        <Readout k="Settling (±2 %)" v={si(a.settle, 's')} />
        <Readout k="R_crit = 2√(L/C)" v={si(a.rcrit, 'Ω')} />
        <Readout k="t_r / T₀" v={a.trRatio.toFixed(2)} />
      </Readouts>
      <EqBox>{String.raw`f_0=\frac{1}{2\pi\sqrt{LC}}=${f0tex},\quad \zeta=\frac R2\sqrt{\frac CL}=${a.zeta.toFixed(3)},\quad OS_{step}=e^{-\pi\zeta/\sqrt{1-\zeta^2}}=${(a.stepOS * 100).toFixed(1)}\%`}</EqBox>
      <Plot series={[{ x: ns, y: a.vs, label: 'Input edge', color: 'muted', dashed: true }, { x: ns, y: a.vc, label: 'V_C (node that rings)', color: 'accent' }]}
        xUnit="s" yUnit="V" xLabel="time" yLabel="Voltage" height={250} hlines={[{ at: s.v, label: 'final value', color: 'green' }, { at: 1.1 * s.v, color: 'orange' }]} />
      <Plot series={[{ x: sweep.x, y: sweep.y, label: 'Overshoot vs series R (this edge)', color: 'accent' }]} xLog xUnit="Ω" yUnit="%" xLabel="Series resistance" yLabel="Overshoot" height={190}
        vlines={[{ at: a.rcrit, label: 'R_crit', color: 'green' }]} points={[{ x: s.r, y: a.overshoot * 100, label: 'now', color: 'accent' }]} />
    </SimShell>
  );
}
