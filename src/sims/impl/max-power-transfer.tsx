// Maximum power transfer: resistive sweep and complex conjugate match.
import { useMemo, useState } from 'react';
import type { PointerEvent as RPE } from 'react';
import { SimShell, SimProps, Slider, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { solve, rlOpt, mismatchDb } from '../models/max-power-transfer';

type St = { vs: number; rs: number; rl: number; complex: boolean; xs: number; xl: number };
const T = (v: number, u: string) => `\\text{${si(v, u)}}`;
const jx = (x: number) => `${x < 0 ? '−' : '+'}j${si(Math.abs(x), 'Ω')}`;

function initState(params: Record<string, any>): St {
  const n = (k: string, d: number, min = 0) => { const v = Number(params[k]); return params[k] !== undefined && isFinite(v) && v >= min ? v : d; };
  const complex = params.complex === true || params.complex === 'true';
  const rs = Math.max(0.1, n('rs', 50));
  return { vs: n('vs', 10), rs, rl: Math.max(0.1, n('rl', 50)), complex, xs: complex ? rs * 0.8 : 0, xl: 0 };
}

/** Heat map of P_L/P_max over RL (log) × XL; click to set the load. */
function MatchMap({ s, onPick }: { s: St; onPick: (rl: number, xl: number) => void }) {
  const W = 320, H = 220, ml = 46, mb = 30, mt = 8, mr = 8; const iw = W - ml - mr, ih = H - mt - mb;
  const r0 = s.rs / 10, r1 = s.rs * 10; const xc = -s.xs, xspan = 3 * s.rs; const x0 = xc - xspan, x1 = xc + xspan;
  const NX = 36, NY = 26;
  const cells = useMemo(() => {
    const out: { x: number; y: number; v: number }[] = [];
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const rl = 10 ** (Math.log10(r0) + (i + 0.5) / NX * (Math.log10(r1) - Math.log10(r0)));
      const xl = x1 - (j + 0.5) / NY * (x1 - x0);
      out.push({ x: i, y: j, v: solve({ vs: 1, rs: s.rs, rl, xs: s.xs, xl }).ratio });
    }
    return out;
  }, [s.rs, s.xs, r0, r1, x0, x1]);
  const px = (rl: number) => ml + (Math.log10(rl) - Math.log10(r0)) / (Math.log10(r1) - Math.log10(r0)) * iw;
  const py = (xl: number) => mt + (x1 - xl) / (x1 - x0) * ih;
  const pick = (e: RPE<SVGSVGElement>) => {
    const svg = e.currentTarget; const r = svg.getBoundingClientRect();
    const X = (e.clientX - r.left) / r.width * W, Y = (e.clientY - r.top) / r.height * H;
    if (X < ml || X > ml + iw || Y < mt || Y > mt + ih) return;
    const rl = 10 ** (Math.log10(r0) + (X - ml) / iw * (Math.log10(r1) - Math.log10(r0)));
    const xl = x1 - (Y - mt) / ih * (x1 - x0);
    onPick(Math.round(rl * 100) / 100, Math.round(xl * 10) / 10);
  };
  const cx = px(Math.min(r1, Math.max(r0, s.rl))), cy = py(Math.min(x1, Math.max(x0, s.xl)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
      onPointerDown={pick} onPointerMove={e => { if (e.buttons) pick(e); }} role="button" tabIndex={0} aria-label="Load impedance map: click to choose RL and XL; Enter applies the conjugate match"
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(s.rs, -s.xs); } }}>
      {cells.map(c => <rect key={c.x + '-' + c.y} x={ml + c.x * iw / NX} y={mt + c.y * ih / NY} width={iw / NX + 0.6} height={ih / NY + 0.6} fill="var(--d-accent)" opacity={0.04 + 0.86 * c.v * c.v} />)}
      <rect x={ml} y={mt} width={iw} height={ih} fill="none" stroke="var(--d-muted)" />
      {[r0, s.rs, r1].map((v, i) => <text key={i} x={px(v)} y={H - mb + 14} fontSize={10.5} fill="var(--d-muted)" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{si(v, 'Ω')}</text>)}
      <text x={ml + iw / 2} y={H - 3} fontSize={11} fill="var(--d-ink)" textAnchor="middle">RL (log)</text>
      {[x1, xc, x0].map((v, i) => <text key={i} x={ml - 4} y={py(v) + (i === 0 ? 9 : i === 2 ? -2 : 4)} fontSize={10.5} fill="var(--d-muted)" textAnchor="end">{si(v, 'Ω').replace(' Ω', '')}</text>)}
      <text transform={`translate(10 ${mt + ih / 2}) rotate(-90)`} fontSize={11} fill="var(--d-ink)" textAnchor="middle">XL (Ω)</text>
      {/* conjugate-match point */}
      <g stroke="var(--d-green)" strokeWidth={2.2}><line x1={px(s.rs) - 6} x2={px(s.rs) + 6} y1={py(-s.xs) - 6} y2={py(-s.xs) + 6} /><line x1={px(s.rs) - 6} x2={px(s.rs) + 6} y1={py(-s.xs) + 6} y2={py(-s.xs) - 6} /></g>
      <text x={px(s.rs) + 8} y={py(-s.xs) - 7} fontSize={11} fill="var(--d-green)" fontWeight={600}>Zs*</text>
      <circle cx={cx} cy={cy} r={6} fill="none" stroke="var(--d-orange)" strokeWidth={2.4} />
      <circle cx={cx} cy={cy} r={2} fill="var(--d-orange)" />
    </svg>
  );
}

export default function MaxPowerTransfer({ params }: SimProps) {
  const init = useMemo(() => initState(params), [params]);
  const [s, set] = useState<St>(init);
  const upd = <K extends keyof St>(k: K) => (v: St[K]) => set(p => ({ ...p, [k]: v }));
  const xs = s.complex ? s.xs : 0, xl = s.complex ? s.xl : 0;
  const r = useMemo(() => solve({ vs: s.vs, rs: s.rs, rl: s.rl, xs, xl }), [s.vs, s.rs, s.rl, xs, xl]);
  const ropt = rlOpt(s.rs, xs, xl);

  const curves = useMemo(() => {
    const rls = logspace(s.rs / 100, s.rs * 100, 300);
    const sv = rls.map(rl => solve({ vs: s.vs, rs: s.rs, rl, xs, xl }));
    return { x: rls, p: sv.map(v => v.ratio), eff: sv.map(v => v.eff), ps: sv.map(v => (isFinite(v.pmax) ? v.ps / v.pmax : 0)) };
  }, [s.vs, s.rs, xs, xl]);

  const matched = Math.abs(s.rl / s.rs - 1) < 0.02 && (!s.complex || Math.abs(xs + xl) < 0.02 * s.rs + 0.05);
  const region = matched ? { label: s.complex ? 'Conjugate matched: maximum power' : 'Matched: RL = Rs', color: 'ok' as const }
    : s.rl > s.rs * 3 ? { label: 'RL ≫ Rs: high efficiency, less power', color: 'info' as const }
      : s.rl < s.rs / 3 ? { label: 'RL ≪ Rs: most power wasted in Rs', color: 'bad' as const }
        : { label: 'Near match', color: 'warn' as const };

  const schematic = useMemo(() => {
    const el: any[] = [
      { t: 'region', at: [-1.6, -2.6], w: 11.2, h: 11.6, label: 'source', color: 'muted' },
      { t: s.complex ? 'Vac' : 'V', a: [0, 2], b: [0, 6], label: 'V_s', value: si(s.vs, 'V') + (s.complex ? ' rms' : '') },
      { t: 'wire', pts: [[0, 2], [0, 0], [1, 0]], flow: true },
      { t: 'R', a: [1, 0], b: [5, 0], label: 'R_s', value: si(s.rs, 'Ω'), color: r.ps > r.pl * 1.05 ? 'red' : undefined },
    ];
    if (s.complex && xs !== 0) el.push({ t: xs > 0 ? 'L' : 'C', a: [5, 0], b: [9, 0], label: 'jX_s', value: jx(xs) });
    else el.push({ t: 'wire', pts: [[5, 0], [9, 0]], flow: true });
    el.push({ t: 'wire', pts: [[9, 0], [15, 0], [15, 1]], flow: true });
    el.push({ t: 'R', a: [15, 1], b: [15, 4.5], label: 'R_L', value: si(s.rl, 'Ω'), color: 'orange' });
    if (s.complex && xl !== 0) el.push({ t: xl > 0 ? 'L' : 'C', a: [15, 4.5], b: [15, 8], label: 'jX_L', value: jx(xl), color: 'orange' });
    else el.push({ t: 'wire', pts: [[15, 4.5], [15, 8]] });
    el.push({ t: 'wire', pts: [[15, 8], [0, 8], [0, 6]] });
    el.push({ t: 'arrow', a: [11.2, -0.8], b: [13.2, -0.8], label: `I = ${si(r.i, 'A')}` });
    el.push({ t: 'text', at: [18.5, 3.5], text: `P_L = ${si(r.pl, 'W')}`, color: 'accent', anchor: 'start' });
    el.push({ t: 'text', at: [18.5, 5], text: `η = ${(r.eff * 100).toFixed(1)}%`, color: 'green', anchor: 'start' });
    return renderCircuit({ elements: el }).svg;
  }, [s, xs, xl, r]);

  const xRangeX = s.complex ? Math.max(4 * s.rs, Math.abs(s.xs) * 1.5, Math.abs(s.xl) * 1.2) : 0;
  const eq = s.complex
    ? String.raw`\begin{gathered}P_L = \frac{|V_s|^2 R_L}{(R_s+R_L)^2 + (X_s+X_L)^2} = \frac{${s.vs.toFixed(1)}^2\cdot ${T(s.rl, 'Ω')}}{(${T(s.rs + s.rl, 'Ω')})^2 + (${T(xs + xl, 'Ω')})^2} = ${T(r.pl, 'W')}\\ Z_L = Z_s^* \Rightarrow P_{max} = \frac{|V_s|^2}{4R_s} = ${T(r.pmax, 'W')}\end{gathered}`
    : String.raw`\begin{gathered}P_L = \frac{V_s^2 R_L}{(R_s+R_L)^2} = \frac{${s.vs.toFixed(1)}^2\cdot ${T(s.rl, 'Ω')}}{(${T(s.rs + s.rl, 'Ω')})^2} = ${T(r.pl, 'W')}\\ P_{max} = \frac{V_s^2}{4R_s} = ${T(r.pmax, 'W')},\quad \eta = \frac{R_L}{R_s+R_L} = ${(r.eff * 100).toFixed(1)}\%\end{gathered}`;

  return (
    <SimShell title="Maximum power transfer" onReset={() => set(init)}
      tryThis={s.complex
        ? <>with X<sub>s</sub> ≠ 0, set R<sub>L</sub> = R<sub>s</sub> but leave X<sub>L</sub> = 0: you don't get P<sub>max</sub>, because the reactance limits the current. Click the green ✕ (Z<sub>s</sub>*) on the map, or press <b>Conjugate match</b>: X<sub>L</sub> = −X<sub>s</sub> cancels the source reactance and the full V<sub>s</sub>²/4R<sub>s</sub> arrives. With X<sub>L</sub> stuck at 0, the best R<sub>L</sub> is |R<sub>s</sub> + jX<sub>s</sub>|.</>
        : <>sweep R<sub>L</sub> from 5 Ω to 500 Ω: power peaks at exactly R<sub>L</sub> = R<sub>s</sub> with 50% efficiency (half the power heats R<sub>s</sub>). At R<sub>L</sub> = 3R<sub>s</sub> you still get 75% of P<sub>max</sub> at 75% efficiency, which is why power systems use R<sub>L</sub> ≫ R<sub>s</sub> and RF links match.</>}
      controls={<>
        <Slider label="Source voltage Vs" value={s.vs} min={0} max={50} step={0.1} unit="V" onChange={upd('vs')} />
        <Slider label="Source resistance Rs" value={s.rs} min={0.1} max={10e3} log unit="Ω" onChange={upd('rs')} />
        <Slider label="Load resistance RL" value={s.rl} min={0.1} max={1e6} log unit="Ω" onChange={upd('rl')} />
        <Toggle label="Complex (AC) mode with reactances" checked={s.complex} onChange={v => set(p => ({ ...p, complex: v, xs: v && p.xs === 0 ? p.rs * 0.8 : p.xs }))} />
        {s.complex && <>
          <Slider label="Source reactance Xs" value={s.xs} min={-xRangeX} max={xRangeX} step={xRangeX / 200} format={jx} onChange={upd('xs')} />
          <Slider label="Load reactance XL" value={s.xl} min={-xRangeX} max={xRangeX} step={xRangeX / 200} format={jx} onChange={upd('xl')} />
        </>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={() => set(p => ({ ...p, rl: p.rs }))}>Set RL = Rs</button>
          {s.complex && <button type="button" className="btn btn-sm" onClick={() => set(p => ({ ...p, rl: p.rs, xl: -p.xs }))}>Conjugate match</button>}
          {s.complex && <button type="button" className="btn btn-sm btn-ghost" onClick={() => set(p => ({ ...p, rl: Math.round(rlOpt(p.rs, p.xs, p.xl) * 100) / 100 }))}>Best RL for this XL</button>}
        </div>
        <Note>{s.complex ? 'Vs is an RMS phasor; P is real (average) power. Positive X is inductive, negative is capacitive.' : 'Vs is DC (or RMS). Rs is the Thevenin resistance of whatever drives the load.'}</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div><RegionBadge label={region.label} color={region.color} /></div>
      <Readouts>
        <Readout k="Load power P_L" v={si(r.pl, 'W')} hl />
        <Readout k="P_L / P_max" v={(r.ratio * 100).toFixed(1) + '%'} tone={r.ratio > 0.98 ? 'ok' : r.ratio > 0.5 ? 'warn' : 'bad'} />
        <Readout k="Efficiency η" v={(r.eff * 100).toFixed(1) + '%'} />
        <Readout k="Lost in Rs" v={si(r.ps, 'W')} />
        <Readout k="Available P_max" v={si(r.pmax, 'W')} />
        <Readout k="Current |I|" v={si(r.i, 'A')} />
        <Readout k="Load voltage |V_L|" v={si(r.vl, 'V')} />
        <Readout k="Mismatch loss" v={isFinite(mismatchDb(r.pl, r.pmax)) ? mismatchDb(r.pl, r.pmax).toFixed(2) + ' dB' : '—'} />
        {s.complex && <Readout k="Best RL for this XL" v={si(ropt, 'Ω')} />}
      </Readouts>
      <EqBox>{eq}</EqBox>
      <Plot height={250} xLog xUnit="Ω" xLabel="Load resistance R_L" yLabel="fraction" yRange={[0, 1.05]} xRange={[s.rs / 100, s.rs * 100]}
        yTickFormat={v => (v * 100).toFixed(0) + '%'}
        series={[{ x: curves.x, y: curves.p, label: 'P_L / P_max', color: 'accent', width: 2.5 }, { x: curves.x, y: curves.eff, label: 'efficiency η', color: 'green' }, { x: curves.x, y: curves.ps, label: 'P in R_s / P_max', color: 'red', dashed: true }]}
        vlines={[{ at: s.rs, label: 'R_L = R_s', color: 'muted' }, ...(s.complex && Math.abs(ropt / s.rs - 1) > 0.01 ? [{ at: ropt, label: 'best R_L', color: 'orange' }] : [])]}
        hlines={[{ at: 0.5, color: 'muted' }]}
        points={[{ x: s.rl, y: r.ratio, color: 'accent' }, { x: s.rl, y: r.eff, color: 'green' }]} />
      {s.complex && <div>
        <div className="small muted" style={{ marginBottom: 6 }}>P<sub>L</sub>/P<sub>max</sub> over the load plane (darker = more power). Click or drag to choose Z<sub>L</sub>; ✕ marks the conjugate match Z<sub>s</sub>* = {si(s.rs, 'Ω')} {jx(-s.xs)}.</div>
        <MatchMap s={{ ...s, xs, xl }} onPick={(rl, x) => set(p => ({ ...p, rl, xl: x }))} />
      </div>}
    </SimShell>
  );
}
