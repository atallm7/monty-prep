// Branch prediction: static, 1-bit, 2-bit saturating counter and local-history predictors on an outcome stream.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge } from '../kit';
import Plot from '../../components/Plot';
import { makePattern, run, windowAccuracy, branchCPI, PredId, PRED_NAMES, STATE_NAMES, PatternId } from '../models/branch-predictor';

const PREDS: PredId[] = ['at', 'ant', 'one', 'two', 'local'];
const COLORS: Record<PredId, string> = { at: 'orange', ant: 'blue', one: 'red', two: 'accent', local: 'green' };
const PATS: { value: PatternId; label: string }[] = [{ value: 'loop', label: 'Loop' }, { value: 'alternating', label: 'Alternating' }, { value: 'random', label: 'Random' }, { value: 'custom', label: 'Custom' }];

function useRaf(on: boolean, period: number, tick: () => void) {
  const ref = useRef(tick); ref.current = tick;
  useEffect(() => {
    if (!on) return;
    let id = 0, last = performance.now(), acc = 0;
    const loop = (t: number) => { acc += t - last; last = t; if (acc >= period) { acc = 0; ref.current(); } id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id);
  }, [on, period]);
}

/** 2-bit saturating counter state diagram, highlighting the transition taken at the current step. */
function Fsm({ state, next, outcome }: { state: number; next: number; outcome: boolean }) {
  const cx = (i: number) => 70 + i * 120, cy = 62, r = 27;
  const arc = (a: number, b: number, up: boolean) => {
    const x0 = cx(a) + (b > a ? 1 : -1) * r * 0.8, x1 = cx(b) - (b > a ? 1 : -1) * r * 0.8; const dy = up ? -1 : 1;
    return `M${x0},${cy + dy * 14} Q${(x0 + x1) / 2},${cy + dy * 46} ${x1},${cy + dy * 14}`;
  };
  const act = (a: number, b: number) => state === a && next === b;
  const edge = (d: string, on: boolean, key: string, label: string, lx: number, ly: number) => (
    <g key={key}><path d={d} markerEnd={on ? 'url(#bp-a2)' : 'url(#bp-a)'} style={{ fill: 'none', stroke: on ? 'var(--d-accent)' : 'var(--d-muted)', strokeWidth: on ? 2.6 : 1.3 }} />
      <text x={lx} y={ly} textAnchor="middle" fontSize={11} style={{ fill: on ? 'var(--d-accent)' : 'var(--d-muted)', fontWeight: on ? 700 : 400 }}>{label}</text></g>);
  const edges = [];
  for (let i = 0; i < 3; i++) {
    edges.push(edge(arc(i, i + 1, true), act(i, i + 1) && outcome, `t${i}`, 'T', (cx(i) + cx(i + 1)) / 2, cy - 34));
    edges.push(edge(arc(i + 1, i, false), act(i + 1, i) && !outcome, `n${i}`, 'N', (cx(i) + cx(i + 1)) / 2, cy + 44));
  }
  // saturating self-loops
  const self = (i: number, on: boolean, lbl: string, left: boolean) => {
    const x = cx(i) + (left ? -r : r) * 0.7, y = cy - r * 0.7, s = left ? -1 : 1;
    return edge(`M${x},${y} C${x + s * 34},${y - 34} ${x + s * 44},${cy + 10} ${cx(i) + s * r},${cy + 6}`, on, `s${i}`, lbl, cx(i) + s * 44, cy - 26);
  };
  edges.push(self(0, state === 0 && next === 0 && !outcome, 'N', true), self(3, state === 3 && next === 3 && outcome, 'T', false));
  return (
    <svg viewBox="0 0 500 122" style={{ width: "100%", maxWidth: 560, display: 'block', margin: '0 auto', fontFamily: 'Inter, sans-serif' }} role="img" aria-label="2-bit counter state diagram">
      <defs>
        <marker id="bp-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--d-muted)' }} /></marker>
        <marker id="bp-a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--d-accent)' }} /></marker>
      </defs>
      {edges}
      {STATE_NAMES.map((n, i) => (
        <g key={n}>
          <circle cx={cx(i)} cy={cy} r={r} style={{ fill: i === state ? 'var(--d-accent)' : 'var(--d-box)', fillOpacity: i === state ? 0.22 : 1, stroke: i >= 2 ? 'var(--d-orange)' : 'var(--d-blue)', strokeWidth: i === state ? 3 : 1.5, strokeDasharray: i === next && i !== state ? '4 3' : undefined }} />
          <text x={cx(i)} y={cy - 2} textAnchor="middle" fontSize={13} style={{ fill: 'var(--d-ink)', fontWeight: 700 }}>{n}</text>
          <text x={cx(i)} y={cy + 13} textAnchor="middle" fontSize={10} style={{ fill: 'var(--d-muted)' }}>{i.toString(2).padStart(2, '0')} → {i >= 2 ? 'T' : 'N'}</text>
        </g>))}
    </svg>
  );
}

export default function BranchPredictor({ params }: SimProps) {
  const p0 = String(params.pattern ?? 'loop');
  const init = {
    pattern: (['loop', 'alternating', 'random', 'custom'].includes(p0) ? p0 : 'loop') as PatternId,
    n: Number(params.n ?? 10), reps: Number(params.reps ?? 4), len: Number(params.len ?? 40), p: Number(params.p ?? 0.5), seed: 1,
    custom: String(params.custom ?? 'TTNTN'), init2: 2, histBits: 2, penalty: 3, bfrac: 0.2,
  };
  const [s, set] = useState(init);
  const [step, setStep] = useState(0);
  const [play, setPlay] = useState(false);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(q => ({ ...q, [k]: v }));

  const seq = useMemo(() => makePattern(s.pattern, { n: s.n, reps: s.reps, len: s.len, p: s.p, seed: s.seed, custom: s.custom }), [s.pattern, s.n, s.reps, s.len, s.p, s.seed, s.custom]);
  const runs = useMemo(() => PREDS.map(id => run(id, seq, { init2: s.init2, init1: true, histBits: s.histBits })), [seq, s.init2, s.histBits]);
  const R = Object.fromEntries(runs.map(r => [r.id, r])) as Record<PredId, (typeof runs)[number]>;
  const N = seq.length;
  const i = Math.min(step, Math.max(0, N - 1));
  useRaf(play, 450, () => setStep(k => (k >= N - 1 ? 0 : k + 1)));
  const period = s.pattern === 'loop' ? Math.max(1, Math.round(s.n)) : s.pattern === 'alternating' ? 2 : s.pattern === 'custom' ? Math.max(1, seq.length / Math.max(1, s.reps)) : 0;
  const warm = period ? Math.min(N - 1, period * Math.max(1, Math.ceil(8 / period))) : Math.min(N - 1, 10);
  const best = runs.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
  const two = R.two;

  // strip diagram
  const LW = 112, cw = N <= 40 ? 18 : Math.max(6, 720 / N), rh = 20;
  const W = LW + N * cw + 4, rowsY = (k: number) => 18 + k * (rh + 3);
  const showTxt = cw >= 14;
  const strip = (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${rowsY(6) + 2}`} style={{ width: '100%', maxWidth: W * 1.25, minWidth: Math.min(W, 560), display: 'block', fontFamily: 'Inter, sans-serif' }} role="img" aria-label="Outcome and prediction strip">
        <rect x={LW + i * cw} y={0} width={cw} height={rowsY(6)} rx={3} style={{ fill: 'var(--d-accent)', fillOpacity: 0.14 }} />
        {seq.map((_, k) => (k % 5 === 0 && (showTxt || k % 10 === 0)) ? <text key={k} x={LW + k * cw + cw / 2} y={11} fontSize={9} textAnchor="middle" style={{ fill: 'var(--d-muted)' }}>{k}</text> : null)}
        <text x={4} y={rowsY(0) + 14} fontSize={11.5} style={{ fill: 'var(--d-ink)', fontWeight: 700 }}>Actual outcome</text>
        {seq.map((t, k) => (
          <g key={k} role="button" tabIndex={-1} style={{ cursor: 'pointer' }} onClick={() => { setPlay(false); setStep(k); }}>
            <rect x={LW + k * cw + 1} y={rowsY(0) + 1} width={cw - 2} height={rh - 2} rx={3} style={{ fill: t ? 'var(--d-orange)' : 'var(--d-blue)', fillOpacity: 0.85 }} />
            {showTxt && <text x={LW + k * cw + cw / 2} y={rowsY(0) + 14} fontSize={10.5} textAnchor="middle" style={{ fill: 'var(--d-bg)', fontWeight: 700 }}>{t ? 'T' : 'N'}</text>}
          </g>))}
        {PREDS.map((id, r) => (
          <g key={id}>
            <text x={4} y={rowsY(r + 1) + 14} fontSize={11} style={{ fill: 'var(--d-ink)' }}>{PRED_NAMES[id]}</text>
            {R[id].pred.map((p, k) => (
              <g key={k}>
                <rect x={LW + k * cw + 1} y={rowsY(r + 1) + 1} width={cw - 2} height={rh - 2} rx={3}
                  style={{ fill: R[id].correct[k] ? 'var(--d-green)' : 'var(--d-red)', fillOpacity: R[id].correct[k] ? 0.18 : 0.75 }} />
                {showTxt && <text x={LW + k * cw + cw / 2} y={rowsY(r + 1) + 14} fontSize={10} textAnchor="middle" style={{ fill: R[id].correct[k] ? 'var(--d-ink)' : 'var(--d-bg)', fontWeight: 600 }}>{p ? 'T' : 'N'}</text>}
              </g>))}
          </g>))}
      </svg>
    </div>
  );

  const xs = seq.map((_, k) => k + 1);
  const t = seq[i] ?? true;
  const cpiTwo = branchCPI(1, s.bfrac, 1 - two.accuracy, s.penalty);

  return (
    <SimShell title="Branch prediction" layout="stacked" onReset={() => { set(init); setStep(0); setPlay(false); }}
      tryThis={<>on <b>Loop</b> with n = 10, compare 1-bit (two misses per loop: the exit and the re-entry, 80% steady state) with the 2-bit counter (one miss, 90%). Then pick <b>Alternating</b> and set the 2-bit initial state to WNT: it is wrong every time (0%), while the local-history predictor learns the pattern perfectly after a few branches.</>}
      controls={<>
        <Seg label="Outcome pattern" value={s.pattern} options={PATS} onChange={v => { set(q => ({ ...q, pattern: v })); setStep(0); }} />
        {s.pattern === 'loop' && <><Slider label="Loop iterations n" value={s.n} min={2} max={20} step={1} format={v => String(v)} onChange={upd('n')} />
          <Slider label="Loop executions" value={s.reps} min={1} max={10} step={1} format={v => String(v)} onChange={upd('reps')} /></>}
        {(s.pattern === 'alternating' || s.pattern === 'random') && <Slider label="Branch count" value={s.len} min={8} max={120} step={1} format={v => String(v)} onChange={upd('len')} />}
        {s.pattern === 'random' && <><Slider label="P(taken)" value={s.p} min={0} max={1} step={0.05} format={v => v.toFixed(2)} onChange={upd('p')} />
          <button className="btn btn-sm" onClick={() => set(q => ({ ...q, seed: q.seed + 1 }))}>New random sequence (seed {s.seed})</button></>}
        {s.pattern === 'custom' && <><label className="ctl"><span className="ctl-head"><span className="ctl-label">Repeating unit (T/N)</span></span>
          <input className="input" style={{ height: 32, fontFamily: 'var(--font-mono)' }} value={s.custom} maxLength={24} onChange={e => set(q => ({ ...q, custom: e.target.value }))} aria-label="Custom pattern" /></label>
          <Slider label="Repetitions" value={s.reps} min={1} max={12} step={1} format={v => String(v)} onChange={upd('reps')} /></>}
        <Select label="2-bit initial state" value={String(s.init2)} options={STATE_NAMES.map((n, k) => ({ value: String(k), label: `${n} (${k.toString(2).padStart(2, '0')})` }))} onChange={v => set(q => ({ ...q, init2: Number(v) }))} />
        <Slider label="Local history bits k" value={s.histBits} min={1} max={4} step={1} format={v => `${v} → ${2 ** v} ctrs`} onChange={upd('histBits')} />
        <Slider label="Mispredict penalty" value={s.penalty} min={1} max={20} step={1} format={v => `${v} cycles`} onChange={upd('penalty')} />
        <Slider label="Branch fraction of instrs" value={s.bfrac} min={0.05} max={0.4} step={0.01} format={v => (v * 100).toFixed(0) + '%'} onChange={upd('bfrac')} />
        <Note>1-bit starts at "taken"; local-history counters start at the same state as the 2-bit counter with an all-N history.</Note>
      </>}>
      {N === 0 ? <Note>Enter a pattern using T and N.</Note> : <>
        {strip}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setStep(k => Math.max(0, k - 1))}>◀ Step</button>
          <button className="btn btn-sm" onClick={() => setPlay(v => !v)}>{play ? '❚❚ Pause' : '▶ Play'}</button>
          <button className="btn btn-sm" onClick={() => setStep(k => Math.min(N - 1, k + 1))}>Step ▶</button>
          <div style={{ flex: '1 1 180px' }}><Slider label={`Branch #${i}`} value={i} min={0} max={Math.max(1, N - 1)} step={1} format={() => `${t ? 'taken' : 'not taken'}`} onChange={v => { setPlay(false); setStep(Math.round(v)); }} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, alignItems: 'center' }}>
          <div>
            <Fsm state={two.state[i]} next={two.stateAfter[i]} outcome={t} />
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-2)' }}>
              2-bit at #{i}: state <b>{STATE_NAMES[two.state[i]]}</b> predicts <b>{two.pred[i] ? 'T' : 'N'}</b>, actual <b>{t ? 'T' : 'N'}</b> → {two.correct[i] ? <span style={{ color: 'var(--ok)' }}>correct</span> : <span style={{ color: 'var(--bad)' }}>mispredict</span>}, next state <b>{STATE_NAMES[two.stateAfter[i]]}</b>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
            <div>1-bit: last outcome = <b>{R.one.state[i] ? 'T' : 'N'}</b> → predicts {R.one.pred[i] ? 'T' : 'N'} {R.one.correct[i] ? '✓' : '✗'}</div>
            <div>Local: history <code>{(R.local.hist?.[i] ?? 0).toString(2).padStart(s.histBits, '0')}</code> (1 = T, newest right) selects counter {STATE_NAMES[R.local.state[i]]} → {R.local.pred[i] ? 'T' : 'N'} {R.local.correct[i] ? '✓' : '✗'}</div>
            <div>Static: always-T {R.at.correct[i] ? '✓' : '✗'}, always-N {R.ant.correct[i] ? '✓' : '✗'}</div>
            <div style={{ marginTop: 6 }}><RegionBadge label={`Best: ${PRED_NAMES[best.id]} ${(best.accuracy * 100).toFixed(1)}%`} color="ok" /></div>
          </div>
        </div>
        <Readouts>
          {PREDS.map(id => <Readout key={id} k={`${PRED_NAMES[id]} (${R[id].misses} miss)`} v={(R[id].accuracy * 100).toFixed(1) + '%'} hl={id === 'two'}
            tone={R[id].accuracy >= 0.9 ? 'ok' : R[id].accuracy >= 0.7 ? 'warn' : 'bad'} />)}
          <Readout k={`Steady-state (after #${warm}) 1-bit / 2-bit`} v={`${(windowAccuracy(R.one, warm) * 100).toFixed(0)}% / ${(windowAccuracy(two, warm) * 100).toFixed(0)}%`} />
          <Readout k="CPI with 2-bit" v={cpiTwo.toFixed(3)} />
        </Readouts>
        <EqBox>{String.raw`\begin{gathered}\text{CPI} = 1 + f_{br}\cdot m\cdot P = 1 + ${s.bfrac.toFixed(2)}\cdot ${(1 - two.accuracy).toFixed(3)}\cdot ${s.penalty} = ${cpiTwo.toFixed(3)}` + (s.pattern === 'loop' ? String.raw`\\ \text{loop: } \text{acc}_{2b} \to \tfrac{n-1}{n} = ${((s.n - 1) / s.n * 100).toFixed(0)}\%,\ \ \text{acc}_{1b} \to \tfrac{n-2}{n} = ${(Math.max(0, s.n - 2) / s.n * 100).toFixed(0)}\%` : '') + String.raw`\end{gathered}`}</EqBox>
        <Plot height={220} xLabel="Branch number" yLabel="Cumulative accuracy" yRange={[0, 1.02]}
          series={PREDS.map(id => ({ x: xs, y: R[id].cumAcc, label: PRED_NAMES[id], color: COLORS[id], dashed: id === 'at' || id === 'ant' }))}
          vlines={[{ at: i + 1, label: `#${i}`, color: 'muted' }]} />
      </>}
    </SimShell>
  );
}
