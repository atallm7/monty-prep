// MOSFET gate drive: Miller plateau, gate resistor, gate-loop ringing, switching loss, floating-gate pickup.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { simulateGate, floatingGate } from '../models/gate-drive';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };
const VGS_MAX = 20; // typical absolute-maximum Vgs rating

export default function GateDrive({ params }: SimProps) {
  const init = {
    vdrive: n(params.vdrive, 3.3), rg: Math.max(0.1, n(params.rg, 10)), qg: n(params.qg, 20e-9), lg: n(params.lg, 10e-9), vth: n(params.vth, 1.5),
    rsrc: 25, vdd: 12, il: 5, fsw: 20e3, rpd: 100e3, usePd: true, tr: 10e-6,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const rpd = s.usePd ? s.rpd : Infinity;

  const r = useMemo(() => simulateGate({ vdrive: s.vdrive, rg: s.rg, rsrc: s.rsrc, lg: s.lg, qg: s.qg, vth: s.vth, vdd: s.vdd, il: s.il, rpd }), [s.vdrive, s.rg, s.rsrc, s.lg, s.qg, s.vth, s.vdd, s.il, rpd]);
  const flNoPd = useMemo(() => floatingGate(r.device, s.vdd, 1e-6, Infinity).peak, [r.device, s.vdd]);
  const fl = useMemo(() => floatingGate(r.device, s.vdd, s.tr, rpd), [r.device, s.vdd, s.tr, rpd]);

  const enh = s.vdrive > r.vplTheory + 0.05;
  const pSw = (r.eOn + r.eOff) * s.fsw;
  const pCond = isFinite(r.rdsOn) ? s.il * s.il * r.rdsOn * 0.5 : Infinity;
  const ringing = r.zeta < 0.7;
  const overV = r.vgsMax > VGS_MAX;
  const state = !enh ? { l: s.vdrive <= s.vth ? 'Drive below Vth: FET never turns on' : 'Drive below Miller plateau: stuck in linear region', c: 'bad' as const }
    : overV ? { l: `Vgs rings to ${r.vgsMax.toFixed(1)} V > ${VGS_MAX} V abs max`, c: 'bad' as const }
    : r.reTurnOn ? { l: 'Ringing re-crosses Vth after turn-off (false turn-on)', c: 'bad' as const }
    : ringing ? { l: `Gate loop underdamped (ζ = ${r.zeta.toFixed(2)})`, c: 'warn' as const }
    : { l: 'Clean switching', c: 'ok' as const };
  const rCrit = 2 * Math.sqrt(s.lg / r.cissOff);

  const schematic = useMemo(() => renderCircuit({
    elements: [
      { t: 'Vsq', a: [0, 10], b: [0, 14], label: 'driver', value: si(s.vdrive, 'V'), labelSide: 'other' },
      { t: 'wire', pts: [[0, 10], [0, 8], [1, 8]] },
      { t: 'R', a: [1, 8], b: [4, 8], label: 'R_{src}', value: si(s.rsrc, 'Ω') },
      { t: 'R', a: [4, 8], b: [7, 8], label: 'R_G', value: si(s.rg, 'Ω'), color: ringing ? 'red' : 'accent' },
      { t: 'L', a: [7, 8], b: [10, 8], label: 'L_G', value: si(s.lg, 'H'), color: 'orange' },
      { t: 'wire', pts: [[10, 8], [10, 10], [12, 10]] }, { t: 'dot', at: [10, 10] },
      { t: 'nmos', at: [12, 10], label: 'Q1' },
      ...(s.usePd ? [{ t: 'R', a: [10, 10], b: [10, 14], label: 'R_{pd}', value: si(s.rpd, 'Ω'), labelSide: 'other' }] : [{ t: 'text', at: [9.6, 12.2], text: 'no R_{pd}', anchor: 'end', muted: true }]),
      { t: 'wire', pts: [[0, 14], [14, 14], [14, 12]] }, { t: 'gnd', at: [7, 14] },
      { t: 'wire', pts: [[14, 8], [14, 7]] }, { t: 'dot', at: [14, 7] },
      { t: 'I', a: [14, 3], b: [14, 7], label: 'I_L', value: si(s.il, 'A'), labelSide: 'other' },
      { t: 'wire', pts: [[14, 7], [17, 7]] }, { t: 'D', a: [17, 7], b: [17, 3], label: 'D_{fw}' },
      { t: 'wire', pts: [[14, 3], [17, 3]] }, { t: 'wire', pts: [[14, 3], [14, 2]] }, { t: 'dot', at: [14, 3] },
      { t: 'rail', at: [14, 2], label: `V_{DD} = ${si(s.vdd, 'V')}` },
      { t: 'text', at: [19, 10], text: `C_{iss} ≈ ${si(r.cissOff, 'F')}`, anchor: 'start', color: 'blue' },
      { t: 'text', at: [19, 11.4], text: `Q_G = ${si(s.qg, 'C')}`, anchor: 'start', muted: true },
    ],
  }).svg, [s, r.cissOff, ringing]);

  const nsx = (v: number) => si(v, 's');
  return (
    <SimShell title="MOSFET gate drive: Miller plateau, Rg and ringing" onReset={() => set(init)}
      tryThis={<>(1) Click "Gate-driver IC" and set R<sub>G</sub> to 0.1 Ω: the gate loop is now a series RLC with ζ = (R/2)·√(C<sub>iss</sub>/L<sub>G</sub>) ≪ 1. V<sub>GS</sub> rings far past the drive and can bounce back above V<sub>th</sub> after turn-off. Raise R<sub>G</sub> toward R<sub>crit</sub> = 2√(L/C) ≈ {si(rCrit, 'Ω')}. (2) Back on the GPIO, drop V<sub>drive</sub> to 1.9 V. It is above V<sub>th</sub> but below the plateau, so the FET never leaves the linear region and E<sub>on</sub> explodes.</>}
      controls={<>
        <Slider label="Drive voltage Vdrive" value={s.vdrive} min={1} max={15} step={0.1} unit="V" onChange={upd('vdrive')} />
        <Slider label="Driver source resistance Rsrc" value={s.rsrc} min={0.5} max={100} log unit="Ω" onChange={upd('rsrc')} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={() => set(p => ({ ...p, rsrc: 25, vdrive: 3.3 }))}>MCU GPIO (25 Ω, 3.3 V)</button>
          <button type="button" className="btn btn-sm" onClick={() => set(p => ({ ...p, rsrc: 1.5, vdrive: 12 }))}>Gate-driver IC (1.5 Ω, 12 V)</button>
        </div>
        <Slider label="Gate resistor Rg" value={s.rg} min={0.1} max={1000} log unit="Ω" onChange={upd('rg')} />
        <Slider label="Gate loop inductance Lg" value={s.lg} min={1e-9} max={100e-9} log unit="H" onChange={upd('lg')} />
        <Slider label="Total gate charge Qg (@10 V)" value={s.qg} min={2e-9} max={200e-9} log unit="C" onChange={upd('qg')} />
        <Slider label="Threshold Vth" value={s.vth} min={0.5} max={5} step={0.05} unit="V" onChange={upd('vth')} />
        <Slider label="Supply VDD" value={s.vdd} min={3} max={100} step={0.5} unit="V" onChange={upd('vdd')} />
        <Slider label="Load current IL" value={s.il} min={0.1} max={50} log unit="A" onChange={upd('il')} />
        <Slider label="Switching frequency" value={s.fsw} min={1e3} max={1e6} log unit="Hz" onChange={upd('fsw')} />
        <Toggle label="Gate pull-down resistor" checked={s.usePd} onChange={upd('usePd')} />
        {s.usePd && <Slider label="Pull-down Rpd" value={s.rpd} min={1e3} max={1e6} log unit="Ω" onChange={upd('rpd')} />}
        <Slider label="VDD power-up ramp time (gate floating)" value={s.tr} min={10e-9} max={10e-3} log unit="s" onChange={upd('tr')} />
        <Note>Clamped inductive load: I<sub>L</sub> flows in the free-wheel diode until Q1 takes it over. Device: square law with K = 20 A/V², C<sub>gd</sub> ∝ 1/√(1+V<sub>DG</sub>/0.8 V), capacitances scaled to Q<sub>G</sub>.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><RegionBadge label={state.l} color={state.c} /></div>
      <Plot series={[
        { x: r.t, y: r.vs, label: 'driver V_s', color: 'muted', dashed: true },
        { x: r.t, y: r.vgs, label: 'V_GS', color: 'accent' },
      ]} xUnit="s" yUnit="V" xLabel="time" yLabel="gate voltage" height={220}
        hlines={[{ at: s.vth, label: 'V_th', color: 'red' }, ...(enh ? [{ at: r.vplTheory, label: 'Miller plateau', color: 'orange' }] : [])]} />
      <Plot series={[
        { x: r.t, y: r.vds, label: 'V_DS (V)', color: 'blue' },
        { x: r.t, y: r.id, label: 'I_D (A)', color: 'green' },
      ]} xUnit="s" xLabel="time" yLabel="V_DS (V), I_D (A)" height={200} />
      <Plot series={[{ x: r.t, y: r.ig, label: 'gate current i_G', color: 'purple' }]} xUnit="s" yUnit="A" xLabel="time" yLabel="i_G" height={150} />
      <Readouts>
        <Readout k="Miller plateau (√(IL/K)+Vth)" v={si(r.vplTheory, 'V')} hl />
        <Readout k="Peak gate current" v={si(r.iPeak, 'A')} />
        <Readout k="Ciss (high / low Vds)" v={`${si(r.cissOff, 'F')} / ${si(r.cissOn, 'F')}`} />
        <Readout k="Qgd (Miller charge)" v={si(r.qgd, 'C')} />
        <Readout k="Gate loop ζ" v={`${r.zeta.toFixed(2)} (R_crit ${si(rCrit, 'Ω')})`} tone={r.zeta < 0.4 ? 'bad' : r.zeta < 0.7 ? 'warn' : 'ok'} />
        <Readout k="Peak Vgs" v={si(r.vgsMax, 'V')} tone={overV ? 'bad' : r.overshoot > 0.1 * s.vdrive ? 'warn' : 'ok'} />
        <Readout k="Turn-on delay td(on)" v={isFinite(r.tdOn) ? nsx(r.tdOn) : '—'} />
        <Readout k="Current rise / Vds fall" v={`${isFinite(r.tri) ? nsx(r.tri) : '—'} / ${isFinite(r.tfv) ? nsx(r.tfv) : '—'}`} />
        <Readout k="Vds rise / current fall" v={`${isFinite(r.trv) ? nsx(r.trv) : '—'} / ${isFinite(r.tfi) ? nsx(r.tfi) : '—'}`} />
        <Readout k="Eon / Eoff" v={`${si(r.eOn, 'J')} / ${si(r.eOff, 'J')}`} />
        <Readout k={`Switching loss @ ${si(s.fsw, 'Hz')}`} v={si(pSw, 'W')} tone={pSw > 2 ? 'bad' : pSw > 0.5 ? 'warn' : 'ok'} hl />
        <Readout k="Rds(on) / conduction (D=50%)" v={isFinite(r.rdsOn) ? `${si(r.rdsOn, 'Ω')} / ${si(pCond, 'W')}` : '∞'} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered} V_{pl} = V_{th} + \sqrt{I_L/K} = ${s.vth.toFixed(2)} + \sqrt{${Number(s.il.toPrecision(3))}/20} = ${r.vplTheory.toFixed(2)}\,\text{V} \\ t_{plateau} \approx \frac{Q_{gd}\,(R_{src}+R_G)}{V_{drive}-V_{pl}},\qquad \zeta = \frac{R_{src}+R_G}{2}\sqrt{\frac{C_{iss}}{L_G}} = ${r.zeta.toFixed(2)} \\ P_{sw} = (E_{on}+E_{off})\,f_{sw} \approx \tfrac12 V_{DD} I_L (t_{r}+t_{f}) f_{sw} = ${si(pSw, 'W').replace(' ', '\\,\\text{')}}\end{gathered}`}</EqBox>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Gate left floating (GPIO Hi-Z at boot) while VDD ramps up in {si(s.tr, 's')}</div>
        <Plot series={[{ x: fl.t, y: fl.v, label: 'V_GS (floating)', color: 'red' }]} xUnit="s" yUnit="V" xLabel="time" yLabel="V_GS" height={160}
          hlines={[{ at: s.vth, label: 'V_th', color: 'red' }]} yRange={[0, Math.max(s.vth * 1.3, fl.peak * 1.15)]} />
        <Readouts>
          <Readout k="Peak Vgs from Cgd·dV/dt" v={si(fl.peak, 'V')} tone={fl.peak > s.vth ? 'bad' : fl.peak > 0.5 * s.vth ? 'warn' : 'ok'} />
          <Readout k="Pull-down time constant" v={s.usePd ? si(s.rpd * r.cissOn, 's') : '∞ (no Rpd)'} />
          <Readout k="Gate discharge to Vth if GPIO floats while on" v={s.usePd && s.vdrive > s.vth ? si(s.rpd * r.cissOn * Math.log(s.vdrive / s.vth), 's') : '∞ (stays on, or never on)'} />
        </Readouts>
        <Note>Without a pull-down, the Cgd/Cgs divider alone lifts the gate by ≈ {si(flNoPd, 'V')} on power-up, regardless of how slowly VDD ramps. A pull-down only helps when R<sub>pd</sub>·C<sub>iss</sub> is much shorter than the ramp time.</Note>
      </div>
    </SimShell>
  );
}
