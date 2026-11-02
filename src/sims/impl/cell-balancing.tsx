// Series-cell pack: charge with and without passive bleed-resistor balancing.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { clamp } from '../../lib/units';
import { simulateBalance, BAL_START_V } from '../models/cell-balancing';

const CELL_COLORS = ['red', 'blue', 'green', 'orange', 'purple', 'accent'];
const cvar = (c: string) => `var(--d-${c})`;
const hm = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')} min` : `${Math.round(s / 60)} min`;

function PackDiagram(p: { n: number; q: number[]; soc: number[]; v: number[]; ib: number[]; ic: number; balance: boolean; vmax: number; first: number }) {
  const W = 540, cw = W / p.n, H = 222, qmax = Math.max(...p.q);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Pack diagram: cell state of charge and bleed resistors">
      {/* series string */}
      <line x1={8} y1={22} x2={W - 8} y2={22} stroke="var(--d-ink)" strokeWidth={1.5} strokeDasharray={p.ic > 0 ? '6 4' : undefined}>
        {p.ic > 0 && <animate attributeName="stroke-dashoffset" from="20" to="0" dur="0.8s" repeatCount="indefinite" />}
      </line>
      <text x={8} y={14} fontSize={12} fill="var(--d-accent)" fontWeight={600}>I_charger = {si(p.ic, 'A')} →</text>
      <text x={W - 8} y={14} fontSize={12} fill="var(--d-muted)" textAnchor="end">pack + </text>
      {p.q.map((q, i) => {
        const x0 = i * cw + cw * 0.18, w = cw * 0.4, hFull = 120 * q / qmax, yb = 168, yt = yb - hFull;
        const lvl = Math.max(0, Math.min(1, p.soc[i]));
        const over = p.v[i] >= p.vmax - 0.002;
        const bleeding = p.ib[i] > 1e-4;
        const col = cvar(CELL_COLORS[i % CELL_COLORS.length]);
        const rx = i * cw + cw * 0.74;
        return <g key={i}>
          <line x1={x0 + w / 2} y1={22} x2={x0 + w / 2} y2={yt - 6} stroke="var(--d-ink)" strokeWidth={1.2} />
          <rect x={x0 + w * 0.3} y={yt - 6} width={w * 0.4} height={6} fill="var(--d-ink)" rx={1.5} />
          <rect x={x0} y={yt} width={w} height={hFull} fill="var(--d-box)" stroke={over ? 'var(--d-red)' : 'var(--d-ink)'} strokeWidth={over ? 2.4 : 1.4} rx={4} />
          <rect x={x0 + 2} y={yb - 2 - (hFull - 4) * lvl} width={w - 4} height={(hFull - 4) * lvl} fill={col} opacity={0.75} rx={2.5} />
          <text x={x0 + w / 2} y={yb + 16} fontSize={12} textAnchor="middle" fill="var(--d-ink)" fontWeight={600}>Cell {i + 1}{i === p.first ? ' ★' : ''}</text>
          <text x={x0 + w / 2} y={yb + 31} fontSize={11.5} textAnchor="middle" fill={over ? 'var(--d-red)' : 'var(--d-ink)'}>{p.v[i].toFixed(3)} V</text>
          <text x={x0 + w / 2} y={yb + 45} fontSize={11} textAnchor="middle" fill="var(--d-muted)">{(lvl * 100).toFixed(1)}%{p.n <= 4 ? ` of ${si(q, 'Ah')}` : ''}</text>
          {/* bleed resistor + switch */}
          {p.balance && <g opacity={bleeding ? 1 : 0.45}>
            <line x1={x0 + w / 2} y1={34} x2={rx} y2={34} stroke="var(--d-muted)" strokeWidth={1} />
            <line x1={rx} y1={34} x2={rx} y2={58} stroke="var(--d-muted)" strokeWidth={1} />
            <rect x={rx - 5} y={58} width={10} height={34} fill="none" stroke={bleeding ? 'var(--d-orange)' : 'var(--d-muted)'} strokeWidth={bleeding ? 2.2 : 1.2} rx={1} />
            <line x1={rx} y1={92} x2={rx} y2={110} stroke="var(--d-muted)" strokeWidth={1} />
            {bleeding ? <line x1={rx} y1={110} x2={rx} y2={128} stroke="var(--d-orange)" strokeWidth={2} /> : <line x1={rx} y1={112} x2={rx + 9} y2={126} stroke="var(--d-muted)" strokeWidth={1.4} />}
            <line x1={rx} y1={128} x2={rx} y2={yb + 4} stroke="var(--d-muted)" strokeWidth={1} />
            <line x1={rx} y1={yb + 4} x2={x0 + w / 2} y2={yb + 4} stroke="var(--d-muted)" strokeWidth={1} />
            {bleeding && p.n <= 4 && <text x={rx + 7} y={80} fontSize={10.5} fill="var(--d-orange)">{si(p.ib[i], 'A', 2)}</text>}
          </g>}
          {i < p.n - 1 && <text x={(i + 1) * cw} y={yb - hFull / 2} fontSize={10} textAnchor="middle" fill="var(--d-muted)">+</text>}
        </g>;
      })}
    </svg>
  );
}

export default function CellBalancing({ params }: SimProps) {
  const init = {
    cells: clamp(Math.round(Number(params.cells ?? 4)) || 4, 2, 6),
    mismatch: clamp(Number(params.mismatch ?? 0.05), 0, 0.3),
    balance: (params.balance === 'passive' ? 'passive' : 'none') as 'none' | 'passive',
    socSpread: 0.1, crate: 0.5, rbal: 33, cursor: 1, compare: true,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const base = { cells: s.cells, mismatch: s.mismatch, socSpread: s.socSpread, crate: s.crate, rbal: s.rbal };
  const r = useMemo(() => simulateBalance({ ...base, balance: s.balance }), [s.cells, s.mismatch, s.socSpread, s.crate, s.rbal, s.balance]);
  const other = useMemo(() => s.compare ? simulateBalance({ ...base, balance: s.balance === 'none' ? 'passive' : 'none' }) : null, [s.compare, s.cells, s.mismatch, s.socSpread, s.crate, s.rbal, s.balance]);

  const k = Math.min(r.t.length - 1, Math.round(s.cursor * (r.t.length - 1)));
  const n = r.q.length;
  const th = r.t.map(t => t / 3600);
  const vNow = r.v.map(a => a[k]), socNow = r.soc.map(a => a[k]), ibNow = r.ib.map(a => a[k]);
  const anyBleed = ibNow.some(x => x > 1e-4);
  const phase = r.t[k] < r.tFirstFull ? 'CC: all cells charging' : anyBleed ? 'Taper + balancing' : r.t[k] >= r.tEnd ? 'Charge terminated' : 'Taper (highest cell held at V_max)';
  const lostPct = r.lostAh / r.idealAh * 100;
  const pBleed = 4.2 * 4.2 / s.rbal;

  return (
    <SimShell title="Series cell balancing" onReset={() => set(init)}
      tryThis={<>with balancing off, note which cell hits 4.2 V first (★): the charge must stop there, so the other cells never fill and the pack loses {si(s.balance === 'none' ? r.lostAh : other?.lostAh ?? 0, 'Ah')}. Switch to passive: the high cells bleed through R<sub>bal</sub> while the charger tapers, and usable capacity climbs to the weakest cell's capacity, at the cost of bleed heat and time. Then try R<sub>bal</sub> = 200 Ω: a gentler bleed takes much longer to correct a 10% spread (balancing current ≈ V/R).</>}
      controls={<>
        <Seg label="Balancing" value={s.balance} onChange={upd('balance')} options={[{ value: 'none', label: 'None' }, { value: 'passive', label: 'Passive (bleed)' }]} />
        <Slider label="Cells in series" value={s.cells} min={2} max={6} step={1} format={v => `${v}S (${(v * 4.2).toFixed(1)} V full)`} onChange={v => upd('cells')(Math.round(v))} />
        <Slider label="Capacity mismatch (spread)" value={s.mismatch} min={0} max={0.3} step={0.005} format={v => (v * 100).toFixed(1) + '%'} onChange={upd('mismatch')} />
        <Slider label="Initial SoC spread" value={s.socSpread} min={0} max={0.3} step={0.005} format={v => (v * 100).toFixed(1) + '%'} onChange={upd('socSpread')} />
        <Slider label="Charge current" value={s.crate} min={0.1} max={1} step={0.05} format={v => `${v.toFixed(2)}C = ${si(v * 2, 'A')}`} onChange={upd('crate')} />
        {s.balance === 'passive' && <Slider label="Bleed resistor R_bal" value={s.rbal} min={10} max={200} log unit="Ω" onChange={upd('rbal')} />}
        <Slider label="Time cursor" value={s.cursor} min={0} max={1} step={0.002} format={v => hm(v * r.tEnd)} onChange={upd('cursor')} />
        <Toggle label="Compare with the other mode" checked={s.compare} onChange={upd('compare')} />
        <Note>2 Ah nominal cells, R<sub>0</sub> = 30 mΩ, mean start SoC 30%. Charger tapers when any cell reaches 4.2 V and stops at C/20. Balancer bleeds a cell above {BAL_START_V} V that is &gt;10 mV above the lowest (top balancing).</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={phase} color={anyBleed ? 'warn' : r.t[k] < r.tFirstFull ? 'info' : 'accent'} />
        <span className="sim-note">t = {hm(r.t[k])} · cell spread {((Math.max(...vNow) - Math.min(...vNow)) * 1000).toFixed(0)} mV</span>
      </div>
      <div className="figure-body" style={{ padding: 8, display: 'block' }}>
        <PackDiagram n={n} q={r.q} soc={socNow} v={vNow} ib={ibNow} ic={r.ic[k]} balance={s.balance === 'passive'} vmax={4.2} first={r.firstCell} />
        <div className="sim-note" style={{ textAlign: 'center' }}>Box height ∝ capacity, fill = state of charge at the time cursor. ★ = first cell to reach 4.2 V.{s.balance === 'passive' ? ' Orange resistor = bleed switch closed.' : ''}</div>
      </div>
      <Readouts>
        <Readout k="First cell at 4.2 V" v={`Cell ${r.firstCell + 1} @ ${hm(r.tFirstFull)}`} />
        <Readout k="Usable pack capacity" v={`${si(r.usableAh, 'Ah')} (${(r.usableAh / r.nominalAh * 100).toFixed(1)}%)`} hl tone={lostPct > 3 ? 'bad' : lostPct > 1 ? 'warn' : 'ok'} />
        <Readout k="Best possible (weakest cell)" v={si(r.idealAh, 'Ah')} />
        <Readout k="Lost to imbalance" v={`${si(r.lostAh, 'Ah')} (${lostPct.toFixed(1)}%)`} tone={lostPct > 3 ? 'bad' : lostPct > 1 ? 'warn' : 'ok'} />
        <Readout k="Charge time" v={hm(r.tEnd) + (r.finished ? '' : ' (not done)')} />
        {s.balance === 'passive' && <Readout k="Bleed heat (total)" v={`${si(r.heatTotalJ, 'J')} = ${si(r.heatTotalJ / 3600, 'Wh')}`} />}
        {s.balance === 'passive' && <Readout k="Peak bleed per cell" v={`${si(r.peakBleedA, 'A')}, ${si(r.peakBleedW, 'W')}`} />}
        {other && <Readout k={`Usable with ${s.balance === 'none' ? 'passive' : 'no'} balancing`} v={si(other.usableAh, 'Ah')} />}
        <Readout k="Pack-level CV, no cell monitor" v={`Cell ${r.packCvCell + 1} → ${r.packCvMaxV.toFixed(3)} V`} tone={r.packCvMaxV > 4.25 ? 'bad' : r.packCvMaxV > 4.21 ? 'warn' : 'ok'} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}I_{bleed} = \frac{V_{cell}}{R_{bal}} \approx \frac{4.2\,\text{V}}{${s.rbal.toFixed(0)}\,\Omega} = ${(4.2 / s.rbal * 1000).toFixed(0)}\,\text{mA} \\ P = \frac{V^2}{R_{bal}} = ${(pBleed * 1000).toFixed(0)}\,\text{mW} \\ Q_{usable} = \min_i\left(\text{SoC}_i\,Q_i\right) = ${r.usableAh.toFixed(3)}\,\text{Ah}\end{gathered}`}</EqBox>
      <Plot height={250} xLabel="Time (h)" yLabel="Cell voltage" yUnit="V" yRange={[Math.min(3.5, ...r.v.map(a => a[0])) - 0.05, 4.27]}
        series={r.v.map((v, i) => ({ x: th, y: v, label: `Cell ${i + 1}`, color: CELL_COLORS[i % CELL_COLORS.length] }))}
        hlines={[{ at: 4.2, label: 'V_max 4.2 V', color: 'red' }, ...(s.balance === 'passive' ? [{ at: BAL_START_V, label: 'balancing enabled above', color: 'muted' }] : [])]}
        vlines={[{ at: r.tFirstFull / 3600, label: 'first cell full', color: 'muted' }, { at: r.t[k] / 3600, color: 'accent' }]} />
      <Plot height={190} xLabel="Time (h)" yLabel="Current" yUnit="A"
        series={[{ x: th, y: r.ic, label: 'Charger I_c', color: 'ink', width: 2.4 }, ...(s.balance === 'passive' ? r.ib.map((b, i) => ({ x: th, y: b, label: `Bleed ${i + 1}`, color: CELL_COLORS[i % CELL_COLORS.length], width: 1.3 })) : [])]}
        vlines={[{ at: r.t[k] / 3600, color: 'accent' }]} />
      <Note>Passive balancing can only burn charge off the fullest cells, so it fixes SoC mismatch, not capacity mismatch: the pack still stops at the weakest cell's capacity on discharge. A pack-level charger that only regulates N × 4.2 V lets the cell with least headroom go above 4.2 V; that is why every Li-ion pack needs per-cell voltage monitoring.</Note>
    </SimShell>
  );
}
