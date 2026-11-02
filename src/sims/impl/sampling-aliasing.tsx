// Sampling & aliasing: samples of a tone, ideal sinc reconstruction, folded frequency, spectrum images and an
// optional Butterworth anti-alias filter in front of the sampler.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot, { Span } from '../../components/Plot';
import { alias, butter, simulate, images, inputTone } from '../models/sampling-aliasing';

export default function SamplingAliasing({ params }: SimProps) {
  const init = {
    f: Math.max(0, Math.min(20000, Number(params.f ?? 900) || 0)),
    fs: Math.max(100, Math.min(20000, Number(params.fs ?? 1000) || 1000)),
    phase: 0, filter: false, fcr: 0.45, order: '4' as '2' | '4' | '8',
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const fc = s.fcr * s.fs;
  const order = Number(s.order);
  const inp = { f: s.f, fs: s.fs, phase: s.phase * Math.PI / 180, filter: s.filter, fc, order };

  const al = alias(s.f, s.fs);
  const ts = 1 / s.fs;
  const T = Math.min(60 * ts, Math.max(12 * ts, al.fa > 0 ? 2.2 / al.fa : 60 * ts));
  const pts = Math.round(Math.min(6000, Math.max(600, s.f * T * 24)));
  const sim = useMemo(() => simulate(inp, T, pts), [s.f, s.fs, s.phase, s.filter, fc, order, T, pts]);
  const tone = inputTone(inp);

  const fmax = Math.max(3 * s.fs, s.f * 1.15);
  const spec = useMemo(() => {
    const imgs = images(s.f, s.fs, fmax);
    const st = { x: [] as number[], y: [] as number[] };
    for (const im of imgs) { if (Math.abs(im.f - s.f) < 1e-9 || Math.abs(im.f - al.fa) < 1e-9) continue; st.x.push(im.f, im.f, NaN); st.y.push(0, tone.A, NaN); }
    const H = { x: [] as number[], y: [] as number[] };
    if (s.filter) for (let i = 0; i <= 300; i++) { const f = fmax * i / 300; H.x.push(f); H.y.push(butter(f, fc, order).mag); }
    return { st, H };
  }, [s.f, s.fs, fmax, al.fa, tone.A, s.filter, fc, order]);
  const zones: Span[] = [];
  for (let z = 0; z * s.fs / 2 < fmax; z++) if (z % 2 === 1) zones.push({ from: z * s.fs / 2, to: Math.min(fmax, (z + 1) * s.fs / 2), color: 'muted' });

  const atNyq = Math.abs(s.f - s.fs / 2) < 1e-6 * s.fs;
  const badge = !al.aliased ? <RegionBadge label="Below Nyquist: faithfully reconstructed" color="ok" /> : atNyq ? <RegionBadge label="Exactly fs/2: amplitude depends on phase" color="warn" /> : <RegionBadge label={`Aliased: appears at ${si(al.fa, 'Hz')}`} color="bad" />;
  const attenDb = 20 * Math.log10(Math.max(1e-12, tone.gain));

  return (
    <SimShell title="Sampling & aliasing" onReset={() => set(init)}
      tryThis={<>with f<sub>s</sub> = 1 kHz sweep f from 100 Hz to 2 kHz and watch the green reconstruction: it rises to 500 Hz, then <i>falls</i> back to 0 at f = f<sub>s</sub> and climbs again (folding). Then enable the anti-alias filter with f = 900 Hz: the alias at 100 Hz shrinks by the filter's attenuation, which is why the filter must sit <i>before</i> the ADC.</>}
      controls={<>
        <Slider label="Signal frequency f" value={s.f} min={0} max={Math.max(5000, Math.ceil(4 * s.fs / 100) * 100)} step={5} unit="Hz" onChange={upd('f')} />
        <Slider label="Sample rate fs" value={s.fs} min={100} max={20000} log unit="Hz" onChange={upd('fs')} />
        <Slider label="Signal phase φ" value={s.phase} min={0} max={360} step={5} format={v => v.toFixed(0) + '°'} onChange={upd('phase')} />
        <Toggle label="Anti-alias filter (Butterworth)" checked={s.filter} onChange={upd('filter')} />
        {s.filter && <Slider label="Filter cutoff fc / fs" value={s.fcr} min={0.05} max={1} step={0.01} format={v => `${v.toFixed(2)} (${si(v * s.fs, 'Hz')})`} onChange={upd('fcr')} />}
        {s.filter && <Seg label="Filter order" value={s.order} options={[{ value: '2', label: '2nd' }, { value: '4', label: '4th' }, { value: '8', label: '8th' }]} onChange={upd('order')} />}
        <Note>The green trace is the ideal Whittaker–Shannon (sinc) reconstruction from the dots alone. It can only produce frequencies below f<sub>s</sub>/2, so any tone above Nyquist comes back folded to |f − k·f<sub>s</sub>|.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{badge}{al.inverted && al.aliased && <RegionBadge label="Odd zone: spectrum inverted (phase flips)" color="info" />}</div>
      <Plot height={260} xUnit="s" xLabel="time" yLabel="amplitude" xRange={[0, T]} yRange={[-1.25, 1.25]}
        series={[
          { x: sim.t, y: sim.x, label: s.filter ? `filtered input (${si(s.f, 'Hz')})` : `input (${si(s.f, 'Hz')})`, color: 'muted', width: 1.2 },
          { x: sim.t, y: sim.xr, label: `reconstructed (${si(al.fa, 'Hz')})`, color: 'green', width: 2.2 },
          { x: sim.st, y: sim.sv, label: 'samples', color: 'red', points: true, width: 0.01 },
        ]} />
      <Plot height={220} xUnit="Hz" xLabel="frequency" yLabel="|X(f)|" xRange={[0, fmax]} yRange={[0, 1.15]} hover={false}
        xspans={zones}
        vlines={[{ at: s.fs / 2, label: 'fs/2 (Nyquist)', color: 'orange' }, { at: s.fs, label: 'fs', color: 'muted' }, ...(s.filter ? [{ at: fc, label: 'fc', color: 'blue' }] : [])]}
        series={[
          ...(s.filter ? [{ ...spec.H, label: '|H(f)| filter', color: 'blue', dashed: true }] : []),
          { ...spec.st, label: 'images k·fs ± f', color: 'muted', width: 2 },
          { x: [s.f, s.f], y: [0, tone.A], label: 'input tone', color: 'red', width: 3 },
          { x: [al.fa, al.fa], y: [0, tone.A], label: 'apparent tone (baseband)', color: 'green', width: 3 },
        ]} />
      <Readouts>
        <Readout k="Apparent frequency fa" v={si(al.fa, 'Hz')} hl tone={al.aliased && !atNyq ? 'bad' : 'ok'} />
        <Readout k="Nyquist fs/2" v={si(s.fs / 2, 'Hz')} />
        <Readout k="Nyquist zone" v={String(al.zone)} />
        <Readout k="Samples per cycle" v={s.f > 0 ? (s.fs / s.f).toFixed(2) : '∞'} tone={s.f > 0 && s.fs / s.f < 2 ? 'bad' : undefined} />
        {s.filter && <Readout k="Filter gain at f" v={`${attenDb.toFixed(1)} dB`} tone={al.aliased ? (attenDb < -40 ? 'ok' : 'warn') : attenDb < -1 ? 'warn' : 'ok'} />}
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}f_a = \left|f - k f_s\right| = \left|\text{${si(s.f, 'Hz')}} - ${al.k}\cdot \text{${si(s.fs, 'Hz')}}\right| = \text{${si(al.fa, 'Hz')}}\\ k=\mathrm{round}(f/f_s)=${al.k}\end{gathered}`}</EqBox>
    </SimShell>
  );
}
