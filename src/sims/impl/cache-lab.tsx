// Cache simulator: address breakdown, set-associative lookup with LRU/FIFO, 3C miss classification, AMAT.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge } from '../kit';
import Plot from '../../components/Plot';
import { simulate, makeTrace, fields, amat, TraceId, Repl } from '../models/cache-lab';

const hex = (v: number, d = 4) => '0x' + v.toString(16).toUpperCase().padStart(d, '0');
const P2 = (lo: number, hi: number) => { const o: number[] = []; for (let v = lo; v <= hi; v *= 2) o.push(v); return o; };
const KIND_COLOR = { compulsory: 'var(--d-blue)', capacity: 'var(--d-orange)', conflict: 'var(--d-red)' } as const;

function useRaf(on: boolean, period: number, tick: () => void) {
  const ref = useRef(tick); ref.current = tick;
  useEffect(() => {
    if (!on) return;
    let id = 0, last = performance.now(), acc = 0;
    const loop = (t: number) => { acc += t - last; last = t; if (acc >= period) { acc = 0; ref.current(); } id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id);
  }, [on, period]);
}

export default function CacheLab({ params }: SimProps) {
  const t0 = String(params.trace ?? 'sequential');
  const init = {
    lines: Number(params.lines ?? 8), ways: Number(params.ways ?? 1), block: Number(params.block ?? 16),
    trace: (['sequential', 'stride', 'conflict', 'custom'].includes(t0) ? t0 : 'sequential') as TraceId,
    repl: 'lru' as Repl, arrayBytes: 128, stride: 32, count: 16, custom: '0x0000 0x0004 0x0080 0x0000 0x0100 0x0084 0x0008 0x0180',
    tHit: 1, penalty: 100,
  };
  const [s, set] = useState(init);
  const [step, setStep] = useState(0);
  const [play, setPlay] = useState(false);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(q => ({ ...q, [k]: v }));
  const cfg = { lines: s.lines, ways: s.ways, block: s.block, repl: s.repl };
  const f = fields(cfg);

  const trace = useMemo(() => makeTrace(s.trace, cfg, { arrayBytes: s.arrayBytes, stride: s.stride, count: s.count, custom: s.custom }), [s.trace, s.lines, s.ways, s.block, s.arrayBytes, s.stride, s.count, s.custom]);
  const r = useMemo(() => simulate(cfg, trace), [trace, s.lines, s.ways, s.block, s.repl]);
  const N = r.accesses.length;
  const i = Math.min(step, Math.max(0, N - 1));
  const a = r.accesses[i];
  useRaf(play, 500, () => setStep(k => (k >= N - 1 ? 0 : k + 1)));
  const am = amat(s.tHit, r.missRate, s.penalty);

  // hit rate vs associativity at constant capacity (same trace)
  const assoc = useMemo(() => {
    const ws = P2(1, f.lines);
    return { x: ws, y: ws.map(w => simulate({ lines: f.lines, ways: w, block: f.block, repl: s.repl }, makeTrace(s.trace, { lines: f.lines, ways: w, block: f.block }, { arrayBytes: s.arrayBytes, stride: s.stride, count: s.count, custom: s.custom })).hitRate * 100) };
  }, [f.lines, f.block, s.repl, s.trace, s.arrayBytes, s.stride, s.count, s.custom]);
  const cum = useMemo(() => { let h = 0; return r.accesses.map((x, k) => { if (x.hit) h++; return (h / (k + 1)) * 100; }); }, [r]);

  // address bits
  const bits = a ? a.addr.toString(2).padStart(f.addrBits, '0').split('') : [];
  const fieldOf = (b: number) => (b < f.tagBits ? 'tag' : b < f.tagBits + f.indexBits ? 'index' : 'offset');
  const FC = { tag: 'var(--d-purple)', index: 'var(--d-blue)', offset: 'var(--d-green)' } as const;

  // window of sets to show
  const maxRows = 16; const s0 = a ? Math.max(0, Math.min(f.sets - maxRows, a.index - maxRows / 2)) : 0;
  const shownSets = Array.from({ length: Math.min(maxRows, f.sets) }, (_, k) => s0 + k);
  const snap = a?.snapshot;
  const rank = (setIdx: number, w: number) => { // LRU rank (0 = MRU) or FIFO age rank
    if (!snap) return 0; const row = snap[setIdx]; const key = (x: typeof row[number]) => (s.repl === 'lru' ? x.lastUse : x.filled);
    return row.filter(x => x.valid && key(x) > key(row[w])).length;
  };

  const lineOpts = P2(1, 64).map(v => ({ value: String(v), label: String(v) }));
  const wayOpts = P2(1, f.lines).map(v => ({ value: String(v), label: v === f.lines ? `${v} (fully assoc.)` : v === 1 ? '1 (direct-mapped)' : `${v}-way` }));
  const blockOpts = P2(4, 64).map(v => ({ value: String(v), label: `${v} B` }));
  const stripW = Math.max(8, Math.min(18, 720 / Math.max(1, N)));

  return (
    <SimShell title="Cache simulator" layout="stacked" onReset={() => { set(init); setStep(0); setPlay(false); }}
      tryThis={<>pick the <b>conflict</b> trace: arrays A and B sit exactly one cache-size apart, so in a direct-mapped cache every access evicts the other array (0% hits, all conflict misses). Switch to <b>2-way</b> without changing capacity and the hit rate jumps to 75%. Then try <b>sequential</b> with a 256 B array: pass 2 turns into capacity misses.</>}
      controls={<>
        <Seg label="Address trace" value={s.trace} options={[{ value: 'sequential', label: 'Sequential' }, { value: 'stride', label: 'Stride' }, { value: 'conflict', label: 'Conflict' }, { value: 'custom', label: 'Custom' }]} onChange={v => { set(q => ({ ...q, trace: v })); setStep(0); }} />
        <Select label="Total lines (blocks)" value={String(f.lines)} options={lineOpts} onChange={v => { set(q => ({ ...q, lines: Number(v), ways: Math.min(q.ways, Number(v)) })); setStep(0); }} />
        <Select label="Associativity (ways)" value={String(f.ways)} options={wayOpts} onChange={v => { set(q => ({ ...q, ways: Number(v) })); setStep(0); }} />
        <Select label="Block size" value={String(f.block)} options={blockOpts} onChange={v => { set(q => ({ ...q, block: Number(v) })); setStep(0); }} />
        <Seg label="Replacement" value={s.repl} options={[{ value: 'lru', label: 'LRU' }, { value: 'fifo', label: 'FIFO' }]} onChange={upd('repl')} />
        {s.trace === 'sequential' && <Slider label="Array size (2 passes)" value={s.arrayBytes} min={32} max={1024} step={32} format={v => `${v} B`} onChange={upd('arrayBytes')} />}
        {s.trace === 'stride' && <Slider label="Stride" value={s.stride} min={4} max={256} step={4} format={v => `${v} B`} onChange={upd('stride')} />}
        {(s.trace === 'stride' || s.trace === 'conflict') && <Slider label="Elements" value={s.count} min={2} max={32} step={1} format={v => String(v)} onChange={upd('count')} />}
        {s.trace === 'custom' && <label className="ctl"><span className="ctl-head"><span className="ctl-label">Addresses (hex 0x.. or decimal)</span></span>
          <textarea className="input" rows={3} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: 6 }} value={s.custom} onChange={e => set(q => ({ ...q, custom: e.target.value }))} aria-label="Custom address trace" /></label>}
        <Slider label="Hit time" value={s.tHit} min={1} max={10} step={1} format={v => `${v} cyc`} onChange={upd('tHit')} />
        <Slider label="Miss penalty" value={s.penalty} min={5} max={300} step={5} format={v => `${v} cyc`} onChange={upd('penalty')} />
        <Note>{f.addrBits}-bit byte addresses, 4-byte word accesses. Capacity = lines × block = {f.size} B.</Note>
      </>}>
      {N === 0 || !a ? <Note>The trace is empty. Enter some addresses.</Note> : <>
        {/* address breakdown */}
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, fontFamily: 'var(--font-mono)', fontSize: 13 }} aria-label="Address bits">
            {bits.map((b, k) => <span key={k} style={{ width: 20, textAlign: 'center', padding: '3px 0', borderRadius: 4, background: `color-mix(in srgb, ${FC[fieldOf(k)]} 18%, transparent)`, color: FC[fieldOf(k)], fontWeight: 600, marginLeft: k && fieldOf(k) !== fieldOf(k - 1) ? 6 : 0 }}>{b}</span>)}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 6, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>access #{i}: <b style={{ fontFamily: 'var(--font-mono)' }}>{hex(a.addr)}</b></span>
            <span style={{ color: FC.tag }}>tag ({f.tagBits} b) = {hex(a.tag, 1)}</span>
            <span style={{ color: FC.index }}>index ({f.indexBits} b) = {a.index}</span>
            <span style={{ color: FC.offset }}>offset ({f.offsetBits} b) = {a.offset}</span>
            {a.hit ? <RegionBadge label={`HIT (way ${a.way})`} color="ok" /> : <RegionBadge label={`MISS · ${a.kind}${a.evicted ? ` · evicts block ${hex(a.evicted.blockAddr)}` : ''}`} color="bad" />}
          </div>
        </div>
        {/* trace strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }} aria-label="Access trace">
          {r.accesses.map((x, k) => (
            <button key={k} type="button" title={`#${k} ${hex(x.addr)} ${x.hit ? 'hit' : 'miss (' + x.kind + ')'}`} aria-label={`access ${k} ${x.hit ? 'hit' : 'miss'}`}
              onClick={() => { setPlay(false); setStep(k); }}
              style={{ width: stripW, height: 18, padding: 0, border: k === i ? '2px solid var(--d-ink)' : '1px solid transparent', borderRadius: 3, cursor: 'pointer', background: x.hit ? 'color-mix(in srgb, var(--d-green) 35%, transparent)' : KIND_COLOR[x.kind!], opacity: k > i ? 0.35 : 1 }} />))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setStep(k => Math.max(0, k - 1))}>◀ Step</button>
          <button className="btn btn-sm" onClick={() => setPlay(v => !v)}>{play ? '❚❚ Pause' : '▶ Play'}</button>
          <button className="btn btn-sm" onClick={() => setStep(k => Math.min(N - 1, k + 1))}>Step ▶</button>
          <div style={{ flex: '1 1 180px' }}><Slider label="Access" value={i} min={0} max={Math.max(1, N - 1)} step={1} format={v => `#${v} of ${N}`} onChange={v => { setPlay(false); setStep(Math.round(v)); }} /></div>
          <span style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'color-mix(in srgb, var(--d-green) 35%, transparent)' }} /> hit</span>
            {(['compulsory', 'capacity', 'conflict'] as const).map(k => <span key={k}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: KIND_COLOR[k] }} /> {k}</span>)}
          </span>
        </div>
        {/* cache contents after this access */}
        <div style={{ overflowX: 'auto' }}>
          <table className="cat-table" style={{ marginTop: 0, fontSize: 12.5, fontFamily: 'var(--font-mono)' }}>
            <thead><tr><th>Set</th>{Array.from({ length: f.ways }, (_, w) => <th key={w}>Way {w}: V · tag · {s.repl === 'lru' ? 'LRU' : 'age'}</th>)}</tr></thead>
            <tbody>
              {shownSets.map(si_ => (
                <tr key={si_} style={{ background: si_ === a.index ? 'var(--accent-soft)' : undefined }}>
                  <td style={{ padding: '4px 8px' }}>{si_}</td>
                  {snap![si_].map((w, k) => {
                    const cur = si_ === a.index && k === a.way;
                    return <td key={k} style={{ padding: '4px 8px', color: !w.valid ? 'var(--text-3)' : undefined, fontWeight: cur ? 700 : 400, outline: cur ? `2px solid ${a.hit ? 'var(--ok)' : 'var(--bad)'}` : undefined, outlineOffset: -2 }}>
                      {w.valid ? <>1 · {hex(w.tag, 1)} · {rank(si_, k)}<span style={{ color: 'var(--text-3)' }}> [{hex((w.tag * f.sets + si_) * f.block)}]</span></> : '0 · — · —'}
                    </td>;
                  })}
                </tr>))}
            </tbody>
          </table>
          {f.sets > maxRows && <Note>Showing sets {s0}–{s0 + maxRows - 1} of {f.sets} (window follows the current access).</Note>}
        </div>
        <Readouts>
          <Readout k="Hits / misses" v={`${r.hits} / ${r.misses}`} />
          <Readout k="Hit rate" v={(r.hitRate * 100).toFixed(1) + '%'} hl tone={r.hitRate > 0.85 ? 'ok' : r.hitRate > 0.5 ? 'warn' : 'bad'} />
          <Readout k="Compulsory" v={r.kinds.compulsory} />
          <Readout k="Capacity" v={r.kinds.capacity} tone={r.kinds.capacity ? 'warn' : undefined} />
          <Readout k="Conflict" v={r.kinds.conflict} tone={r.kinds.conflict ? 'bad' : undefined} />
          <Readout k="AMAT" v={`${am.toFixed(2)} cyc`} hl />
          <Readout k="Sets × ways" v={`${f.sets} × ${f.ways}`} />
          <Readout k="Tag / index / offset" v={`${f.tagBits} / ${f.indexBits} / ${f.offsetBits}`} />
        </Readouts>
        <EqBox>{String.raw`\begin{gathered}\text{index} = \left\lfloor \frac{A}{B} \right\rfloor \bmod S = \left\lfloor \frac{${a.addr}}{${f.block}} \right\rfloor \bmod ${f.sets} = ${a.index} \\ \text{tag} = \left\lfloor \frac{A}{B\,S} \right\rfloor = ${a.tag} \\ \text{AMAT} = t_{hit} + m\cdot t_{miss} = ${s.tHit} + ${r.missRate.toFixed(3)}\cdot ${s.penalty} = ${am.toFixed(2)}\ \text{cycles}\end{gathered}`}</EqBox>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Plot height={210} xLabel="Access #" yLabel="Cumulative hit rate" yUnit="%" yRange={[0, 100]}
            series={[{ x: cum.map((_, k) => k), y: cum, label: 'hit rate', color: 'accent' }]} vlines={[{ at: i, label: `#${i}`, color: 'muted' }]} />
          <Plot height={210} xLabel="Ways (same capacity)" yLabel="Hit rate" yUnit="%" yRange={[0, 100]} xRange={[0, Math.max(1, Math.log2(f.lines))]}
            xTickFormat={v => (Math.abs(v - Math.round(v)) < 1e-6 ? String(2 ** Math.round(v)) : '')}
            series={[{ x: assoc.x.map(Math.log2), y: assoc.y, label: 'hit rate vs associativity', color: 'green', points: true }]}
            points={[{ x: Math.log2(f.ways), y: r.hitRate * 100, label: 'now' }]} />
        </div>
      </>}
    </SimShell>
  );
}
