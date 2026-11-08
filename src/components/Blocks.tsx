import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { renderCircuit } from '../diagrams/circuit.mjs';
import { renderTiming } from '../diagrams/timing.mjs';
import Plot, { Series } from './Plot';
import { compile, evalNum, polyAtJw, cdiv, cabs, carg } from '../lib/expr';
import { mdInline } from '../lib/markdown';
import { getSim } from '../sims/registry';
import { useTheme } from '../lib/theme';
import { logspace, si } from '../lib/units';
import SimErrorBoundary from './SimErrorBoundary';
import { loadMermaid } from '../lib/mermaidLoader';

/** Inline markdown that also renders plain-text subscripts (V_M, R_{th}, R_p,min) outside $math$ and `code`. */
function subInline(text: string) {
  const t = text.split(/(\$[^$]*\$|`[^`]*`)/).map(seg => seg.startsWith('$') || seg.startsWith('`') ? seg : seg.replace(/\b([A-Za-zΩτωφθλμ])_(?:\{([^}]+)\}|([A-Za-z0-9]{1,4}(?:,[A-Za-z0-9]{1,4})?))\b/g, (_, a, b, c) => `${a}<sub>${b || c}</sub>`)).join('');
  return mdInline(t);
}
function Caption({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="figure-cap" dangerouslySetInnerHTML={{ __html: subInline(text) }} />;
}
function BlockError({ msg }: { msg: string }) { return <div className="figure"><div className="figure-error">{msg}</div></div>; }

function parse<T>(code: string): [T | null, string | null] {
  try { return [JSON.parse(code) as T, null]; } catch (e) { return [null, (e as Error).message]; }
}

export function CircuitBlock({ code, caption }: { code: string; caption?: string }) {
  const [spec, err] = parse<{ elements: unknown[]; caption?: string }>(code);
  const out = useMemo(() => spec ? renderCircuit(spec) : null, [code]);
  if (err || !out) return <BlockError msg={'circuit: ' + err} />;
  return <figure className="figure" style={{ margin: '6px 0 20px' }}>
    <div className="figure-body" dangerouslySetInnerHTML={{ __html: out.svg }} />
    {out.errors.length > 0 && <div className="figure-error">{out.errors.join('\n')}</div>}
    <Caption text={caption || spec?.caption} />
  </figure>;
}

export function TimingBlock({ code, caption }: { code: string; caption?: string }) {
  const [spec, err] = parse<{ signals: unknown[]; caption?: string }>(code);
  const out = useMemo(() => spec ? renderTiming(spec) : null, [code]);
  if (err || !out) return <BlockError msg={'timing: ' + err} />;
  return <figure className="figure" style={{ margin: '6px 0 20px' }}>
    <div className="figure-body" dangerouslySetInnerHTML={{ __html: out.svg }} />
    {out.errors.length > 0 && <div className="figure-error">{out.errors.join('\n')}</div>}
    <Caption text={caption || spec?.caption} />
  </figure>;
}

type AxisSpec = { label?: string; unit?: string; min?: number | string; max?: number | string; log?: boolean };
type PlotSpec = {
  title?: string; caption?: string; x?: AxisSpec; y?: AxisSpec; height?: number; vars?: Record<string, number | string>; params?: Param[]; readouts?: Readout[];
  series: { label?: string; fn?: string; points?: [number, number][]; color?: string; dashed?: boolean; step?: boolean; fill?: boolean; n?: number; xmin?: number | string; xmax?: number | string; markers?: boolean }[];
  hlines?: { at: number | string; label?: string; color?: string }[]; vlines?: { at: number | string; label?: string; color?: string }[];
  points?: { x: number | string; y: number | string; label?: string; color?: string }[];
  xspans?: { from: number | string; to: number | string; label?: string; color?: string }[];
};

/** Slider parameter for interactive plot/bode blocks: its value is available as a variable in every expression. */
type Param = { name: string; label?: string; min: number; max: number; value: number; step?: number; log?: boolean; unit?: string };
type Readout = { label: string; expr: string; unit?: string; digits?: number };

/** Resolve vars in order; slider params take precedence over (and can feed) vars with derived expressions. */
function resolveVars(v?: Record<string, number | string>, params?: Record<string, number>) {
  const out: Record<string, number> = { ...(params || {}) };
  for (const [k, val] of Object.entries(v || {})) if (!(params && k in params)) out[k] = evalNum(val, out);
  return out;
}

function useParams(params?: Param[]) {
  const init = () => Object.fromEntries((params || []).map(p => [p.name, p.value])) as Record<string, number>;
  const [vals, setVals] = useState<Record<string, number>>(init);
  return { vals, set: (k: string, v: number) => setVals(o => ({ ...o, [k]: v })), reset: () => setVals(init()) };
}

const fmtVal = (v: number, unit?: string) => {
  if (!isFinite(v)) return '—';
  if (unit && SI_UNIT.test(unit)) return si(v, unit, 3);
  const a = Math.abs(v); const s = a !== 0 && (a >= 1e5 || a < 1e-3) ? v.toExponential(2) : String(Number(v.toPrecision(3)));
  return unit ? `${s} ${unit}` : s;
};
const SI_UNIT = /^(V|A|W|Ω|ohm|F|H|Hz|s|J|C|S)$/;

/** Sliders (+ optional live readouts) under an interactive figure. */
function ParamControls({ params, vals, set, reset, readouts, vars }: { params: Param[]; vals: Record<string, number>; set: (k: string, v: number) => void; reset: () => void; readouts?: Readout[]; vars: Record<string, number> }) {
  const changed = params.some(p => vals[p.name] !== p.value);
  return <div className="plot-params">
    <div className="plot-params-head"><span className="plot-params-tag">Interactive</span><span className="muted small">Drag the sliders to see how the curve responds.</span>
      {changed && <button type="button" className="btn btn-sm" onClick={reset}>Reset</button>}</div>
    <div className="plot-params-grid">
      {params.map(p => {
        const v = vals[p.name];
        const toPos = (x: number) => p.log ? Math.log(x / p.min) / Math.log(p.max / p.min) * 1000 : (x - p.min) / (p.max - p.min) * 1000;
        const fromPos = (t: number) => { let x = p.log ? p.min * Math.pow(p.max / p.min, t / 1000) : p.min + (p.max - p.min) * t / 1000; if (p.step && !p.log) x = Math.round(x / p.step) * p.step; return Number(x.toPrecision(4)); };
        const id = `pp-${p.name}-${Math.round(p.min * 1e3)}`;
        return <label key={p.name} className="plot-param" htmlFor={id}>
          <span className="plot-param-top"><span className="plot-param-name" dangerouslySetInnerHTML={{ __html: subInline(p.label || p.name) }} /><b>{fmtVal(v, p.unit)}</b></span>
          <input id={id} type="range" min={0} max={1000} step={1} value={Math.round(toPos(v))} onChange={e => set(p.name, fromPos(+e.target.value))} aria-valuetext={fmtVal(v, p.unit)} />
        </label>;
      })}
    </div>
    {readouts && readouts.length > 0 && <div className="plot-readouts">
      {readouts.map((r, i) => { let val = NaN; try { val = evalNum(r.expr, vars); } catch { /* shown as — */ }
        return <div key={i} className="plot-readout"><span className="muted small" dangerouslySetInnerHTML={{ __html: subInline(r.label) }} /><b>{fmtVal(val, r.unit)}</b></div>; })}
    </div>}
  </div>;
}

export function PlotBlock({ code, caption }: { code: string; caption?: string }) {
  const [spec, err] = parse<PlotSpec>(code);
  const pp = useParams(spec?.params);
  const res = useMemo(() => {
    if (!spec) return null;
    try {
      const vars = resolveVars(spec.vars, pp.vals);
      const xmin = evalNum(spec.x?.min ?? 0, vars), xmax = evalNum(spec.x?.max ?? 1, vars);
      const series: Series[] = spec.series.map(s => {
        if (s.points) return { x: s.points.map(p => p[0]), y: s.points.map(p => p[1]), label: s.label, color: s.color, dashed: s.dashed, step: s.step, fill: s.fill, points: s.markers };
        const f = compile(s.fn || '0', ['x'], vars);
        const a = s.xmin !== undefined ? evalNum(s.xmin, vars) : xmin, b = s.xmax !== undefined ? evalNum(s.xmax, vars) : xmax;
        const n = s.n || 600;
        const xs = spec.x?.log ? logspace(a, b, n) : Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
        return { x: xs, y: xs.map(x => f(x)), label: s.label, color: s.color, dashed: s.dashed, step: s.step, fill: s.fill };
      });
      const num = (v: number | string) => evalNum(v, vars);
      return {
        series, xRange: [xmin, xmax] as [number, number],
        yRange: spec.y?.min !== undefined && spec.y?.max !== undefined ? [num(spec.y.min), num(spec.y.max)] as [number, number] : undefined,
        hlines: spec.hlines?.map(h => ({ ...h, at: num(h.at) })), vlines: spec.vlines?.map(h => ({ ...h, at: num(h.at) })),
        points: spec.points?.map(p => ({ ...p, x: num(p.x), y: num(p.y) })), xspans: spec.xspans?.map(s => ({ ...s, from: num(s.from), to: num(s.to) })),
        vars,
      };
    } catch (e) { return { error: (e as Error).message }; }
  }, [code, pp.vals]);
  if (err || !res) return <BlockError msg={'plot: ' + err} />;
  if ('error' in res) return <BlockError msg={'plot: ' + res.error} />;
  return <figure className="figure" style={{ margin: '6px 0 20px' }}>
    <div className="figure-body" style={{ display: 'block' }}>
      <Plot series={res.series} xRange={res.xRange} yRange={res.yRange} xLog={spec!.x?.log} yLog={spec!.y?.log}
        xLabel={spec!.x?.label} yLabel={spec!.y?.label} xUnit={spec!.x?.unit || undefined} yUnit={spec!.y?.unit || undefined} title={spec!.title}
        hlines={res.hlines} vlines={res.vlines} points={res.points} xspans={res.xspans} height={spec!.height} />
      {spec!.params?.length ? <ParamControls params={spec!.params} vals={pp.vals} set={pp.set} reset={pp.reset} readouts={spec!.readouts} vars={res.vars} /> : null}
    </div>
    <Caption text={caption || spec!.caption} />
  </figure>;
}

type BodeSpec = { caption?: string; systems: { label?: string; num: (number | string)[]; den: (number | string)[]; color?: string }[]; f: { min: number | string; max: number | string }; show?: 'both' | 'mag' | 'phase'; marks?: { f: number | string; label?: string }[]; magRange?: [number, number]; phaseRange?: [number, number]; vars?: Record<string, number | string>; units?: 'Hz' | 'rad/s'; params?: Param[]; readouts?: Readout[] };

export function BodeBlock({ code, caption }: { code: string; caption?: string }) {
  const [spec, err] = parse<BodeSpec>(code);
  const pp = useParams(spec?.params);
  const res = useMemo(() => {
    if (!spec) return null;
    try {
      const vars = resolveVars(spec.vars, pp.vals);
      const fmin = evalNum(spec.f.min, vars), fmax = evalNum(spec.f.max, vars);
      const fs = logspace(fmin, fmax, 500);
      const mag: Series[] = [], ph: Series[] = [];
      spec.systems.forEach(sys => {
        const num = sys.num.map(c => evalNum(c, vars)), den = sys.den.map(c => evalNum(c, vars));
        const m: number[] = [], p: number[] = []; let prev = 0, off = 0;
        fs.forEach((f, i) => {
          const w = spec.units === 'rad/s' ? f : 2 * Math.PI * f;
          const H = cdiv(polyAtJw(num, w), polyAtJw(den, w));
          m.push(20 * Math.log10(cabs(H)));
          let a = carg(H) * 180 / Math.PI;
          if (i > 0) { while (a + off - prev > 180) off -= 360; while (a + off - prev < -180) off += 360; }
          a += off; prev = a; p.push(a);
        });
        mag.push({ x: fs, y: m, label: sys.label, color: sys.color }); ph.push({ x: fs, y: p, label: sys.label, color: sys.color });
      });
      const marks = (spec.marks || []).map(mk => ({ at: evalNum(mk.f, vars), label: mk.label }));
      return { mag, ph, fmin, fmax, marks, vars };
    } catch (e) { return { error: (e as Error).message }; }
  }, [code, pp.vals]);
  if (err || !res) return <BlockError msg={'bode: ' + err} />;
  if ('error' in res) return <BlockError msg={'bode: ' + res.error} />;
  const show = spec!.show || 'both'; const xu = spec!.units === 'rad/s' ? 'rad/s' : 'Hz';
  return <figure className="figure" style={{ margin: '6px 0 20px' }}>
    <div className="figure-body" style={{ display: 'block' }}>
      {show !== 'phase' && <Plot series={res.mag} xLog xRange={[res.fmin, res.fmax]} yRange={spec!.magRange} xUnit={xu} yLabel="Magnitude (dB)" yTickFormat={v => v.toFixed(0)} vlines={res.marks} height={220} legend={show === 'mag'} xLabel={show === 'mag' ? `Frequency (${xu})` : undefined} />}
      {show !== 'mag' && <Plot series={res.ph} xLog xRange={[res.fmin, res.fmax]} yRange={spec!.phaseRange} xUnit={xu} yLabel="Phase (°)" yTickFormat={v => v.toFixed(0) + '°'} vlines={res.marks} height={show === 'phase' ? 240 : 190} xLabel={`Frequency (${xu})`} />}
      {spec!.params?.length ? <ParamControls params={spec!.params} vals={pp.vals} set={pp.set} reset={pp.reset} readouts={spec!.readouts} vars={res.vars} /> : null}
    </div>
    <Caption text={caption || spec!.caption} />
  </figure>;
}

let mermaidSeq = 0;
export function MermaidBlock({ code, caption }: { code: string; caption?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { effective } = useTheme();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await loadMermaid();
        m.initialize({ startOnLoad: false, theme: effective === 'dark' ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'Inter, sans-serif', flowchart: { curve: 'basis', htmlLabels: true }, themeVariables: effective === 'dark' ? { background: '#15161a', primaryColor: '#1c1e25', primaryBorderColor: '#8b8df9', lineColor: '#a6a7b0', primaryTextColor: '#ececf0' } : { primaryColor: '#f7f7fb', primaryBorderColor: '#4f46e5', lineColor: '#55555c' } });
        const { svg } = await m.render('mmd' + (++mermaidSeq), code);
        if (alive && ref.current) { ref.current.innerHTML = svg; setErr(null); }
      } catch (e) { if (alive) setErr((e as Error).message); }
    })();
    return () => { alive = false; };
  }, [code, effective]);
  return <figure className="figure" style={{ margin: '6px 0 20px' }}>
    <div className="figure-body mermaid-body" ref={ref}><span className="faint small">Rendering diagram…</span></div>
    {err && <div className="figure-error">mermaid: {err}</div>}
    <Caption text={caption} />
  </figure>;
}

export function SvgBlock({ code, caption }: { code: string; caption?: string }) {
  const clean = code.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
  return <figure className="figure" style={{ margin: '6px 0 20px' }}>
    <div className="figure-body svg-raw" dangerouslySetInnerHTML={{ __html: clean }} />
    <Caption text={caption} />
  </figure>;
}

export function SimBlock({ code, caption }: { code: string; caption?: string }) {
  const [spec, err] = parse<{ id: string; title?: string; [k: string]: unknown }>(code);
  if (err || !spec) return <BlockError msg={'sim: ' + err} />;
  const entry = getSim(spec.id);
  if (!entry) return <BlockError msg={`Unknown simulation "${spec.id}"`} />;
  const C = entry.component;
  return <SimErrorBoundary>
    <Suspense fallback={<div className="sim"><div className="sim-head"><span className="sim-badge">Simulation</span><span className="sim-title">{spec.title || entry.title}</span></div><div className="empty">Loading simulation…</div></div>}>
      <C params={spec} caption={caption} />
    </Suspense>
  </SimErrorBoundary>;
}
