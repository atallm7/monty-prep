// High-side NFET bootstrap driver: Cboot charging, charge sharing, droop, UVLO and the maximum-duty limit.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { metrics, run, waveforms, BOOT_DEFAULTS } from '../models/bootstrap-driver';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };

export default function BootstrapDriver({ params }: SimProps) {
  const init = { vin: n(params.vin, 24), vdrv: n(params.vdrv, 12), cboot: n(params.cboot, 100e-9), d: Math.min(0.999, Math.max(0, n(params.d, 0.5))), fsw: n(params.fsw, 100e3), qg: BOOT_DEFAULTS.qg, rb: BOOT_DEFAULTS.rb };
  const [s, set] = useState(init);
  const [ph, setPh] = useState<'ls' | 'hs'>('ls');
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const m = useMemo(() => metrics(s), [s]);
  const c = m.c;
  const wf = useMemo(() => waveforms(s, m.Vss, 3), [s, m.Vss]);
  const cold = useMemo(() => { const r = run(s, Math.min(400, Math.max(30, Math.ceil(m.cyclesToCharge) + 15))); return r.env; }, [s, m.cyclesToCharge]);
  const sweep = useMemo(() => {
    const xs: number[] = [], vgs: number[] = [];
    for (let i = 1; i <= 60; i++) { const D = i < 60 ? i / 61 : 0.9995; const rr = run({ ...s, d: D }, 4000); const cy = rr.last; xs.push(D); vgs.push(cy.enabled ? Math.min(cy.Vs, cy.Vend) : 0); }
    return { xs, vgs };
  }, [s.vin, s.vdrv, s.cboot, s.fsw, s.qg, s.rb]);

  const lsOn = ph === 'ls', vb = m.Vss;
  const schematic = useMemo(() => renderCircuit({ elements: [
    { t: 'rail', at: [6, 0], label: `V_{in} = ${si(s.vin, 'V')}`, dir: 'up' }, { t: 'wire', pts: [[6, 0], [6, 3]], flow: !lsOn },
    { t: 'nmos', at: [4, 5], label: 'Q1', color: !lsOn ? 'green' : undefined },
    { t: 'wire', pts: [[6, 7], [6, 9]], flow: true }, { t: 'dot', at: [6, 8] },
    { t: 'nmos', at: [4, 11], label: 'Q2', color: lsOn ? 'green' : undefined },
    { t: 'wire', pts: [[6, 13], [6, 14]], flow: lsOn }, { t: 'gnd', at: [6, 14] },
    { t: 'wire', pts: [[6, 8], [2, 8]] }, { t: 'term', at: [2, 8], label: lsOn ? `SW = 0 V` : `SW = ${si(s.vin, 'V')}`, side: 'left' },
    { t: 'rail', at: [15, 0], label: `V_{drv} = ${si(s.vdrv, 'V')}`, dir: 'up' }, { t: 'wire', pts: [[15, 0], [15, 1]], flow: lsOn },
    { t: 'D', a: [15, 1], b: [15, 4], label: 'D_b', value: `V_f ${BOOT_DEFAULTS.vf} V`, color: lsOn ? 'accent' : 'red' },
    { t: 'dot', at: [15, 4] }, { t: 'C', a: [15, 4], b: [15, 8], label: 'C_{boot}', value: si(s.cboot, 'F'), color: 'accent' },
    { t: 'wire', pts: [[15, 8], [6, 8]], flow: lsOn }, { t: 'dot', at: [6, 8] },
    { t: 'text', at: [9, 4], text: `V_{B} = ${si(lsOn ? vb : s.vin + vb, 'V')}`, anchor: 'start', color: 'accent' },
    { t: 'text', at: [9, 5.4], text: `V_{boot} = ${si(vb, 'V')}`, anchor: 'start', muted: true },
    { t: 'text', at: [0, 5], text: 'HS gate: V_{boot}', anchor: 'end', muted: true }, { t: 'wire', pts: [[4, 5], [2, 5]] },
    { t: 'text', at: [0, 11], text: 'LS gate: V_{drv}', anchor: 'end', muted: true }, { t: 'wire', pts: [[4, 11], [2, 11]] },
  ] }).svg, [s, lsOn, vb]);

  const state = !m.cy.enabled ? { l: 'High side never enables: Cboot below UVLO + hysteresis', c: 'bad' as const }
    : m.cy.tripped ? { l: `UVLO trips ${si(m.cy.tTrip, 's')} into the on-time: high side drops out`, c: 'bad' as const }
    : s.d > m.dMax ? { l: 'Duty above the refill limit', c: 'bad' as const }
    : s.d > m.dMax - 0.02 ? { l: 'Close to the maximum-duty limit', c: 'warn' as const } : { l: 'Bootstrap healthy', c: 'ok' as const };
  const ton = s.d / s.fsw, toff = (1 - s.d) / s.fsw;

  return (
    <SimShell title="High-side NFET bootstrap driver" onReset={() => { set(init); setPh('ls'); }}
      tryThis={<>(1) Drag C<sub>boot</sub> down to 10 nF: the charge-sharing step Q<sub>g</sub>/C<sub>boot</sub> grows until V<sub>GS</sub> collapses. (2) Set the duty to 0.99 at 100 kHz: the low side is on for only {si(0.01 / 1e5, 's')} per cycle, so C<sub>boot</sub> cannot refill. (3) Drop f<sub>sw</sub> to 1 kHz with D = 0.9: the 900 µs on-time lets the quiescent current and R<sub>gs</sub> droop the cap past UVLO.</>}
      controls={<>
        <Seg label="Show phase" value={ph} options={[{ value: 'ls', label: 'Low side on (charge)' }, { value: 'hs', label: 'High side on' }]} onChange={setPh} />
        <Slider label="Input voltage Vin" value={s.vin} min={5} max={60} step={0.5} unit="V" onChange={upd('vin')} />
        <Slider label="Driver supply Vdrv" value={s.vdrv} min={6} max={20} step={0.5} unit="V" onChange={upd('vdrv')} />
        <Slider label="Bootstrap cap Cboot" value={s.cboot} min={10e-9} max={10e-6} log unit="F" onChange={upd('cboot')} />
        <Slider label="Duty D (high-side on)" value={s.d} min={0} max={0.999} step={0.001} onChange={upd('d')} format={v => (v * 100).toFixed(1) + ' %'} />
        <Slider label="Switching frequency" value={s.fsw} min={1e3} max={1e6} log unit="Hz" onChange={upd('fsw')} />
        <Slider label="Gate charge Qg" value={s.qg} min={5e-9} max={150e-9} step={1e-9} unit="C" onChange={upd('qg')} />
        <Slider label="Series resistance Rb" value={s.rb} min={0.5} max={50} log unit="Ω" onChange={upd('rb')} />
        <Note>Assumed: V<sub>f</sub> = {BOOT_DEFAULTS.vf} V, UVLO = {BOOT_DEFAULTS.uvlo} V (+{BOOT_DEFAULTS.hyst} V hysteresis), floating-side I<sub>q</sub> = {BOOT_DEFAULTS.iq * 1e6} µA, R<sub>gs</sub> = {BOOT_DEFAULTS.rgs / 1e3} kΩ. Cycle-by-cycle exact solution from a cold start.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ margin: '6px 0' }}><RegionBadge label={state.l} color={state.c} /></div>
      <Readouts>
        <Readout k="Steady Vboot (low side on)" v={si(m.Vss, 'V')} hl />
        <Readout k="High-side Vgs (start → end of on-time)" v={m.cy.enabled ? `${si(m.vgsMax, 'V')} → ${si(m.cy.Vend, 'V')}` : 'off'} tone={state.c === 'bad' ? 'bad' : undefined} />
        <Readout k="Charge-sharing step" v={si(m.share, 'V')} />
        <Readout k="Droop during on-time" v={si(m.droopOn, 'V')} />
        <Readout k="Max duty (no UVLO trip)" v={(m.dMax * 100).toFixed(2) + ' %'} tone={s.d > m.dMax ? 'bad' : 'ok'} />
        <Readout k="Hold time at 100 % duty" v={si(m.tHold, 's')} />
        <Readout k="Min Cboot for this Qg / on-time" v={isFinite(m.cMin) ? si(m.cMin, 'F') : 'n/a'} />
        <Readout k="Diode reverse voltage" v={si(m.vDiodeRev, 'V')} />
        <Readout k="Cycles to enable from cold" v={m.cyclesToCharge >= 0 ? String(m.cyclesToCharge) : 'never'} />
        <Readout k="Refill time constant Rb·Cboot" v={si(m.tauC, 's')} />
      </Readouts>
      <EqBox>{String.raw`V_{GS,HS} = V_B - V_{SW} \approx V_{drv}-V_f-\frac{Q_g}{C_{boot}} - \frac{(I_q + V/R_{gs})\,t_{on}}{C_{boot}} = ${(m.cy.enabled ? m.cy.Vend : 0).toFixed(2)}\,\text{V}\quad(\text{UVLO}=${BOOT_DEFAULTS.uvlo}\,\text{V})`}</EqBox>
      <Plot series={[{ x: wf.t, y: wf.sw, label: 'Switch node VSW', color: 'orange' }, { x: wf.t, y: wf.vb, label: 'VB (bootstrap node)', color: 'accent' }, { x: wf.t, y: wf.vgs, label: 'High-side Vgs', color: 'green' }]} xUnit="s" yUnit="V" xLabel="Time (three cycles, steady state)" yLabel="Voltage" height={230} hlines={[{ at: BOOT_DEFAULTS.uvlo, label: 'UVLO', color: 'red' }]} />
      <Plot series={[{ x: cold.map(e => e.t), y: cold.map(e => e.vmax), label: 'Cboot peak (end of charge)', color: 'accent' }, { x: cold.map(e => e.t), y: cold.map(e => e.vmin), label: 'Cboot after on-time', color: 'blue', dashed: true }]} xUnit="s" yUnit="V" xLabel="Cold start, per cycle" yLabel="Vboot" height={190} hlines={[{ at: BOOT_DEFAULTS.uvlo + BOOT_DEFAULTS.hyst, label: 'UVLO + hyst', color: 'red' }]} />
      <Plot series={[{ x: sweep.xs, y: sweep.vgs, label: 'Lowest high-side Vgs', color: 'green' }]} xUnit="" yUnit="V" xLabel="Duty cycle D" yLabel="Min Vgs" height={190} hlines={[{ at: BOOT_DEFAULTS.uvlo, label: 'UVLO', color: 'red' }]} vlines={[{ at: m.dMax, label: 'D max', color: 'orange' }]} points={[{ x: s.d, y: m.cy.enabled ? m.vgsMin : 0, label: 'now', color: 'accent' }]} xRange={[0, 1]} />
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>On-time {si(ton, 's')}, off-time {si(toff, 's')}, loop τ = R<sub>b</sub>C<sub>boot</sub> = {si(m.tauC, 's')}.</p>
    </SimShell>
  );
}
