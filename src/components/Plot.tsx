import { useEffect, useMemo, useRef, useState } from 'react';
import { si, num } from '../lib/units';

export type Series = {
  x: number[]; y: number[]; label?: string; color?: string; dashed?: boolean; width?: number; step?: boolean; fill?: boolean; points?: boolean;
};
export type Ref = { at: number; label?: string; color?: string };
export type Ann = { x: number; y: number; label?: string; color?: string };
export type Span = { from: number; to: number; label?: string; color?: string };
export type PlotProps = {
  series: Series[];
  xLabel?: string; yLabel?: string; xUnit?: string; yUnit?: string;
  xLog?: boolean; yLog?: boolean;
  xRange?: [number, number]; yRange?: [number, number];
  height?: number; title?: string;
  hlines?: Ref[]; vlines?: Ref[]; points?: Ann[]; xspans?: Span[]; yspans?: Span[];
  legend?: boolean; hover?: boolean; aspect?: number;
  xTickFormat?: (v: number) => string; yTickFormat?: (v: number) => string;
};

/** Render "R_L", "V_{out}", "x^2" as SVG tspans */
const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plot title → HTML with the same X_{sub} / X_s subscript convention as axis labels. */
function titleHtml(t: string) {
  return escHtml(t).replace(/([A-Za-zΩτωφθλμ\d)])_(?:\{([^}]+)\}|([A-Za-z0-9]{1,4}))/g, (_, a, b, c) => `${a}<sub>${b || c}</sub>`)
    .replace(/\^(?:\{([^}]+)\}|([A-Za-z0-9+\-]{1,4}))/g, (_, b, c) => `<sup>${b || c}</sup>`);
}

export function Lbl({ t }: { t?: string }) {
  if (!t) return null;
  const parts: (string | { s: string; sub: boolean })[] = []; let buf = ''; let i = 0;
  while (i < t.length) {
    const c = t[i];
    if ((c === '_' || c === '^') && i + 1 < t.length && t[i + 1] !== ' ') {
      let content: string;
      if (t[i + 1] === '{') { const j = t.indexOf('}', i + 2); content = t.slice(i + 2, j < 0 ? t.length : j); i = (j < 0 ? t.length : j) + 1; }
      else { const m = t.slice(i + 1).match(/^[A-Za-z0-9]+/); content = m ? m[0] : t[i + 1]; i += 1 + content.length; }
      if (buf) parts.push(buf); buf = ''; parts.push({ s: content, sub: c === '_' }); continue;
    }
    buf += c; i++;
  }
  if (buf) parts.push(buf);
  return <>{parts.map((p, k) => typeof p === 'string' ? <tspan key={k}>{p}</tspan> : <tspan key={k} baselineShift={p.sub ? 'sub' : 'super'} fontSize="75%">{p.s}</tspan>)}</>;
}

export const PALETTE = ['var(--d-accent)', 'var(--d-orange)', 'var(--d-green)', 'var(--d-red)', 'var(--d-purple)', 'var(--d-blue)', 'var(--d-muted)'];
export function colorOf(c: string | undefined, i: number) {
  if (!c) return PALETTE[i % PALETTE.length];
  if (/^(accent|red|blue|green|orange|purple|muted|ink)$/.test(c)) return `var(--d-${c})`;
  return c;
}

function niceStep(range: number, target: number) {
  const raw = range / Math.max(1, target); const mag = 10 ** Math.floor(Math.log10(raw)); const r = raw / mag;
  return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
}
function linTicks(a: number, b: number, target: number) {
  if (!(b > a)) return [a];
  const st = niceStep(b - a, target); const out: number[] = [];
  for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : v);
  return out;
}
function logTicks(a: number, b: number) {
  const out: number[] = []; const minor: number[] = [];
  const e0 = Math.floor(Math.log10(a)), e1 = Math.ceil(Math.log10(b)); const stepE = Math.max(1, Math.ceil((e1 - e0) / 8));
  for (let e = e0; e <= e1; e++) {
    const d = 10 ** e; if (d >= a * 0.999 && d <= b * 1.001 && (e - e0) % stepE === 0) out.push(d);
    if (stepE > 1) continue;
    for (let k = 2; k < 10; k++) { const v = k * d; if (v > a && v < b) minor.push(v); }
  }
  return { major: out, minor };
}

export default function Plot(p: PlotProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const [hover, setHover] = useState<{ px: number; py: number; x: number } | null>(null);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(es => { for (const e of es) setW(Math.max(260, Math.round(e.contentRect.width))); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = p.height ?? Math.round(Math.min(340, Math.max(200, W * (p.aspect ?? 0.5))));
  const narrow = W < 440;

  const { xr, yr } = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of p.series) for (let i = 0; i < s.x.length; i++) {
      const x = s.x[i], y = s.y[i]; if (!isFinite(x) || !isFinite(y)) continue;
      if (p.xLog && x <= 0) continue; if (p.yLog && y <= 0) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    for (const h of p.hlines || []) { y0 = Math.min(y0, h.at); y1 = Math.max(y1, h.at); }
    if (!isFinite(x0)) { x0 = 0; x1 = 1; } if (!isFinite(y0)) { y0 = 0; y1 = 1; }
    if (y1 === y0) { y0 -= 1; y1 += 1; }
    if (!p.yLog && !p.yRange) { const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad; }
    return { xr: (p.xRange ?? [x0, x1]) as [number, number], yr: (p.yRange ?? [y0, y1]) as [number, number] };
  }, [p.series, p.xRange, p.yRange, p.xLog, p.yLog, p.hlines]);


  // SI prefixes only make sense for SI units; anything else (%, °C, dB, rpm, "periods") prints plain numbers + unit
  const SI_UNITS = /^(V|A|W|Ω|F|H|Hz|s|J|C|T|Wb|S|N|N·m|N⋅m|m|Wh|Ah|VA|V\/s|A\/s|W\/K|K\/W|bit\/s|b\/s|B|Sa\/s|rad\/s|Ω·m|V\/A|A\/V|lx|Pa|kg·m²)$/;
  const fmtU = (v: number, u?: string) => u === undefined ? num(v, 3) : SI_UNITS.test(u) ? si(v, u, 3) : `${num(v, 3)}${u ? ' ' + u : ''}`;
  // Long non-SI units (e.g. "(normalized)", "per cycle") go once into the axis title instead of on every tick.
  const longUnit = (u?: string) => !!u && !SI_UNITS.test(u) && (/[\s()]/.test(u) || u.length > 6);
  const xU = longUnit(p.xUnit) ? undefined : p.xUnit, yU = longUnit(p.yUnit) ? undefined : p.yUnit;
  const withUnit = (label: string | undefined, u: string | undefined) => !label || !longUnit(u) || label.includes(u!.replace(/[()]/g, '')) ? label : `${label} ${/^\(.*\)$/.test(u!) ? u : `(${u})`}`;
  const xLabel = withUnit(p.xLabel, p.xUnit), yLabel = withUnit(p.yLabel, p.yUnit);
  const fx = p.xTickFormat ?? ((v: number) => fmtU(v, xU));
  const fy = p.yTickFormat ?? ((v: number) => fmtU(v, yU));
  const xt = p.xLog ? logTicks(xr[0], xr[1]) : { major: linTicks(xr[0], xr[1], narrow ? 4 : 7), minor: [] as number[] };
  const yt = p.yLog ? logTicks(yr[0], yr[1]) : { major: linTicks(yr[0], yr[1], 5), minor: [] as number[] };
  // left margin grows with the widest y tick label so the rotated axis title never overlaps it
  const yTickW = Math.max(18, ...yt.major.map(v => fy(v).length * 6.6));
  const M = { l: Math.round(yTickW + (p.yLabel ? 30 : 12)), r: 26, t: 12, b: p.xLabel ? 44 : 28 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const tx = (x: number) => p.xLog ? M.l + (Math.log10(x) - Math.log10(xr[0])) / (Math.log10(xr[1]) - Math.log10(xr[0])) * iw : M.l + (x - xr[0]) / (xr[1] - xr[0]) * iw;
  const ty = (y: number) => p.yLog ? M.t + ih - (Math.log10(y) - Math.log10(yr[0])) / (Math.log10(yr[1]) - Math.log10(yr[0])) * ih : M.t + ih - (y - yr[0]) / (yr[1] - yr[0]) * ih;
  // Thin x tick labels so neighbours never collide (grid lines are kept for every tick).
  const xLabelled = useMemo(() => {
    const keep = new Set<number>(); let lastRight = -Infinity;
    for (const v of xt.major) {
      const w = fx(v).length * 6.3; const X = tx(v); const end = X > M.l + iw - 18;
      const left = end ? X - w : X - w / 2, right = end ? X : X + w / 2;
      if (left > lastRight + 16) { keep.add(v); lastRight = right; }
    }
    return keep;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xt.major.join(','), W, xr[0], xr[1], p.xLog, M.l, iw]);
  const invx = (px: number) => p.xLog ? 10 ** (Math.log10(xr[0]) + (px - M.l) / iw * (Math.log10(xr[1]) - Math.log10(xr[0]))) : xr[0] + (px - M.l) / iw * (xr[1] - xr[0]);

  const paths = p.series.map((s, si_) => {
    let d = ''; let pen = false;
    for (let i = 0; i < s.x.length; i++) {
      const x = s.x[i], y = s.y[i];
      if (!isFinite(x) || !isFinite(y) || (p.xLog && x <= 0) || (p.yLog && y <= 0)) { pen = false; continue; }
      const X = tx(x), Y = Math.max(M.t - 2000, Math.min(M.t + ih + 2000, ty(y)));
      if (s.step && pen && i > 0) d += `L${X.toFixed(1)},${ty(s.y[i - 1]).toFixed(1)}`;
      d += `${pen ? 'L' : 'M'}${X.toFixed(1)},${Y.toFixed(1)}`; pen = true;
    }
    return { d, s, c: colorOf(s.color, si_) };
  });
  const clipId = useMemo(() => 'clip' + Math.random().toString(36).slice(2), []);

  const hv = hover && p.hover !== false ? p.series.map((s, i) => {
    if (!s.x.length) return null;
    let best = 0, bd = Infinity;
    for (let k = 0; k < s.x.length; k++) { const d = Math.abs(tx(s.x[k]) - hover.px); if (d < bd) { bd = d; best = k; } }
    return { i, x: s.x[best], y: s.y[best], c: colorOf(s.color, i), label: s.label };
  }).filter(Boolean) as { i: number; x: number; y: number; c: string; label?: string }[] : [];

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%' }}>
      {/* Title as HTML so long titles wrap instead of being clipped by the SVG */}
      {p.title && <div className="plot-title" style={{ paddingLeft: M.l }} dangerouslySetInnerHTML={{ __html: titleHtml(p.title) }} />}
      <svg className="plot-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        onPointerMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = e.clientX - r.left; const py = e.clientY - r.top; if (px >= M.l && px <= M.l + iw) setHover({ px, py, x: invx(px) }); else setHover(null); }}
        onPointerLeave={() => setHover(null)}>
        <defs><clipPath id={clipId}><rect x={M.l} y={M.t} width={iw} height={ih} /></clipPath></defs>
        {(p.xspans || []).map((s, i) => <g key={'xs' + i}><rect x={tx(s.from)} y={M.t} width={Math.max(0, tx(s.to) - tx(s.from))} height={ih} fill={colorOf(s.color || 'accent', 0)} opacity={0.08} />{s.label && <text x={(tx(s.from) + tx(s.to)) / 2} y={M.t + 12} textAnchor="middle" className="ann" style={{ fill: colorOf(s.color || 'accent', 0) }}>{s.label}</text>}</g>)}
        {(p.yspans || []).map((s, i) => <g key={'ys' + i}><rect x={M.l} y={ty(s.to)} width={iw} height={Math.max(0, ty(s.from) - ty(s.to))} fill={colorOf(s.color || 'accent', 0)} opacity={0.08} />{s.label && <text x={M.l + iw - 4} y={ty(s.to) + 12} textAnchor="end" className="ann" style={{ fill: colorOf(s.color || 'accent', 0) }}>{s.label}</text>}</g>)}
        {xt.minor.map(v => <line key={'xm' + v} x1={tx(v)} x2={tx(v)} y1={M.t} y2={M.t + ih} className="gridl" opacity={0.5} />)}
        {yt.minor.map(v => <line key={'ym' + v} y1={ty(v)} y2={ty(v)} x1={M.l} x2={M.l + iw} className="gridl" opacity={0.5} />)}
        {xt.major.map(v => <g key={'x' + v}><line x1={tx(v)} x2={tx(v)} y1={M.t} y2={M.t + ih} className="gridl" />{xLabelled.has(v) && <text x={tx(v)} y={M.t + ih + 15} textAnchor={tx(v) > M.l + iw - 18 ? 'end' : 'middle'} className="tick">{fx(v)}</text>}</g>)}
        {yt.major.map(v => <g key={'y' + v}><line y1={ty(v)} y2={ty(v)} x1={M.l} x2={M.l + iw} className="gridl" /><text x={M.l - 6} y={ty(v) + 3.5} textAnchor="end" className="tick">{fy(v)}</text></g>)}
        <line x1={M.l} x2={M.l + iw} y1={M.t + ih} y2={M.t + ih} className="ax" />
        <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + ih} className="ax" />
        {!p.yLog && yr[0] < 0 && yr[1] > 0 && <line x1={M.l} x2={M.l + iw} y1={ty(0)} y2={ty(0)} className="ax" opacity={0.6} />}
        {xLabel && <text x={M.l + iw / 2} y={H - 8} textAnchor="middle" className="axlabel"><Lbl t={xLabel} /></text>}
        {yLabel && <text transform={`translate(13 ${M.t + ih / 2}) rotate(-90)`} textAnchor="middle" className="axlabel"><Lbl t={yLabel} /></text>}
        <g clipPath={`url(#${clipId})`}>
          {paths.map(({ d, s, c }, i) => <g key={i}>
            {s.fill && <path d={`${d}L${tx(s.x[s.x.length - 1])},${ty(Math.max(yr[0], 0))}L${tx(s.x[0])},${ty(Math.max(yr[0], 0))}Z`} fill={c} opacity={0.12} stroke="none" />}
            <path d={d} className="series" style={{ stroke: c, strokeDasharray: s.dashed ? '6 5' : undefined, strokeWidth: s.width }} />
            {s.points && s.x.map((x, k) => <circle key={k} cx={tx(x)} cy={ty(s.y[k])} r={2.6} fill={c} />)}
          </g>)}
          {(p.hlines || []).map((h, i) => <line key={'h' + i} x1={M.l} x2={M.l + iw} y1={ty(h.at)} y2={ty(h.at)} className="refl" style={h.color ? { stroke: colorOf(h.color, 0) } : undefined} />)}
          {(p.vlines || []).map((h, i) => <line key={'v' + i} y1={M.t} y2={M.t + ih} x1={tx(h.at)} x2={tx(h.at)} className="refl" style={h.color ? { stroke: colorOf(h.color, 0) } : undefined} />)}
          {(p.points || []).map((a, i) => <circle key={'p' + i} cx={tx(a.x)} cy={ty(a.y)} r={4.2} fill={colorOf(a.color || 'ink', 0)} stroke="var(--d-bg)" strokeWidth={1.5} />)}
        </g>
        {(p.hlines || []).map((h, i) => { const y = ty(h.at); if (!h.label || y < M.t - 1 || y > M.t + ih + 1) return null; const below = y - M.t < 16; return <text key={'hl' + i} x={M.l + iw - 4} y={below ? y + 13 : y - 5} textAnchor="end" className="ann" style={h.color ? { fill: colorOf(h.color, 0) } : undefined}><Lbl t={h.label} /></text>; })}
        {(p.vlines || []).map((h, i) => { const x = tx(h.at); if (!h.label || x < M.l - 1 || x > M.l + iw + 1) return null; const right = x < M.l + iw - 120; return <text key={'vl' + i} x={right ? x + 4 : x - 4} y={M.t + 12 + (i % 2) * 13} textAnchor={right ? 'start' : 'end'} className="ann" style={h.color ? { fill: colorOf(h.color, 0) } : undefined}><Lbl t={h.label} /></text>; })}
        {(p.points || []).map((a, i) => a.label ? <text key={'pl' + i} x={tx(a.x) + 7} y={ty(a.y) - 7} className="ann"><Lbl t={a.label} /></text> : null)}
        {hover && hv.length > 0 && <g>
          <line x1={hover.px} x2={hover.px} y1={M.t} y2={M.t + ih} className="cursor" />
          {hv.map(h => isFinite(h.y) && <circle key={h.i} cx={tx(h.x)} cy={ty(h.y)} r={3.6} fill={h.c} stroke="var(--d-bg)" strokeWidth={1.5} />)}
        </g>}
      </svg>
      {hover && hv.length > 0 && (
        <div className="plot-tip" style={{ left: Math.min(hover.px + 12, W - 170), top: Math.max(4, hover.py - 20) }}>
          <div className="faint">{p.xLabel ? p.xLabel.split('(')[0].trim() + ': ' : 'x: '}{fx(hv[0].x)}</div>
          {hv.map(h => <div key={h.i} style={{ color: h.c }}>{h.label ? h.label + ': ' : ''}{fy(h.y)}</div>)}
        </div>
      )}
      {p.legend !== false && p.series.some(s => s.label) && (
        <div className="plot-legend">{p.series.map((s, i) => s.label ? <span key={i}><i style={{ background: colorOf(s.color, i), opacity: s.dashed ? 0.7 : 1 }} /><svg width={Math.max(10, s.label.length * 7.2)} height={16} style={{ overflow: 'visible' }}><text x={0} y={12} style={{ fill: 'var(--text-2)', fontSize: 12.5 }}><Lbl t={s.label} /></text></svg></span> : null)}</div>
      )}
    </div>
  );
}
