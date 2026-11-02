// Fourier synthesis & spectrum: build waves from N harmonics, see Gibbs ringing, harmonic envelopes and the
// second spectral roll-off that a finite rise time adds (corner at 1/(π·tr)).
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, num } from '../kit';
import Plot, { Series } from '../../components/Plot';
import { Wave, harmonic, synthesize, powerFraction, corners, edged } from '../models/fourier-synth';

type View = 'time' | 'spectrum' | 'edges';
const WAVES: { value: Wave; label: string }[] = [{ value: 'square', label: 'Square' }, { value: 'triangle', label: 'Triangle' }, { value: 'sawtooth', label: 'Sawtooth' }, { value: 'pulse', label: 'Pulse' }];
const pct = (v: number, d = 1) => (v * 100).toFixed(d) + '%';

const EQ: Record<Wave, string> = {
  square: String.raw`x_N(t)=\frac{4}{\pi}\sum_{n\,\text{odd}}^{N}\frac{\sin(2\pi n f_0 t)}{n}`,
  triangle: String.raw`x_N(t)=\frac{8}{\pi^2}\sum_{n\,\text{odd}}^{N}(-1)^{\frac{n-1}{2}}\frac{\sin(2\pi n f_0 t)}{n^2}`,
  sawtooth: String.raw`x_N(t)=\frac{2}{\pi}\sum_{n=1}^{N}(-1)^{n+1}\frac{\sin(2\pi n f_0 t)}{n}`,
  pulse: String.raw`x_N(t)=D+\sum_{n=1}^{N}2D\,\mathrm{sinc}(nD)\cos\!\big(2\pi n f_0 (t-\tfrac{DT}{2})\big)`,
};

export default function FourierSynth({ params }: SimProps) {
  const w0 = String(params.wave ?? 'square');
  const v0 = String(params.view ?? 'time');
  const init = {
    wave: (['square', 'triangle', 'sawtooth', 'pulse'].includes(w0) ? w0 : 'square') as Wave,
    N: Math.max(1, Math.min(199, Math.round(Number(params.harmonics ?? 9)) || 9)),
    duty: Math.max(0.02, Math.min(0.98, Number(params.duty ?? 0.25) || 0.25)),
    tr: Math.max(0.001, Math.min(0.2, Number(params.tr ?? 0.02) || 0.02)),
    view: (['time', 'spectrum', 'edges'].includes(v0) ? v0 : 'time') as View,
    comps: false, db: false,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const tr = s.view === 'edges' ? s.tr : 0;

  const syn = useMemo(() => synthesize(s.wave, s.N, s.duty, tr, -0.25, 1.75, 900), [s.wave, s.N, s.duty, tr]);
  const pf = useMemo(() => powerFraction(s.wave, s.N, s.duty, tr), [s.wave, s.N, s.duty, tr]);
  const nz = syn.hs.filter(h => h.amp > 1e-9).length;
  const cor = corners(s.wave, s.duty, s.tr);

  const timeSeries = useMemo(() => {
    const out: Series[] = [{ x: syn.t, y: syn.yi, label: tr > 0 ? 'trapezoid (tr)' : 'ideal', color: 'muted', dashed: true }];
    if (s.comps) {
      const cols = ['blue', 'green', 'orange', 'purple', 'red'];
      syn.hs.filter(h => h.amp > 1e-9).slice(0, 5).forEach((h, i) => out.push({ x: syn.t, y: syn.t.map(t => h.a * Math.cos(2 * Math.PI * h.n * t) + h.b * Math.sin(2 * Math.PI * h.n * t)), label: `n=${h.n}`, color: cols[i], width: 1.2 }));
    }
    out.push({ x: syn.t, y: syn.y, label: `sum to N=${s.N}`, color: 'accent', width: 2.2 });
    return out;
  }, [syn, s.comps, s.N, tr]);

  // Spectrum stems (NaN breaks give one path per stem)
  const spec = useMemo(() => {
    const M = Math.max(31, s.N + 6);
    const inc = { x: [] as number[], y: [] as number[] }, exc = { x: [] as number[], y: [] as number[] }, env = { x: [] as number[], y: [] as number[] };
    const floor = 1e-4;
    for (let n = 1; n <= M; n++) {
      const a = harmonic(s.wave, n, s.duty).amp; if (a < 1e-9) continue;
      const tgt = n <= s.N ? inc : exc;
      tgt.x.push(n, n, NaN); tgt.y.push(s.db ? floor : 0, a, NaN);
    }
    for (let i = 0; i <= 400; i++) {
      const n = 0.6 + (M - 0.6) * i / 400;
      const e = s.wave === 'square' ? 4 / (Math.PI * n) : s.wave === 'triangle' ? 8 / (Math.PI ** 2 * n * n) : s.wave === 'sawtooth' ? 2 / (Math.PI * n) : 2 * s.duty * Math.abs(Math.sin(Math.PI * n * s.duty) / (Math.PI * n * s.duty));
      env.x.push(n); env.y.push(e);
    }
    return { inc, exc, env, M };
  }, [s.wave, s.N, s.duty, s.db]);

  // Edges view: log-log spectrum of ideal vs trapezoid + asymptotes
  const edge = useMemo(() => {
    const ideal = { x: [] as number[], y: [] as number[] }, trap = { x: [] as number[], y: [] as number[] }, asym = { x: [] as number[], y: [] as number[] };
    const nMax = 2000;
    for (let n = 1; n <= nMax; n = n < 60 ? n + 1 : Math.ceil(n * 1.04)) {
      const a = harmonic(s.wave, n, s.duty).amp; const b = harmonic(s.wave, n, s.duty, s.tr).amp;
      if (a > 1e-9) { ideal.x.push(n); ideal.y.push(a); }
      if (b > 1e-9) { trap.x.push(n); trap.y.push(b); }
    }
    // Bode-style asymptotic envelope: A0 → −20 dB/dec above f1 = 1/(πτ) → −40 dB/dec above f2 = 1/(πtr)
    const A0 = s.wave === 'pulse' ? 2 * s.duty : s.wave === 'square' ? 4 / Math.PI : s.wave === 'sawtooth' ? 2 / Math.PI : 8 / Math.PI ** 2;
    for (let i = 0; i <= 200; i++) {
      const n = 10 ** (Math.log10(0.5) + (Math.log10(nMax) - Math.log10(0.5)) * i / 200);
      let e: number;
      if (s.wave === 'triangle') e = Math.min(A0, A0 / (n * n));
      else if (s.wave === 'sawtooth') e = A0 / Math.max(1, n);
      else if (s.wave === 'square') e = 4 / (Math.PI * Math.max(1, n));
      else { const f1 = cor.f1; e = n < f1 ? A0 : A0 * f1 / n; }
      if (n > cor.f2) e *= cor.f2 / n;
      asym.x.push(n); asym.y.push(e);
    }
    const tt: number[] = [], yy: number[] = [];
    for (let i = 0; i <= 700; i++) { const t = -0.25 + 2 * i / 700; tt.push(t); yy.push(edged(s.wave, t, s.duty, s.tr)); }
    return { ideal, trap, asym, tt, yy };
  }, [s.wave, s.duty, s.tr, cor.f1, cor.f2]);

  const jumpWave = s.wave !== 'triangle';
  const gibbs = jumpWave && tr === 0;
  const tone = pf > 0.99 ? 'ok' : pf > 0.9 ? 'warn' : 'bad';

  return (
    <SimShell title="Fourier synthesis & spectrum" onReset={() => set(init)}
      tryThis={<>pick <b>Square</b> and drag N from 9 to 199: the ripple squeezes toward the edge but the overshoot stays stuck near 9% of the jump (Gibbs). Then open <b>Edges</b> and raise t<sub>r</sub>: harmonics above 1/(π·t<sub>r</sub>) fall at −40 dB/dec, which is why rise time, not clock frequency, sets the bandwidth your board must handle.</>}
      controls={<>
        <Seg label="Waveform" value={s.wave} options={WAVES} onChange={upd('wave')} />
        <Seg label="View" value={s.view} options={[{ value: 'time', label: 'Time' }, { value: 'spectrum', label: 'Spectrum' }, { value: 'edges', label: 'Edges' }]} onChange={upd('view')} />
        <Slider label="Highest harmonic N" value={s.N} min={1} max={199} step={1} format={v => String(Math.round(v))} onChange={v => upd('N')(Math.round(v))} />
        {s.wave === 'pulse' && <Slider label="Duty cycle D" value={s.duty} min={0.02} max={0.98} step={0.01} format={v => pct(v, 0)} onChange={upd('duty')} />}
        {s.view === 'edges' && <Slider label="Rise time tr (fraction of T)" value={s.tr} min={0.001} max={0.2} log format={v => pct(v, v < 0.01 ? 2 : 1) + ' of T'} onChange={upd('tr')} />}
        {s.view === 'time' && <Toggle label="Show first 5 components" checked={s.comps} onChange={upd('comps')} />}
        {s.view === 'spectrum' && <Toggle label="Log amplitude (dB-style)" checked={s.db} onChange={upd('db')} />}
        <Note>Amplitude 1 (±1 waves; pulse train 0→1). Time is in periods T, frequency in harmonics of f<sub>0</sub> = 1/T. Edge model: the ideal wave convolved with a t<sub>r</sub>-wide box (linear ramps), so every harmonic is multiplied by sinc(n·t<sub>r</sub>/T).</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {s.wave === 'triangle' ? <RegionBadge label="No jumps: 1/n² harmonics, no Gibbs" color="ok" /> : gibbs ? <RegionBadge label={`Gibbs overshoot ${pct(syn.overshoot)}`} color="warn" /> : syn.overshoot > 0.005 ? <RegionBadge label={`Overshoot ${pct(syn.overshoot)}: N is below the edge corner`} color="warn" /> : <RegionBadge label="N past the edge corner: ringing gone" color="ok" />}
        <RegionBadge label={`${nz} non-zero term${nz === 1 ? '' : 's'}`} color="info" />
      </div>

      {s.view === 'time' && <Plot series={timeSeries} xLabel="t / T" yLabel="x(t)" height={280} xRange={[-0.25, 1.75]}
        hlines={jumpWave ? [{ at: 1 + (s.wave === 'pulse' ? 1 : 2) * syn.overshoot, label: gibbs ? 'peak' : '', color: 'orange' }] : []} />}

      {s.view === 'spectrum' && <Plot series={[
        { ...spec.env, label: 'envelope', color: 'muted', dashed: true },
        { ...spec.exc, label: 'not included', color: 'muted', width: 2.5 },
        { ...spec.inc, label: `included (n ≤ ${s.N})`, color: 'accent', width: 3 },
      ]} xLabel="harmonic number n (f / f0)" yLabel="amplitude |c_n|" height={280} xRange={[0, spec.M + 1]} yLog={s.db} yRange={s.db ? [1e-3, 2] : [0, s.wave === 'pulse' ? 2 * s.duty * 1.15 : s.wave === 'square' ? 1.4 : s.wave === 'sawtooth' ? 0.75 : 0.9]} hover={false}
        vlines={s.wave === 'pulse' ? Array.from({ length: Math.floor(spec.M * s.duty) }, (_, k) => ({ at: (k + 1) / s.duty, label: k === 0 ? 'sinc null n = 1/D' : '', color: 'orange' })).filter(v => v.at <= spec.M) : []} />}

      {s.view === 'edges' && <>
        <Plot series={[{ x: syn.t, y: syn.yi, label: 'trapezoid', color: 'muted', dashed: true }, { x: syn.t, y: syn.y, label: `sum to N=${s.N}`, color: 'accent' }]} xLabel="t / T" yLabel="x(t)" height={200} xRange={[-0.25, 1.75]} />
        <Plot series={[
          { ...edge.ideal, label: 'ideal edges', color: 'muted', points: true, width: 0.6 },
          { ...edge.trap, label: `tr = ${pct(s.tr, 1)} T`, color: 'accent', points: true, width: 0.6 },
          { ...edge.asym, label: 'asymptotes', color: 'orange', dashed: true },
        ]} xLog yLog xRange={[0.8, 2000]} yRange={[1e-6, 2]} xLabel="harmonic number n (log)" yLabel="|c_n| (log)" height={260} hover={false}
          vlines={[...(isFinite(cor.f1) && cor.f1 > 0.8 ? [{ at: cor.f1, label: '1/(πτ)', color: 'muted' }] : []), { at: cor.f2, label: '1/(π·tr)', color: 'orange' }, { at: cor.knee035, label: '0.35/tr(10–90)', color: 'red' }]} />
      </>}

      <Readouts>
        <Readout k="Power captured (Parseval)" v={pct(pf, 2)} tone={tone} hl />
        {jumpWave && <Readout k="Peak overshoot / jump" v={pct(syn.overshoot, 2)} tone={syn.overshoot > 0.05 ? 'warn' : undefined} />}
        <Readout k="RMS error vs target" v={num(syn.rmsErr, 3)} />
        <Readout k="Fundamental |c₁|" v={num(syn.hs[0]?.amp ?? 0, 4)} />
        {s.view === 'edges' && <Readout k="Corner 1/(π·tr)" v={`${num(cor.f2, 3)} · f₀`} />}
        {s.view === 'edges' && <Readout k="Knee 0.35/tr(10–90)" v={`${num(cor.knee035, 3)} · f₀`} />}
      </Readouts>
      <EqBox>{EQ[s.wave] + (s.view === 'edges' ? String.raw`\;\times\;\mathrm{sinc}\!\left(\frac{n\,t_r}{T}\right),\quad f_{\text{corner}}=\frac{1}{\pi t_r}=${num(cor.f2, 3)}\,f_0` : String.raw`,\quad |c_1| = ${num(syn.hs[0]?.amp ?? 0, 4)}`)}</EqBox>
    </SimShell>
  );
}
