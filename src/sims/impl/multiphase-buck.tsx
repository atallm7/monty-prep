// Multiphase interleaved buck: per-phase vs summed current, ripple cancellation, loss scaling, transient.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { linspace } from '../../lib/units';
import { multiphase, rippleRatio, losses, transient, mpDefaults } from '../models/multiphase-buck';

type View = 'currents' | 'cancel' | 'losses' | 'transient';
const COLORS = ['blue', 'green', 'orange', 'purple', 'red', 'muted'];
const tx = (s: string) => String.raw`\text{${s}}`;

export default function MultiphaseBuck({ params }: SimProps) {
  const d0 = mpDefaults();
  const init = {
    phases: Math.max(1, Math.min(6, Math.round(Number(params.phases ?? 2)))), vin: Number(params.vin ?? d0.vin), vout: Number(params.vout ?? d0.vout),
    iout: Number(params.iout ?? d0.iout), l: Number(params.l ?? d0.l), fsw: Number(params.fsw ?? d0.fsw), c: d0.c, esr: d0.esr, r: d0.r, step: 20, view: 'currents' as View,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const inp = useMemo(() => ({ ...d0, ...s, vout: Math.min(s.vout, s.vin * 0.95) }), [s]);
  const r = useMemo(() => multiphase(inp), [inp]);
  const N = r.N;

  const cancel = useMemo(() => {
    const Ds = linspace(0.005, 0.995, 400);
    return Ds.length ? [1, 2, 3, 4, 5, 6].map(n => ({ n, x: Ds, y: Ds.map(D => rippleRatio(n, D)) })) : [];
  }, []);
  const lossN = useMemo(() => [1, 2, 3, 4, 5, 6].map(n => losses(inp, n)), [inp]);
  const tr = useMemo(() => { const one = transient(inp, 1, s.step); return { one, me: transient(inp, N, s.step, 0.5, one.tEnd) }; }, [inp, N, s.step]);

  const phaseOpts = [1, 2, 3, 4, 5, 6].map(n => ({ value: String(n), label: String(n) }));
  const best = lossN.reduce((b, x, i) => x.total < lossN[b].total ? i : b, 0) + 1;

  return (
    <SimShell title="Multiphase (interleaved) buck" onReset={() => set(init)}
      tryThis={<>(1) Set V<sub>out</sub> = 6 V (D = 0.5) with 2 phases: the summed ripple vanishes although each phase still ripples {si(r.dIph, 'A')}. Try 4 phases at D = 0.25 too. (2) In the transient view compare 1 vs 6 phases for a {s.step} A step: the effective inductance is L/N, so the current slews N times faster and the undershoot shrinks.</>}
      controls={<>
        <Seg label="Phases N" value={String(s.phases)} onChange={v => upd('phases')(Number(v))} options={phaseOpts} />
        <Seg label="Plot" value={s.view} onChange={upd('view')} options={[{ value: 'currents', label: 'Currents' }, { value: 'cancel', label: 'Cancellation' }, { value: 'losses', label: 'Losses' }, { value: 'transient', label: 'Transient' }]} />
        <Slider label="Input voltage Vin" value={s.vin} min={2} max={24} step={0.1} unit="V" onChange={upd('vin')} />
        <Slider label="Output voltage Vout" value={s.vout} min={0.5} max={Math.max(1, s.vin * 0.95)} step={0.01} unit="V" onChange={upd('vout')} />
        <Slider label="Load current Iout" value={s.iout} min={1} max={200} log unit="A" onChange={upd('iout')} />
        <Slider label="Inductance per phase L" value={s.l} min={47e-9} max={10e-6} log unit="H" onChange={upd('l')} />
        <Slider label="Switching freq fsw (per phase)" value={s.fsw} min={100e3} max={3e6} log unit="Hz" onChange={upd('fsw')} />
        <Slider label="Output capacitance C" value={s.c} min={10e-6} max={5e-3} log unit="F" onChange={upd('c')} />
        <Slider label="Cap ESR" value={s.esr} min={0.0001} max={0.02} log unit="Ω" onChange={upd('esr')} />
        <Slider label="R per phase (Rds + DCR)" value={s.r} min={0.0005} max={0.05} log unit="Ω" onChange={upd('r')} />
        <Slider label="Load step ΔI" value={s.step} min={1} max={150} log unit="A" onChange={upd('step')} />
        <Note>Phases are identical and shifted by 360°/N; ideal current sharing. Per phase: Qg = 15 nC (×2 FETs) at 5 V, Coss = 1 nF, t<sub>r</sub> = t<sub>f</sub> = 5 ns.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {r.K < 0.02 ? <RegionBadge label={`N·D = ${(N * r.D).toFixed(2)}: ripple fully cancels`} color="ok" /> : <RegionBadge label={`Ripple cancellation K = ${r.K.toFixed(3)}`} color={r.K < 0.5 ? 'accent' : 'info'} />}
        {r.dIph / 2 > r.idc && <RegionBadge label="Per-phase current reverses (light load per phase)" color="warn" />}
      </div>
      <Readouts>
        <Readout k="Duty D" v={(r.D * 100).toFixed(1) + '%'} />
        <Readout k="Per-phase DC" v={si(r.idc, 'A')} hl />
        <Readout k="Per-phase ripple ΔI" v={si(r.dIph, 'A')} />
        <Readout k="Summed ripple ΔI_sum" v={si(r.dIsum, 'A')} hl />
        <Readout k="Ripple frequency N·fsw" v={si(r.fEff, 'Hz')} />
        <Readout k="Output ripple ΔV" v={si(r.dV, 'V')} />
        <Readout k="Conduction loss" v={si(r.cond, 'W')} />
        <Readout k="Efficiency (model)" v={(r.eff * 100).toFixed(1) + '%'} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}\frac{\Delta I_{sum}}{\Delta I_{ph}}=\frac{N\,(D-\tfrac{m}{N})(\tfrac{m+1}{N}-D)}{D(1-D)}=${r.K.toFixed(3)}\;(m=\lfloor ND\rfloor=${Math.floor(N * r.D + 1e-12)})\\ P_{cond}=\frac{I_{out}^2R}{N}+\frac{N\,\Delta I_{ph}^2R}{12}=${tx(si(r.cond, 'W'))}\end{gathered}`}</EqBox>

      {s.view === 'currents' && <>
        <Plot xUnit="s" xLabel="t" yUnit="A" yLabel="per-phase i_L" height={200} xRange={[0, 2 * r.T]}
          series={r.ph.map((y, k) => ({ x: r.t, y, label: `phase ${k + 1}`, color: COLORS[k] }))} hlines={[{ at: r.idc, label: 'Iout/N', color: 'muted' }]} />
        <Plot xUnit="s" xLabel="t" yUnit="A" yLabel="Σ i_L" height={200} xRange={[0, 2 * r.T]}
          series={[{ x: r.t, y: r.sum, label: `sum of ${N} phases (ripple at ${si(r.fEff, 'Hz')})`, color: 'accent', width: 2.4 }]}
          hlines={[{ at: s.iout, label: 'I_out', color: 'muted' }]} yRange={[s.iout - Math.max(r.dIph, 1e-3) * 0.75, s.iout + Math.max(r.dIph, 1e-3) * 0.75]} />
        <Note>Both plots use a y-range of ±¾ of the per-phase ripple, so you can compare directly: the summed current is the same DC, but with ripple K·ΔI<sub>ph</sub> at N times the frequency, which also makes the output capacitor&apos;s job N² easier for the same ΔV (ΔV ≈ ΔI<sub>sum</sub>/(8·C·N·f<sub>sw</sub>)).</Note>
      </>}

      {s.view === 'cancel' && <Plot xLabel="duty cycle D" yLabel="ΔI_sum / ΔI_phase" height={260} xRange={[0, 1]} yRange={[0, 1.05]}
        series={cancel.map(c => ({ x: c.x, y: c.y, label: `N=${c.n}`, color: c.n === N ? 'accent' : 'muted', width: c.n === N ? 2.6 : 1, dashed: c.n !== N }))}
        points={[{ x: r.D, y: r.K, label: 'now', color: 'red' }]} vlines={Array.from({ length: N - 1 }, (_, k) => ({ at: (k + 1) / N, color: 'green' }))} />}

      {s.view === 'losses' && <>
        <Plot xLabel="number of phases N" yUnit="W" yLabel="loss" height={240} xRange={[0.8, 6.8]}
          series={[
            { x: [1, 2, 3, 4, 5, 6], y: lossN.map(l => l.cond), label: 'conduction (∝ 1/N)', color: 'blue', points: true },
            { x: [1, 2, 3, 4, 5, 6], y: lossN.map(l => l.fixed), label: 'gate + Coss (∝ N)', color: 'orange', points: true },
            { x: [1, 2, 3, 4, 5, 6], y: lossN.map(l => l.swOverlap), label: 'V·I overlap (const.)', color: 'purple', points: true, dashed: true },
            { x: [1, 2, 3, 4, 5, 6], y: lossN.map(l => l.total), label: 'total', color: 'accent', points: true, width: 2.4 },
          ]} vlines={[{ at: N, label: 'now', color: 'red' }]} points={[{ x: best, y: lossN[best - 1].total, label: `min at N=${best}`, color: 'green' }]} />
        <Note>Splitting I<sub>out</sub> over N phases cuts I²R loss by N, but every phase brings its own gate charge and C<sub>oss</sub> loss. At heavy load (CPU/GPU rails) conduction dominates, so more phases win; at light load controllers &quot;shed&quot; phases for the same reason.</Note>
      </>}

      {s.view === 'transient' && <>
        <Plot xUnit="s" xLabel="time after load step" yUnit="V" yLabel="V_out" height={220}
          series={[{ x: tr.one.t, y: tr.one.v, label: '1 phase', color: 'muted', dashed: true }, { x: tr.me.t, y: tr.me.v, label: `${N} phases`, color: 'accent', width: 2.4 }]}
          hlines={[{ at: inp.vout, label: 'V_out', color: 'muted' }]} />
        <Plot xUnit="s" xLabel="time after load step" yUnit="A" yLabel="ΔΣi_L" height={180}
          series={[{ x: tr.one.t, y: tr.one.i, label: '1 phase', color: 'muted', dashed: true }, { x: tr.me.t, y: tr.me.i, label: `${N} phases (slew ${si(tr.me.slew * 1e-6, 'A')}/µs)`, color: 'accent', width: 2.4 }]}
          hlines={[{ at: s.step, label: 'new load', color: 'orange' }]} />
        <Readouts>
          <Readout k="Undershoot (1 phase)" v={si(tr.one.undershoot, 'V')} />
          <Readout k={`Undershoot (${N} phases)`} v={si(tr.me.undershoot, 'V')} hl />
          <Readout k="Reaction delay" v={si(tr.me.td, 's')} />
          <Readout k="Slew time" v={si(tr.me.tr, 's')} />
          <Readout k="Recovery time (1 / N)" v={`${si(tr.one.tRecover, 's')} / ${si(tr.me.tRecover, 's')}`} />
        </Readouts>
        <EqBox>{String.raw`\Delta V\approx ESR\,\Delta I+\frac{\Delta I\,t_d}{C}+\frac{(L/N)\,\Delta I^2}{2C\,(V_{in}-V_{out})}\le ${tx(si(tr.me.under, 'V'))}`}</EqBox>
        <Note>Idealised best-case controller: after a delay t<sub>d</sub> (half a phase slot, T/2N) all phases switch to 100% duty, so Σi<sub>L</sub> ramps at N(V<sub>in</sub>−V<sub>out</sub>)/L. It then overshoots the current just enough to put back the charge the capacitor lost, so V<sub>out</sub> recovers with no overshoot. Real loops are slower, but scale the same way.</Note>
      </>}
    </SimShell>
  );
}
