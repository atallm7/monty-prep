// Standard resistor values (E-series), colour code and a Monte-Carlo of a toleranced divider.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { parseSI } from '../../lib/units';
import { SERIES, SERIES_TOL, nearest, colorBands, dividerWorstCase, monteCarlo, predictedStd, histogram } from '../models/e-series';
import type { SeriesName } from '../models/e-series';

const NAMES: SeriesName[] = ['E6', 'E12', 'E24', 'E96'];
const TOLS = [0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.001];
// Physical band colours (these are the code itself, so they are literal on purpose)
const BAND: Record<string, string> = { black: '#1f1f1f', brown: '#7b4a26', red: '#d6322b', orange: '#f08a1c', yellow: '#f2d22e', green: '#2e9d4a', blue: '#2f6fd6', violet: '#8a4fcf', grey: '#8d8d8d', white: '#f6f6f6', gold: '#c9a227', silver: '#b9bec4' };
const pct = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}%`;
const T = (v: number, u: string) => `\\text{${si(v, u)}}`;

type St = { value: number; series: SeriesName; tol: number; vin: number; ratio: number; dist: 'uniform' | 'gauss'; seed: number; spec: number };
function initState(params: Record<string, any>): St {
  const v = typeof params.value === 'string' ? parseSI(params.value) : Number(params.value ?? 4700);
  const series: SeriesName = NAMES.includes(params.series) ? params.series : 'E24';
  const t = Number(params.tol ?? (params.series ? SERIES_TOL[series] : 0.05));
  return { value: isFinite(v) && v > 0 ? Math.min(1e9, Math.max(0.1, v)) : 4700, series, tol: isFinite(t) && t > 0 && t < 1 ? t : 0.05, vin: 5, ratio: 0.5, dist: 'uniform', seed: 1, spec: 0.02 };
}

function ResistorSVG({ bands }: { bands: string[] }) {
  const n = bands.length; const x0 = 90, w = 200;
  const xs = bands.map((_, i) => (i < n - 1 ? x0 + 26 + i * 30 : x0 + w - 36));
  return (
    <svg viewBox="0 0 380 90" style={{ width: '100%', maxWidth: 380, height: 'auto', display: 'block', margin: '0 auto' }} role="img" aria-label={`Resistor colour bands: ${bands.join(', ')}`}>
      <line x1={10} x2={x0} y1={45} y2={45} stroke="var(--d-muted)" strokeWidth={5} strokeLinecap="round" />
      <line x1={x0 + w} x2={370} y1={45} y2={45} stroke="var(--d-muted)" strokeWidth={5} strokeLinecap="round" />
      <rect x={x0} y={18} width={w} height={54} rx={22} fill="var(--d-box)" stroke="var(--d-ink)" strokeWidth={1.4} />
      {bands.map((b, i) => b === 'none'
        ? <rect key={i} x={xs[i]} y={18} width={14} height={54} fill="none" stroke="var(--d-muted)" strokeDasharray="3 3" />
        : <rect key={i} x={xs[i]} y={18.7} width={14} height={52.6} fill={BAND[b]} stroke="var(--d-ink)" strokeWidth={0.6} />)}
      {bands.map((b, i) => <text key={'t' + i} x={xs[i] + 7} y={86} fontSize={9.5} textAnchor="middle" fill="var(--d-muted)">{b}</text>)}
    </svg>
  );
}

/** One decade on a log ruler with each series value and its ±tol band; click a value to pick it. */
function Ruler({ target, series, tol, onPick }: { target: number; series: SeriesName; tol: number; onPick: (v: number) => void }) {
  const W = 640, H = 92, ml = 14, mr = 14; const iw = W - ml - mr;
  const dec = 10 ** Math.floor(Math.log10(target));
  const px = (v: number) => ml + Math.log10(v / dec) * iw;
  const vals = SERIES[series];
  const pick = nearest(target, series).value;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <line x1={ml} x2={ml + iw} y1={48} y2={48} stroke="var(--d-ink)" strokeWidth={1} />
      {vals.map((m, i) => {
        const v = m * dec; const a = Math.max(ml, px(v * (1 - tol))), b = Math.min(ml + iw, px(v * (1 + tol)));
        const on = Math.abs(v / pick - 1) < 1e-9;
        return <g key={m} role="button" tabIndex={0} aria-label={`Pick ${si(v, 'Ω')}`} style={{ cursor: 'pointer' }}
          onClick={() => onPick(v)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(v); } }}>
          <rect x={a} y={i % 2 ? 36 : 40} width={Math.max(0.5, b - a)} height={8} fill={on ? 'var(--d-accent)' : 'var(--d-blue)'} opacity={on ? 0.55 : 0.18} />
          <line x1={px(v)} x2={px(v)} y1={30} y2={56} stroke={on ? 'var(--d-accent)' : 'var(--d-ink)'} strokeWidth={on ? 2.2 : 1} />
          <rect x={px(v) - 6} y={24} width={12} height={36} fill="transparent" />
          {(vals.length <= 24 || i % 4 === 0 || on) && <text x={px(v)} y={vals.length > 24 ? 74 : (i % 2 ? 72 : 84)} fontSize={10} textAnchor="middle" fill={on ? 'var(--d-accent)' : 'var(--d-muted)'} fontWeight={on ? 700 : 400}>{m.toFixed(vals.length > 24 ? 2 : 1)}</text>}
        </g>;
      })}
      <line x1={px(10 * dec)} x2={px(10 * dec)} y1={34} y2={56} stroke="var(--d-muted)" />
      <g><line x1={px(target)} x2={px(target)} y1={6} y2={48} stroke="var(--d-red)" strokeWidth={2} /><polygon points={`${px(target) - 5},6 ${px(target) + 5},6 ${px(target)},14`} fill="var(--d-red)" />
        <text x={Math.min(W - 60, Math.max(60, px(target)))} y={22} fontSize={11} textAnchor="middle" fill="var(--d-red)" fontWeight={600}>target {si(target, 'Ω')}</text></g>
      <text x={ml} y={H - 2} fontSize={10} fill="var(--d-muted)">× {si(dec, 'Ω')}</text>
    </svg>
  );
}

export default function ESeries({ params }: SimProps) {
  const init = useMemo(() => initState(params), [params]);
  const [s, set] = useState<St>(init);
  const [txt, setTxt] = useState(si(init.value, '').trim());
  const upd = <K extends keyof St>(k: K) => (v: St[K]) => set(p => ({ ...p, [k]: v }));
  const setValue = (v: number) => { set(p => ({ ...p, value: v })); setTxt(si(v, '').trim()); };

  const n = nearest(s.value, s.series);
  const all = NAMES.map(name => ({ name, ...nearest(s.value, name) }));
  const cb = colorBands(n.value, s.series === 'E96' ? 3 : 2, s.tol);
  const inTol = Math.abs(n.err) <= s.tol;

  // Divider: R1 = chosen standard value, R2 = series value nearest the ideal for the requested ratio
  const r1 = n.value;
  const r2ideal = (r1 * s.ratio) / (1 - s.ratio);
  const r2 = nearest(r2ideal, s.series).value;
  const wc = dividerWorstCase(r1, r2, s.tol);
  const N = 20000;
  const mc = useMemo(() => monteCarlo(s.vin, r1, r2, s.tol, N, s.dist, s.seed), [s.vin, r1, r2, s.tol, s.dist, s.seed]);
  const vNom = s.vin * wc.k, vTarget = s.vin * s.ratio;
  const hist = useMemo(() => {
    const lo = s.vin * wc.kmin, hi = s.vin * wc.kmax; const pad = (hi - lo) * 0.08 || 1e-6;
    const h = histogram(mc.samples, lo - pad, hi + pad, 60);
    const x: number[] = [], y: number[] = [];
    h.counts.forEach((c, i) => { x.push(h.edges[i], h.edges[i + 1]); y.push(c / N * 100, c / N * 100); });
    return { x, y, lo: lo - pad, hi: hi + pad };
  }, [mc, s.vin, wc.kmin, wc.kmax]);
  const yieldPct = useMemo(() => { let k = 0; for (let i = 0; i < mc.samples.length; i++) if (Math.abs(mc.samples[i] / vTarget - 1) <= s.spec) k++; return k / mc.samples.length; }, [mc, vTarget, s.spec]);
  const pStd = predictedStd(s.vin, r1, r2, s.tol, s.dist);

  const changeSeries = (name: SeriesName) => set(p => ({ ...p, series: name, tol: SERIES_TOL[name] }));

  return (
    <SimShell title="Standard resistor values & tolerance" onReset={() => { set(init); setTxt(si(init.value, '').trim()); }}
      tryThis={<>type <b>5k</b>: E12 gives 4.7 kΩ (−6%), E24 5.1 kΩ (+2%), E96 4.99 kΩ (−0.2%). Then look at the divider: with ±5% parts the ratio of two equal resistors can be off by ±5%, but the Monte-Carlo spread is far narrower (σ ≈ 1.0% of V<sub>out</sub> for uniform parts), because both errors rarely hit their limits in opposite directions. Switch to 1% and watch the yield jump.</>}
      controls={<>
        <label className="ctl"><span className="ctl-head"><span className="ctl-label">Target value (e.g. 4.7k, 330, 1M)</span></span>
          <input className="input" style={{ height: 32, fontSize: 13 }} value={txt} aria-label="Target resistance"
            onChange={e => { setTxt(e.target.value); const v = parseSI(e.target.value); if (isFinite(v) && v >= 0.1 && v <= 1e9) set(p => ({ ...p, value: v })); }} /></label>
        <Slider label="Target (slider)" value={s.value} min={0.1} max={1e8} log unit="Ω" onChange={setValue} />
        <Seg label="Series" value={s.series} onChange={changeSeries} options={NAMES.map(x => ({ value: x, label: x }))} />
        <Select label="Part tolerance" value={String(s.tol)} onChange={v => upd('tol')(Number(v))} options={TOLS.map(t => ({ value: String(t), label: `±${t * 100}%${Object.entries(SERIES_TOL).find(e => e[1] === t) ? ' (' + Object.entries(SERIES_TOL).find(e => e[1] === t)![0] + ' default)' : ''}` }))} />
        <div className="small" style={{ fontWeight: 700, marginTop: 4 }}>Divider Monte-Carlo</div>
        <Slider label="Vin" value={s.vin} min={0.5} max={48} step={0.1} unit="V" onChange={upd('vin')} />
        <Slider label="Wanted Vout / Vin" value={s.ratio} min={0.05} max={0.95} step={0.005} format={v => v.toFixed(3)} onChange={upd('ratio')} />
        <Seg label="Part distribution" value={s.dist} onChange={upd('dist')} options={[{ value: 'uniform', label: 'Uniform ±t' }, { value: 'gauss', label: 'Gaussian (t = 3σ)' }]} />
        <Slider label="Vout spec (±)" value={s.spec} min={0.001} max={0.1} step={0.001} format={v => (v * 100).toFixed(1) + '%'} onChange={upd('spec')} />
        <button type="button" className="btn btn-sm" onClick={() => set(p => ({ ...p, seed: p.seed + 1 }))}>Re-run {N.toLocaleString()} builds</button>
        <Note>Each build draws R1 and R2 independently within ±tolerance. Real reels often have the centre removed (sold as tighter grades), so uniform is a reasonable pessimistic model.</Note>
      </>}>
      <ResistorSVG bands={cb ? cb.bands : []} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600 }}>{si(n.value, 'Ω')} ±{(s.tol * 100).toFixed(s.tol < 0.01 ? 1 : 0)}%</span>
        <RegionBadge label={`${pct(n.err)} from target`} color={Math.abs(n.err) < 0.005 ? 'ok' : inTol ? 'info' : 'warn'} />
        <span className="small muted">{cb ? cb.bands.join(' · ') : '—'}</span>
      </div>
      <Ruler target={s.value} series={s.series} tol={s.tol} onPick={setValue} />
      <Readouts>
        <Readout k={`Nearest ${s.series}`} v={si(n.value, 'Ω')} hl />
        <Readout k="Error vs target" v={pct(n.err)} tone={Math.abs(n.err) < 0.01 ? 'ok' : Math.abs(n.err) < 0.05 ? 'warn' : 'bad'} />
        <Readout k="Next below" v={`${si(n.below, 'Ω')} (${pct(n.below / s.value - 1, 1)})`} />
        <Readout k="Next above" v={`${si(n.above, 'Ω')} (${pct(n.above / s.value - 1, 1)})`} />
        <Readout k="Part range (±tol)" v={`${si(n.value * (1 - s.tol), 'Ω')} … ${si(n.value * (1 + s.tol), 'Ω')}`} />
      </Readouts>
      <div style={{ overflowX: 'auto' }}>
        <table className="small" style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-2)' }}><th style={{ padding: '4px 6px' }}>Series</th><th>Nearest</th><th>Error</th><th>Values/decade</th><th>Usual tol.</th><th>Bands</th></tr></thead>
          <tbody>{all.map(r => <tr key={r.name} style={{ borderTop: '1px solid var(--border)', fontWeight: r.name === s.series ? 700 : 400 }}>
            <td style={{ padding: '4px 6px' }}>{r.name}</td><td>{si(r.value, 'Ω')}</td><td>{pct(r.err)}</td><td>{SERIES[r.name].length}</td><td>±{SERIES_TOL[r.name] * 100}%</td><td>{r.name === 'E96' ? 5 : 4}</td></tr>)}</tbody>
        </table>
      </div>
      <EqBox>{String.raw`\text{E}n:\; R_k = 10^{k/n}\;(\text{rounded}),\qquad \text{step } 10^{1/${SERIES[s.series].length}} = ${(10 ** (1 / SERIES[s.series].length)).toFixed(3)}\;\Rightarrow\; \text{max pick error} \approx \pm${((10 ** (0.5 / SERIES[s.series].length) - 1) * 100).toFixed(1)}\%`}</EqBox>
      <div className="small" style={{ fontWeight: 700 }}>Divider: R1 = {si(r1, 'Ω')}, R2 = {si(r2, 'Ω')} (nearest {s.series} to the ideal {si(r2ideal, 'Ω')})</div>
      <Readouts>
        <Readout k="Nominal Vout" v={`${si(vNom, 'V')} (${pct(vNom / vTarget - 1)})`} hl />
        <Readout k="Worst case" v={`${si(s.vin * wc.kmin, 'V')} … ${si(s.vin * wc.kmax, 'V')}`} />
        <Readout k="MC mean" v={si(mc.mean, 'V')} />
        <Readout k="MC σ / predicted" v={`${si(mc.std, 'V')} / ${si(pStd, 'V')}`} />
        <Readout k="MC min … max" v={`${si(mc.min, 'V')} … ${si(mc.max, 'V')}`} />
        <Readout k={`Yield within ±${(s.spec * 100).toFixed(1)}% of target`} v={(yieldPct * 100).toFixed(1) + '%'} tone={yieldPct > 0.997 ? 'ok' : yieldPct > 0.9 ? 'warn' : 'bad'} />
      </Readouts>
      <Plot height={220} xUnit="V" xLabel="Vout" yLabel="% of builds" xRange={[hist.lo, hist.hi]} legend={false}
        series={[{ x: hist.x, y: hist.y, label: 'builds', color: 'accent', fill: true }]}
        vlines={[{ at: s.vin * wc.kmin, label: 'worst −', color: 'red' }, { at: s.vin * wc.kmax, label: 'worst +', color: 'red' }, { at: vNom, label: 'nominal', color: 'muted' }]}
        xspans={[{ from: vTarget * (1 - s.spec), to: vTarget * (1 + s.spec), color: 'green' }]} yTickFormat={v => v.toFixed(1) + '%'} />
      <EqBox>{String.raw`V_{out} = V_{in}\frac{R_2}{R_1+R_2} = ${T(vNom, 'V')},\quad \frac{\sigma_{V}}{V_{out}} \approx (1-k)\sqrt{2}\,\sigma_R = ${(1 - wc.k).toFixed(3)}\cdot\sqrt2\cdot ${((s.dist === 'uniform' ? s.tol / Math.sqrt(3) : s.tol / 3) * 100).toFixed(2)}\% = ${(pStd / vNom * 100).toFixed(2)}\%`}</EqBox>
    </SimShell>
  );
}
