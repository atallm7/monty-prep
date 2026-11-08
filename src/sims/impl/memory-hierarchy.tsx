// Memory hierarchy: AMAT, where the time goes per level, effective CPI and a working-set sweep.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, si } from '../kit';
import Plot from '../../components/Plot';
import { amat, breakdown, cpi, hitsFromWorkingSet } from '../models/memory-hierarchy';

const PRESETS: Record<string, Partial<Rec>> = {
  desktop: { l1hit: 0.95, l2hit: 0.8, l3hit: 0.5, l1: 4, l2: 12, l3: 40, dram: 200 },
  mcu: { l1hit: 0.98, l2hit: 1, l3hit: 1, l1: 1, l2: 6, l3: 0, dram: 0 },
  thrashing: { l1hit: 0.9, l2hit: 0.2, l3hit: 0.3, l1: 4, l2: 12, l3: 40, dram: 200 },
};
type Rec = { l1hit: number; l2hit: number; l3hit: number; l1: number; l2: number; l3: number; dram: number; loads: number };
const LV = [
  { k: 'l1', name: 'L1', c: 'var(--d-green)' }, { k: 'l2', name: 'L2', c: 'var(--d-blue)' }, { k: 'l3', name: 'L3', c: 'var(--d-purple)' },
  { k: 'dram', name: 'DRAM', c: 'var(--d-red)' }, { k: 'tlb', name: 'TLB', c: 'var(--d-orange)' },
] as const;
const pct = (v: number) => (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
const bytes = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} GB` : v >= 1e6 ? `${(v / 1e6).toFixed(v < 1e7 ? 1 : 0)} MB` : `${(v / 1e3).toFixed(v < 1e4 ? 1 : 0)} KB`);

function Bar({ items, total, unit }: { items: { name: string; c: string; v: number }[]; total: number; unit: (v: number) => string }) {
  return (
    <div>
      <div style={{ display: 'flex', height: 34, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--d-muted)' }} role="img" aria-label={items.map(i => `${i.name} ${unit(i.v)}`).join(', ')}>
        {items.map(i => { const w = total > 0 ? i.v / total : 0; return w > 0 ? (
          <div key={i.name} style={{ width: `${w * 100}%`, background: i.c, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textShadow: '0 0 2px rgba(0,0,0,.6)' }} title={`${i.name}: ${unit(i.v)} (${pct(w)})`}>{w > 0.1 ? `${i.name} ${pct(w)}` : w > 0.045 ? pct(w) : ''}</div>) : null; })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 12, marginTop: 4 }}>
        {items.map(i => <span key={i.name}><span style={{ color: i.c }}>■</span> {i.name} {unit(i.v)}{total > 0 ? ` (${pct(i.v / total)})` : ''}</span>)}
      </div>
    </div>
  );
}

export default function MemoryHierarchy({ params }: SimProps) {
  const init = {
    l1hit: Number(params.l1hit ?? 0.95), l2hit: Number(params.l2hit ?? 0.8), l3hit: Number(params.l3hit ?? 0.5),
    l1: Number(params.l1 ?? 4), l2: Number(params.l2 ?? 12), l3: Number(params.l3 ?? 40), dram: Number(params.dram ?? 200), loads: Number(params.loads ?? 0.3),
    tlbMiss: 0, tlbPen: 30, baseCpi: 1,
    mode: 'manual' as 'manual' | 'ws', ws: 2e6, c1: 32e3, c2: 256e3, c3: 8e6,
  };
  const [s, set] = useState(init);
  const [preset, setPreset] = useState('');
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => { setPreset(''); set(q => ({ ...q, [k]: v })); };

  const ws = hitsFromWorkingSet(s.ws, s.c1, s.c2, s.c3);
  const eff = s.mode === 'ws' ? { ...s, l1hit: ws.l1hit, l2hit: ws.l2hit, l3hit: ws.l3hit } : s;
  const r = useMemo(() => breakdown(eff, s.tlbMiss, s.tlbPen), [eff.l1hit, eff.l2hit, eff.l3hit, s.l1, s.l2, s.l3, s.dram, s.tlbMiss, s.tlbPen]);
  const A = r.total;
  const CPI = cpi(s.baseCpi, s.loads, A, s.l1);
  const slowdown = CPI / s.baseCpi;
  const hasL3 = !(eff.l2hit >= 1);

  const sweep = useMemo(() => {
    const xs: number[] = []; for (let e = 3; e <= 9.5; e += 0.05) xs.push(10 ** e);
    const y = xs.map(w => { const h = hitsFromWorkingSet(w, s.c1, s.c2, s.c3); return amat({ ...s, ...h }) + s.tlbMiss * s.tlbPen; });
    return { x: xs, y };
  }, [s.l1, s.l2, s.l3, s.dram, s.c1, s.c2, s.c3, s.tlbMiss, s.tlbPen]);
  const nowY = amat({ ...s, l1hit: ws.l1hit, l2hit: ws.l2hit, l3hit: ws.l3hit }) + s.tlbMiss * s.tlbPen;

  const pick = (n: string) => { set(q => ({ ...q, ...PRESETS[n], mode: 'manual' })); setPreset(n); };
  const nest = String.raw`\text{AMAT} = t_1 + m_1\,(t_2 + m_2\,(t_3 + m_3\,t_{DRAM})) = ${s.l1} + ${(1 - eff.l1hit).toFixed(3)}\,(${s.l2} + ${(1 - eff.l2hit).toFixed(3)}\,(${s.l3} + ${(1 - eff.l3hit).toFixed(3)}\cdot ${s.dram})) = ${r.cache.toFixed(2)}\ \text{cycles}`;

  return (
    <SimShell title="Memory hierarchy & AMAT" onReset={() => { set(init); setPreset(''); }}
      tryThis={<>start with the desktop preset: 95% of accesses hit L1, yet L1 accounts for only about two thirds of the time, and the rare DRAM accesses cost almost as much as L2 and L3 combined. Drop the L1 hit rate to 90%: AMAT jumps by 2 cycles because miss rate multiplies everything below it. Then switch to <em>from working set</em> and drag the working set past the L2 and L3 sizes to see the AMAT staircase.</>}
      controls={<>
        <Seg label="Preset" value={preset as any} options={Object.keys(PRESETS).map(k => ({ value: k, label: k }))} onChange={pick} />
        <Seg label="Hit rates come from" value={s.mode} options={[{ value: 'manual', label: 'sliders' }, { value: 'ws', label: 'working set' }]} onChange={upd('mode')} />
        {s.mode === 'manual' ? <>
          <Slider label="L1 hit rate" value={s.l1hit} min={0} max={1} step={0.001} format={pct} onChange={upd('l1hit')} />
          <Slider label="L2 local hit rate" value={s.l2hit} min={0} max={1} step={0.001} format={pct} onChange={upd('l2hit')} />
          <Slider label="L3 local hit rate" value={s.l3hit} min={0} max={1} step={0.001} format={pct} onChange={upd('l3hit')} />
        </> : <>
          <Slider label="Working set" value={s.ws} min={1e3} max={1e9} log format={bytes} onChange={upd('ws')} />
          <Slider label="L1 size" value={s.c1} min={4e3} max={256e3} log format={bytes} onChange={upd('c1')} />
          <Slider label="L2 size" value={s.c2} min={64e3} max={4e6} log format={bytes} onChange={upd('c2')} />
          <Slider label="L3 size" value={s.c3} min={1e6} max={64e6} log format={bytes} onChange={upd('c3')} />
          <Note>Uniform random access: global hit fraction through level i is min(1, C<sub>i</sub>/W). Local hit rates are derived: {pct(eff.l1hit)} / {pct(eff.l2hit)} / {pct(eff.l3hit)}.</Note>
        </>}
        <Slider label="L1 latency" value={s.l1} min={1} max={10} step={1} format={v => `${v} cyc`} onChange={upd('l1')} />
        <Slider label="L2 latency" value={s.l2} min={2} max={40} step={1} format={v => `${v} cyc`} onChange={upd('l2')} />
        <Slider label="L3 latency" value={s.l3} min={0} max={120} step={1} format={v => `${v} cyc`} onChange={upd('l3')} />
        <Slider label="DRAM latency" value={s.dram} min={0} max={600} step={5} format={v => `${v} cyc`} onChange={upd('dram')} />
        <Slider label="Loads per instruction" value={s.loads} min={0} max={0.6} step={0.01} format={v => v.toFixed(2)} onChange={upd('loads')} />
        <Slider label="TLB miss rate" value={s.tlbMiss} min={0} max={0.05} step={0.0005} format={v => pct(v)} onChange={upd('tlbMiss')} />
        <Slider label="TLB miss penalty" value={s.tlbPen} min={5} max={200} step={5} format={v => `${v} cyc`} onChange={upd('tlbPen')} />
        <Note>Latencies and sizes are typical illustrative values, not any specific CPU. Local hit rate = hits at that level / accesses reaching it.</Note>
      </>}>
      <div style={{ fontSize: 12, fontWeight: 700, margin: '2px 0 4px' }}>Where the time goes (cycles per access)</div>
      <Bar items={LV.filter(l => l.k !== 'tlb' || r.time.tlb > 0).map(l => ({ name: l.name, c: l.c, v: r.time[l.k as 'l1'] }))} total={A} unit={v => `${v.toFixed(2)} cyc`} />
      <div style={{ fontSize: 12, fontWeight: 700, margin: '12px 0 4px' }}>Where the accesses are served</div>
      <Bar items={LV.filter(l => l.k !== 'tlb').map(l => ({ name: l.name, c: l.c, v: r.served[l.k as 'l1'] }))} total={1} unit={v => pct(v)} />
      <Readouts>
        <Readout k="AMAT" v={`${A.toFixed(2)} cycles`} hl />
        <Readout k="Effective CPI" v={CPI.toFixed(2)} tone={slowdown > 2 ? 'bad' : slowdown > 1.3 ? 'warn' : 'ok'} />
        <Readout k="Slowdown vs ideal" v={`${slowdown.toFixed(2)}×`} />
        <Readout k="DRAM share of time" v={A > 0 ? pct(r.time.dram / A) : '0%'} tone={A > 0 && r.time.dram / A > 0.3 ? 'bad' : undefined} />
        <Readout k="Miss to DRAM" v={pct(r.served.dram)} />
        {s.tlbMiss > 0 && <Readout k="TLB term" v={`${r.time.tlb.toFixed(2)} cycles`} />}
        {!hasL3 && <Readout k="Note" v="L2 always hits (no L3/DRAM)" />}
      </Readouts>
      <EqBox>{nest}</EqBox>
      <EqBox>{String.raw`\text{CPI}_{eff} = \text{CPI}_{base} + f_{ld}\,(\text{AMAT} - t_1) = ${s.baseCpi} + ${s.loads.toFixed(2)}\,(${A.toFixed(2)} - ${s.l1}) = ${CPI.toFixed(2)}`}</EqBox>
      <Plot series={[{ x: sweep.x, y: sweep.y, label: 'AMAT vs working set', color: 'accent' }]} xLog xUnit="B" yUnit=" cyc" xLabel="Working-set size (bytes)" yLabel="AMAT" height={240}
        xTickFormat={bytes} yTickFormat={v => `${+v.toPrecision(3)}`}
        vlines={[{ at: s.c1, label: 'L1', color: 'green' }, { at: s.c2, label: 'L2', color: 'blue' }, { at: s.c3, label: 'L3', color: 'purple' }]}
        points={[{ x: s.ws, y: nowY, label: s.mode === 'ws' ? 'now' : 'W', color: 'orange' }]} />
      {s.mode === 'manual' && <Note>Switch "Hit rates come from" to <em>working set</em> to drive the bars with this sweep. The marker shows the working set slider's position.</Note>}
    </SimShell>
  );
}
