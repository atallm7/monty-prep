// Scope probes: 10× compensation, probe loading vs frequency, ground-lead ringing.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { compensation, compMag, PROBES, loading, loadingRatio, groundLead } from '../models/scope-probe';

type View = 'compensation' | 'loading' | 'ground';
const R1 = 9e6, C1 = 10e-12, R2 = 1e6, CCABLE = 60e-12, CSCOPE = 15e-12, VPP = 5;
const tx = (v: number, u: string) => `\\text{${si(v, u)}}`;
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(Math.abs(x) < 0.1 ? 2 : 1)}%`;

export default function ScopeProbe({ params }: SimProps) {
  const v0 = params.view === 'loading' || params.view === 'ground' ? params.view : 'compensation';
  const init = { view: v0 as View, ccomp: 9e-12, fsq: 1e3, rs: 100e3, f: 1e6, probe: 'x10', lead: 150, cp: 10e-12, rsg: 25, tr: 0.7e-9 };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const c2 = CCABLE + CSCOPE + s.ccomp;
  const comp = useMemo(() => compensation({ r1: R1, c1: C1, r2: R2, c2, f: s.fsq, vpp: VPP, atten: 10 }), [c2, s.fsq]);
  const compBode = useMemo(() => { const fs = logspace(10, 1e8, 300); return { fs, y: fs.map(f => 20 * Math.log10(10 * compMag(f, { r1: R1, c1: C1, r2: R2, c2 }))) }; }, [c2]);

  const pr = PROBES.find(p => p.id === s.probe) ?? PROBES[1];
  const ld = useMemo(() => loading(s.rs, pr, s.f), [s.rs, pr, s.f]);
  const ldCurves = useMemo(() => { const fs = logspace(100, 1e9, 300); return { fs, ys: PROBES.map(p => fs.map(f => loadingRatio(f, s.rs, p.r, p.c))) }; }, [s.rs]);
  const ldStep = useMemo(() => { const ts = logspace(1e-12, 1e-2, 300); return { ts, ys: PROBES.map(p => { const L = loading(s.rs, p, 1); return ts.map(t => L.dcRatio * (1 - Math.exp(-t / L.tau))); }) }; }, [s.rs]);

  const Lg = s.lead * 1e-9; // ≈ 1 nH per mm of ground lead (rule of thumb)
  const gnd = useMemo(() => s.view === 'ground' ? groundLead({ L: Lg, C: s.cp, rs: s.rsg, tr: s.tr, v: 1 }) : null, [s.view, Lg, s.cp, s.rsg, s.tr]);

  const schematic = useMemo(() => {
    let el: any[];
    if (s.view === 'compensation') {
      el = [
        { t: 'Vsq', a: [0, 2], b: [0, 6], label: 'cal', value: `${VPP} V, ${si(s.fsq, 'Hz')}` },
        { t: 'wire', pts: [[0, 2], [0, 0], [3, 0]] },
        { t: 'R', a: [3, 0], b: [9, 0], label: 'R_1', value: '9 MΩ', labelSide: 'other' },
        { t: 'wire', pts: [[3, 0], [3, -2.5]] }, { t: 'wire', pts: [[9, 0], [9, -2.5]] },
        { t: 'C', a: [3, -2.5], b: [9, -2.5], label: 'C_1', value: '10 pF' },
        { t: 'dot', at: [3, 0] }, { t: 'dot', at: [9, 0] },
        { t: 'wire', pts: [[9, 0], [14, 0]], dashed: true, label: 'cable' },
        { t: 'R', a: [14, 0], b: [14, 5], label: 'R_2', value: '1 MΩ' },
        { t: 'wire', pts: [[14, 0], [18, 0]] }, { t: 'dot', at: [14, 0] },
        { t: 'C', a: [18, 0], b: [18, 5], label: 'C_2', value: si(c2, 'F'), color: Math.abs(comp.ratio - 1) < 0.02 ? 'green' : 'orange' },
        { t: 'wire', pts: [[0, 6], [0, 7], [18, 7], [18, 5]] }, { t: 'wire', pts: [[14, 5], [14, 7]] }, { t: 'dot', at: [14, 7] },
        { t: 'gnd', at: [7, 7] },
        { t: 'wire', pts: [[18, 0], [22, 0]] }, { t: 'term', at: [22, 0], label: 'ADC ×10', side: 'right' },
        { t: 'region', at: [2.2, -5.4], w: 7.6, h: 6.6, label: 'probe tip', color: 'blue' },
        { t: 'region', at: [12.6, -1.2], w: 8.6, h: 7.4, label: 'scope + trimmer', color: 'purple' },
      ];
    } else if (s.view === 'loading') {
      el = [
        { t: 'Vac', a: [0, 2], b: [0, 6], label: 'V_s', value: si(s.f, 'Hz') },
        { t: 'wire', pts: [[0, 2], [0, 0], [1, 0]] },
        { t: 'R', a: [1, 0], b: [6, 0], label: 'R_s', value: si(s.rs, 'Ω') },
        { t: 'wire', pts: [[6, 0], [13, 0]] }, { t: 'dot', at: [10, 0] }, { t: 'dot', at: [6, 0] },
        { t: 'text', at: [6, -1.4], text: 'node', anchor: 'middle', muted: true },
        { t: 'R', a: [10, 0], b: [10, 5], label: 'R_p', value: si(pr.r, 'Ω'), color: 'accent' },
        { t: 'C', a: [13, 0], b: [13, 5], label: 'C_p', value: si(pr.c, 'F'), color: 'accent' },
        { t: 'wire', pts: [[0, 6], [0, 7], [13, 7], [13, 5]] }, { t: 'wire', pts: [[10, 5], [10, 7]] }, { t: 'dot', at: [10, 7] },
        { t: 'gnd', at: [4, 7] },
        { t: 'region', at: [8.6, -1.4], w: 7.4, h: 7.6, label: pr.label, color: 'accent' },
        { t: 'text', at: [17, 2.5], text: `|Z_p| = ${si(ld.zp, 'Ω')}`, anchor: 'start', color: 'accent' },
        { t: 'text', at: [17, 4], text: `reads ${(ld.ratio * 100).toFixed(1)}%`, anchor: 'start' },
      ];
    } else {
      el = [
        { t: 'Vsq', a: [0, 2], b: [0, 6], label: 'edge', value: `t_r ${si(s.tr, 's')}` },
        { t: 'wire', pts: [[0, 2], [0, 0], [1, 0]] },
        { t: 'R', a: [1, 0], b: [5, 0], label: 'R_s', value: si(s.rsg, 'Ω') },
        { t: 'wire', pts: [[5, 0], [9, 0]], flow: true },
        { t: 'text', at: [8.3, -0.8], text: 'tip', anchor: 'middle', muted: true },
        { t: 'C', a: [9, 0], b: [9, 5], label: 'C_{tip}', value: si(s.cp, 'F'), labelSide: 'other' },
        { t: 'wire', pts: [[9, 5], [9, 7]] },
        { t: 'L', a: [9, 7], b: [3, 7], label: 'L_{gnd}', value: `${si(Lg, 'H')} (${num(s.lead, 3)} mm)`, color: s.lead > 20 ? 'red' : 'green', labelSide: 'other' },
        { t: 'wire', pts: [[3, 7], [0, 7], [0, 6]] }, { t: 'gnd', at: [0, 7] },
        { t: 'vmark', a: [11, 0.5], b: [11, 4.5], label: 'V_{scope}' }, { t: 'text', at: [13, 2.5], text: ' ' },
      ];
    }
    return renderCircuit({ elements: el }).svg;
  }, [s, c2, comp.ratio, pr, ld, Lg]);

  const views = [{ value: 'compensation' as View, label: 'Compensation' }, { value: 'loading' as View, label: 'Loading' }, { value: 'ground' as View, label: 'Ground lead' }];
  let stage, controls, eq, tryThis, badge;
  if (s.view === 'compensation') {
    const st = Math.abs(comp.ratio - 1) < 0.02 ? { l: 'Compensated: flat top', c: 'ok' as const } : comp.ratio > 1 ? { l: 'Over-compensated: overshoot', c: 'warn' as const } : { l: 'Under-compensated: rounded edges', c: 'warn' as const };
    badge = st;
    controls = <>
      <Slider label="Compensation trimmer" value={s.ccomp} min={0} max={30e-12} step={0.1e-12} unit="F" onChange={upd('ccomp')} />
      <button className="btn btn-sm" onClick={() => set(p => ({ ...p, ccomp: R1 * C1 / R2 - CCABLE - CSCOPE }))}>Turn trimmer to ideal</button>
      <Slider label="Square-wave frequency" value={s.fsq} min={100} max={100e3} log unit="Hz" onChange={upd('fsq')} />
      <Note>Tip: R<sub>1</sub> = 9 MΩ ‖ C<sub>1</sub> = 10 pF. Scope side: R<sub>2</sub> = 1 MΩ ‖ (cable 60 pF + input 15 pF + trimmer). The scope multiplies by 10.</Note>
    </>;
    eq = String.raw`\begin{gathered}R_1C_1=${tx(R1 * C1, 's')}\;\text{vs}\;R_2C_2=${tx(R2 * c2, 's')},\qquad \tau=(R_1\|R_2)(C_1+C_2)=${tx(comp.tau, 's')}\\ \frac{V_{edge}}{V_{flat}}=\frac{C_1/(C_1+C_2)}{R_2/(R_1+R_2)}=${num(1 + comp.hfGainErr, 4)}\end{gathered}`;
    stage = <>
      <Readouts>
        <Readout k="R1C1 / R2C2" v={num(comp.ratio, 4)} hl tone={st.c} />
        <Readout k="Edge (HF) gain error" v={pct(comp.hfGainErr)} tone={Math.abs(comp.hfGainErr) > 0.02 ? 'warn' : 'ok'} />
        <Readout k="Displayed overshoot" v={pct(Math.max(0, comp.overshoot))} />
        <Readout k="Settling τ" v={si(comp.tau, 's')} />
        <Readout k="Ideal trimmer" v={si(R1 * C1 / R2 - CCABLE - CSCOPE, 'F')} />
      </Readouts>
      <Plot series={[{ x: comp.t, y: comp.ideal, label: 'true signal', color: 'muted', dashed: true, step: true }, { x: comp.t, y: comp.y, label: 'scope display (×10)', color: 'accent' }]}
        xUnit="s" yUnit="V" xLabel="time" yLabel="voltage" height={240} yRange={[-0.6, VPP * 1.45]} />
      <Plot series={[{ x: compBode.fs, y: compBode.y, label: 'probe + scope gain', color: 'accent' }]} xLog xUnit="Hz" xLabel="frequency" yLabel="gain error (dB)" height={170}
        yRange={[Math.min(-1, Math.min(...compBode.y) - 0.3), Math.max(1, Math.max(...compBode.y) + 0.3)]} hlines={[{ at: 0, color: 'muted' }]}
        vlines={[{ at: 1 / (2 * Math.PI * comp.tau), label: '1/2πτ', color: 'muted' }]} />
    </>;
    tryThis = <>sweep the trimmer from 0 to 30 pF. Below the ideal value (C<sub>2</sub> &lt; 9·C<sub>1</sub>) the capacitive divider passes too much edge: the scope shows spikes (over-compensated). Above it the corners round off. Then raise the square wave to 20 kHz: with τ ≈ 90 µs, a mis-compensated probe no longer even reaches the flat top, which is a measurable amplitude error.</>;
  } else if (s.view === 'loading') {
    const err = ld.ratio - 1;
    badge = Math.abs(err) < 0.02 ? { l: 'Negligible loading', c: 'ok' as const } : Math.abs(err) < 0.1 ? { l: 'Noticeable loading', c: 'warn' as const } : { l: 'Probe dominates the node', c: 'bad' as const };
    controls = <>
      <Seg label="Probe" value={s.probe} onChange={upd('probe')} options={PROBES.map(p => ({ value: p.id, label: p.label }))} />
      <Slider label="Source resistance R_s" value={s.rs} min={10} max={10e6} log unit="Ω" onChange={upd('rs')} />
      <Slider label="Signal frequency" value={s.f} min={100} max={1e9} log unit="Hz" onChange={upd('f')} />
      <Note>Typical input models: 1× passive 1 MΩ ‖ 110 pF (cable dominates), 10× passive 10 MΩ ‖ 10 pF, active FET 1 MΩ ‖ 0.9 pF, low-Z transmission-line probe 500 Ω ‖ 0.5 pF.</Note>
    </>;
    eq = String.raw`\begin{gathered}\frac{V_{meas}}{V_s}=\frac{Z_p}{R_s+Z_p},\; Z_p=R_p\|\frac{1}{j\omega C_p}\Rightarrow |Z_p|=${tx(ld.zp, 'Ω')}\\ f_{3dB}=\frac{1}{2\pi (R_s\|R_p)C_p}=${tx(ld.f3, 'Hz')}\end{gathered}`;
    stage = <>
      <Readouts>
        <Readout k="Reading / true" v={`${(ld.ratio * 100).toFixed(2)}%`} hl tone={badge.c} />
        <Readout k="|Z_p| at f" v={si(ld.zp, 'Ω')} />
        <Readout k="DC loading error" v={pct(ld.dcRatio - 1)} />
        <Readout k="Loaded −3 dB" v={si(ld.f3, 'Hz')} />
        <Readout k="Added rise 2.2·RC" v={si(ld.trAdded, 's')} />
      </Readouts>
      <Plot series={PROBES.map((p, i) => ({ x: ldCurves.fs, y: ldCurves.ys[i], label: p.label, color: p.color, width: p.id === s.probe ? 2.6 : 1.2, dashed: p.id !== s.probe }))}
        xLog xUnit="Hz" xLabel="signal frequency" yLabel="measured / true" height={240} yRange={[0, 1.05]}
        vlines={[{ at: s.f, label: 'f', color: 'muted' }]} points={[{ x: s.f, y: ld.ratio, color: pr.color }]} />
      <Plot series={PROBES.map((p, i) => ({ x: ldStep.ts, y: ldStep.ys[i], label: p.label, color: p.color, width: p.id === s.probe ? 2.6 : 1.2, dashed: p.id !== s.probe }))}
        xLog xUnit="s" xLabel="time after an ideal step at the source (log)" yLabel="node / V_s" height={200} yRange={[0, 1.05]} />
    </>;
    tryThis = <>set R<sub>s</sub> = 1 MΩ (a high-impedance bias node) and compare probes at 1 kHz: the 1× and active probes read only half, the 10× reads 91%, and the low-Z probe collapses the node. Now move to a 50 Ω source at 100 MHz: the 1× probe's 110 pF (14 Ω at 100 MHz) drops the reading to about 28% while the 500 Ω low-Z probe is fine. Probe choice depends on both R<sub>s</sub> and f.</>;
  } else {
    const g = gnd!;
    badge = g.os > 0.3 ? { l: 'Severe ringing (probe artifact)', c: 'bad' as const } : g.os > 0.05 ? { l: 'Visible ringing', c: 'warn' as const } : { l: 'Clean edge', c: 'ok' as const };
    controls = <>
      <Seg label="Ground connection" value={s.lead <= 3 ? 'spring' : s.lead <= 60 ? 'short' : 'long'} onChange={v => upd('lead')(v === 'spring' ? 2 : v === 'short' ? 50 : 150)}
        options={[{ value: 'long', label: '15 cm clip lead' }, { value: 'short', label: '5 cm lead' }, { value: 'spring', label: 'Spring tip' }]} />
      <Slider label="Ground loop length" value={s.lead} min={1} max={300} log format={v => `${num(v, 3)} mm → ${si(v * 1e-9, 'H')}`} onChange={upd('lead')} />
      <Slider label="Probe tip capacitance" value={s.cp} min={1e-12} max={20e-12} log unit="F" onChange={upd('cp')} />
      <Slider label="Source resistance" value={s.rsg} min={1} max={200} log unit="Ω" onChange={upd('rsg')} />
      <Slider label="Signal 10–90% rise time" value={s.tr} min={0.1e-9} max={20e-9} log unit="s" onChange={upd('tr')} />
      <Note>The ground lead inductance and the probe tip capacitance form a series LC excited by the edge. The ringing is not on the board: it is created by the probe.</Note>
    </>;
    eq = String.raw`\begin{gathered}f_0=\frac{1}{2\pi\sqrt{L_{gnd}C_{tip}}}=${tx(g.f0, 'Hz')}\\ \zeta=\frac{R_s}{2}\sqrt{\frac{C}{L}}=${num(g.zeta, 3)},\quad \text{OS}=e^{-\pi\zeta/\sqrt{1-\zeta^2}}=${g.zeta < 1 ? num(g.os * 100, 3) + '\\%' : '0'}\end{gathered}`;
    stage = <>
      <Readouts>
        <Readout k="Ring frequency f0" v={si(g.f0, 'Hz')} hl />
        <Readout k="Damping ζ" v={num(g.zeta, 3)} />
        <Readout k="Q" v={num(g.Q, 3)} />
        <Readout k="Displayed overshoot" v={`${num(Math.max(0, g.overshootSim) * 100, 3)}%`} tone={badge.c} />
        <Readout k="Edge knee 0.35/t_r" v={si(0.35 / s.tr, 'Hz')} />
      </Readouts>
      <Plot series={[{ x: g.t, y: g.yin, label: 'actual signal', color: 'muted', dashed: true }, { x: g.t, y: g.y, label: 'scope display', color: 'accent' }]}
        xUnit="s" xLabel="time" yLabel="normalised V" height={250} hlines={[{ at: 1, color: 'muted' }]} />
    </>;
    tryThis = <>with the 15 cm clip lead and a 0.7 ns edge, the display rings at about {si(1 / (2 * Math.PI * Math.sqrt(150e-9 * s.cp)), 'Hz')} with large overshoot. Switch to the spring tip: f<sub>0</sub> jumps above 1 GHz, beyond the edge's bandwidth, and the ringing disappears. Then slow the edge to 10 ns with the long lead: if t<sub>r</sub> ≫ 1/f<sub>0</sub>, the resonance is barely excited.</>;
  }

  return (
    <SimShell title="Scope probes: compensation, loading & ground lead" onReset={() => set(init)} tryThis={tryThis}
      controls={<><Seg label="View" value={s.view} onChange={upd('view')} options={views} />{controls}</>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div><RegionBadge label={badge.l} color={badge.c} /></div>
      {stage}
      <EqBox>{eq}</EqBox>
    </SimShell>
  );
}
