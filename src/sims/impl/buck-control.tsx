// Buck control loop: K-factor Type II/III compensation, loop-gain Bode with margins, and load-step response.
import { useDeferredValue, useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { bcDefaults, designComp, margins, bode, stepResponse, f0, fesr, cffCentered, BCIn } from '../models/buck-control';

const tx = (s: string) => String.raw`\text{${s}}`;

export default function BuckControl({ params }: SimProps) {
  const d = bcDefaults();
  const base = {
    l: Number(params.l ?? d.l), c: Number(params.c ?? d.c), esr: Number(params.esr ?? d.esr), fc: Number(params.fc ?? d.fc),
    pm: Number(params.pm ?? d.pm), istep: Number(params.istep ?? d.istep), vin: d.vin, vout: d.vout, iout: d.iout, dcr: d.dcr,
    type: 'auto' as BCIn['type'], cffOn: false,
  };
  const init = { ...base, cff: cffCentered({ ...d, ...base }) };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const ds = useDeferredValue(s);

  const p: BCIn = useMemo(() => ({ ...d, ...ds }), [ds]);
  const cp = useMemo(() => designComp(p), [p]);
  const mg = useMemo(() => margins(p, cp), [p, cp]);
  const bd = useMemo(() => bode(p, cp, 100, 10e6, 320), [p, cp]);
  const st = useMemo(() => stepResponse(p, cp), [p, cp]);
  const F0 = f0(p), FE = fesr(p);
  const unstable = !(mg.pm > 0) || !(mg.gm > 0);
  const status = unstable ? <RegionBadge label="Unstable: PM < 0, the loop oscillates" color="bad" />
    : mg.pm < 30 ? <RegionBadge label={`Marginal: PM ${mg.pm.toFixed(0)}°, expect ringing`} color="warn" />
      : <RegionBadge label={`Stable: PM ${mg.pm.toFixed(0)}°`} color="ok" />;
  const cff0 = cffCentered(p);

  return (
    <SimShell title="Buck control loop & load transients" onReset={() => set(init)}
      tryThis={<>(1) Drag the target phase margin down to 10°: the loop still crosses at f<sub>c</sub> but the load-step response rings for many cycles; below 0° it breaks into a sustained oscillation clipped by the duty-cycle limits. (2) Double f<sub>c</sub>: the undershoot roughly halves (ΔV ≈ ΔI/(2π·f<sub>c</sub>·C)). Keep f<sub>c</sub> below about f<sub>sw</sub>/10 = {si(d.fsw / 10, 'Hz')} because the averaged model stops being valid near f<sub>sw</sub>.</>}
      controls={<>
        <Slider label="Inductance L" value={s.l} min={0.47e-6} max={47e-6} log unit="H" onChange={upd('l')} />
        <Slider label="Output capacitance C" value={s.c} min={4.7e-6} max={2.2e-3} log unit="F" onChange={upd('c')} />
        <Slider label="Capacitor ESR" value={s.esr} min={0.0005} max={0.5} log unit="Ω" onChange={upd('esr')} />
        <Slider label="Target crossover fc" value={s.fc} min={2e3} max={150e3} log unit="Hz" onChange={upd('fc')} />
        <Slider label="Target phase margin" value={s.pm} min={-20} max={85} step={1} format={v => v.toFixed(0) + '°'} onChange={upd('pm')} />
        <Slider label="Load step ΔI" value={s.istep} min={0.1} max={10} log unit="A" onChange={upd('istep')} />
        <Seg label="Compensator" value={s.type} onChange={upd('type')} options={[{ value: 'auto', label: 'Auto' }, { value: 'II', label: 'Type II' }, { value: 'III', label: 'Type III' }]} />
        <Toggle label="Feed-forward cap Cff across R1" checked={s.cffOn} onChange={upd('cffOn')} />
        {s.cffOn && <>
          <Slider label="Cff" value={s.cff} min={cff0 / 30} max={cff0 * 30} log unit="F" onChange={upd('cff')} />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => upd('cff')(cff0)}>Centre Cff lead at fc ({si(cff0, 'F')})</button>
        </>}
        <Slider label="Input voltage Vin" value={s.vin} min={4} max={24} step={0.1} unit="V" onChange={upd('vin')} />
        <Slider label="Output voltage Vout" value={s.vout} min={1} max={Math.max(1.2, s.vin * 0.8)} step={0.05} unit="V" onChange={upd('vout')} />
        <Slider label="Base load current" value={s.iout} min={0.05} max={10} log unit="A" onChange={upd('iout')} />
        <Slider label="Inductor DCR" value={s.dcr} min={0.001} max={0.2} log unit="Ω" onChange={upd('dcr')} />
        <Note>Voltage mode, V<sub>ramp</sub> = 1 V, V<sub>ref</sub> = 0.8 V, R<sub>2</sub> = 10 kΩ, f<sub>sw</sub> = 500 kHz, duty limited to 0–90%. The compensator is re-designed by the K-factor method every time you move a slider.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {status}
        <RegionBadge label={`Type ${cp.type} (boost ${cp.boost.toFixed(0)}°)`} color="accent" />
        {cp.limited && <RegionBadge label={`Needs ${cp.boostReq.toFixed(0)}° boost: beyond Type ${cp.type}`} color="warn" />}
        {mg.conditional && !unstable && <RegionBadge label="Conditionally stable (phase < −180° below fc)" color="info" />}
        {s.fc > d.fsw / 5 && <RegionBadge label="fc > fsw/5: averaged model optimistic" color="warn" />}
      </div>
      <Readouts>
        <Readout k="LC double pole f0" v={si(F0, 'Hz')} />
        <Readout k="ESR zero" v={si(FE, 'Hz')} />
        <Readout k="Crossover fc (actual)" v={si(mg.fc, 'Hz')} hl />
        <Readout k="Phase margin" v={isFinite(mg.pm) ? mg.pm.toFixed(1) + '°' : '—'} hl tone={mg.pm > 45 ? 'ok' : mg.pm > 0 ? 'warn' : 'bad'} />
        <Readout k="Gain margin" v={isFinite(mg.gm) ? mg.gm.toFixed(1) + ' dB' : '∞'} tone={mg.gm > 6 ? 'ok' : mg.gm > 0 ? 'warn' : 'bad'} />
        <Readout k={cp.type === 'III' ? 'Comp. zeros / poles (double)' : 'Comp. zero / pole'} v={`${si(cp.fz, 'Hz')} / ${si(cp.fp, 'Hz')}`} />
        <Readout k="Undershoot (step up)" v={si(st.undershoot, 'V')} hl />
        <Readout k="Overshoot (release)" v={si(st.overshoot, 'V')} />
        <Readout k="Rule ΔI/(2π·fc·C)" v={si(st.rule, 'V')} />
        <Readout k="Settling (±10% of peak)" v={isFinite(st.settle) ? si(st.settle, 's') : 'never'} tone={isFinite(st.settle) ? undefined : 'bad'} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}G_{vd}(s)=V_{in}\frac{1+sC\,ESR}{1+s\left(\frac{L}{R}+C(ESR+DCR)\right)+s^2LC},\quad f_0=\frac{1}{2\pi\sqrt{LC}}=${tx(si(F0, 'Hz'))}\\ \text{boost}=PM-90^\circ-\varphi_p=${s.pm.toFixed(0)}^\circ-90^\circ-(${cp.phiP.toFixed(1)}^\circ)=${cp.boostReq.toFixed(1)}^\circ,\quad k=${cp.k.toFixed(2)}\end{gathered}`}</EqBox>
      <Plot xLog xUnit="Hz" xLabel="frequency" yLabel="gain (dB)" height={230} yRange={[Math.max(-80, Math.min(...bd.mag.slice(-1), -40)), Math.min(120, Math.max(...bd.mag.slice(0, 2), 40))]}
        series={[{ x: bd.f, y: bd.mag, label: 'loop gain T', color: 'accent', width: 2.4 }, { x: bd.f, y: bd.pmag, label: 'power stage Gvd·H/Vramp', color: 'blue', dashed: true }, { x: bd.f, y: bd.cmag, label: 'compensator Gc', color: 'orange', dashed: true }]}
        hlines={[{ at: 0, color: 'muted' }]} vlines={[{ at: F0, label: 'f0', color: 'blue' }, ...(FE < 1e7 ? [{ at: FE, label: 'f_esr', color: 'green' }] : []), ...(isFinite(mg.fc) ? [{ at: mg.fc, label: 'fc', color: 'red' }] : [])]} />
      <Plot xLog xUnit="Hz" xLabel="frequency" yLabel="phase (°)" height={200} yRange={[Math.min(-270, Math.min(...bd.ph) - 10), Math.max(0, Math.max(...bd.ph) + 10)]}
        series={[{ x: bd.f, y: bd.ph, label: 'loop phase ∠T', color: 'accent', width: 2.4 }, { x: bd.f, y: bd.pph, label: 'power stage phase', color: 'blue', dashed: true }]}
        hlines={[{ at: -180, label: '−180°', color: 'red' }]}
        points={isFinite(mg.fc) ? [{ x: mg.fc, y: -180 + mg.pm, label: `PM = ${mg.pm.toFixed(0)}°`, color: 'red' }] : []} vlines={isFinite(mg.fc) ? [{ at: mg.fc, color: 'red' }] : []} />
      <Plot xUnit="s" xLabel="time" yUnit="V" yLabel="V_out" height={210} xRange={[0, st.tEnd]}
        series={[{ x: st.t, y: st.v, label: 'V_out', color: 'accent', width: 2 }]}
        hlines={[{ at: s.vout, color: 'muted' }]} xspans={[{ from: st.t1, to: st.t2, label: `+${si(s.istep, 'A')} load`, color: 'orange' }]} />
      <Plot xUnit="s" xLabel="time" yUnit="A" yLabel="current" height={170} xRange={[0, st.tEnd]}
        series={[{ x: st.t, y: st.iL, label: 'inductor current (avg)', color: 'accent' }, { x: st.t, y: st.iload, label: 'load current', color: 'orange', dashed: true, step: true }]} />
      <Note>Time response: averaged (cycle-averaged) nonlinear model with the duty cycle clamped to 0–90% and integrator anti-windup. Small-signal Bode and large-signal transient come from the same L, C, ESR, DCR and compensator values.</Note>
    </SimShell>
  );
}
