// Brushed DC motor: voltage-step transient (inrush, back-EMF, settling) and steady-state characteristic curves.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { clamp } from '../../lib/units';
import { simulateTransient, steadyState, motorCurves, timeConstants, RPM, DEF_J, DEF_B } from '../models/dc-motor-lab';

type View = 'transient' | 'curves';
const tex = (v: number, u: string) => si(v, u).replace('µ', '\\mu ').replace('Ω', '\\Omega');

export default function DcMotorLab({ params }: SimProps) {
  const init = {
    view: (params.view === 'curves' ? 'curves' : 'transient') as View,
    v: clamp(Number(params.v ?? 12), 0, 48),
    r: clamp(Number(params.r ?? 1) || 1, 0.05, 20),
    l: clamp(Number(params.l ?? 1e-3) || 1e-3, 1e-5, 0.1),
    kt: clamp(Number(params.kt ?? 0.02) || 0.02, 0.002, 0.5),
    load: clamp(Number(params.load ?? 0.01), 0, 2),
    duty: 1, j: clamp(Number(params.j ?? DEF_J) || DEF_J, 1e-7, 1e-2), b: clamp(Number(params.b ?? DEF_B), 0, 1e-2), fpwm: 20000, loadStep: false,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const mp = { v: s.v, duty: s.duty, r: s.r, l: s.l, kt: s.kt, j: s.j, b: s.b, load: s.load };
  const isTr = s.view === 'transient';

  const tr = useMemo(() => isTr ? simulateTransient({ ...mp, loadStepAt: s.loadStep ? 0.5 : undefined }) : null, [isTr, s.v, s.duty, s.r, s.l, s.kt, s.j, s.b, s.load, s.loadStep]);
  const cv = useMemo(() => motorCurves(mp), [s.v, s.duty, s.r, s.kt, s.b, s.load]);
  const ss = steadyState(mp);
  const tc = timeConstants(mp);
  const va = s.v * s.duty;
  const iStall = va / s.r, tStall = s.kt * iStall;
  const ripple = s.duty > 0 && s.duty < 1 ? s.v * s.duty * (1 - s.duty) / (s.l * s.fpwm) : 0;
  const underdamped = (() => { const A0 = -s.r / s.l, A3 = -s.b / s.j, sm = (A0 + A3) / 2, det = A0 * A3 + s.kt * s.kt / (s.l * s.j); return sm * sm - det < 0; })();

  const region = va === 0 ? { l: 'No drive (0 V)', c: 'info' as const }
    : ss.stalled ? { l: 'Stalled: load ≥ stall torque', c: 'bad' as const }
    : ss.i > 0.5 * iStall ? { l: 'Heavily loaded (I > ½ I_stall)', c: 'warn' as const }
    : { l: `Running at ${(ss.w * RPM).toFixed(0)} rpm`, c: 'ok' as const };

  const schematic = useMemo(() => {
    const iNow = ss.i, emf = s.kt * ss.w;
    return renderCircuit({ elements: [
      { t: s.duty < 1 ? 'Vsq' : 'V', a: [0, 2], b: [0, 6], label: s.duty < 1 ? `D·V` : 'V', value: si(va, 'V') },
      { t: 'wire', pts: [[0, 2], [0, 0], [2, 0]], flow: va > 0 },
      { t: 'R', a: [2, 0], b: [6, 0], label: 'R', value: si(s.r, 'Ω') },
      { t: 'L', a: [6, 0], b: [10, 0], label: 'L', value: si(s.l, 'H') },
      { t: 'wire', pts: [[10, 0], [12, 0], [12, 1.5]], flow: va > 0 },
      { t: 'Vdep', a: [12, 1.5], b: [12, 5.5], label: 'e = K·ω', value: si(emf, 'V'), color: 'orange' },
      { t: 'wire', pts: [[12, 5.5], [12, 8], [0, 8], [0, 6]], flow: va > 0 },
      { t: 'gnd', at: [6, 8] },
      { t: 'arrow', a: [2.5, 1.3], b: [5.5, 1.3], label: `i_{ss} = ${si(iNow, 'A')}` },
      { t: 'text', at: [17, 2.6], text: `ω = ${(ss.w * RPM).toFixed(0)} rpm`, color: 'accent', anchor: 'start' },
      { t: 'text', at: [17, 4.2], text: `T = K·i = ${si(s.kt * iNow, 'N·m')}`, anchor: 'start', muted: true },
    ] }).svg;
  }, [s, ss, va]);

  const trPlots = tr && (() => {
    const tStepT = s.loadStep ? tr.T / 2 : undefined;
    const vl = [...(tStepT ? [{ at: tStepT, label: 'load applied', color: 'orange' }] : [])];
    return <>
      <Plot height={210} xLabel="Time" xUnit="s" yLabel="Armature current" yUnit="A" series={[{ x: tr.t, y: tr.i, label: 'i(t)', color: 'red' }]}
        hlines={[{ at: iStall, label: `stall current V/R = ${si(iStall, 'A')}`, color: 'muted' }, { at: ss.i, label: 'i_ss', color: 'green' }]}
        points={[{ x: tr.tPeak, y: tr.peakI, label: `peak ${si(tr.peakI, 'A')}`, color: 'red' }]} vlines={vl} />
      <Plot height={190} xLabel="Time" xUnit="s" yLabel="Speed" yUnit="rpm" series={[{ x: tr.t, y: tr.w.map(w => w * RPM), label: 'ω(t)', color: 'blue' }]}
        hlines={[{ at: ss.w * RPM, label: 'ω_ss', color: 'green' }]}
        vlines={[...(isFinite(tr.t63) ? [{ at: tr.t63, label: '63%', color: 'muted' }] : []), ...vl]} />
      <Plot height={190} xLabel="Time" xUnit="s" yLabel="Voltage" yUnit="V" yRange={[0, Math.max(1, va) * 1.08]}
        series={[{ x: tr.t, y: tr.emf, label: 'back-EMF K·ω', color: 'orange' }, { x: tr.t, y: tr.i.map(i => i * s.r), label: 'i·R drop', color: 'red', dashed: true }]}
        hlines={[{ at: va, label: 'V_a', color: 'muted' }]} />
    </>;
  })();

  const kNow = cv.op;
  const tqFmt = (v: number) => String(Number((cv.tStall < 1 ? v * 1000 : v).toPrecision(3)));
  const tqLabel = cv.tStall < 1 ? 'Shaft torque (mN·m)' : 'Shaft torque (N·m)';
  const curvePlots = <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 10 }}>
    <Plot height={200} xLabel={tqLabel} xTickFormat={tqFmt} yLabel="Speed" yUnit="rpm" series={[{ x: cv.tq, y: cv.w.map(w => w * RPM), label: 'speed', color: 'blue' }]}
      points={[{ x: 0, y: cv.wNl * RPM, color: 'blue' }, { x: cv.tStall, y: 0, color: 'red' }, ...(kNow ? [{ x: kNow.t, y: kNow.w * RPM, color: 'accent' }] : [])]} />
    <Plot height={200} xLabel={tqLabel} xTickFormat={tqFmt} yLabel="Current" yUnit="A" series={[{ x: cv.tq, y: cv.i, label: 'current', color: 'red' }]}
      hlines={[{ at: cv.iNl, label: 'I_0 (friction)', color: 'muted' }]} points={kNow ? [{ x: kNow.t, y: kNow.i, color: 'accent' }] : []} />
    <Plot height={200} xLabel={tqLabel} xTickFormat={tqFmt} yLabel="Output power" yUnit="W" series={[{ x: cv.tq, y: cv.pout, label: 'P_out = T·ω', color: 'green', fill: true }]}
      vlines={[{ at: cv.tAtPmax, label: 'P_max', color: 'green' }]} points={kNow ? [{ x: kNow.t, y: kNow.p, color: 'accent' }] : []} />
    <Plot height={200} xLabel={tqLabel} xTickFormat={tqFmt} yLabel="Efficiency" yUnit="%" yRange={[0, 100]} series={[{ x: cv.tq, y: cv.eff.map(e => e * 100), label: 'η', color: 'purple' }]}
      vlines={[{ at: cv.tAtEffMax, label: 'η_max', color: 'purple' }]} points={kNow ? [{ x: kNow.t, y: kNow.eff * 100, color: 'accent' }] : []} />
  </div>;

  return (
    <SimShell title="Brushed DC motor" onReset={() => set(init)}
      tryThis={isTr
        ? <>look at the first millisecond: with the rotor still, there is no back-EMF, so the current shoots toward V/R = {si(iStall, 'A')} (limited only by L). As speed builds, K·ω eats the supply voltage and the current falls to just what the load needs. Now raise the load torque past K·V/R = {si(tStall, 'N·m')}: the motor never starts and sits at stall current, all of it as I²R heat. Then enable the load step and watch speed droop by R·T<sub>L</sub>/K² while current rises.</>
        : <>find the two corners: no-load speed V/K and stall torque K·V/R. Maximum power is at half the stall torque (P = V²/4R with no friction), but maximum efficiency sits much nearer no-load, which is where you want to run continuously. Halve the duty cycle: the speed–torque line shifts down in parallel (same slope R/K²).</>}
      controls={<>
        <Seg label="View" value={s.view} onChange={upd('view')} options={[{ value: 'transient', label: 'Transient' }, { value: 'curves', label: 'Curves' }]} />
        <Slider label="Supply voltage V" value={s.v} min={0} max={48} step={0.5} unit="V" onChange={upd('v')} />
        <Slider label="PWM duty D" value={s.duty} min={0} max={1} step={0.01} format={v => (v * 100).toFixed(0) + '%'} onChange={upd('duty')} />
        <Slider label="Armature resistance R" value={s.r} min={0.05} max={20} log unit="Ω" onChange={upd('r')} />
        <Slider label="Armature inductance L" value={s.l} min={1e-5} max={0.1} log unit="H" onChange={upd('l')} />
        <Slider label="Torque constant Kt = Ke" value={s.kt} min={0.002} max={0.5} log format={v => `${si(v, 'N·m/A')}`} onChange={upd('kt')} />
        <Slider label="Load torque T_L" value={s.load} min={0} max={Math.max(0.5, tStall * 1.3)} step={Math.max(0.5, tStall * 1.3) / 400} format={v => si(v, 'N·m')} onChange={upd('load')} />
        <Slider label="Rotor + load inertia J" value={s.j} min={1e-6} max={1e-3} log format={v => si(v, 'kg·m²')} onChange={upd('j')} />
        <Slider label="Viscous friction b" value={s.b} min={1e-8} max={1e-4} log format={v => si(v, 'N·m·s')} onChange={upd('b')} />
        {isTr && <Toggle label="Apply the load half-way (load step)" checked={s.loadStep} onChange={upd('loadStep')} />}
        {s.duty > 0 && s.duty < 1 && <Slider label="PWM frequency" value={s.fpwm} min={1000} max={100000} log unit="Hz" onChange={upd('fpwm')} />}
        <Note>SI units make K<sub>t</sub> (N·m/A) = K<sub>e</sub> (V·s/rad). PWM is modelled by its average D·V (valid when f<sub>PWM</sub> ≫ 1/τ<sub>e</sub>). Load torque is Coulomb-type: it opposes motion and holds a stalled rotor.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={region.l} color={region.c} />
        {underdamped && isTr && <RegionBadge label="Underdamped: L/R comparable to τm" color="info" />}
      </div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <Readouts>
        {isTr && tr ? <>
          <Readout k="Peak inrush current" v={si(tr.peakI, 'A')} hl tone={tr.peakI > 5 * Math.max(ss.i, 1e-9) ? 'warn' : undefined} />
          <Readout k="Stall current V/R" v={si(iStall, 'A')} />
          <Readout k="Steady current" v={si(ss.i, 'A')} />
          <Readout k="Steady speed" v={`${(ss.w * RPM).toFixed(0)} rpm`} />
          <Readout k="Back-EMF at steady state" v={si(s.kt * ss.w, 'V')} />
          <Readout k="τe = L/R  ·  τm = JR/K²" v={`${si(tc.te, 's')} · ${si(tc.tm, 's')}`} />
          <Readout k="t to 63% speed" v={isFinite(tr.t63) ? si(tr.t63, 's') : '—'} />
          <Readout k="Start-up energy: copper loss" v={`${si(tr.energy.cu, 'J')} (${(tr.energy.cu / Math.max(1e-12, tr.energy.in) * 100).toFixed(0)}%)`} />
          {ripple > 0 && <Readout k="PWM current ripple ΔI" v={si(ripple, 'A')} tone={ripple > ss.i ? 'warn' : undefined} />}
        </> : <>
          <Readout k="No-load speed" v={`${(cv.wNl * RPM).toFixed(0)} rpm`} />
          <Readout k="Stall torque K·V/R" v={si(cv.tStall, 'N·m')} hl />
          <Readout k="Stall current" v={si(cv.iStall, 'A')} />
          <Readout k="No-load current I_0" v={si(cv.iNl, 'A')} />
          <Readout k="Max output power" v={`${si(cv.pMax, 'W')} @ ${si(cv.tAtPmax, 'N·m')}`} />
          <Readout k="Max efficiency" v={`${(cv.effMax * 100).toFixed(1)}% @ ${si(cv.tAtEffMax, 'N·m')}`} />
          <Readout k="At your load" v={kNow ? `${(kNow.w * RPM).toFixed(0)} rpm, ${(kNow.eff * 100).toFixed(0)}%` : 'stalled'} tone={kNow ? undefined : 'bad'} />
          {ripple > 0 && <Readout k="PWM current ripple ΔI" v={si(ripple, 'A')} />}
        </>}
      </Readouts>
      <EqBox>{isTr
        ? String.raw`\begin{gathered} V_a = iR + L\frac{di}{dt} + K_e\,\omega \\ J\frac{d\omega}{dt} = K_t\, i - b\,\omega - T_L \\ \omega_{ss} = \frac{K V_a - R\,T_L}{K^2 + R b} = \frac{${s.kt.toFixed(3)}\cdot ${va.toFixed(2)} - ${tex(s.r, 'Ω')}\cdot ${s.load.toFixed(3)}}{${(s.kt ** 2 + s.r * s.b).toExponential(2)}} = ${ss.w.toFixed(1)}\ \text{rad/s}\end{gathered}`
        : String.raw`\begin{gathered} \omega(T) = \frac{V_a}{K} - \frac{R}{K^2}\,T \;(b=0) \\ T_{stall} = \frac{K V_a}{R} = \text{${si(cv.tStall, 'N·m')}} \\ P_{out} = T\omega,\quad \eta = \frac{T\omega}{V_a\, i} \\ P_{max} \approx \frac{V_a^2}{4R} = \text{${si(va * va / (4 * s.r), 'W')}}\end{gathered}`}</EqBox>
      {isTr ? trPlots : curvePlots}
      {isTr && <Note>Electrical time constant τ<sub>e</sub> = L/R sets how fast the inrush rises; the mechanical time constant τ<sub>m</sub> = JR/K² (here {si(tc.tm, 's')}) sets how fast speed, back-EMF and current settle. Inrush is why motor drivers need current limiting and why a stalled motor overheats.</Note>}
    </SimShell>
  );
}
