// Shared building blocks for every interactive simulation.
import { ReactNode, useMemo, useState, useRef } from 'react';
import katex from 'katex';
import { si, num } from '../lib/units';

export type SimProps = { params: Record<string, any>; caption?: string };

export function SimShell(p: { title: string; children: ReactNode; controls?: ReactNode; tryThis?: ReactNode; layout?: 'side' | 'stacked'; onReset?: () => void; badge?: string; caption?: string }) {
  return (
    <section className="sim fade-in" aria-label={p.title}>
      <div className="sim-head">
        <span className="sim-badge">{p.badge || 'Interactive'}</span>
        <span className="sim-title">{p.title}</span>
        <span style={{ flex: 1 }} />
        {p.onReset && <button className="btn btn-sm btn-ghost" onClick={p.onReset}>Reset</button>}
      </div>
      <div className={'sim-body' + (p.layout === 'stacked' || !p.controls ? ' stacked' : '')}>
        <div className="sim-stage">{p.children}</div>
        {p.controls && <div className="sim-panel">{p.controls}</div>}
      </div>
      {(p.tryThis || p.caption) && <div className="sim-try">{p.caption ? <span>{p.caption} </span> : null}{p.tryThis && <><b>Try this:</b> {p.tryThis}</>}</div>}
    </section>
  );
}

/** Slider with numeric entry. log=true makes the slider logarithmic. */
export function Slider(props: { label: ReactNode; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; log?: boolean; format?: (v: number) => string; disabled?: boolean }) {
  // If a page preset (or any state) puts the value outside [min, max], widen the range to include it — and keep it
  // widened — so touching the slider never snaps a page's own example value back into range.
  const ext = useRef({ lo: props.min, hi: props.max });
  if (isFinite(props.value)) { if (props.value < ext.current.lo && (!props.log || props.value > 0)) ext.current.lo = props.value; if (props.value > ext.current.hi) ext.current.hi = props.value; }
  const p = { ...props, min: Math.min(props.min, ext.current.lo), max: Math.max(props.max, ext.current.hi) };
  const toPos = (v: number) => p.log ? (Math.log10(v) - Math.log10(p.min)) / (Math.log10(p.max) - Math.log10(p.min)) * 1000 : v;
  const fromPos = (x: number) => {
    if (!p.log) return x;
    const v = 10 ** (Math.log10(p.min) + x / 1000 * (Math.log10(p.max) - Math.log10(p.min)));
    const mag = 10 ** Math.floor(Math.log10(v)); return Math.round(v / mag * 100) / 100 * mag;
  };
  const [txt, setTxt] = useState<string | null>(null);
  const fmt = p.format ?? ((v: number) => p.unit !== undefined ? si(v, p.unit, 3) : num(v, 4));
  return (
    <label className="ctl">
      <span className="ctl-head"><span className="ctl-label">{p.label}</span><span className="ctl-val" role="button" tabIndex={0} title="Click to type a value" style={{ cursor: 'text' }} onClick={e => { e.preventDefault(); setTxt(String(p.value)); }}>{fmt(p.value)}</span></span>
      <input type="range" disabled={p.disabled} min={p.log ? 0 : p.min} max={p.log ? 1000 : p.max} step={p.log ? 1 : (p.step ?? (p.max - p.min) / 200)}
        value={toPos(p.value)} onChange={e => p.onChange(fromPos(parseFloat(e.target.value)))} aria-label={typeof p.label === 'string' ? p.label : undefined} />
      {txt !== null && <input className="ctl-num" autoFocus value={txt} onChange={e => setTxt(e.target.value)} onBlur={() => { const v = parseFloat(txt); if (isFinite(v)) p.onChange(Math.min(p.max, Math.max(p.min, v))); setTxt(null); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}
    </label>
  );
}

export function Select<T extends string>(p: { label: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return <label className="ctl"><span className="ctl-head"><span className="ctl-label">{p.label}</span></span>
    <select className="input" style={{ height: 32, fontSize: 13 }} value={p.value} onChange={e => p.onChange(e.target.value as T)}>
      {p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select></label>;
}

export function Seg<T extends string>(p: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: ReactNode }) {
  return <div className="ctl">{p.label && <span className="ctl-head"><span className="ctl-label">{p.label}</span></span>}
    <div className="seg">{p.options.map(o => <button key={o.value} type="button" className={o.value === p.value ? 'on' : ''} onClick={() => p.onChange(o.value)}>{o.label}</button>)}</div></div>;
}

export function Toggle(p: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={p.checked} onChange={e => p.onChange(e.target.checked)} />{p.label}</label>;
}

export function Readout(p: { k: ReactNode; v: ReactNode; tone?: 'ok' | 'bad' | 'warn'; hl?: boolean }) {
  return <div className={`readout${p.hl ? ' hl' : ''}${p.tone ? ' ' + p.tone : ''}`}><div className="k">{p.k}</div><div className="v">{p.v}</div></div>;
}
export function Readouts({ children }: { children: ReactNode }) { return <div className="readouts">{children}</div>; }

/** KaTeX math; display=true for block */
export function TeX({ children, display }: { children: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(children.replace(/·/g, '⋅').replace(/µ/g, 'μ'), { displayMode: !!display, throwOnError: false, strict: 'ignore' }).replace('<span class="katex-display">', '<span class="katex-display" tabindex="0">'), [children, display]); // tabindex: keyboard-reachable when it scrolls
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
export function EqBox({ children }: { children: string }) { return <div className="eq-box"><TeX display>{children}</TeX></div>; }

export function Note({ children }: { children: ReactNode }) { return <div className="sim-note">{children}</div>; }

/** Region pill e.g. "Saturation" */
export function RegionBadge({ label, color }: { label: string; color: 'ok' | 'warn' | 'bad' | 'info' | 'accent' }) {
  const map = { ok: ['var(--ok)', 'var(--ok-soft)'], warn: ['var(--warn)', 'var(--warn-soft)'], bad: ['var(--bad)', 'var(--bad-soft)'], info: ['var(--info)', 'var(--info-soft)'], accent: ['var(--accent)', 'var(--accent-soft)'] }[color];
  return <span className="badge-region" style={{ color: map[0], background: map[1] }}>{label}</span>;
}

export { si, num };
