// Hobby servo: 50 Hz pulse → target angle; internal P/PD loop on pot feedback drives the motor (RK4 model).
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { simulateServo, servoLinear, pulseToAngle, pwmTrain, SERVO_DEFAULTS } from '../models/servo-lab';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };
const T_END = 1.0;

function Horn({ actual, target, start }: { actual: number; target: number; start: number }) {
  // 0° points left, 90° up, 180° right (servo seen from the front)
  const cx = 160, cy = 150, R = 105;
  const pt = (deg: number, r: number) => [cx - r * Math.cos(deg * Math.PI / 180), cy - r * Math.sin(deg * Math.PI / 180)];
  const ticks = [0, 30, 60, 90, 120, 150, 180];
  const [hx, hy] = pt(actual, R - 18); const [tx, ty] = pt(target, R + 6); const [sx, sy] = pt(start, R + 6);
  return (
    <svg viewBox="0 0 320 186" style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto' }} role="img" aria-label={`Servo horn at ${actual.toFixed(1)} degrees, target ${target.toFixed(1)} degrees`}>
      <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} fill="none" stroke="var(--d-muted)" strokeWidth={1.2} strokeDasharray="3 4" />
      {ticks.map(a => { const [x1, y1] = pt(a, R - 4); const [x2, y2] = pt(a, R + 4); const [lx, ly] = pt(a, R + 16); return <g key={a}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--d-muted)" /><text x={lx} y={ly + 4} textAnchor="middle" fontSize={10} fill="var(--d-muted)">{a}°</text></g>; })}
      <rect x={cx - 80} y={cy + 13} width={160} height={18} rx={4} fill="var(--d-box)" stroke="var(--d-ink)" strokeWidth={1} />
      <text x={cx} y={cy + 26} textAnchor="middle" fontSize={10} fill="var(--d-muted)">servo case · pot on output shaft</text>
      <line x1={cx} y1={cy} x2={sx} y2={sy} stroke="var(--d-muted)" strokeWidth={1} strokeDasharray="2 3" />
      <line x1={cx} y1={cy} x2={tx} y2={ty} stroke="var(--d-green)" strokeWidth={1.5} strokeDasharray="6 4" />
      <circle cx={tx} cy={ty} r={4} fill="var(--d-green)" />
      <line x1={cx} y1={cy} x2={hx} y2={hy} stroke="var(--d-accent)" strokeWidth={12} strokeLinecap="round" />
      <circle cx={hx} cy={hy} r={3} fill="var(--d-bg)" />
      <circle cx={cx} cy={cy} r={11} fill="var(--d-bg)" stroke="var(--d-ink)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={3} fill="var(--d-ink)" />
      <text x={8} y={16} fontSize={11} fill="var(--d-accent)">θ = {actual.toFixed(1)}°</text>
      <text x={312} y={16} fontSize={11} fill="var(--d-green)" textAnchor="end">target {target.toFixed(1)}°</text>
    </svg>
  );
}

export default function ServoLab({ params }: SimProps) {
  const init = { pulse: n(params.pulse, 1.5), kp: n(params.kp, 4), kd: n(params.kd, 0.2), start: 0, load: 0.1, ideal: false };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const r = useMemo(() => simulateServo({ pulse: s.pulse, kp: s.kp, kd: s.kd, start: s.start, load: s.load, tEnd: T_END, saturate: !s.ideal }), [s]);
  const lin = useMemo(() => servoLinear(s.kp, s.kd), [s.kp, s.kd]);
  const pwm = useMemo(() => pwmTrain(s.pulse, 0.1), [s.pulse]);

  // playback cursor (real time × 0.5)
  const [tc, setTc] = useState(T_END);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(); let t = 0; setTc(0);
    const tick = (now: number) => {
      t += (now - last) / 1000 * 0.5; last = now;
      if (t >= T_END) { setTc(T_END); setPlaying(false); return; }
      setTc(t); raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, r]);
  const idx = Math.min(r.t.length - 1, Math.max(0, Math.round(tc / T_END * (r.t.length - 1))));
  const angNow = r.ang[idx];

  const ssPred = s.kp > 0 ? s.load / s.kp * 180 / Math.PI : Infinity;
  const region = lin.zeta < 0.4 ? { l: `Underdamped (ζ = ${lin.zeta.toFixed(2)}): ringing`, c: 'bad' as const }
    : lin.zeta < 0.95 ? { l: `Underdamped (ζ = ${lin.zeta.toFixed(2)})`, c: 'warn' as const }
    : lin.zeta <= 1.05 ? { l: `Critically damped (ζ ≈ 1)`, c: 'ok' as const }
    : { l: `Overdamped (ζ = ${lin.zeta.toFixed(2)})`, c: 'info' as const };
  const step = r.target - s.start;

  return (
    <SimShell title="Hobby servo: pulse width → angle, P/PD position loop" onReset={() => { set(init); setTc(T_END); setPlaying(false); }}
      tryThis={<>(1) Set the start angle to 80° (a small 10° step), K<sub>d</sub> = 0 and K<sub>p</sub> = 20: ζ ≈ 0.2 and the horn rings with ≈ 50% overshoot, just as linear theory predicts. Now go back to a 0° start: the duty saturates at 100%, the motor slews at full speed and the overshoot is much smaller. Large steps are limited by saturation, not by the gains. (2) With a load torque, lower K<sub>p</sub> to 1: the horn stops short by e<sub>ss</sub> = u<sub>L</sub>/K<sub>p</sub>. The motor integrates, so it removes setpoint error but not a constant load torque.</>}
      controls={<>
        <Slider label="Pulse width" value={s.pulse} min={1.0} max={2.0} step={0.01} format={v => `${v.toFixed(2)} ms (${pulseToAngle(v).toFixed(0)}°)`} onChange={upd('pulse')} />
        <Slider label="Start angle" value={s.start} min={0} max={180} step={1} format={v => `${v.toFixed(0)}°`} onChange={upd('start')} />
        <Slider label="Proportional gain Kp" value={s.kp} min={0.2} max={50} log format={v => `${v.toFixed(2)} /rad`} onChange={upd('kp')} />
        <Slider label="Derivative gain Kd" value={s.kd} min={0} max={1} step={0.01} format={v => `${v.toFixed(2)} s`} onChange={upd('kd')} />
        <Slider label="Load torque (fraction of stall)" value={s.load} min={-0.5} max={0.5} step={0.01} format={v => `${(v * 100).toFixed(0)} %`} onChange={upd('load')} />
        <Toggle label="Unlimited drive (no duty saturation)" checked={s.ideal} onChange={upd('ideal')} />
        <button className="btn btn-sm" type="button" onClick={() => setPlaying(p => !p)}>{playing ? 'Pause' : 'Play step response'}</button>
        <Note>Motor: τ<sub>m</sub> = {si(SERVO_DEFAULTS.tauM, 's')}, no-load output speed {SERVO_DEFAULTS.wmax} rad/s (≈ {(60 / (SERVO_DEFAULTS.wmax * 180 / Math.PI)).toFixed(2)} s/60°, a typical micro servo). Control output u is the H-bridge duty, limited to ±100%.</Note>
      </>}>
      <Horn actual={angNow} target={r.target} start={s.start} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegionBadge label={region.l} color={region.c} />
        {r.satFrac > 0.02 && !s.ideal && <RegionBadge label={`Drive saturated ${(r.satFrac * 100).toFixed(0)}% of the time`} color="warn" />}
        {Math.abs(step) < 1e-6 && <RegionBadge label="No step: target = start" color="info" />}
      </div>
      <Readouts>
        <Readout k="Target angle" v={`${r.target.toFixed(1)}°`} hl />
        <Readout k="Final angle (t = 1 s)" v={`${r.final.toFixed(2)}°`} />
        <Readout k="Steady-state error" v={`${r.ssErr.toFixed(2)}°`} tone={Math.abs(r.ssErr) > 2 ? 'bad' : Math.abs(r.ssErr) > 0.5 ? 'warn' : 'ok'} />
        <Readout k="Predicted uL/Kp" v={isFinite(ssPred) ? `${ssPred.toFixed(2)}°` : '∞'} />
        <Readout k="Overshoot" v={`${(r.overshoot * 100).toFixed(1)} %`} tone={r.overshoot > 0.2 ? 'bad' : r.overshoot > 0.05 ? 'warn' : 'ok'} />
        <Readout k="Rise time 10–90%" v={isFinite(r.rise) ? si(r.rise, 's') : '—'} />
        <Readout k="Settling (±2%)" v={r.settled ? si(r.tSettle, 's') : '> 1 s'} />
        <Readout k="ωn / ζ (linear)" v={`${lin.wn.toFixed(1)} rad/s / ${lin.zeta.toFixed(2)}`} />
        {lin.zeta < 1 && <Readout k="Ringing frequency" v={si(lin.fRing, 'Hz')} />}
        <Readout k="Linear-theory overshoot" v={`${(lin.mp * 100).toFixed(1)} %`} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}\theta_t = 90^\circ + \frac{T_p-1.5\,\text{ms}}{0.5\,\text{ms}}\,90^\circ = ${r.target.toFixed(1)}^\circ \\ \tau_m s^2 + (1+\omega_{max}K_d)s + \omega_{max}K_p = 0 \\ \zeta = \frac{1+${SERVO_DEFAULTS.wmax}\cdot${s.kd.toFixed(2)}}{2\sqrt{${SERVO_DEFAULTS.tauM}\cdot${SERVO_DEFAULTS.wmax}\cdot${s.kp.toFixed(2)}}} = ${lin.zeta.toFixed(2)}\end{gathered}`}</EqBox>
      <Plot series={[{ x: r.t, y: r.ang, label: 'shaft angle θ (pot)', color: 'accent' }]} xUnit="s" yUnit="°" xLabel="time" yLabel="angle" height={220}
        hlines={[{ at: r.target, label: 'target', color: 'green' }]} vlines={[{ at: tc, color: 'muted' }]}
        yTickFormat={v => `${Number(v.toFixed(1))}°`} />
      <Plot series={[{ x: r.t, y: r.u.map(v => v * 100), label: 'motor drive u (duty %)', color: 'orange' }]} xUnit="s" xLabel="time" yLabel="duty (%)" height={150}
        yRange={s.ideal ? undefined : [-110, 110]} hlines={s.ideal ? [] : [{ at: 100, color: 'red' }, { at: -100, color: 'red' }]} yTickFormat={v => `${v.toFixed(0)}%`} />
      <Plot series={[{ ...pwm, label: `command: ${s.pulse.toFixed(2)} ms every 20 ms`, color: 'blue', step: false }]} xUnit="s" xLabel="time (first 100 ms)" yLabel="PWM" height={120} yRange={[-0.1, 1.2]} yTickFormat={v => (v === 0 ? 'L' : v === 1 ? 'H' : '')} />
    </SimShell>
  );
}
