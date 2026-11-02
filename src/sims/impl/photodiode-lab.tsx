// Light sensing: photodiode + TIA vs CdS photoresistor divider (DC transfer, step response, TIA bandwidth).
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Select, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { pdTia, ldr, step2, ldrStep, riseTime, tiaMag, SOURCES, Source } from '../models/photodiode-lab';

const AREA = 7.5e-6, IDARK = 2e-9, VMAX = 4.9, VCC = 5;
const LDRP = { r10: 15e3, gamma: 0.7, rdark: 1e6, tauRise: 0.02, tauFall: 0.03 };

export default function PhotodiodeLab({ params }: SimProps) {
  const init = { lux: Number(params.lux ?? 500), rf: Number(params.rf ?? 1e6), cf: 2.2e-12, cd: 70e-12, gbw: 10e6, source: 'green' as Source, rfix: 10e3 };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const pd = useMemo(() => pdTia({ lux: s.lux, source: s.source, area: AREA, idark: IDARK, rf: s.rf, cf: s.cf, cd: s.cd, gbw: s.gbw, vmax: VMAX }), [s]);
  const L = useMemo(() => ({ ...LDRP, lux: s.lux, rfix: s.rfix, vcc: VCC }), [s.lux, s.rfix]);
  const ld = useMemo(() => ldr(L), [L]);

  const stepPlot = useMemo(() => {
    const ts = logspace(1e-9, 1, 600);
    const ypd = ts.map(t => step2(t, pd.a, pd.b)), yld = ts.map(t => ldrStep(t, L));
    return { ts, ypd, yld, trPd: riseTime(ts, ypd), trLd: riseTime(ts, yld) };
  }, [pd.a, pd.b, L]);

  const transfer = useMemo(() => {
    const xs = logspace(0.1, 1e5, 300);
    return {
      xs,
      pd: xs.map(l => pdTia({ lux: l, source: s.source, area: AREA, idark: IDARK, rf: s.rf, cf: s.cf, cd: s.cd, gbw: s.gbw, vmax: VMAX }).vout),
      ld: xs.map(l => ldr({ ...L, lux: l }).vout),
    };
  }, [s.source, s.rf, s.cf, s.cd, s.gbw, L]);

  const bode = useMemo(() => {
    // dense samples around the resonance so a high-Q peak (C_f → 0) is not missed
    const fn0 = Math.sqrt(s.gbw / (2 * Math.PI * s.rf * (s.cd + s.cf)));
    const fs = [...logspace(10, 1e9, 400), ...logspace(fn0 / 1.3, fn0 * 1.3, 300)].sort((a, b) => a - b);
    return { fs, z: fs.map(f => tiaMag(f, s.rf, s.cf, s.cd, s.gbw)), z0: fs.map(f => tiaMag(f, s.rf, 0, s.cd, s.gbw)) };
  }, [s.rf, s.cf, s.cd, s.gbw]);

  const schematic = useMemo(() => renderCircuit({
    elements: [
      { t: 'photodiode', a: [1, 9], b: [1, 4], label: 'D_1', value: `C_d ${si(s.cd, 'F')}`, color: 'accent' },
      { t: 'gnd', at: [1, 9] },
      { t: 'wire', pts: [[1, 4], [1, 3], [8, 3]], flow: s.lux > 0 ? 'reverse' : undefined },
      { t: 'dot', at: [6, 3] },
      { t: 'opamp', at: [8, 4], swap: false },
      { t: 'wire', pts: [[8, 5], [7, 5], [7, 6]] }, { t: 'gnd', at: [7, 6] },
      { t: 'wire', pts: [[6, 3], [6, 0]] }, { t: 'dot', at: [6, 0] }, { t: 'dot', at: [12, 0] },
      { t: 'R', a: [6, 0], b: [12, 0], label: 'R_f', value: si(s.rf, 'Ω'), labelSide: 'other' },
      { t: 'wire', pts: [[6, 0], [6, -2.5]] }, { t: 'wire', pts: [[12, 0], [12, -2.5]] },
      { t: 'C', a: [6, -2.5], b: [12, -2.5], label: 'C_f', value: si(s.cf, 'F') },
      { t: 'wire', pts: [[12, 0], [12, 4], [14, 4]] }, { t: 'dot', at: [12, 4] },
      { t: 'term', at: [14, 4], label: `V_{out} = ${si(pd.vout, 'V')}`, side: 'right' },
      { t: 'text', at: [-1.6, 6.6], text: `${si(s.lux, 'lx')}`, color: 'orange', anchor: 'end' },
      { t: 'arrow', a: [5.4, 2.2], b: [3.2, 2.2], label: `I_{ph} ${si(pd.itot, 'A')}` },
      // LDR divider
      { t: 'rail', at: [24, 0], label: `${VCC} V`, dir: 'up' },
      { t: 'Rbox', a: [24, 0], b: [24, 4.5], label: 'LDR', value: si(ld.R, 'Ω'), color: 'orange' },
      { t: 'R', a: [24, 4.5], b: [24, 9], label: 'R_{fix}', value: si(s.rfix, 'Ω') },
      { t: 'gnd', at: [24, 9] }, { t: 'dot', at: [24, 4.5] },
      { t: 'wire', pts: [[24, 4.5], [26, 4.5]] }, { t: 'term', at: [26, 4.5], label: `${si(ld.vout, 'V')}`, side: 'right' },
    ],
  }).svg, [s, pd, ld]);

  const zone = pd.clipped ? { l: 'TIA saturated', c: 'bad' as const } : pd.vout < 0.01 ? { l: 'Signal ≈ dark current', c: 'warn' as const } : { l: 'Linear region', c: 'ok' as const };
  const damp = pd.zeta < 0.5 ? { l: `Ringing (ζ = ${num(pd.zeta, 2)})`, c: 'bad' as const } : pd.zeta < 0.65 ? { l: `Some overshoot (ζ = ${num(pd.zeta, 2)})`, c: 'warn' as const } : { l: `Well damped (ζ = ${num(pd.zeta, 2)})`, c: 'ok' as const };

  return (
    <SimShell title="Light sensing: photodiode vs photoresistor" onReset={() => set(init)}
      tryThis={<>sweep illuminance from 1 lx to 10 klx. The photodiode output is a straight line in light (I ∝ E) until the TIA hits the rail, while the LDR divider compresses many decades into a few volts. Then set C<sub>f</sub> to its minimum and watch the TIA ring (C<sub>d</sub> with the op-amp creates a second pole), and press the Butterworth button to fix it. On the step plot, note that the photodiode settles roughly four decades faster than the LDR.</>}
      controls={<>
        <Slider label="Illuminance" value={s.lux} min={0.1} max={1e5} log format={v => `${si(v, 'lx')}`} onChange={upd('lux')} />
        <Select label="Light source (spectrum)" value={s.source} onChange={upd('source')} options={(Object.keys(SOURCES) as Source[]).map(k => ({ value: k, label: `${SOURCES[k].label} (${SOURCES[k].K} lm/W)` }))} />
        <Slider label="TIA feedback R_f" value={s.rf} min={1e3} max={1e8} log unit="Ω" onChange={upd('rf')} />
        <Slider label="Feedback cap C_f" value={s.cf} min={0.1e-12} max={1e-9} log unit="F" onChange={upd('cf')} />
        <button className="btn btn-sm" onClick={() => set(p => ({ ...p, cf: Math.max(0.1e-12, pd.cfButter) }))}>Set C_f for Butterworth ({si(pd.cfButter, 'F')})</button>
        <Slider label="Photodiode capacitance C_d" value={s.cd} min={1e-12} max={1e-9} log unit="F" onChange={upd('cd')} />
        <Slider label="Op-amp GBW" value={s.gbw} min={1e5} max={1e9} log unit="Hz" onChange={upd('gbw')} />
        <Slider label="LDR divider R_fix" value={s.rfix} min={1e3} max={1e6} log unit="Ω" onChange={upd('rfix')} />
        <Note>Photodiode: BPW34-like, 7.5 mm², 2 nA dark current, photoconductive (0 V) mode. TIA output clips at {VMAX} V. LDR: GL55-type CdS, R = 15 kΩ at 10 lx, γ = 0.7, R<sub>dark</sub> = 1 MΩ, τ<sub>rise</sub> = 20 ms.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><RegionBadge label={zone.l} color={zone.c} /><RegionBadge label={damp.l} color={damp.c} /></div>
      <Readouts>
        <Readout k="Irradiance E_e" v={si(pd.Ee, 'W/m²')} />
        <Readout k="Optical power on die" v={si(pd.P, 'W')} />
        <Readout k="Photocurrent I_ph" v={si(pd.iph, 'A')} />
        <Readout k="TIA V_out" v={si(pd.vout, 'V')} hl tone={pd.clipped ? 'bad' : undefined} />
        <Readout k="TIA −3 dB BW" v={si(pd.bw, 'Hz')} />
        <Readout k="PD rise 10–90%" v={si(stepPlot.trPd, 's')} />
        <Readout k="LDR resistance" v={si(ld.R, 'Ω')} />
        <Readout k="LDR divider V" v={si(ld.vout, 'V')} hl />
        <Readout k="LDR rise 10–90%" v={si(stepPlot.trLd, 's')} />
        <Readout k="Lux at TIA clip" v={si(pd.luxSat, 'lx')} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}I_{ph}=\mathcal{R}\,\frac{E_v}{K}A=${SOURCES[s.source].R}\cdot\frac{${num(s.lux, 4)}}{${SOURCES[s.source].K}}\cdot 7.5\,\text{mm}^2=${si(pd.iph, 'A').replace('µ', '\\mu ')}\\ V_{out}=(I_{ph}+I_d)R_f=${num(pd.vIdeal, 3)}\,\text{V}${pd.clipped ? "\\to\\text{clips at } 4.9\\,\\text{V}" : ""},\qquad \frac{V_{out}}{I}=\frac{R_f}{1+s\left(R_fC_f+\frac{1}{\omega_t}\right)+s^2\frac{R_f(C_d+C_f)}{\omega_t}}\end{gathered}`}</EqBox>
      <Plot series={[{ x: stepPlot.ts, y: stepPlot.ypd, label: 'photodiode + TIA', color: 'accent' }, { x: stepPlot.ts, y: stepPlot.yld, label: 'LDR divider', color: 'orange' }]}
        xLog xUnit="s" xLabel="time after light step (log)" yLabel="normalised output" height={220} yRange={[-0.05, Math.max(1.15, 1 + pd.os + 0.05)]}
        hlines={[{ at: 0.9, label: '90%', color: 'muted' }, { at: 0.1, label: '10%', color: 'muted' }]} />
      <Plot series={[{ x: transfer.xs, y: transfer.pd, label: 'TIA V_out', color: 'accent' }, { x: transfer.xs, y: transfer.ld, label: 'LDR divider V', color: 'orange' }]}
        xLog xUnit="lx" xLabel="illuminance" yUnit="V" yLabel="output" height={210} yRange={[0, 5.2]}
        vlines={[{ at: s.lux, label: 'now', color: 'muted' }]} points={[{ x: s.lux, y: pd.vout, color: 'accent' }, { x: s.lux, y: ld.vout, color: 'orange' }]} />
      <Plot series={[{ x: bode.fs, y: bode.z, label: `|Z| with C_f = ${si(s.cf, 'F')}`, color: 'accent' }, { x: bode.fs, y: bode.z0, label: 'C_f = 0', color: 'red', dashed: true }]}
        xLog yLog xUnit="Hz" yUnit="Ω" xLabel="frequency" yLabel="transimpedance |V/I|" height={220}
        vlines={[{ at: pd.bw, label: `f_{3dB} ${si(pd.bw, 'Hz')}`, color: 'accent' }, ...(isFinite(pd.fRC) && pd.fRC < 1e9 && Math.abs(Math.log10(pd.fRC / pd.bw)) > 0.6 ? [{ at: pd.fRC, label: '1/2πR_fC_f', color: 'muted' }] : [])]} />
    </SimShell>
  );
}
