// Amdahl/Gustafson speedup curves and an interactive roofline with draggable kernels.
import { useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, num } from '../kit';
import Plot from '../../components/Plot';
import { amdahl, gustafson, amdahlLimit, efficiency, coresForFraction, attainable, ridge, bound, KERNELS } from '../models/amdahl-roofline';

const PRESETS: Record<string, { view?: 'amdahl' | 'roofline'; p: number; cores: number; peak: number; bw: number }> = {
  cpu: { p: 0.95, cores: 16, peak: 1000, bw: 100 },
  gpu: { p: 0.99, cores: 1024, peak: 30000, bw: 900 },
  'serial-heavy': { p: 0.5, cores: 16, peak: 1000, bw: 100 },
};
const COLORS = ['var(--d-green)', 'var(--d-blue)', 'var(--d-purple)', 'var(--d-orange)', 'var(--d-red)'];
const AXMIN = 1 / 64, AXMAX = 1024;
const lg = Math.log10;

export default function AmdahlRoofline({ params }: SimProps) {
  const init = {
    view: (params.view === 'roofline' ? 'roofline' : 'amdahl') as 'amdahl' | 'roofline',
    p: Number(params.p ?? 0.9), cores: Number(params.cores ?? 16), peak: Number(params.peak ?? 1000), bw: Number(params.bw ?? 100),
  };
  const initK = () => [{ id: 'mine', name: 'Your kernel', ai: Number(params.ai ?? 1), note: 'drag me along the AI axis' }, ...KERNELS.map(k => ({ ...k }))];
  const [s, set] = useState(init);
  const [ks, setKs] = useState(initK);
  const [sel, setSel] = useState('mine');
  const [preset, setPreset] = useState('');
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => { setPreset(''); set(q => ({ ...q, [k]: v })); };
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<string | null>(null);

  const p = Math.min(0.9999, Math.max(0, s.p));
  const N = Math.max(1, Math.round(s.cores));
  const curves = useMemo(() => {
    const xs: number[] = []; for (let e = 0; e <= 10.001; e += 0.1) xs.push(Math.round(2 ** e * 100) / 100);
    return { x: xs, a: xs.map(n => amdahl(p, n)), g: xs.map(n => gustafson(p, n)), ideal: xs };
  }, [p]);

  // roofline geometry
  const W = 400, H = 300, M = { l: 50, r: 14, t: 12, b: 42 };
  const ymin = 10 ** Math.floor(lg(Math.min(s.bw * AXMIN, s.peak) * 0.6)), ymax = 10 ** Math.ceil(lg(s.peak * 1.3));
  const X = (ai: number) => M.l + (lg(ai) - lg(AXMIN)) / (lg(AXMAX) - lg(AXMIN)) * (W - M.l - M.r);
  const Y = (g: number) => M.t + (H - M.t - M.b) * (1 - (lg(Math.max(g, ymin)) - lg(ymin)) / (lg(ymax) - lg(ymin)));
  const rp = ridge(s.peak, s.bw);
  const clampAI = (v: number) => Math.min(AXMAX, Math.max(AXMIN, v));
  const aiFromEvent = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * W;
    return clampAI(10 ** (lg(AXMIN) + (x - M.l) / (W - M.l - M.r) * (lg(AXMAX) - lg(AXMIN))));
  };
  const setAI = (id: string, ai: number) => setKs(a => a.map(k => k.id === id ? { ...k, ai } : k));
  const roofPath = `M${X(AXMIN)},${Y(attainable(s.peak, s.bw, AXMIN))} L${X(rp)},${Y(s.peak)} L${X(AXMAX)},${Y(s.peak)}`;
  const selK = ks.find(k => k.id === sel)!;
  const perf = attainable(s.peak, s.bw, selK.ai), bd = bound(s.peak, s.bw, selK.ai);
  const xTicks = [-6, -4, -2, 0, 2, 4, 6, 8, 10].map(e => 2 ** e).filter(v => v >= AXMIN * 0.99 && v <= AXMAX * 1.01);
  const yTicks: number[] = []; for (let e = lg(ymin); e <= lg(ymax) + 1e-9; e++) yTicks.push(10 ** Math.round(e));
  const fmt = (v: number) => (v >= 1 ? num(v, 3) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3).replace(/0+$/, ''));
  const fmtX = (v: number) => (v < 1 ? `1/${Math.round(1 / v)}` : String(v));
  const fmtY = (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v));

  const pick = (name: string) => { const q = PRESETS[name]; set(o => ({ ...o, ...q })); setPreset(name); };
  const reset = () => { set(init); setKs(initK()); setSel('mine'); setPreset(''); };

  const roof = (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none', userSelect: 'none' }} role="group" aria-label="Roofline plot; drag kernels left or right to change arithmetic intensity"
      onPointerMove={e => { if (drag.current) setAI(drag.current, aiFromEvent(e)); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {xTicks.map(v => <g key={'x' + v}><line x1={X(v)} x2={X(v)} y1={M.t} y2={H - M.b} stroke="var(--d-muted)" strokeOpacity={0.2} /><text x={X(v)} y={H - M.b + 14} textAnchor="middle" fontSize={10} fill="var(--d-muted)">{fmtX(v)}</text></g>)}
      {yTicks.map(v => <g key={'y' + v}><line x1={M.l} x2={W - M.r} y1={Y(v)} y2={Y(v)} stroke="var(--d-muted)" strokeOpacity={0.2} /><text x={M.l - 5} y={Y(v) + 3} textAnchor="end" fontSize={10} fill="var(--d-muted)">{fmtY(v)}</text></g>)}
      <rect x={M.l} y={M.t} width={X(rp) - M.l} height={H - M.t - M.b} fill="var(--d-blue)" opacity={0.06} />
      <rect x={X(rp)} y={M.t} width={W - M.r - X(rp)} height={H - M.t - M.b} fill="var(--d-orange)" opacity={0.06} />
      <text x={M.l + 6} y={M.t + 12} fontSize={10} fill="var(--d-blue)">memory-bound</text>
      <text x={W - M.r - 4} y={M.t + 12} fontSize={10} textAnchor="end" fill="var(--d-orange)">compute-bound</text>
      <path d={roofPath} fill="none" stroke="var(--d-ink)" strokeWidth={2.5} strokeLinejoin="round" />
      <line x1={X(rp)} x2={X(rp)} y1={Y(s.peak)} y2={H - M.b} stroke="var(--d-ink)" strokeDasharray="3 3" opacity={0.5} />
      <text x={X(rp) + 3} y={H - M.b - 4} fontSize={10} fill="var(--d-muted)">ridge {fmt(rp)}</text>
      <text x={X(AXMAX) - 2} y={Y(s.peak) - 4} fontSize={10} textAnchor="end" fill="var(--d-ink)">peak {fmtY(s.peak)} GFLOP/s</text>
      <text x={M.l + 6} y={Y(attainable(s.peak, s.bw, AXMIN)) - 12} fontSize={10} fill="var(--d-ink)" transform={`rotate(${-Math.atan2(Y(attainable(s.peak, s.bw, AXMIN)) - Y(s.peak), X(rp) - X(AXMIN)) * -180 / Math.PI} ${M.l + 6} ${Y(attainable(s.peak, s.bw, AXMIN)) - 12})`}>slope = BW</text>
      {ks.map((k, i) => {
        const pf = attainable(s.peak, s.bw, k.ai), on = k.id === sel, c = k.id === 'mine' ? 'var(--d-accent)' : COLORS[(i - 1) % COLORS.length];
        const cx = X(k.ai), cy = Y(pf), right = cx > W - 90;
        return (
          <g key={k.id} role="button" tabIndex={0} aria-label={`${k.name}, intensity ${fmt(k.ai)} FLOP/byte, ${fmt(pf)} GFLOP/s. Arrow keys change intensity.`} style={{ cursor: 'ew-resize', outline: 'none' }}
            onPointerDown={e => { (e.currentTarget as SVGGElement).setPointerCapture?.(e.pointerId); drag.current = k.id; setSel(k.id); setAI(k.id, aiFromEvent(e)); }}
            onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setSel(k.id); setAI(k.id, clampAI(k.ai / 2 ** 0.25)); } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setSel(k.id); setAI(k.id, clampAI(k.ai * 2 ** 0.25)); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(k.id); } }}>
            <line x1={cx} x2={cx} y1={cy} y2={H - M.b} stroke={c} strokeDasharray="2 3" opacity={on ? 0.9 : 0.4} />
            <circle cx={cx} cy={cy} r={16} fill="transparent" />
            <circle cx={cx} cy={cy} r={on ? 7 : 5.5} fill={c} stroke={on ? 'var(--d-ink)' : 'var(--d-bg)'} strokeWidth={on ? 2 : 1.5} />
            <text x={cx + (right ? -9 : 9)} y={cy + [-10, 17, -24][i % 3]} textAnchor={right ? 'end' : 'start'} fontSize={10} fontWeight={on ? 700 : 500} fill="var(--d-ink)">{k.name}</text>
          </g>
        );
      })}
      <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--d-muted)">Arithmetic intensity (FLOP/byte)</text>
      <text x={12} y={(M.t + H - M.b) / 2} textAnchor="middle" fontSize={11} fill="var(--d-muted)" transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`}>GFLOP/s</text>
    </svg>
  );

  const amdahlView = (<>
    <Readouts>
      <Readout k={`Amdahl S(${N})`} v={`${amdahl(p, N).toFixed(2)}×`} hl />
      <Readout k={`Gustafson S(${N})`} v={`${gustafson(p, N).toFixed(2)}×`} />
      <Readout k="Amdahl limit 1/(1−p)" v={`${amdahlLimit(p).toFixed(1)}×`} tone="warn" />
      <Readout k="Efficiency S/N" v={`${(efficiency(p, N) * 100).toFixed(0)}%`} tone={efficiency(p, N) < 0.5 ? 'bad' : efficiency(p, N) < 0.8 ? 'warn' : 'ok'} />
      <Readout k="Cores for half the limit" v={num(coresForFraction(p, 0.5), 3)} />
    </Readouts>
    <EqBox>{String.raw`S_{A} = \frac{1}{(1-p)+p/N} = \frac{1}{${(1 - p).toFixed(3)}+${p.toFixed(3)}/${N}} = ${amdahl(p, N).toFixed(2)},\qquad S_{G} = N-(1-p)(N-1) = ${gustafson(p, N).toFixed(2)}`}</EqBox>
    <Plot series={[
      { x: curves.x, y: curves.ideal, label: 'ideal S = N', color: 'muted', dashed: true },
      { x: curves.x, y: curves.g, label: 'Gustafson (scaled)', color: 'green' },
      { x: curves.x, y: curves.a, label: 'Amdahl (fixed size)', color: 'accent' },
    ]} xLog yLog xRange={[1, 1024]} xLabel="Cores N" yLabel="Speedup" yUnit="×" height={260}
      hlines={[{ at: amdahlLimit(p), label: '1/(1−p)', color: 'red' }]} vlines={[{ at: N, label: `N=${N}`, color: 'orange' }]}
      points={[{ x: N, y: amdahl(p, N), label: 'Amdahl', color: 'accent' }, { x: N, y: gustafson(p, N), label: 'Gustafson', color: 'green' }]} />
    <Note>Amdahl fixes the problem size: the serial fraction (1−p) caps speedup at 1/(1−p). Gustafson grows the problem with N so the parallel part scales; the serial part stays a fixed fraction of the <em>parallel</em> runtime.</Note>
  </>);

  const rooflineView = (<>
    <div className="figure-body" style={{ padding: '6px 4px' }}>{roof}</div>
    <Readouts>
      <Readout k={selK.name} v={`AI = ${fmt(selK.ai)} FLOP/B`} hl />
      <Readout k="Attainable" v={`${fmt(perf)} GFLOP/s`} />
      <Readout k="% of peak" v={`${(perf / s.peak * 100).toFixed(perf / s.peak < 0.1 ? 1 : 0)}%`} tone={bd === 'memory' ? 'warn' : 'ok'} />
      <Readout k="Ridge AI = peak/BW" v={`${fmt(rp)} FLOP/B`} />
    </Readouts>
    <div style={{ margin: '6px 0' }}><RegionBadge label={bd === 'memory' ? 'Memory-bound: raise AI (reuse data) or bandwidth' : 'Compute-bound: raise peak (SIMD, more cores)'} color={bd === 'memory' ? 'warn' : 'ok'} /></div>
    <EqBox>{String.raw`P = \min(P_{peak},\ AI\cdot BW) = \min(${fmtY(s.peak)},\ ${fmt(selK.ai)}\cdot ${s.bw}) = ${fmt(perf)}\ \text{GFLOP/s}`}</EqBox>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 4, fontSize: 12, margin: '6px 0' }}>
      {ks.map((k, i) => { const pf = attainable(s.peak, s.bw, k.ai); return (
        <button key={k.id} type="button" className="btn btn-sm btn-ghost" style={{ justifyContent: 'space-between', textAlign: 'left', border: k.id === sel ? '1.5px solid var(--accent)' : undefined }} onClick={() => setSel(k.id)} title={k.note}>
          <span><span style={{ color: k.id === 'mine' ? 'var(--d-accent)' : COLORS[(i - 1) % COLORS.length] }}>●</span> {k.name}</span>
          <span style={{ color: 'var(--d-muted)' }}>{fmt(pf)} · {bound(s.peak, s.bw, k.ai) === 'memory' ? 'mem' : 'cmp'}</span>
        </button>); })}
    </div>
  </>);

  return (
    <SimShell title="Amdahl's law & roofline" onReset={reset}
      tryThis={s.view === 'amdahl'
        ? <>set p = 0.9 and push the cores to 1024: Amdahl saturates at 10× while Gustafson keeps climbing nearly linearly. Then drop p to 0.5: half the program is serial, so even infinite cores give at most 2×.</>
        : <>drag a kernel (or use the arrow keys) left of the ridge point: its performance is AI·BW, so doubling bandwidth doubles it. Select the GPU preset: the ridge moves right, so kernels that were compute-bound on the CPU (matmul at AI = 64) can become memory-bound.</>}
      controls={<>
        <Seg label="View" value={s.view} options={[{ value: 'amdahl', label: 'Amdahl / Gustafson' }, { value: 'roofline', label: 'Roofline' }]} onChange={v => set(q => ({ ...q, view: v }))} />
        <Seg label="Preset" value={preset as any} options={Object.keys(PRESETS).map(k => ({ value: k, label: k }))} onChange={pick} />
        {s.view === 'amdahl' ? <>
          <Slider label="Parallel fraction p" value={s.p} min={0} max={0.999} step={0.001} format={v => v.toFixed(3)} onChange={upd('p')} />
          <Slider label="Cores N" value={s.cores} min={1} max={1024} log format={v => String(Math.round(v))} onChange={upd('cores')} />
        </> : <>
          <Slider label="Peak compute" value={s.peak} min={10} max={100000} log format={v => `${num(v, 3)} GFLOP/s`} onChange={upd('peak')} />
          <Slider label="Memory bandwidth" value={s.bw} min={1} max={5000} log format={v => `${num(v, 3)} GB/s`} onChange={upd('bw')} />
          <Slider label={`Selected kernel AI (${selK.name})`} value={selK.ai} min={AXMIN} max={AXMAX} log format={v => `${fmt(v)} FLOP/B`} onChange={v => { setAI(sel, v); }} />
          <Note>Kernel AIs are typical double-precision estimates with ideal caching, not measurements. Click or drag a marker on the plot to move it.</Note>
        </>}
      </>}>
      {s.view === 'amdahl' ? amdahlView : rooflineView}
    </SimShell>
  );
}
