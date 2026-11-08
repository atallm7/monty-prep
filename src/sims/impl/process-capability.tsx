// Process capability: live normal curve vs spec limits + X-bar control chart with fixed baseline limits.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readouts, Readout, EqBox, Note, RegionBadge } from '../kit';
import Plot from '../../components/Plot';
import { capability, pdf, subgroupZ, xbarLimits } from '../models/process-capability';

const PRESETS: Record<string, { mu: number; sigma: number; lsl: number; usl: number }> = {
  capable: { mu: 0, sigma: 1, lsl: -4, usl: 4 },
  'off-center': { mu: 1.5, sigma: 1, lsl: -4, usl: 4 },
  'six-sigma': { mu: 0, sigma: 1, lsl: -6, usl: 6 },
};
const N_SUB = 5, WINDOW = 40;
const ppmFmt = (p: number) => p < 0.001 ? '< 0.001' : p < 10 ? p.toFixed(2) : p < 1e4 ? Math.round(p).toLocaleString() : (p / 1e4).toFixed(1) + '% (' + Math.round(p).toLocaleString() + ')';

export default function ProcessCapability({ params }: SimProps) {
  const pr = PRESETS[params.preset as string] ?? PRESETS.capable;
  const init = { mu: Number(params.mu ?? pr.mu), sigma: Number(params.sigma ?? pr.sigma), lsl: Number(params.lsl ?? pr.lsl), usl: Number(params.usl ?? pr.usl), shift: Number(params.shift ?? (params.preset === 'six-sigma' ? 1.5 : 1.5)) };
  const [s, set] = useState(init);
  const [preset, setPreset] = useState<string>(String(params.preset ?? 'capable'));
  const [showLT, setShowLT] = useState(true);
  const [seed, setSeed] = useState(11);
  const [k, setK] = useState(WINDOW);          // number of subgroups drawn so far
  const [run, setRun] = useState(true);
  const [base, setBase] = useState({ mu: init.mu, sigma: init.sigma }); // control limits come from this baseline
  const up = (key: keyof typeof s) => (v: number) => { setPreset(''); set(p => ({ ...p, [key]: v })); };

  const timer = useRef(0);
  useEffect(() => { if (!run) return; timer.current = window.setInterval(() => setK(x => x + 1), 450); return () => clearInterval(timer.current); }, [run]);

  const c = useMemo(() => capability(s), [s]);
  const lim = useMemo(() => xbarLimits(base.mu, base.sigma, N_SUB), [base]);

  // normal curve + shaded tails
  const curves = useMemo(() => {
    const lo = Math.min(s.lsl, s.mu - 4.5 * s.sigma) - 0.5 * s.sigma, hi = Math.max(s.usl, s.mu + 4.5 * s.sigma) + 0.5 * s.sigma;
    const M = 260, xs = Array.from({ length: M + 1 }, (_, i) => lo + (hi - lo) * i / M);
    const mk = (m: number, a: number, b: number) => { const x = xs.filter(v => v >= a && v <= b); return { x: [a, ...x.filter(v => v > a && v < b), b], y: [a, ...x.filter(v => v > a && v < b), b].map(v => pdf(v, m, s.sigma)) }; };
    const dir = c.cpu < c.cpl ? 1 : -1, mLT = s.mu + dir * s.shift * s.sigma;
    return { lo, hi, main: { x: xs, y: xs.map(v => pdf(v, s.mu, s.sigma)) }, lt: { x: xs, y: xs.map(v => pdf(v, mLT, s.sigma)) },
      left: s.lsl > lo ? mk(s.mu, lo, s.lsl) : null, right: s.usl < hi ? mk(s.mu, s.usl, hi) : null, ymax: Math.max(pdf(s.mu, s.mu, s.sigma), showLT ? pdf(mLT, mLT, s.sigma) : 0) * 1.12 };
  }, [s, c.cpu, c.cpl, showLT]);

  // X-bar chart from reproducible subgroups: x̄_j = μ + σ·z̄_j, so moving the sliders re-scales the stream live
  const chart = useMemo(() => {
    const j0 = Math.max(0, k - WINDOW), xs: number[] = [], ys: number[] = [], out: { x: number; y: number }[] = [];
    for (let j = j0; j < k; j++) { const y = s.mu + s.sigma * subgroupZ(seed, j, N_SUB); xs.push(j + 1); ys.push(y); if (y > lim.ucl || y < lim.lcl) out.push({ x: j + 1, y }); }
    return { xs, ys, out, j0 };
  }, [k, s.mu, s.sigma, seed, lim]);

  const tone = c.cpk >= 1.33 ? 'ok' : c.cpk >= 1 ? 'warn' : 'bad';
  const label = c.cpk >= 2 ? 'World-class (Cpk ≥ 2)' : c.cpk >= 1.33 ? 'Capable (Cpk ≥ 1.33)' : c.cpk >= 1 ? 'Marginal (1 ≤ Cpk < 1.33)' : 'Not capable (Cpk < 1)';
  const reset = () => { set(init); setPreset(''); setBase({ mu: init.mu, sigma: init.sigma }); setK(WINDOW); };

  return (
    <SimShell title="Process capability: Cp, Cpk & control chart" badge="Statistics" onReset={reset}
      tryThis={<>keep σ = 1 and drag the <b>mean</b> from 0 to 2: Cp stays 1.33 but Cpk drops to 0.67 and defects jump from ~63 ppm to ~23,000 ppm. In the chart (limits are frozen from the baseline) the points start leaving the control limits. Then load <b>six-sigma</b>: Cpk = 2 gives 0.002 ppm, and with the customary 1.5σ long-term drift it is 3.4 ppm.</>}
      controls={<>
        <Seg label="Preset" value={preset as any} options={[...Object.keys(PRESETS).map(p => ({ value: p, label: p })), { value: '' as any, label: 'custom' }]} onChange={v => { if (!v) return; setPreset(v); set(p => ({ ...p, ...PRESETS[v], shift: 1.5 })); }} />
        <Slider label="Mean μ" value={s.mu} min={-6} max={6} step={0.05} format={v => v.toFixed(2)} onChange={up('mu')} />
        <Slider label="Std dev σ" value={s.sigma} min={0.2} max={3} step={0.05} format={v => v.toFixed(2)} onChange={up('sigma')} />
        <Slider label="Lower spec LSL" value={s.lsl} min={-12} max={-0.5} step={0.25} format={v => v.toFixed(2)} onChange={up('lsl')} />
        <Slider label="Upper spec USL" value={s.usl} min={0.5} max={12} step={0.25} format={v => v.toFixed(2)} onChange={up('usl')} />
        <Slider label="Long-term shift" value={s.shift} min={0} max={2} step={0.1} format={v => `${v.toFixed(1)} σ`} onChange={up('shift')} />
        <Toggle label="Show long-term shifted curve" checked={showLT} onChange={setShowLT} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setRun(r => !r)}>{run ? 'Pause chart' : 'Run chart'}</button>
          <button className="btn btn-sm" onClick={() => setK(x => x + 1)}>+1 sample</button>
          <button className="btn btn-sm" onClick={() => { setSeed(x => x + 1); }}>New random stream</button>
          <button className="btn btn-sm" onClick={() => setBase({ mu: s.mu, sigma: s.sigma })}>Re-baseline limits</button>
        </div>
        <Note>Control limits are x̄ ± 3σ/√n (n = {N_SUB}) from the baseline μ = {base.mu.toFixed(2)}, σ = {base.sigma.toFixed(2)}. Changing the process afterwards shows up as out-of-control points.</Note>
      </>}>
      <Readouts>
        <Readout k="Cp" v={c.cp.toFixed(2)} />
        <Readout k="Cpk" v={c.cpk.toFixed(2)} tone={tone} hl />
        <Readout k="Sigma level (3·Cpk)" v={c.sigmaLevel.toFixed(2) + ' σ'} />
        <Readout k="Out of spec (short-term)" v={ppmFmt(c.ppm) + (c.ppm >= 1e4 ? '' : ' ppm')} tone={tone} />
        <Readout k={`Out of spec (${s.shift.toFixed(1)}σ drift)`} v={ppmFmt(c.ppmLT) + (c.ppmLT >= 1e4 ? '' : ' ppm')} />
      </Readouts>
      <div style={{ margin: '4px 0' }}><RegionBadge label={label} color={tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'bad'} /></div>
      <Plot height={250} xLabel="Measured parameter" yLabel="Probability density" xRange={[curves.lo, curves.hi]} yRange={[0, curves.ymax]}
        series={[
          ...(curves.left ? [{ ...curves.left, color: 'red', fill: true, width: 0.5 }] : []), ...(curves.right ? [{ ...curves.right, color: 'red', fill: true, width: 0.5 }] : []),
          ...(showLT ? [{ ...curves.lt, label: `long-term (${s.shift.toFixed(1)}σ shift)`, color: 'muted', dashed: true }] : []),
          { ...curves.main, label: 'process', color: 'accent', width: 2.5 }]}
        vlines={[{ at: s.lsl, label: 'LSL', color: 'red' }, { at: s.usl, label: 'USL', color: 'red' }, { at: s.mu, label: 'μ', color: 'accent' }]}
        xspans={[{ from: Math.max(curves.lo, s.mu - 3 * s.sigma), to: Math.min(curves.hi, s.mu + 3 * s.sigma), color: 'green' }]} />
      <div style={{ fontSize: 12, color: 'var(--d-muted)', margin: '-2px 0 10px' }}>Red tails: out-of-spec area ({ppmFmt(c.ppm)}{c.ppm >= 1e4 ? '' : ' ppm'}). Green band: μ ± 3σ (natural process width) against the spec window.</div>
      <Plot height={230} xLabel={`Subgroup number (n = ${N_SUB})`} yLabel="Subgroup mean x̄" xRange={[chart.j0 + 1, Math.max(chart.j0 + WINDOW, k)]}
        yRange={[Math.min(lim.lcl, ...chart.ys) - 0.3 * lim.se, Math.max(lim.ucl, ...chart.ys) + 0.3 * lim.se]}
        series={[{ x: chart.xs, y: chart.ys, label: 'x̄', color: 'accent', points: true }]}
        hlines={[{ at: lim.ucl, label: 'UCL', color: 'red' }, { at: lim.cl, label: 'CL', color: 'muted' }, { at: lim.lcl, label: 'LCL', color: 'red' }]}
        points={chart.out.map(o => ({ x: o.x, y: o.y, color: 'red' }))} />
      <div style={{ fontSize: 12, color: chart.out.length ? 'var(--bad)' : 'var(--d-muted)', margin: '-2px 0 8px' }}>{chart.out.length ? `${chart.out.length} point${chart.out.length > 1 ? 's' : ''} beyond ±3σ/√n in the last ${WINDOW} subgroups: process out of statistical control.` : `All points within ±3σ/√n limits in the last ${WINDOW} subgroups.`}</div>
      <EqBox>{String.raw`C_p=\frac{USL-LSL}{6\sigma}=\frac{${(s.usl - s.lsl).toFixed(2)}}{${(6 * s.sigma).toFixed(2)}}=${c.cp.toFixed(2)}`}</EqBox>
      <EqBox>{String.raw`C_{pk}=\frac{\min(USL-\mu,\ \mu-LSL)}{3\sigma}=\min(${c.cpu.toFixed(2)},\,${c.cpl.toFixed(2)})=${c.cpk.toFixed(2)}`}</EqBox>
    </SimShell>
  );
}
