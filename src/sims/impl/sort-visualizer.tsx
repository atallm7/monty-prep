// Algorithm visualizer: animated bars driven by the event stream of the real algorithm (see models/sort-visualizer.ts).
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Select, Seg, Readout, Readouts, EqBox, Note } from '../kit';
import Plot from '../../components/Plot';
import { ALGOS, Algo, InputKind, isSearch, makeInput, sortEvents, searchEvents, replay, isSorted, measureSort, measureSearch } from '../models/sort-visualizer';

const THEORY: Record<Algo, { best: string; avg: string; worst: string; tex: (n: number) => string }> = {
  bubble: { best: 'O(n)', avg: 'O(n²)', worst: 'O(n²)', tex: n => String.raw`\text{worst: } \tfrac{n(n-1)}{2} = ${n * (n - 1) / 2}\ \text{comparisons}` },
  insertion: { best: 'O(n)', avg: 'O(n²)', worst: 'O(n²)', tex: n => String.raw`\text{worst: } \tfrac{n(n-1)}{2} = ${n * (n - 1) / 2}\ \text{comparisons},\ \text{best: } n-1 = ${n - 1}` },
  merge: { best: 'O(n log n)', avg: 'O(n log n)', worst: 'O(n log n)', tex: n => String.raw`\le n\lceil\log_2 n\rceil = ${n * Math.ceil(Math.log2(n))}\ \text{comparisons}` },
  quick: { best: 'O(n log n)', avg: 'O(n log n)', worst: 'O(n²)', tex: n => String.raw`\text{worst (sorted, last pivot): } \tfrac{n(n-1)}{2} = ${n * (n - 1) / 2}` },
  'binary-search': { best: 'O(1)', avg: 'O(log n)', worst: 'O(log n)', tex: n => String.raw`\le \lfloor\log_2 n\rfloor + 1 = ${Math.floor(Math.log2(n)) + 1}\ \text{probes}` },
  'linear-search': { best: 'O(1)', avg: 'O(n)', worst: 'O(n)', tex: n => String.raw`\text{avg} \approx \tfrac{n+1}{2} = ${(n + 1) / 2},\ \text{worst: } n = ${n}` },
};
const NS = [4, 8, 16, 32, 64, 128, 256, 512];
const ALGO_IDS = ALGOS.map(a => a.value);

export default function SortVisualizer({ params }: SimProps) {
  const init = {
    algo: (ALGO_IDS.includes(params.algo) ? params.algo : 'insertion') as Algo,
    n: Math.max(4, Math.min(100, Math.round(Number(params.n ?? 24)) || 24)),
    input: (['random', 'sorted', 'reversed', 'nearly'].includes(params.input) ? params.input : 'random') as InputKind,
  };
  const [algo, setAlgo] = useState<Algo>(init.algo);
  const [n, setN] = useState(init.n);
  const [input, setInput] = useState<InputKind>(init.input);
  const [seed, setSeed] = useState(1);
  const [speed, setSpeed] = useState(30); // events per second
  const [target, setTarget] = useState(Math.round(init.n * 0.7));
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const search = isSearch(algo);

  // search: binary needs sorted data; linear works on the chosen order
  const data = useMemo(() => (algo === 'binary-search' ? makeInput('sorted', n) : makeInput(input, n, seed)), [algo, n, input, seed]);
  const tgt = Math.min(target, n + 1);
  const evs = useMemo(() => (search ? searchEvents(algo, data, tgt) : sortEvents(algo, data)), [algo, data, tgt, search]);
  const total = evs.length;
  const st = useMemo(() => replay(data, evs, idx), [data, evs, idx]);
  const done = idx >= total;

  // reset the animation whenever the problem changes
  const pos = useRef(0); const spd = useRef(speed); spd.current = speed;
  useEffect(() => { pos.current = 0; setIdx(0); setPlaying(false); }, [algo, n, input, seed, tgt]);

  // animation loop
  useEffect(() => { pos.current = idx; }, [idx]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = -1;
    const tick = (now: number) => {
      pos.current = Math.min(total, pos.current + (last < 0 ? 0 : Math.max(0, now - last)) / 1000 * spd.current); last = now;
      setIdx(Math.floor(pos.current));
      if (pos.current >= total) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  const play = () => { if (done) { pos.current = 0; setIdx(0); } setPlaying(p => !p); };
  const step = (d: number) => { setPlaying(false); setIdx(i => Math.max(0, Math.min(total, i + d))); };

  const chart = useMemo(() => {
    if (search) {
      const lin = NS.map(m => measureSearch('linear-search', m).avg), bin = NS.map(m => measureSearch('binary-search', m).avg);
      return { sorted: false, series: [
        { x: NS, y: lin, label: 'linear search (avg)', color: 'orange', points: true }, { x: NS, y: bin, label: 'binary search (avg)', color: 'accent', points: true },
        { x: NS, y: NS.map(m => m), label: 'n', color: 'muted', dashed: true }, { x: NS, y: NS.map(m => Math.log2(m)), label: 'log₂ n', color: 'green', dashed: true },
      ] };
    }
    const ms = NS.map(m => measureSort(algo, input, m, seed));
    return { sorted: ms.every(m => m.sorted), series: [
      { x: NS, y: ms.map(m => m.cmp), label: 'measured comparisons', color: 'accent', points: true },
      { x: NS, y: ms.map(m => m.total), label: 'comparisons + moves', color: 'red', points: true },
      { x: NS, y: NS.map(m => m), label: 'n', color: 'muted', dashed: true },
      { x: NS, y: NS.map(m => m * Math.log2(m)), label: 'n log₂ n', color: 'green', dashed: true },
      { x: NS, y: NS.map(m => m * m), label: 'n²', color: 'purple', dashed: true },
    ] };
  }, [algo, input, seed, search]);

  const here = useMemo(() => {
    if (search) { const e = replay(data, evs, Infinity); return { c: e.cmp, t: e.cmp }; }
    const m = measureSort(algo, input, n, seed); return { c: m.cmp, t: m.total };
  }, [algo, input, n, seed, search, data, evs]);

  // ---- drawing ----
  const W = 600, H = 210, bw = W / n;
  const last = st.last;
  const cmpIdx = last && last.t === 'cmp' ? [last.i, last.j] : last && last.t === 'swap' ? [last.i, last.j] : last && last.t === 'set' ? [last.i] : [];
  const moveKind = last ? last.t : '';
  const finalSorted = !search && done && isSorted(st.arr);
  const color = (i: number) => {
    if (search) {
      if (st.found === i) return 'var(--d-green)';
      if (last && last.t === 'cmp' && last.i === i) return 'var(--d-orange)';
      return 'var(--d-blue)';
    }
    if (finalSorted) return 'var(--d-green)';
    if (cmpIdx.includes(i)) return moveKind === 'cmp' ? 'var(--d-orange)' : 'var(--d-red)';
    return 'var(--d-blue)';
  };
  const opacity = (i: number) => (search && algo === 'binary-search' && (i < st.lo || i > st.hi) ? 0.18 : 1);
  const reset = () => { setAlgo(init.algo); setN(init.n); setInput(init.input); setSeed(1); setSpeed(30); setTarget(Math.round(init.n * 0.7)); setIdx(0); setPlaying(false); };
  const th = THEORY[algo];
  const maxV = n + (search ? 1 : 0);

  return (
    <SimShell title="Algorithm visualizer & Big-O" onReset={reset} badge="Interactive"
      tryThis={<>pick <b>Insertion sort</b>, then compare <b>sorted</b> against <b>reversed</b> input: comparisons jump from n−1 to n(n−1)/2. Then switch to <b>Quick sort</b> on sorted input (last-element pivot) and watch it go quadratic while merge sort stays at n log n. Raise n and read the chart: measured points sit on the n log n or n² curve.</>}
      controls={<>
        <Slider label="Array size n" value={n} min={4} max={100} step={1} format={v => String(Math.round(v))} onChange={v => setN(Math.round(v))} />
        {(!search || algo === 'linear-search') && <Seg label="Input order" value={input} options={[{ value: 'random', label: 'Random' }, { value: 'sorted', label: 'Sorted' }, { value: 'reversed', label: 'Reversed' }, { value: 'nearly', label: 'Nearly' }]} onChange={setInput} />}
        {search && <Slider label={algo === 'binary-search' ? 'Target value (n+1 = absent)' : 'Target value (n+1 = absent)'} value={tgt} min={1} max={n + 1} step={1} format={v => String(Math.round(v))} onChange={v => setTarget(Math.round(v))} />}
        <Slider label="Speed (steps/s)" value={speed} min={1} max={1000} log format={v => `${Math.round(v)}/s`} onChange={setSpeed} />
        <button className="btn btn-sm" onClick={() => setSeed(s => s + 1)}>New random data</button>
        <Note>Counts come straight from the algorithm's own comparison/swap/write events, not a formula. Binary search always runs on sorted data. Quick sort uses the Lomuto partition with the last element as pivot.</Note>
      </>}>
      <Select label="Algorithm" value={algo} options={ALGOS} onChange={setAlgo} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        <button className="btn btn-sm" onClick={() => step(-1)} aria-label="Step back" disabled={idx === 0}>◀ Step</button>
        <button className="btn btn-sm btn-primary" onClick={play} style={{ minWidth: 84 }}>{playing ? '❚❚ Pause' : done ? '↻ Replay' : '▶ Play'}</button>
        <button className="btn btn-sm" onClick={() => step(1)} aria-label="Step forward" disabled={done}>Step ▶</button>
        <button className="btn btn-sm btn-ghost" onClick={() => { setPlaying(false); setIdx(total); }} disabled={done}>⏭ Finish</button>
        <button className="btn btn-sm btn-ghost" onClick={() => { setPlaying(false); setIdx(0); }} disabled={idx === 0}>⏮ Restart</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H + (search ? 20 : 0)}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${algo} on ${n} elements, step ${idx} of ${total}`}>
        {st.arr.map((v, i) => { const h = Math.max(3, v / maxV * (H - 20)); return <g key={i} opacity={opacity(i)}>
          <rect x={i * bw + Math.min(1.2, bw * 0.1)} y={H - h} width={Math.max(1, bw - Math.min(2.4, bw * 0.2))} height={h} fill={color(i)} rx={Math.min(3, bw / 4)} />
          {n <= 24 && <text x={i * bw + bw / 2} y={H - h - 3} textAnchor="middle" fontSize={bw > 22 ? 11 : 9} fill="var(--d-ink)">{v}</text>}
        </g>; })}
        {search && <g>
          <line x1={0} x2={W} y1={H - Math.max(3, tgt / maxV * (H - 20))} y2={H - Math.max(3, tgt / maxV * (H - 20))} stroke="var(--d-red)" strokeDasharray="5 4" strokeWidth={1.5} />
          <text x={W - 2} y={Math.max(10, H - Math.max(3, tgt / maxV * (H - 20)) - 4)} textAnchor="end" fontSize={12} fill="var(--d-red)">target {tgt}{tgt > n ? ' (absent)' : ''}</text>
          <text x={0} y={H + 15} fontSize={12} fill="var(--d-muted)">{algo === 'binary-search' ? (st.hi < st.lo ? 'range empty' : `searching indices ${st.lo}…${st.hi}`) : `scanned ${st.cmp} of ${n}`}{st.found >= 0 ? `  ·  found at index ${st.found}` : done ? '  ·  not found' : ''}</text>
        </g>}
      </svg>
      <Readouts>
        <Readout k="Comparisons" v={st.cmp} hl />
        {!search && <Readout k="Swaps" v={st.swaps} />}
        {!search && <Readout k="Array writes" v={st.writes} />}
        <Readout k="Step" v={`${idx} / ${total}`} />
        <Readout k="Status" v={search ? (st.found >= 0 ? 'found' : done ? 'not found' : 'searching') : done ? (finalSorted ? 'sorted ✓' : 'done') : idx === 0 ? 'ready' : 'running'} tone={done ? 'ok' : undefined} />
      </Readouts>
      <div style={{ fontSize: 13, color: 'var(--text-2)', margin: '2px 0' }}>Best <b>{th.best}</b> · average <b>{th.avg}</b> · worst <b>{th.worst}</b></div>
      <EqBox>{th.tex(n)}</EqBox>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Full run on this input: <b>{here.c}</b> comparisons{search ? '' : <>, <b>{here.t}</b> total with moves</>}.</div>
      <Plot series={chart.series} xLog yLog xLabel="Array size n" yLabel="operations" height={260} xTickFormat={v => String(Math.round(v))}
        points={[{ x: n, y: Math.max(1, here.c), label: `n=${n}`, color: 'ink' }]} />
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{search ? 'Averages over every present target on sorted data.' : `Each point is a full run of the chosen algorithm on ${input} input of that size${chart.sorted ? '' : ' (WARNING: not sorted)'}. Dashed: reference curves.`}</div>
    </SimShell>
  );
}
