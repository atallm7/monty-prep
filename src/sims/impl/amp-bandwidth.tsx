// Gain-bandwidth product and slew rate: Bode view, slew-limited sine, and step-response views.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { logspace } from '../../lib/units';
import { openLoop, closedLoop, fClosed, fpole, dcGain, fullPowerBW, sineResponse, stepResponse } from '../models/amp-bandwidth';

type View = 'bode' | 'slew' | 'step';
const db = (x: number) => 20 * Math.log10(Math.max(1e-12, x));

export default function AmpBandwidth({ params }: SimProps) {
  const init = {
    view: (['bode', 'slew', 'step'].includes(params.view) ? params.view : 'bode') as View,
    gbw: Number(params.gbw ?? 1e6), a0: Number(params.a0 ?? 1e5), gain: Math.max(1, Number(params.gain ?? 10)), sr: Number(params.sr ?? 0.5e6),
    vp: 2, fsig: 20e3, vstep: 0.1,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const p = { gbw: s.gbw, a0: s.a0, gain: s.gain, sr: s.sr };
  const f3 = fClosed(p), fp = fpole(p), g = dcGain(p);
  const fpbw = fullPowerBW(s.sr, s.vp);

  const bode = useMemo(() => {
    const fmax = Math.max(10 * s.gbw, 10 * f3);
    const fs = logspace(Math.min(0.1, fp / 10), fmax, 300);
    return { fs, ol: fs.map(f => db(openLoop(p, f).mag)), cl: fs.map(f => db(closedLoop(p, f).mag)), olp: fs.map(f => openLoop(p, f).phase), clp: fs.map(f => closedLoop(p, f).phase) };
  }, [s.gbw, s.a0, s.gain]);
  const sine = useMemo(() => s.view === 'slew' ? sineResponse(p, s.vp, s.fsig) : null, [s.view, s.gbw, s.a0, s.gain, s.sr, s.vp, s.fsig]);
  const step = useMemo(() => s.view === 'step' ? stepResponse(p, s.vstep) : null, [s.view, s.gbw, s.a0, s.gain, s.sr, s.vstep]);
  const stepThreshold = s.sr / (2 * Math.PI * f3); // output step above which the initial slope exceeds SR

  const region = s.view === 'bode' ? (s.gain >= s.a0 / 3 ? { l: 'Gain ≈ A0: little loop gain left', c: 'warn' as const } : { l: `Loop gain ${db(s.a0 / s.gain).toFixed(0)} dB at DC`, c: 'ok' as const })
    : s.view === 'slew' ? (sine!.slewLimited ? { l: 'Slew-rate limited (distorted)', c: 'bad' as const } : s.fsig > f3 / 2 ? { l: 'Bandwidth limited (attenuated)', c: 'warn' as const } : { l: 'Linear, undistorted', c: 'ok' as const })
      : (step!.slewLimited ? { l: 'Large-signal step: slewing', c: 'warn' as const } : { l: 'Small-signal step: single pole', c: 'ok' as const });

  return (
    <SimShell title="Gain-bandwidth & slew rate" onReset={() => set(init)}
      tryThis={s.view === 'bode' ? <>step the noise gain from 1 to 10 to 100: the closed-loop curve always meets the open-loop line, so the bandwidth falls 10× each time (constant GBW). Then lower A0 and watch the closed-loop DC gain fall short of G.</>
        : s.view === 'slew' ? <>at 2 V peak, sweep f past the full-power bandwidth SR/(2πV<sub>p</sub>): the sine turns into a triangle even though f is far below the small-signal bandwidth. Halve V<sub>p</sub> and the FPBW doubles.</>
          : <>compare a 0.1 V step (exponential, t<sub>r</sub> ≈ 0.35/BW) with a 5 V step: the large step ramps at SR and takes about 0.8·ΔV/SR, far longer than 0.35/BW predicts.</>}
      controls={<>
        <Seg label="View" value={s.view} options={[{ value: 'bode', label: 'Bode' }, { value: 'slew', label: 'Slew (sine)' }, { value: 'step', label: 'Step' }]} onChange={upd('view')} />
        <Slider label="Gain-bandwidth GBW" value={s.gbw} min={1e4} max={1e9} log unit="Hz" onChange={upd('gbw')} />
        <Slider label="Open-loop DC gain A0" value={s.a0} min={100} max={1e7} log format={v => `${si(v, '')} (${db(v).toFixed(0)} dB)`} onChange={upd('a0')} />
        <Slider label="Closed-loop noise gain G" value={s.gain} min={1} max={1000} log format={v => `${v.toPrecision(3)} V/V (${db(v).toFixed(1)} dB)`} onChange={upd('gain')} />
        <Slider label="Slew rate SR" value={s.sr} min={1e4} max={1e9} log format={v => `${(v / 1e6).toPrecision(3)} V/µs`} onChange={upd('sr')} />
        {s.view === 'slew' && <>
          <Slider label="Output amplitude Vp" value={s.vp} min={0.05} max={10} step={0.05} unit="V" onChange={upd('vp')} />
          <Slider label="Signal frequency" value={s.fsig} min={100} max={1e8} log unit="Hz" onChange={upd('fsig')} />
        </>}
        {s.view === 'step' && <Slider label="Output step size" value={s.vstep} min={0.01} max={10} log unit="V" onChange={upd('vstep')} />}
        <Note>Single-pole op-amp: A(f) = A0/(1 + jf/f<sub>p</sub>) with f<sub>p</sub> = GBW/A0, in a non-inverting stage of noise gain G = 1 + R2/R1 (β = 1/G).</Note>
      </>}>
      <div><RegionBadge label={region.l} color={region.c} /></div>
      {s.view === 'bode' && <>
        <EqBox>{String.raw`f_{-3\text{dB}} = f_p\left(1+\frac{A_0}{G}\right) \approx \frac{\text{GBW}}{G} = \frac{${si(s.gbw, 'Hz')}}{${s.gain.toPrecision(3)}} = ${si(f3, 'Hz')}`}</EqBox>
        <Plot series={[{ x: bode.fs, y: bode.ol, label: '|A| open loop', color: 'muted', width: 2 }, { x: bode.fs, y: bode.cl, label: '|A_CL| closed loop', color: 'accent', width: 2.4 }]}
          xLog xUnit="Hz" yUnit="dB" xLabel="frequency" yLabel="magnitude" height={260} yRange={[Math.min(-20, db(g) - 40), db(s.a0) + 10]}
          hlines={[{ at: db(g), label: `G = ${db(g).toFixed(1)} dB`, color: 'orange' }, { at: 0, color: 'muted' }]}
          vlines={[{ at: fp, label: 'f_p', color: 'muted' }, { at: f3, label: 'f_{-3dB}', color: 'accent' }, { at: s.gbw, label: 'GBW', color: 'red' }]}
          points={[{ x: f3, y: db(g) - 3.01, label: '−3 dB' }]} />
        <Plot series={[{ x: bode.fs, y: bode.olp, label: 'open-loop phase', color: 'muted' }, { x: bode.fs, y: bode.clp, label: 'closed-loop phase', color: 'accent' }]}
          xLog xUnit="Hz" yUnit="°" xLabel="frequency" yLabel="phase" height={170} yRange={[-95, 5]} legend={false} vlines={[{ at: f3, color: 'accent' }]} hlines={[{ at: -45, label: '−45°', color: 'muted' }]} />
      </>}
      {s.view === 'slew' && sine && <>
        <EqBox>{String.raw`f_{FP} = \frac{SR}{2\pi V_p} = \frac{${(s.sr / 1e6).toPrecision(3)}\,\text{V}/\mu\text{s}}{2\pi\cdot ${s.vp.toFixed(2)}\,\text{V}} = ${si(fpbw, 'Hz')}\qquad \text{needed: } 2\pi f V_p = ${(2 * Math.PI * s.fsig * s.vp / 1e6).toPrecision(3)}\,\text{V}/\mu\text{s}`}</EqBox>
        <Plot series={[{ x: sine.t, y: sine.ideal, label: 'ideal G·vin', color: 'muted', dashed: true }, { x: sine.t, y: sine.out, label: 'actual vout', color: 'accent', width: 2.4 }]}
          xUnit="s" yUnit="V" xLabel="time" yLabel="vout" height={260} yRange={[-s.vp * 1.2, s.vp * 1.2]} />
      </>}
      {s.view === 'step' && step && <>
        <EqBox>{step.slewLimited
          ? String.raw`t_{10\text{–}90} \approx \frac{0.8\,\Delta V}{SR} = ${si(0.8 * s.vstep / s.sr, 's')}\ \ (\text{measured } ${si(step.tr, 's')})\quad\text{vs}\quad \frac{0.35}{BW} = ${si(0.35 / f3, 's')}`
          : String.raw`t_r = \tau\ln 9 = \frac{\ln 9}{2\pi f_{-3\text{dB}}} \approx \frac{0.35}{BW} = ${si(0.35 / f3, 's')}\quad(\text{measured } ${si(step.tr, 's')})`}</EqBox>
        <Plot series={[{ x: step.t, y: step.ideal, label: 'ideal (step)', color: 'muted', dashed: true, step: true }, { x: step.t, y: step.out, label: 'vout', color: 'accent', width: 2.4 }]}
          xUnit="s" yUnit="V" xLabel="time" yLabel="vout" height={260} yRange={[-0.1 * s.vstep, 1.15 * s.vstep]}
          hlines={[{ at: 0.1 * s.vstep, label: '10%', color: 'muted' }, { at: 0.9 * s.vstep, label: '90%', color: 'muted' }]} vlines={[{ at: step.tau, label: 'τ', color: 'orange' }]} />
      </>}
      <Readouts>
        <Readout k="Closed-loop BW" v={si(f3, 'Hz')} hl />
        <Readout k="Open-loop pole fp" v={si(fp, 'Hz')} />
        <Readout k="Actual DC gain" v={`${g.toPrecision(5)} V/V`} tone={g < 0.99 * s.gain ? 'warn' : undefined} />
        <Readout k="Loop gain A0/G" v={`${db(s.a0 / s.gain).toFixed(1)} dB`} />
        <Readout k="Small-signal tr ≈ 0.35/BW" v={si(0.35 / f3, 's')} />
        <Readout k="Full-power BW @ Vp" v={si(fpbw, 'Hz')} tone={s.view === 'slew' && s.fsig > fpbw ? 'bad' : undefined} />
        {s.view === 'slew' && sine && <Readout k="Output peak" v={`${si(sine.outPk, 'V')} (${(100 * sine.outPk / s.vp).toFixed(0)}%)`} tone={sine.slewLimited ? 'bad' : undefined} />}
        {s.view === 'step' && step && <Readout k="Measured 10–90%" v={si(step.tr, 's')} tone={step.slewLimited ? 'warn' : 'ok'} />}
        {s.view === 'step' && <Readout k="Slews above step of" v={si(stepThreshold, 'V')} />}
      </Readouts>
    </SimShell>
  );
}
