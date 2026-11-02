// PWM explorer: average/RMS, harmonic spectrum, RC-filtered output, LED and motor equivalents.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { pwmStats, harmonic, rcSteady, rcResponse, rcGain, cieLightness } from '../models/pwm-lab';

type View = 'time' | 'spectrum' | 'filter';
const tx = (s: string) => String.raw`\text{${s}}`;
const R_M = 2, L_M = 2e-3; // motor winding model used for the "motor equivalent"

export default function PwmLab({ params }: SimProps) {
  const init = {
    duty: Math.min(1, Math.max(0, Number(params.duty ?? 0.3))), f: Number(params.f ?? 1000), amp: Number(params.amp ?? 5),
    view: (['time', 'spectrum', 'filter'].includes(params.view) ? params.view : 'time') as View, rc: Number(params.rc ?? 1e-3),
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const T = 1 / s.f, D = s.duty, A = s.amp;
  const st = pwmStats(D, A);
  const ss = rcSteady(D, A, s.f, s.rc);
  const motor = rcSteady(D, A / R_M, s.f, L_M / R_M);
  const lstar = cieLightness(D);
  const flicker = s.f < 100;

  const wave = useMemo(() => rcResponse(D, A, s.f, s.rc, 3, 200, rcSteady(D, A, s.f, s.rc).vmin), [D, A, s.f, s.rc]);
  const spec = useMemo(() => {
    const N = 30; const x: number[] = [], y: number[] = [], fx: number[] = [], fy: number[] = [], ex: number[] = [], ey: number[] = [];
    for (let n = 1; n <= N; n++) {
      const c = harmonic(n, D, A), fn = n * s.f;
      x.push(fn, fn, NaN); y.push(0, c, NaN);
      fx.push(fn * 1.0, fn * 1.0, NaN); fy.push(0, c * rcGain(fn, s.rc), NaN);
      ex.push(fn); ey.push(2 * A / (n * Math.PI));
    }
    return { x, y, fx, fy, ex, ey, list: Array.from({ length: 6 }, (_, i) => harmonic(i + 1, D, A)) };
  }, [D, A, s.f, s.rc]);
  const startup = useMemo(() => {
    const nPer = Math.min(400, Math.ceil(6 * s.rc / T) + 2);
    return { ...rcResponse(D, A, s.f, s.rc, nPer, Math.max(8, Math.floor(16000 / nPer))), nPer };
  }, [D, A, s.f, s.rc, T]);

  const pctD = (D * 100).toFixed(1);

  return (
    <SimShell title="PWM explorer" onReset={() => set(init)}
      tryThis={<>(1) Set D = 50% in the spectrum view: every even harmonic disappears, and at D = 25% every 4th one does (c<sub>n</sub> ∝ |sin(nπD)|). (2) In the filter view, raise f ten times: the RC ripple drops ten times (ΔV ≈ A·D(1−D)/(f·τ)) while the average stays at D·A; ripple is worst at D = 50%.</>}
      controls={<>
        <Seg label="View" value={s.view} onChange={upd('view')} options={[{ value: 'time', label: 'Time' }, { value: 'spectrum', label: 'Spectrum' }, { value: 'filter', label: 'RC filter' }]} />
        <Slider label="Duty cycle" value={s.duty} min={0} max={1} step={0.005} format={v => (v * 100).toFixed(1) + '%'} onChange={upd('duty')} />
        <Slider label="Frequency f" value={s.f} min={1} max={1e6} log unit="Hz" onChange={upd('f')} />
        <Slider label="Amplitude A" value={s.amp} min={0.5} max={24} step={0.1} unit="V" onChange={upd('amp')} />
        <Slider label="RC time constant τ" value={s.rc} min={1e-7} max={1} log unit="s" onChange={upd('rc')} />
        <Note>f<sub>c</sub> = 1/(2πτ) = {si(1 / (2 * Math.PI * s.rc), 'Hz')}. Motor equivalent uses a winding with R = 2 Ω, L = 2 mH (τ<sub>e</sub> = 1 ms).</Note>
      </>}>
      <Readouts>
        <Readout k="Average D·A" v={si(st.avg, 'V')} hl />
        <Readout k="RMS A·√D" v={si(st.rms, 'V')} />
        <Readout k="AC RMS A·√(D(1−D))" v={si(st.acRms, 'V')} />
        <Readout k="Period / on-time" v={`${si(T, 's')} / ${si(D * T, 's')}`} />
        <Readout k="RC ripple p-p" v={si(ss.ripple, 'V')} tone={ss.ripple / A < 0.01 ? 'ok' : ss.ripple / A < 0.1 ? 'warn' : 'bad'} />
        <Readout k="Fundamental" v={`${si(spec.list[0], 'V')} @ ${si(s.f, 'Hz')}`} />
      </Readouts>
      <EqBox>{String.raw`V_{avg}=D\,A=${D.toFixed(3)}\cdot ${A.toFixed(2)}=${tx(si(st.avg, 'V'))},\quad V_{rms}=A\sqrt{D}=${tx(si(st.rms, 'V'))},\quad c_n=\frac{2A}{n\pi}\left|\sin(n\pi D)\right|`}</EqBox>

      {s.view === 'time' && <Plot xUnit="s" xLabel="t" yUnit="V" yLabel="v" height={240} series={[
        { x: wave.t, y: wave.pwm, label: 'PWM', color: 'accent', width: 2 },
      ]} hlines={[{ at: st.avg, label: `average ${si(st.avg, 'V')}`, color: 'green' }, { at: st.rms, label: `RMS ${si(st.rms, 'V')}`, color: 'orange' }]}
        xspans={[{ from: 0, to: D * T, label: 'on: D·T', color: 'accent' }]} yRange={[-0.05 * A, 1.12 * A]} />}

      {s.view === 'spectrum' && <>
        <Plot xUnit="Hz" xLabel="frequency" yUnit="V" yLabel="peak amplitude" height={250} xRange={[0, 30.5 * s.f]} series={[
          { x: spec.ex, y: spec.ey, label: 'envelope 2A/(nπ)', color: 'muted', dashed: true },
          { x: spec.x, y: spec.y, label: 'PWM harmonics', color: 'accent', width: 3 },
          { x: spec.fx, y: spec.fy, label: 'after RC filter', color: 'red', width: 3 },
        ]} points={[{ x: 0.0001 * s.f, y: st.avg, label: 'DC = D·A', color: 'green' }]} vlines={[{ at: 1 / (2 * Math.PI * s.rc), label: 'RC f_c', color: 'red' }]} />
        <Readouts>{spec.list.map((c, i) => <Readout key={i} k={`n=${i + 1} (${si((i + 1) * s.f, 'Hz')})`} v={si(c, 'V')} />)}</Readouts>
        <Note>A PWM is DC (the average) plus harmonics of f. A low-pass filter keeps the DC term and attenuates the harmonics, which is why a PWM pin plus an RC is a cheap DAC. The red bars are the same harmonics scaled by the RC gain |H| = 1/√(1+(2πnfτ)²).</Note>
      </>}

      {s.view === 'filter' && <>
        <Plot xUnit="s" xLabel="t (power-up)" yUnit="V" yLabel="v_out" height={210} series={[
          { x: startup.t, y: startup.pwm, label: 'PWM', color: 'muted', width: 1 },
          { x: startup.t, y: startup.v, label: 'RC output', color: 'accent', width: 2 },
        ]} hlines={[{ at: st.avg, label: 'D·A', color: 'green' }]} vlines={startup.t[startup.t.length - 1] > 5 * s.rc ? [{ at: 5 * s.rc, label: '5τ', color: 'orange' }] : []} />
        {startup.nPer >= 400 && <Note>τ is much longer than the period: only the first 400 periods of the start-up are drawn ({si(400 * T, 's')} of 5τ = {si(5 * s.rc, 's')}).</Note>}
        <Plot xUnit="s" xLabel="t (steady state, 3 periods)" yUnit="V" yLabel="v_out" height={190} series={[
          { x: wave.t, y: wave.v, label: 'RC output (steady state)', color: 'accent', width: 2 },
        ]} hlines={[{ at: ss.vmax, label: 'V_max', color: 'red' }, { at: ss.vmin, label: 'V_min', color: 'blue' }, { at: st.avg, label: 'D·A', color: 'green' }]} />
        <EqBox>{String.raw`\Delta V=A\frac{(1-e^{-DT/\tau})(1-e^{-(1-D)T/\tau})}{1-e^{-T/\tau}}=${tx(si(ss.ripple, 'V'))}\;\approx\;\frac{A\,D(1-D)\,T}{\tau}=${tx(si(ss.approx, 'V'))}`}</EqBox>
      </>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
          <svg viewBox="0 0 60 60" width={56} height={56} role="img" aria-label={`LED at ${pctD}% duty`}>
            <circle cx={30} cy={30} r={26} fill="var(--d-orange)" opacity={0.08 + 0.5 * D} />
            <circle cx={30} cy={30} r={14} fill="var(--d-orange)" opacity={Math.max(0.08, D)} stroke="var(--d-ink)" strokeWidth={1.5} />
          </svg>
          <div style={{ fontSize: 13 }}>
            <b>LED</b>: luminance {pctD}% of full, perceived lightness L* ≈ {lstar.toFixed(0)}%{' '}
            {flicker ? <RegionBadge label="visible flicker (<100 Hz)" color="bad" /> : <RegionBadge label="no visible flicker" color="ok" />}
            <div className="faint" style={{ fontSize: 12 }}>The eye averages above ~100 Hz; brightness looks nonlinear (CIE L*), so dimmers use gamma-corrected duty.</div>
          </div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 13 }}>
          <b>Motor</b> (R = 2 Ω, L = 2 mH): behaves like a DC supply of {si(st.avg, 'V')}. Average current {si(D * A / R_M, 'A')} (stalled),
          current ripple {si(motor.ripple, 'A')} p-p {motor.ripple > 0.2 * Math.max(1e-9, D * A / R_M) ? <RegionBadge label="raise f: audible/lossy ripple" color="warn" /> : <RegionBadge label="smooth current" color="ok" />}
          <div className="faint" style={{ fontSize: 12 }}>The winding inductance is the filter (τ<sub>e</sub> = L/R = 1 ms); speed follows the average voltage.</div>
        </div>
      </div>
    </SimShell>
  );
}
