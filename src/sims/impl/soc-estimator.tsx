// State-of-charge estimation: coulomb counting vs OCV lookup vs a blended (Kalman-style) estimator on a drive cycle.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { clamp } from '../../lib/units';
import { simulateSoc, REST_THRESH_C, ASSUMED_OFFSET, ASSUMED_GAIN, ASSUMED_SIGMA_V, T_TOTAL } from '../models/soc-estimator';
import { ocvSlope } from '../models/lipo-lab';

const pp = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(2)} pp`;

export default function SocEstimator({ params }: SimProps) {
  const init = {
    offset: clamp(Number(params.offset ?? 0.01), -0.2, 0.2),
    gainErr: clamp(Number(params.gainErr ?? 0.01), -0.1, 0.1),
    capacity: 2, vErrMv: 5, initErr: 0, tRest: 300, showOcv: true,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const r = useMemo(() => simulateSoc({ offset: s.offset, gainErr: s.gainErr, capacity: s.capacity, vErr: s.vErrMv / 1000, initErr: s.initErr, tRest: s.tRest }), [s.offset, s.gainErr, s.capacity, s.vErrMv, s.initErr, s.tRest]);
  const tm = useMemo(() => r.t.map(t => t / 60), [r]);
  const pct = (a: number[]) => a.map(v => v * 100);
  const err = (a: number[]) => a.map((v, k) => (v - r.trueSoc[k]) * 100);

  const e = { cc: r.final.cc - r.final.true, ocv: r.final.ocv - r.final.true, blend: r.final.blend - r.final.true };
  const tone = (x: number) => Math.abs(x) > 0.05 ? 'bad' as const : Math.abs(x) > 0.02 ? 'warn' as const : 'ok' as const;
  const driftPerHour = s.offset / s.capacity * 100;
  const restBlocked = Math.abs(s.offset) >= REST_THRESH_C * s.capacity;
  const tie = r.corrections.length === 0;
  const best = tie ? 'No OCV corrections: blended = coulomb count' : Math.abs(e.blend) <= Math.abs(e.cc) ? 'Blended estimator wins' : 'Coulomb counting wins (this time)';
  const plateauSlope = ocvSlope(0.5);

  return (
    <SimShell title="SoC estimation: coulomb counting vs OCV vs blended" onReset={() => set(init)}
      tryThis={<>raise the current-sensor offset to 30 mA: the coulomb counter drifts by I<sub>off</sub>·t/Q ≈ {(0.03 / s.capacity * 100).toFixed(1)} %/h and never recovers, but the blended estimator snaps back at each park. Push the offset past C/50 = {si(REST_THRESH_C * s.capacity, 'A')} and the BMS can no longer even detect rest, so it never corrects. Then set the voltage error to 15 mV and watch the OCV correction degrade on the flat 40–70% plateau (only ~{(plateauSlope * 10).toFixed(1)} mV per 1% SoC there, so 15 mV ≈ {(1.5 / plateauSlope).toFixed(1)}% SoC).</>}
      controls={<>
        <Slider label="Current-sensor offset" value={s.offset} min={-0.2} max={0.2} step={0.001} format={v => si(v, 'A')} onChange={upd('offset')} />
        <Slider label="Current-sensor gain error" value={s.gainErr} min={-0.1} max={0.1} step={0.001} format={v => (v * 100).toFixed(1) + '%'} onChange={upd('gainErr')} />
        <Slider label="Voltage-sensor error" value={s.vErrMv} min={-20} max={20} step={0.5} format={v => v.toFixed(1) + ' mV'} onChange={upd('vErrMv')} />
        <Slider label="Initial SoC error (counters)" value={s.initErr} min={-0.15} max={0.15} step={0.005} format={v => pp(v)} onChange={upd('initErr')} />
        <Slider label="Cell capacity Q" value={s.capacity} min={0.5} max={10} step={0.1} unit="Ah" format={v => si(v, 'Ah')} onChange={upd('capacity')} />
        <Slider label="Rest time before OCV is trusted" value={s.tRest} min={60} max={900} step={30} format={v => `${(v / 60).toFixed(1)} min`} onChange={upd('tRest')} />
        <Toggle label="Show raw OCV-lookup trace" checked={s.showOcv} onChange={upd('showOcv')} />
        <Note>Drive cycle: 4 × (20 min of 2C bursts, 0.5C cruise, −0.8C regen, stops) + 15 min parked. Cell: 1-RC model, R<sub>0</sub> = 60 mΩ, R<sub>1</sub> = 40 mΩ, τ = 40 s. Blended estimator assumes ±{si(ASSUMED_OFFSET, 'A')}, ±{ASSUMED_GAIN * 100}% current and ±{ASSUMED_SIGMA_V * 1000} mV voltage accuracy.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={best} color={tie ? 'warn' : Math.abs(e.blend) <= Math.abs(e.cc) ? 'ok' : 'warn'} />
        {restBlocked && <RegionBadge label="Offset > rest threshold: rest never detected" color="bad" />}
        <span className="sim-note">{r.corrections.length} OCV correction{r.corrections.length === 1 ? '' : 's'} applied (gain K = {r.corrections.map(c => c.k.toFixed(2)).join(', ') || '—'})</span>
      </div>
      <Readouts>
        <Readout k="True SoC at end" v={(r.final.true * 100).toFixed(1) + '%'} hl />
        <Readout k="Coulomb-count error" v={pp(e.cc)} tone={tone(e.cc)} />
        <Readout k="OCV-lookup error (now, at rest)" v={pp(e.ocv)} tone={tone(e.ocv)} />
        <Readout k="Blended error" v={pp(e.blend)} tone={tone(e.blend)} />
        <Readout k="Worst error CC / OCV / blend" v={`${(r.maxErr.cc * 100).toFixed(1)} / ${(r.maxErr.ocv * 100).toFixed(0)} / ${(r.maxErr.blend * 100).toFixed(1)} pp`} />
        <Readout k="Offset drift rate" v={`${driftPerHour >= 0 ? '−' : '+'}${Math.abs(driftPerHour).toFixed(2)} %/h`} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}\widehat{\text{SoC}}_{CC}(t) = \text{SoC}_0 - \frac{1}{3600\,Q}\int I_{meas}\,dt \\ I_{meas} = I(1+\varepsilon_g) + I_{off} \\ e_{CC} = -\frac{I_{off}\,t + \varepsilon_g\!\int I\,dt}{3600\,Q} \\ = -\frac{${(s.offset * 1000).toFixed(0)}\,\text{mA}\cdot ${(T_TOTAL / 3600).toFixed(2)}\,\text{h} + ${(s.gainErr * 100).toFixed(1)}\%\cdot ${r.ahNet.toFixed(2)}\,\text{Ah}}{${s.capacity.toFixed(1)}\,\text{Ah}} = ${(r.predictedCcErr * 100).toFixed(2)}\,\text{pp}\end{gathered}`}</EqBox>
      <Plot height={260} xLabel="Time (min)" yLabel="SoC" yUnit="%" yRange={[0, 100]}
        xspans={r.rests.map(x => ({ from: x.from / 60, to: x.to / 60, label: 'rest', color: 'green' }))}
        series={[
          ...(s.showOcv ? [{ x: tm, y: pct(r.ocvEst), label: 'OCV lookup', color: 'orange', width: 1 }] : []),
          { x: tm, y: pct(r.trueSoc), label: 'True SoC', color: 'ink', width: 3.5 },
          { x: tm, y: pct(r.cc), label: 'Coulomb count', color: 'red', dashed: true },
          { x: tm, y: pct(r.blend), label: 'Blended', color: 'accent' },
        ]}
        points={r.corrections.map(c => ({ x: c.t / 60, y: c.after * 100, color: 'accent' }))} />
      <Plot height={210} xLabel="Time (min)" yLabel="Estimate − true" yUnit="pp" yRange={[-Math.max(4, r.maxErr.cc * 120, r.maxErr.blend * 120), Math.max(4, r.maxErr.cc * 120, r.maxErr.blend * 120)]}
        series={[
          { x: tm, y: err(r.cc), label: 'Coulomb count', color: 'red' },
          { x: tm, y: err(r.blend), label: 'Blended', color: 'accent' },
        ]}
        hlines={[{ at: 0, color: 'muted' }]} />
      <span className="sim-note">Error plot omits the raw OCV lookup (its worst error this run: {(r.maxErr.ocv * 100).toFixed(0)} pp, under load).</span>
      <Plot height={150} xLabel="Time (min)" yLabel="Current" yUnit="A" series={[{ x: tm, y: r.i, label: 'Cell current (+ = discharge)', color: 'blue', width: 1 }]} />
      <Note>OCV lookup reads low under discharge and high during regen: the I·R drop divided by a slope of only ~{(plateauSlope * 10).toFixed(1)} mV per 1% SoC on the plateau gives tens of percent of error. It is only trustworthy after the RC polarisation has relaxed (≈5τ). Coulomb counting is smooth but integrates every sensor error forever; the blended estimator uses each when it is good.</Note>
    </SimShell>
  );
}
