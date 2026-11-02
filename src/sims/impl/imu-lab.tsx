// IMU lab: double-integration drift of accelerometer bias/noise, gyro angle drift, and a complementary filter.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { simulateDrift, simulateFusion } from '../models/imu-lab';

type View = 'drift' | 'fusion';

function FusionDiagram({ alpha, tau }: { alpha: number; tau: number }) {
  const box = (x: number, y: number, w: number, t: string, c = 'var(--d-ink)') => <g>
    <rect x={x} y={y} width={w} height={30} rx={6} fill="var(--d-box)" stroke={c} strokeWidth={1.4} />
    <text x={x + w / 2} y={y + 19.5} textAnchor="middle" fontSize={12.5} fill="var(--d-ink)">{t}</text></g>;
  const ar = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--d-muted)" strokeWidth={1.4} markerEnd="url(#imuArr)" />;
  return (
    <svg viewBox="0 0 560 120" style={{ width: '100%', maxWidth: 620 }} role="img" aria-label="Complementary filter block diagram">
      <defs><marker id="imuArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="var(--d-muted)" /></marker></defs>
      {box(4, 10, 74, 'gyro ω', 'var(--d-blue)')}{box(4, 78, 74, 'accel a', 'var(--d-orange)')}
      {box(108, 10, 92, 'θ + ω·dt')}{box(108, 78, 92, 'atan2(aₓ, a_z)')}
      {box(232, 10, 130, `× α = ${alpha.toFixed(3)}`, 'var(--d-blue)')}{box(232, 78, 130, `× (1−α) = ${(1 - alpha).toFixed(3)}`, 'var(--d-orange)')}
      <circle cx={410} cy={60} r={14} fill="var(--d-box)" stroke="var(--d-ink)" strokeWidth={1.4} /><text x={410} y={65} textAnchor="middle" fontSize={16} fill="var(--d-ink)">+</text>
      {box(452, 45, 104, 'θ fused', 'var(--d-accent)')}
      {ar(78, 25, 106, 25)}{ar(78, 93, 106, 93)}{ar(200, 25, 230, 25)}{ar(200, 93, 230, 93)}
      {ar(362, 25, 400, 50)}{ar(362, 93, 400, 70)}{ar(424, 60, 450, 60)}
      <path d="M504,45 L504,4 L154,4 L154,8" fill="none" stroke="var(--d-muted)" strokeDasharray="4 3" strokeWidth={1.2} markerEnd="url(#imuArr)" />
      <text x={280} y={118} textAnchor="middle" fontSize={11.5} fill="var(--d-muted)">high-pass gyro + low-pass accel, crossover τ = {si(tau, 's')}</text>
    </svg>
  );
}

export default function ImuLab({ params }: SimProps) {
  const init = {
    view: (params.view === 'fusion' ? 'fusion' : 'drift') as View,
    bias: Number(params.bias ?? 0.02), accNoise: 0.002, gyroBias: 0.01, arw: 0.005, T: 60, tilt: false,
    alpha: Number(params.alpha ?? 0.98), fGyroBias: 0.5, fGyroNoise: 0.2, fAccNoise: 0.3, shake: 3, seed: 1,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const drift = useMemo(() => s.view === 'drift' ? simulateDrift({ bias: s.bias, accNoise: s.accNoise, gyroBias: s.gyroBias, arw: s.arw, T: s.T, tilt: s.tilt, seed: s.seed }) : null,
    [s.view, s.bias, s.accNoise, s.gyroBias, s.arw, s.T, s.tilt, s.seed]);
  const fusion = useMemo(() => s.view === 'fusion' ? simulateFusion({ alpha: s.alpha, gyroBias: s.fGyroBias, gyroNoise: s.fGyroNoise, accNoise: s.fAccNoise, shake: s.shake, seed: s.seed + 6 }) : null,
    [s.view, s.alpha, s.fGyroBias, s.fGyroNoise, s.fAccNoise, s.shake, s.seed]);

  const controls = <>
    <Seg label="View" value={s.view} onChange={upd('view')} options={[{ value: 'drift', label: 'Integration drift' }, { value: 'fusion', label: 'Sensor fusion' }]} />
    {s.view === 'drift' ? <>
      <Slider label="Accel bias b" value={s.bias} min={0} max={0.2} step={0.001} unit="m/s²" format={v => `${num(v, 3)} m/s² (${num(v / 9.80665 * 1000, 3)} mg)`} onChange={upd('bias')} />
      <Slider label="Accel noise density" value={s.accNoise} min={0} max={0.02} step={0.0002} format={v => `${num(v * 1000 / 9.80665 * 1000, 3)} µg/√Hz`} onChange={upd('accNoise')} />
      <Slider label="Gyro bias" value={s.gyroBias} min={0} max={0.1} step={0.001} format={v => `${num(v, 3)} °/s (${num(v * 3600, 3)} °/h)`} onChange={upd('gyroBias')} />
      <Slider label="Gyro angle random walk" value={s.arw} min={0} max={0.05} step={0.0005} format={v => `${num(v, 3)} °/√s`} onChange={upd('arw')} />
      <Slider label="Integration time" value={s.T} min={1} max={600} log unit="s" onChange={upd('T')} />
      <Toggle label="Couple gyro tilt error into gravity (g·sin θ)" checked={s.tilt} onChange={upd('tilt')} />
    </> : <>
      <Slider label="Filter weight α" value={s.alpha} min={0} max={0.999} step={0.001} format={v => v.toFixed(3)} onChange={upd('alpha')} />
      <Slider label="Gyro bias" value={s.fGyroBias} min={0} max={3} step={0.05} format={v => `${num(v, 3)} °/s`} onChange={upd('fGyroBias')} />
      <Slider label="Gyro noise (per sample)" value={s.fGyroNoise} min={0} max={2} step={0.05} format={v => `${num(v, 3)} °/s rms`} onChange={upd('fGyroNoise')} />
      <Slider label="Accel noise (per axis)" value={s.fAccNoise} min={0} max={1.5} step={0.01} unit="m/s²" format={v => `${num(v, 3)} m/s² rms`} onChange={upd('fAccNoise')} />
      <Slider label="Vibration 8–12 s (linear accel)" value={s.shake} min={0} max={8} step={0.1} format={v => `${num(v, 3)} m/s²`} onChange={upd('shake')} />
    </>}
    <button className="btn btn-sm" onClick={() => set(p => ({ ...p, seed: p.seed + 1 }))}>New noise realization</button>
    <Note>{s.view === 'drift' ? 'Stationary IMU sampled at 100 Hz, integrated with the trapezoidal rule. Every curve is the error: the true position is zero.' : 'Device rocks ±30° at 0.2 Hz, then steps +20° at t = 14 s. 100 Hz update, dt = 10 ms.'}</Note>
  </>;

  let stage;
  if (drift) {
    const a = drift.analytic, f = drift.final;
    const pe = Math.abs(f.pos);
    const series = [
      { x: drift.t, y: drift.pos, label: 'simulated position error', color: 'accent' },
      { x: drift.t, y: drift.pBias, label: '½·b·t²', color: 'orange', dashed: true },
      ...(s.tilt ? [{ x: drift.t, y: drift.pTilt, label: 'g·b_g·t³/6 (tilt)', color: 'red', dashed: true }] : []),
      ...(s.accNoise > 0 ? [{ x: drift.t, y: drift.pSigma.map((v, i) => drift.pBias[i] + drift.pTilt[i] + v), label: '+1σ noise', color: 'muted', dashed: true },
        { x: drift.t, y: drift.pSigma.map((v, i) => drift.pBias[i] + drift.pTilt[i] - v), color: 'muted', dashed: true }] : []),
    ];
    stage = <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegionBadge label={pe < 1 ? 'Error < 1 m' : pe < 100 ? 'Drifting: metres' : 'Useless without aiding'} color={pe < 1 ? 'ok' : pe < 100 ? 'warn' : 'bad'} />
        <span className="faint" style={{ fontSize: 13 }}>after {si(f.t, 's')} of dead reckoning</span>
      </div>
      <Readouts>
        <Readout k="Position error" v={si(f.pos, 'm')} hl tone={pe < 1 ? 'ok' : pe < 100 ? 'warn' : 'bad'} />
        <Readout k="½·b·t² (bias only)" v={si(a.pBias, 'm')} />
        <Readout k="Velocity error" v={si(f.vel, 'm/s')} />
        <Readout k="Angle drift" v={`${num(f.ang, 3)}°`} />
        <Readout k="Noise 1σ (pos)" v={si(a.pSigma, 'm')} />
        {s.tilt && <Readout k="Tilt term g·b_g·t³/6" v={si(a.pTilt, 'm')} />}
      </Readouts>
      <EqBox>{String.raw`p_e(t)=\iint b\,dt^2=\tfrac12 b t^2=\tfrac12(${num(s.bias, 3)})(${num(f.t, 4)})^2=${num(a.pBias, 4)}\,\text{m},\qquad \theta_e=b_g t=${num(a.angBias, 3)}^\circ` + (s.tilt ? String.raw`,\quad p_{tilt}\approx \tfrac{g\,b_g t^3}{6}` : '')}</EqBox>
      <Plot series={series} xLabel="time" xUnit="s" yLabel="position error" yUnit="m" height={240} />
      <Plot series={[{ x: drift.t, y: drift.ang, label: 'gyro angle error', color: 'blue' }, { x: drift.t, y: drift.t.map(t => s.gyroBias * t), label: 'b_g·t', color: 'orange', dashed: true }]}
        xLabel="time" xUnit="s" yLabel="angle error (°)" height={180} />
    </>;
  } else if (fusion) {
    const r = fusion.rms; const fc = 1 / (2 * Math.PI * fusion.tau);
    const best = Math.min(r.acc, r.gyro, r.comp);
    stage = <>
      <FusionDiagram alpha={s.alpha} tau={fusion.tau} />
      <Readouts>
        <Readout k="Fused RMS error" v={`${num(r.comp, 3)}°`} hl tone={r.comp <= best * 1.0001 ? 'ok' : 'warn'} />
        <Readout k="Accel-only RMS" v={`${num(r.acc, 3)}°`} />
        <Readout k="Gyro-only RMS" v={`${num(r.gyro, 3)}°`} />
        <Readout k="τ = α·dt/(1−α)" v={si(fusion.tau, 's')} />
        <Readout k="Crossover f_c" v={isFinite(fc) ? si(fc, 'Hz') : '0 Hz'} />
        <Readout k="Bias offset b_g·τ" v={isFinite(fusion.tau) ? `${num(s.fGyroBias * fusion.tau, 3)}°` : '∞ (drifts)'} />
      </Readouts>
      <EqBox>{String.raw`\hat\theta_k=\alpha\,(\hat\theta_{k-1}+\omega_k\,dt)+(1-\alpha)\,\theta_{acc,k},\quad \tau=\frac{\alpha\,dt}{1-\alpha}=\frac{${s.alpha.toFixed(3)}\cdot 0.01}{${(1 - s.alpha).toFixed(3)}}=${isFinite(fusion.tau) ? num(fusion.tau, 3) : '\\infty'}\,\text{s}`}</EqBox>
      <Plot series={[
        { x: fusion.t, y: fusion.acc, label: 'accel tilt', color: 'orange' },
        { x: fusion.t, y: fusion.gyro, label: 'gyro integrated', color: 'blue' },
        { x: fusion.t, y: fusion.truth, label: 'true', color: 'muted', dashed: true },
        { x: fusion.t, y: fusion.comp, label: 'complementary', color: 'accent', width: 2.4 },
      ]} xLabel="time" xUnit="s" yLabel="angle (°)" height={260} xspans={s.shake > 0 ? [{ from: 8, to: 12, label: 'vibration', color: 'red' }] : []} />
      <Plot series={[{ x: fusion.t, y: fusion.comp.map((v, i) => v - fusion.truth[i]), label: 'fused error', color: 'accent' }, { x: fusion.t, y: fusion.gyro.map((v, i) => v - fusion.truth[i]), label: 'gyro-only error', color: 'blue', dashed: true }]}
        xLabel="time" xUnit="s" yLabel="error (°)" height={170} yRange={[-10, 10]} />
    </>;
  }

  return (
    <SimShell title="IMU: integration drift & sensor fusion" onReset={() => set(init)} controls={controls}
      tryThis={s.view === 'drift'
        ? <>set the integration time to 6 s, then 60 s: the bias-driven position error grows 100×, not 10×, because it is ½·b·t². Then turn on tilt coupling: a gyro bias of only 0.01 °/s (36 °/h) leaks gravity into the horizontal axis and adds a t³ term that soon swamps the accelerometer bias.</>
        : <>drag α to 0 (accel only: noisy, and thrown off by the 8–12 s vibration), then to 0.999 (gyro only: smooth but offset by b_g·τ and slow to forget). Find the α with the lowest fused RMS. Then double the gyro bias and see the optimum move toward smaller α.</>}>
      {stage}
    </SimShell>
  );
}
