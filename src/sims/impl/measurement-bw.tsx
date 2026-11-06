// Signal rise time vs scope bandwidth and sample rate.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { edgeAnalysis, harmonics, scopeGain } from '../models/measurement-bw';
import { logspace } from '../../lib/units';

export default function MeasurementBW({ params }: SimProps) {
  const init = { tr: Number(params.tr ?? 1e-9), bw: Number(params.bw ?? 200e6), fs: Number(params.fs ?? 1e9), phase: 0, f0: 50e6 };
  const [s, set] = useState(init);
  const upd = (k: keyof typeof s) => (v: number) => set(p => ({ ...p, [k]: v }));
  const e = useMemo(() => edgeAnalysis(s), [s]);
  const h = useMemo(() => harmonics(s.f0, s.tr, s.bw, s.fs, 81), [s]);
  const resp = useMemo(() => { const xs = logspace(s.f0 * 0.7, s.f0 * 90, 120); return { x: xs, y: xs.map(f => scopeGain(f, s.bw) * 1.3) }; }, [s.f0, s.bw]);

  const stems = (sel: (i: number) => boolean, val: (i: number) => number) => {
    const x: number[] = [], y: number[] = [];
    h.f.forEach((f, i) => { if (sel(i)) { x.push(f, f, NaN); y.push(0, val(i), NaN); } }); return { x, y };
  };
  const ideal = stems(() => true, i => h.ideal[i]);
  const seen = stems(i => !h.beyondNyq[i], i => h.seen[i]);
  const alias = stems(i => h.beyondNyq[i], i => h.seen[i]);
  const knee = e.sigBw, errAbs = Math.abs(e.errPct);
  const spe = e.samplesPerEdge;
  const trs = isFinite(e.trSampled) ? e.trSampled : NaN;
  const sErr = isFinite(trs) ? (trs / s.tr - 1) * 100 : NaN;
  const bad = errAbs > 20 || spe < 2;
  const badge = errAbs > 20 ? { l: `Scope too slow: reads ${e.errPct.toFixed(0)} % slower`, c: 'bad' as const } : errAbs > 5 ? { l: 'Noticeable rise-time error', c: 'warn' as const } : { l: 'Bandwidth adequate (<5 % error)', c: 'ok' as const };
  const sbadge = spe < 2 ? { l: 'Under-sampled edge: <2 samples', c: 'bad' as const } : spe < 4 ? { l: 'Few samples per edge (interpolation error)', c: 'warn' as const } : { l: 'Edge well sampled', c: 'ok' as const };
  const nyqBad = e.nyquist < Math.min(s.bw, knee) * 1.0;

  return (
    <SimShell title="Bandwidth, rise time & sample rate" onReset={() => set(init)}
      tryThis={<>with the current settings ({si(s.tr, 's')} edge, {si(s.bw, 'Hz')} scope) the display shows a rise time of {si(e.trMeas, 's')} instead of {si(s.tr, 's')}, a {e.errPct.toFixed(0)} % error, because t<sub>r,meas</sub> = √(t<sub>r,sig</sub>² + (0.35/BW)²). Raise BW to 2 GHz (≈ 5× the signal bandwidth {si(knee, 'Hz')}) and the error falls below 2 % (3× still leaves about 6 %). Now lower the sample rate toward 500 MS/s: only about one sample lands on the edge, the measured rise time jumps around as you slide the sampling phase, and harmonics above fs/2 alias back into the band.</>}
      controls={<>
        <Slider label="Signal rise time (10–90 %)" value={s.tr} min={50e-12} max={100e-9} log unit="s" onChange={upd('tr')} />
        <Slider label="Scope bandwidth (−3 dB)" value={s.bw} min={10e6} max={20e9} log unit="Hz" onChange={upd('bw')} />
        <Slider label="Sample rate" value={s.fs} min={10e6} max={100e9} log unit="Sa/s" onChange={upd('fs')} />
        <Slider label="Sampling phase vs edge" value={s.phase} min={0} max={1} step={0.01} format={v => (v * 100).toFixed(0) + ' % of Ts'} onChange={upd('phase')} />
        <Slider label="Clock frequency (harmonic plot)" value={s.f0} min={1e6} max={1e9} log unit="Hz" onChange={upd('f0')} />
        <Note>Scope front end modelled as a Gaussian response (tr = 0.34/BW, close to the 0.35/BW rule). Samples are joined by straight lines, like a scope in linear-interpolation mode.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><RegionBadge label={badge.l} color={badge.c} /><RegionBadge label={sbadge.l} color={sbadge.c} /></div>
      <Readouts>
        <Readout k="Measured rise time (RSS)" v={si(e.trMeas, 's')} hl tone={bad ? 'bad' : 'ok'} />
        <Readout k="Rise-time error" v={`+${e.errPct.toFixed(1)} %`} tone={errAbs > 20 ? 'bad' : errAbs > 5 ? 'warn' : 'ok'} />
        <Readout k="Scope tr = 0.35/BW" v={si(e.trRule, 's')} />
        <Readout k="Signal bandwidth 0.35/tr" v={si(knee, 'Hz')} />
        <Readout k="Samples across the edge" v={spe.toFixed(2)} tone={spe < 2 ? 'bad' : spe < 4 ? 'warn' : 'ok'} />
        <Readout k="Rise time from samples" v={isFinite(trs) ? `${si(trs, 's')} (${sErr >= 0 ? '+' : ''}${sErr.toFixed(0)} %)` : 'n/a'} hl />
        <Readout k="Nyquist fs/2" v={si(e.nyquist, 'Hz')} tone={nyqBad ? 'warn' : 'ok'} />
        <Readout k="Power passed by scope" v={`${(h.powerKept * 100).toFixed(1)} %`} />
      </Readouts>
      <EqBox>{String.raw`t_{r,meas}=\sqrt{t_{r,sig}^2+\left(\frac{0.35}{BW}\right)^2}=\sqrt{(${(s.tr * 1e9).toPrecision(3)}\,\text{ns})^2+(${(e.trRule * 1e9).toPrecision(3)}\,\text{ns})^2}=${(e.trRSS * 1e9).toPrecision(3)}\,\text{ns}`}</EqBox>
      <Plot series={[{ x: e.t, y: e.ideal, label: 'Signal edge', color: 'muted', dashed: true }, { x: e.t, y: e.filt, label: 'After scope bandwidth', color: 'accent' }, { x: e.st, y: e.sv, label: 'Sampled & joined', color: 'red', points: true, width: 1.2 }]}
        xUnit="s" yUnit="" yTickFormat={v => v.toFixed(1)} xLabel="time" yLabel="Normalised voltage" height={250} hlines={[{ at: 0.1, color: 'muted' }, { at: 0.9, color: 'muted' }]} />
      <Plot series={[{ x: ideal.x, y: ideal.y, label: 'Signal harmonics', color: 'muted' }, { x: seen.x, y: seen.y, label: 'Seen by the scope', color: 'accent', width: 2.4 }, { x: alias.x, y: alias.y, label: 'Above fs/2 (aliases)', color: 'orange', width: 2.4 }, { x: resp.x, y: resp.y, label: 'Scope response (scaled)', color: 'red', dashed: true }]}
        xLog xUnit="Hz" yTickFormat={v => v.toFixed(1)} xLabel="Frequency" yLabel="Harmonic amplitude" height={230}
        vlines={[{ at: s.bw, label: 'BW', color: 'red' }, { at: e.nyquist, label: 'fs/2', color: 'orange' }, { at: knee, label: '0.35/tr', color: 'green' }]} />
    </SimShell>
  );
}
