// Test coverage, yield & escapes. Pure model in ../models/yield-coverage.ts
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Toggle, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { linspace } from '../../lib/units';
import { yieldModel, williamsBrown } from '../models/yield-coverage';

const usd = (v: number) => '$' + (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : v >= 100 ? v.toFixed(0) : v.toFixed(2));
const PRESETS = {
  startup: { Y: 0.9, aoi: 0, ict: 0, fct: 0.9, burnin: false, N: 500 },
  production: { Y: 0.95, aoi: 0.6, ict: 0.8, fct: 0.9, burnin: false, N: 10000 },
  automotive: { Y: 0.97, aoi: 0.9, ict: 0.95, fct: 0.98, burnin: true, N: 50000 },
} as const;

export default function YieldCoverage({ params }: SimProps) {
  const init = {
    Y: Number(params.Y ?? 0.95), aoi: Number(params.aoi ?? 0.6), ict: Number(params.ict ?? 0.8), fct: Number(params.fct ?? 0.9),
    burnin: Boolean(params.burnin ?? false), fieldCost: Number(params.fieldCost ?? 200), N: Number(params.N ?? 10000),
  };
  const [s, set] = useState(init);
  const [pre, setPre] = useState<string>('');
  const up = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => { setPre(''); set(p => ({ ...p, [k]: v })); };

  const m = useMemo(() => yieldModel(s), [s]);
  const tx = useMemo(() => linspace(0, 0.9999, 200), []);
  const curves = useMemo(() => [0.8, 0.9, 0.95, 0.99].map(Y => ({ Y, y: tx.map(T => Math.max(williamsBrown(Y, T) * 1e6, 0.5)) })), [tx]);

  // funnel geometry
  const W = 340, rowH = 40, top = 30, maxW = 190, x0 = 12;
  const rows = m.rows;
  const wOf = (v: number) => (m.startDefective > 0 ? Math.max(0, (v / m.startDefective) * maxW) : 0);
  let drawn = 0;
  const funnel = rows.map(r => { const y = top + (drawn++) * rowH; return { r, y }; });
  const H = top + rows.length * rowH + 40;
  const dppmTone = m.dppm < 500 ? 'ok' : m.dppm < 5000 ? 'warn' : 'bad';
  const savings = m.noTestField - m.total;
  const maxCost = Math.max(m.noTestField, m.total, 1);

  return (
    <SimShell title="Test coverage, yield & escapes" onReset={() => { setPre(''); set(init); }}
      tryThis={<>pick <b>Startup</b>, then add AOI and ICT: the escapes per 10 000 boards fall, but look at the cost bars. Test cost is paid on <i>every</i> board, field cost only on escapes, so the best coverage is found where the two meet. Then drop process yield to 80% at fixed coverage: DL = 1 − Y<sup>(1−T)</sup> shows why low yield means a worse shipped quality even with the same test. Enable <b>burn-in</b> for the automotive escape rate.</>}
      controls={<>
        <Seg label="Presets" value={pre as any} options={[{ value: 'startup', label: 'Startup' }, { value: 'production', label: 'Production' }, { value: 'automotive', label: 'Automotive' }]} onChange={(k: string) => { setPre(k); set(p => ({ ...p, ...(PRESETS as any)[k] })); }} />
        <Slider label="Process yield Y" value={s.Y} min={0.5} max={0.999} step={0.001} format={v => (v * 100).toFixed(1) + '%'} onChange={up('Y')} />
        <Slider label="AOI coverage" value={s.aoi} min={0} max={1} step={0.01} format={v => (v * 100).toFixed(0) + '%'} onChange={up('aoi')} />
        <Slider label="ICT / flying-probe coverage" value={s.ict} min={0} max={1} step={0.01} format={v => (v * 100).toFixed(0) + '%'} onChange={up('ict')} />
        <Slider label="Functional test coverage" value={s.fct} min={0} max={1} step={0.01} format={v => (v * 100).toFixed(0) + '%'} onChange={up('fct')} />
        <Toggle label="Burn-in (70% of remaining latent defects)" checked={s.burnin} onChange={up('burnin')} />
        <Slider label="Field failure cost" value={s.fieldCost} min={10} max={20000} log format={v => usd(v)} onChange={up('fieldCost')} />
        <Slider label="Production volume" value={s.N} min={100} max={200000} log format={v => v.toFixed(0) + ' boards'} onChange={up('N')} />
        <Note>Stage costs per board: AOI $0.40, ICT $1.50, FCT $3, burn-in $10. A coverage of 0 skips the stage. Stages are assumed to detect faults independently; caught boards are repaired and shipped. Repair cost follows the rule of ten back from the field cost.</Note>
      </>}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Test funnel showing defective boards remaining after each stage" style={{ display: 'block', maxWidth: 440, margin: '0 auto' }}>
        <text x={x0} y={14} fontSize={11} fill="var(--d-muted)">Defective boards left and caught · {m.N.toLocaleString()} built</text>
        {/* start bar */}
        <rect x={x0} y={top - 8} width={maxW} height={8} fill="var(--d-orange)" />
        <text x={x0 + maxW + 6} y={top - 1} fontSize={10} fill="var(--d-ink)">{m.startDefective.toFixed(0)} defective ({((1 - m.Y) * 100).toFixed(1)}%)</text>
        {funnel.map(({ r, y }) => {
          const wb = wOf(r.before), wa = wOf(r.after);
          const yy = y + 4;
          return (
            <g key={r.key} opacity={r.on ? 1 : 0.4}>
              <polygon points={`${x0},${yy} ${x0 + wb},${yy} ${x0 + wa},${yy + rowH - 10} ${x0},${yy + rowH - 10}`} fill="var(--d-orange)" opacity={0.35} stroke="var(--d-orange)" />
              <rect x={x0 + wa} y={yy + (rowH - 10) / 2 - 4} width={Math.max(0, wb - wa)} height={8} fill="var(--d-green)" opacity={0.0} />
              <text x={x0 + 4} y={yy + 14} fontSize={11} fontWeight={600} fill="var(--d-ink)">{r.name.split(' ')[0]}{r.on ? ` · ${(r.cov * 100).toFixed(0)}%` : ' · skipped'}</text>
              {r.on && <>
                <text x={x0 + maxW + 6} y={yy + 14} fontSize={10} fill="var(--d-green)">caught {r.caught.toFixed(0)}</text>
                <text x={x0 + maxW + 6} y={yy + 26} fontSize={10} fill="var(--d-muted)">{usd(r.testCost)} test · fix {usd(r.repairCostEach)}/ea</text>
              </>}
            </g>);
        })}
        <rect x={x0} y={H - 30} width={Math.max(2, wOf(m.escapes))} height={10} fill="var(--d-red)" />
        <text x={x0} y={H - 5} fontSize={11} fontWeight={600} fill="var(--d-red)">Escapes to field: {m.escapes.toFixed(1)} boards ({Math.round(m.dppm).toLocaleString()} DPPM)</text>
      </svg>

      <div style={{ margin: '4px 0 8px' }}>
        <RegionBadge label={m.dppm < 500 ? 'Automotive-grade (<500 DPPM)' : m.dppm < 5000 ? 'Consumer-grade' : 'High escape rate'} color={m.dppm < 500 ? 'ok' : m.dppm < 5000 ? 'warn' : 'bad'} />
      </div>
      <Readouts>
        <Readout k="Total coverage T" v={(m.T * 100).toFixed(2) + '%'} />
        <Readout k="Defect level DL" v={(m.DL * 100).toFixed(3) + '%'} hl tone={dppmTone} />
        <Readout k="Shipped DPPM" v={Math.round(m.dppm).toLocaleString()} hl tone={dppmTone} />
        <Readout k="Escapes (field failures)" v={m.escapes.toFixed(1)} />
        <Readout k="Cost of test + repair" v={usd(m.testCost + m.repairCost)} />
        <Readout k="Field-failure cost" v={usd(m.fieldCostTotal)} tone={m.fieldCostTotal > m.testCost + m.repairCost ? 'bad' : undefined} />
        <Readout k="Total / per board" v={`${usd(m.total)} / ${usd(m.perBoard)}`} />
        <Readout k="vs. no test" v={`${savings >= 0 ? 'saves ' : 'costs '}${usd(Math.abs(savings))}`} tone={savings >= 0 ? 'ok' : 'warn'} />
      </Readouts>
      <EqBox>{String.raw`DL = 1 - Y^{(1-T)} = 1 - ${m.Y.toFixed(3)}^{(1-${m.T.toFixed(3)})} = ${(m.DL * 100).toFixed(3)}\% \;\Rightarrow\; ${Math.round(m.dppm).toLocaleString()}\ \text{DPPM}`}</EqBox>

      {/* cost bars and rule of ten */}
      <svg viewBox="0 0 340 150" width="100%" role="img" aria-label="Cost comparison and rule of ten" style={{ display: 'block', maxWidth: 440, margin: '0 auto' }}>
        <text x={12} y={14} fontSize={11} fill="var(--d-muted)">Cost of quality (whole lot)</text>
        {[
          { label: 'No test', parts: [{ v: m.noTestField, c: 'var(--d-red)', n: 'field' }] },
          { label: 'Your plan', parts: [{ v: m.testCost, c: 'var(--d-blue)', n: 'test' }, { v: m.repairCost, c: 'var(--d-green)', n: 'repair' }, { v: m.fieldCostTotal, c: 'var(--d-red)', n: 'field' }] },
        ].map((b, i) => {
          let x = 70; const y = 24 + i * 24;
          return <g key={b.label}><text x={12} y={y + 12} fontSize={11} fill="var(--d-ink)">{b.label}</text>
            {b.parts.map(p => { const w = (p.v / maxCost) * 200; const el = <rect key={p.n} x={x} y={y} width={Math.max(0, w)} height={16} fill={p.c} opacity={0.8}><title>{p.n}: {usd(p.v)}</title></rect>; x += w; return el; })}
            <text x={x + 4} y={y + 12} fontSize={10} fill="var(--d-ink)">{usd(b.parts.reduce((a, p) => a + p.v, 0))}</text></g>;
        })}
        <text x={70} y={86} fontSize={10} fill="var(--d-blue)">■ test</text><text x={115} y={86} fontSize={10} fill="var(--d-green)">■ repair</text><text x={170} y={86} fontSize={10} fill="var(--d-red)">■ field failures</text>
        <text x={12} y={104} fontSize={11} fill="var(--d-muted)">Rule of ten: cost to fix one defect</text>
        {(() => {
          const act = rows.filter(r => r.on);
          const items = [...act.map(r => ({ n: r.name.split(' ')[0], v: r.repairCostEach })), { n: 'Field', v: s.fieldCost }];
          const bw = 300 / items.length;
          return items.map((it, i) => <g key={i}><rect x={12 + i * bw} y={110} width={bw - 4} height={30} rx={3} fill={i === items.length - 1 ? 'var(--d-red)' : 'var(--d-orange)'} opacity={0.25 + 0.15 * i} stroke="var(--d-muted)" /><text x={12 + i * bw + (bw - 4) / 2} y={122} fontSize={10} textAnchor="middle" fill="var(--d-ink)">{it.n}</text><text x={12 + i * bw + (bw - 4) / 2} y={135} fontSize={11} fontWeight={700} textAnchor="middle" fill="var(--d-ink)">{usd(it.v)}</text></g>);
        })()}
      </svg>

      <Plot series={curves.map((c, i) => ({ x: tx.map(t => t * 100), y: c.y, label: `Y = ${(c.Y * 100).toFixed(0)}%`, color: ['red', 'orange', 'accent', 'green'][i] }))}
        yLog xUnit="%" yUnit="" xLabel="Total fault coverage T" yLabel="Shipped defects (DPPM)" height={230} xRange={[0, 100]}
        yTickFormat={v => v >= 1000 ? (v / 1000) + 'k' : String(v)}
        points={[{ x: m.T * 100, y: Math.max(m.dppm, 0.5), label: 'you', color: 'accent' }]}
        hlines={[{ at: 500, label: 'automotive target', color: 'muted' }]} />
    </SimShell>
  );
}
