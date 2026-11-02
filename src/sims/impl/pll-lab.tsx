// Charge-pump PLL: lock transient, phase error, loop design (R, C from bw & ζ), phase-step response, too-fast loops.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { simulate, linearPrediction } from '../models/pll-lab';

function decimate<T>(arr: T[], maxN: number) { const k = Math.max(1, Math.ceil(arr.length / maxN)); return arr.filter((_, i) => i % k === 0); }

export default function PllLab({ params }: SimProps) {
  const init = {
    fref: Number(params.fref ?? 10e6), n: Math.max(1, Math.round(Number(params.n ?? 10))), bw: Number(params.bw ?? 100e3), zeta: Number(params.zeta ?? 0.7),
    kvco: 50e6, icp: 100e-6, offsetPct: -1, step: false, stepDeg: 45,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const pin = { fref: s.fref, n: s.n, bw: s.bw, zeta: s.zeta, kvco: s.kvco, icp: s.icp, offset: s.offsetPct / 100, phaseStep: s.step ? s.stepDeg : 0 };
  const o = useMemo(() => simulate(pin), [s]);
  const d = o.d;
  const plot = useMemo(() => {
    const t = decimate(o.t, 1500), f = decimate(o.f, 1500), ph = decimate(o.phaseErrDeg, 1500), vc = decimate(o.vc, 1500);
    const lin = t.map(tt => linearPrediction(pin, o, tt));
    return { t, f, ph, vc, linF: lin.map(l => l.f), linPh: lin.map(l => l.phaseDeg) };
  }, [o]);
  const ratio = s.bw / s.fref;
  const unstable = !o.locked && (ratio > 0.2 || o.slips > 0 && ratio > 0.1);
  const region = unstable ? { l: 'Unstable: loop too fast for fref', c: 'bad' as const } : !o.locked ? { l: 'Not locked within window', c: 'warn' as const }
    : ratio > 1 / 10 ? { l: 'Locked, but bw > fref/10 (sampling effects)', c: 'warn' as const } : { l: 'Locked', c: 'ok' as const };

  const dfp = plot.f.map(v => v - o.ftarget), dfl = plot.linF.map(v => v - o.ftarget);
  const fmin = Math.min(...dfp), fmax = Math.max(...dfp);
  const span = Math.max(fmax - fmin, 1e-6 * o.ftarget);
  const yR: [number, number] = [fmin - 0.08 * span, fmax + 0.08 * span];
  const svg = useMemo(() => renderCircuit({
    elements: [
      { t: 'term', at: [-1, 1], label: `f_{ref} ${si(s.fref, 'Hz')}`, side: 'top' }, { t: 'wire', pts: [[-1, 1], [2, 1]] },
      { t: 'box', at: [2, 0], w: 4, h: 4, label: 'PFD', pins: [{ side: 'left', pos: 1, name: 'R' }, { side: 'left', pos: 3, name: 'V' }] },
      { t: 'wire', pts: [[6, 2], [8, 2]] },
      { t: 'box', at: [8, 0], w: 4, h: 4, label: `CP\n${si(s.icp, 'A')}` },
      { t: 'wire', pts: [[12, 2], [17, 2]], flow: o.locked ? undefined : true }, { t: 'dot', at: [14, 2] },
      { t: 'R', a: [14, 2], b: [14, 5.5], label: 'R', value: si(d.R, 'Ω') }, { t: 'C', a: [14, 5.5], b: [14, 8.5], label: 'C', value: si(d.C, 'F') }, { t: 'gnd', at: [14, 8.5] },
      { t: 'text', at: [15.3, 1.2], text: 'V_c', anchor: 'start', size: 12, muted: true },
      { t: 'box', at: [17, 0], w: 4, h: 4, label: `VCO\n${si(s.kvco, 'Hz/V')}` },
      { t: 'wire', pts: [[21, 2], [25, 2]] }, { t: 'dot', at: [22.5, 2] }, { t: 'term', at: [25, 2], label: `f_{out} → ${si(o.ftarget, 'Hz')}`, side: 'top', color: 'accent' },
      { t: 'wire', pts: [[22.5, 2], [22.5, 11], [15, 11]] },
      { t: 'box', at: [11, 10], w: 4, h: 2, label: `÷${s.n}` },
      { t: 'wire', pts: [[11, 11], [0.8, 11], [0.8, 3], [2, 3]] },
    ],
  }).svg, [s.fref, s.icp, s.kvco, s.n, d.R, d.C, o.ftarget, o.locked]);

  const vlines = [...(isFinite(o.lockTime) ? [{ at: o.lockTime, label: 'lock', color: 'green' }] : []), ...(isFinite(o.tStep) ? [{ at: o.tStep, label: `${s.stepDeg}° step`, color: 'orange' }] : [])];
  return (
    <SimShell title="Phase-locked loop" onReset={() => set(init)}
      tryThis={<>drop ζ to 0.3 and watch the VCO overshoot and ring; raise it to 2 and the loop creeps in slowly. Then push the loop bandwidth toward f<sub>ref</sub>/3: the continuous-time model (dashed) still predicts a lock, but the real sampled PFD goes unstable. Enable the phase step to see a type-II loop pull the phase error back to exactly zero.</>}
      controls={<>
        <Slider label="Reference fref" value={s.fref} min={1e5} max={100e6} log unit="Hz" onChange={upd('fref')} />
        <Slider label="Feedback divider N" value={s.n} min={1} max={200} step={1} format={v => `${v} → ${si(v * s.fref, 'Hz')}`} onChange={v => upd('n')(Math.round(v))} />
        <Slider label="Loop bandwidth (−3 dB)" value={s.bw} min={1e2} max={Math.max(1e3, s.fref / 2)} log unit="Hz" onChange={upd('bw')} />
        <Slider label="Damping ζ" value={s.zeta} min={0.1} max={3} step={0.05} format={v => v.toFixed(2)} onChange={upd('zeta')} />
        <Slider label="VCO gain Kvco" value={s.kvco} min={1e6} max={1e9} log unit="Hz/V" onChange={upd('kvco')} />
        <Slider label="Charge-pump current" value={s.icp} min={10e-6} max={5e-3} log unit="A" onChange={upd('icp')} />
        <Slider label="Initial VCO frequency error" value={s.offsetPct} min={-20} max={20} step={0.1} format={v => `${v.toFixed(1)} %`} onChange={upd('offsetPct')} />
        <Toggle label="Reference phase step after lock" checked={s.step} onChange={upd('step')} />
        {s.step && <Slider label="Phase step size" value={s.stepDeg} min={-180} max={180} step={5} format={v => `${v}°`} onChange={upd('stepDeg')} />}
        <Note>R and C are recomputed so the loop has the requested bandwidth and damping for the chosen Kvco, Icp and N. The model is event-driven, one charge-pump pulse per reference cycle, so sampling instability and PFD cycle slips are real. The dashed curves are the continuous-time linear model.</Note>
      </>}>
      <div><RegionBadge label={region.l} color={region.c} /></div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <EqBox>{String.raw`\omega_n = \sqrt{\tfrac{I_{cp}K_v}{2\pi N C}} = 2\pi\cdot ${si(d.fn, 'Hz')},\quad \zeta = \tfrac{R}{2}\sqrt{\tfrac{I_{cp}K_vC}{2\pi N}} = ${d.zeta.toFixed(2)},\quad t_{lock}\approx\frac{4.6}{\zeta\omega_n} = ${si(4.6 / (Math.min(1, d.zeta) * d.wn), 's')}`}</EqBox>
      <Plot series={[{ x: plot.t, y: dfl, label: 'linear model', color: 'muted', dashed: true }, { x: plot.t, y: dfp, label: 'VCO frequency error f − N·fref (per ref cycle)', color: 'accent', width: 2 }]}
        xUnit="s" yUnit="Hz" xLabel="time" height={230} yRange={yR}
        hlines={[{ at: 0, label: 'N·fref', color: 'green' }]} vlines={vlines} />
      <Plot series={[{ x: plot.t, y: plot.linPh, label: 'linear model', color: 'muted', dashed: true }, { x: plot.t, y: plot.ph, label: 'phase error θref − θdiv', color: 'orange', width: 2 }]}
        xUnit="s" yUnit="°" xLabel="time" yLabel="phase error" height={190} vlines={vlines} hlines={[{ at: 360, label: '±360° PFD range', color: 'red' }, { at: -360, color: 'red' }]}
        yRange={[Math.max(-400, Math.min(-5, ...plot.ph) * 1.15), Math.min(400, Math.max(5, ...plot.ph) * 1.15)]} />
      <Readouts>
        <Readout k="Target N·fref" v={si(o.ftarget, 'Hz')} />
        <Readout k="Final VCO freq" v={si(o.f[o.f.length - 1], 'Hz', 6)} tone={o.locked ? 'ok' : 'bad'} />
        <Readout k="Lock time (100 ppm, 0.1 rad)" v={isFinite(o.lockTime) ? si(o.lockTime, 's') : 'not locked'} hl tone={o.locked ? undefined : 'bad'} />
        <Readout k="Frequency overshoot" v={s.offsetPct === 0 ? '—' : `${o.overshootPct.toFixed(1)} %`} />
        <Readout k="Natural freq fn" v={si(d.fn, 'Hz')} />
        <Readout k="bw / fref" v={`1/${(1 / ratio).toFixed(1)}`} tone={ratio > 0.1 ? 'warn' : 'ok'} />
        <Readout k="Loop filter R / C" v={`${si(d.R, 'Ω')} / ${si(d.C, 'F')}`} />
        <Readout k="Cycle slips" v={String(o.slips)} tone={o.slips ? 'warn' : undefined} />
        <Readout k="Final Vc" v={si(o.vcFinal, 'V')} />
      </Readouts>
    </SimShell>
  );
}
