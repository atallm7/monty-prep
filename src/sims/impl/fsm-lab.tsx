// Finite-state machines: Moore vs Mealy side by side. Model: models/fsm-lab.ts
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge } from '../kit';
import { renderTiming } from '../../diagrams/timing.mjs';
import { Machine, Preset, PRESETS, build, run } from '../models/fsm-lab';

const W = 380, H = 312, CX = 190, CY = 160;
const PLANS: Record<Preset, number[]> = {
  'detect-101': [1, 0, 1, 0, 1, 1, 0, 1], 'detect-110': [0, 1, 1, 0, 1, 1, 0, 0],
  traffic: [0, 0, 1, 0, 0, 0, 0, 1], vending: [0, 1, 1, 0, 1, 0, 0, 0],
};
const TITLES: Record<Preset, string> = { 'detect-101': 'Detect 101', 'detect-110': 'Detect 110', traffic: 'Traffic light', vending: 'Vending 15c' };

function positions(n: number) {
  if (n === 2) return [{ x: 95, y: CY }, { x: 285, y: CY }];
  return Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return { x: CX + 125 * Math.cos(a), y: CY + 92 * Math.sin(a) }; });
}

function Diagram({ m, state, lastEdge, inputs, id, title }: { m: Machine; state: number; lastEdge: { from: number; x: number } | null; inputs: [string, string]; id: string; title: string }) {
  const pos = useMemo(() => positions(m.states.length), [m.states.length]);
  const R = m.kind === 'moore' ? 27 : 24;
  const groups = useMemo(() => {
    const g = new Map<string, { from: number; to: number; labels: string[]; xs: number[] }>();
    m.delta.forEach((row, s) => row.forEach((to, x) => {
      const k = s + '>' + to; const lab = m.kind === 'mealy' ? `${inputs[x]}/${(m.out as (string | number)[][])[s][x]}` : inputs[x];
      const e = g.get(k) ?? { from: s, to, labels: [], xs: [] }; e.labels.push(lab); e.xs.push(x); g.set(k, e);
    }));
    return [...g.values()];
  }, [m, inputs]);
  const mk = (c: string, nm: string) => <marker id={`${id}-${nm}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={c} /></marker>;
  return (
    <div className="figure-body" style={{ padding: 6, display: 'block' }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted, var(--d-muted))' }}>{m.kind === 'moore' ? 'output depends on state only (shown in node)' : 'output depends on state and input (on arrow: in/out)'}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label={`${title} state diagram, current state ${m.states[state]}`}>
        <defs>{mk('var(--d-muted)', 'n')}{mk('var(--d-accent)', 'a')}</defs>
        {groups.map((e, k) => {
          const hot = !!lastEdge && lastEdge.from === e.from && e.xs.includes(lastEdge.x);
          const col = hot ? 'var(--d-accent)' : 'var(--d-muted)'; const mid = `url(#${id}-${hot ? 'a' : 'n'})`;
          const label = e.labels.join(', ');
          if (e.from === e.to) {
            const p = pos[e.from]; let dx = p.x - CX, dy = p.y - CY; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
            if (m.states.length === 2) { dx = 0; dy = -1; }
            const nx = -dy, ny = dx; const sx = p.x + dx * R * 0.9 + nx * 9, sy = p.y + dy * R * 0.9 + ny * 9, ex = p.x + dx * R * 0.9 - nx * 9, ey = p.y + dy * R * 0.9 - ny * 9;
            const c1x = sx + dx * 34 + nx * 14, c1y = sy + dy * 34 + ny * 14, c2x = ex + dx * 34 - nx * 14, c2y = ey + dy * 34 - ny * 14;
            return <g key={k}><path d={`M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`} fill="none" stroke={col} strokeWidth={hot ? 2.6 : 1.5} markerEnd={mid} />
              <text x={p.x + dx * (R + 38)} y={p.y + dy * (R + 38) + 4} textAnchor="middle" fontSize={12} fontWeight={hot ? 700 : 500} fill={hot ? 'var(--d-accent)' : 'var(--d-ink)'}>{label}</text></g>;
          }
          const a = pos[e.from], b = pos[e.to]; const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
          const bend = Math.min(36, L * 0.2);
          const sx = a.x + ux * R + nx * 4, sy = a.y + uy * R + ny * 4, ex = b.x - ux * (R + 4) + nx * 4, ey = b.y - uy * (R + 4) + ny * 4;
          const qx = (a.x + b.x) / 2 + nx * bend * 1.6, qy = (a.y + b.y) / 2 + ny * bend * 1.6;
          const lx = 0.25 * sx + 0.5 * qx + 0.25 * ex + nx * 9, ly = 0.25 * sy + 0.5 * qy + 0.25 * ey + ny * 9 + 3;
          return <g key={k}><path d={`M${sx},${sy} Q${qx},${qy} ${ex},${ey}`} fill="none" stroke={col} strokeWidth={hot ? 2.6 : 1.5} markerEnd={mid} />
            <text x={lx} y={ly} textAnchor="middle" fontSize={12} fontWeight={hot ? 700 : 500} fill={hot ? 'var(--d-accent)' : 'var(--d-ink)'} stroke="var(--d-bg)" strokeWidth={3} paintOrder="stroke">{label}</text></g>;
        })}
        {m.states.map((nm, i) => {
          const p = pos[i], on = i === state; const o = m.kind === 'moore' ? (m.out as (string | number)[])[i] : null;
          return <g key={i}>
            {i === m.init && <path d={`M${p.x - R - 26},${p.y - 2} L${p.x - R - 2},${p.y - 2}`} stroke="var(--d-ink)" strokeWidth={1.4} markerEnd={`url(#${id}-n)`} fill="none" />}
            <circle cx={p.x} cy={p.y} r={R} fill={on ? 'var(--d-accent)' : 'var(--d-box)'} fillOpacity={on ? 0.22 : 1} stroke={on ? 'var(--d-accent)' : 'var(--d-ink)'} strokeWidth={on ? 3 : 1.5} />
            {o !== null && String(o) === '1' && <circle cx={p.x} cy={p.y} r={R - 4} fill="none" stroke="var(--d-ink)" strokeWidth={1} />}
            <text x={p.x} y={p.y + (o !== null ? -2 : 4)} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--d-ink)">{nm}</text>
            {o !== null && <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize={10.5} fill="var(--d-muted)">z={String(o)}</text>}
          </g>;
        })}
      </svg>
    </div>
  );
}

export default function FsmLab({ params }: SimProps) {
  const p0: Preset = (PRESETS as string[]).includes(params.preset) ? params.preset : 'detect-101';
  const [preset, setPresetRaw] = useState<Preset>(p0);
  const [xs, setXs] = useState<number[]>([]);
  const [plan, setPlan] = useState(0);
  const [playing, setPlaying] = useState(false);
  const pair = useMemo(() => build(preset), [preset]);
  const mo = useMemo(() => run(pair.moore, xs), [pair, xs]);
  const ml = useMemo(() => run(pair.mealy, xs), [pair, xs]);
  const last = xs.length ? xs.length - 1 : -1;

  const push = (x: number) => setXs(p => [...p, x]);
  const planned = () => PLANS[preset][plan % PLANS[preset].length];
  const stepPlan = () => { push(plan < PLANS[preset].length ? PLANS[preset][plan] : Math.random() < 0.5 ? 0 : 1); setPlan(k => k + 1); };
  const ref = useRef(stepPlan); ref.current = stepPlan;
  useEffect(() => { if (!playing) return; const id = setInterval(() => ref.current(), 800); return () => clearInterval(id); }, [playing]);
  const reset = () => { setXs([]); setPlan(0); setPlaying(false); setPresetRaw(p0); };
  const setPreset = (v: Preset) => { setPresetRaw(v); setXs([]); setPlan(0); setPlaying(false); };
  void planned;

  // per-cycle view: Moore z_t = lambda(state_t); Mealy y_t = lambda(state_t, x_t); the Moore value is the Mealy value delayed by one cycle
  const cyc = useMemo(() => xs.map((x, t) => ({ x, ms: mo.steps[t].from, ls: ml.steps[t].from, z: (pair.moore.out as (string | number)[])[mo.steps[t].from], y: ml.steps[t].out })), [xs, mo, ml, pair]);
  const win = cyc.slice(-12);
  const timing = useMemo(() => {
    if (!win.length) return '';
    const bin = pair.binaryOut;
    const wave = (vals: (string | number)[], isBin: boolean) => isBin ? { wave: vals.map(v => (String(v) === '1' ? '1' : '0')).join('') } : { wave: '='.repeat(vals.length), data: vals.map(String) };
    return renderTiming({ hscale: 1.1, signals: [
      { name: 'CLK', wave: 'p'.repeat(win.length) },
      { name: pair.inLabel, ...wave(win.map(c => pair.inputs[c.x]), false), color: 'blue' },
      { name: 'Moore S', ...wave(win.map(c => pair.moore.states[c.ms]), false) },
      { name: 'Moore z', ...wave(win.map(c => c.z), bin), color: 'orange' },
      { name: 'Mealy S', ...wave(win.map(c => pair.mealy.states[c.ls]), false) },
      { name: 'Mealy y', ...wave(win.map(c => c.y), bin), color: 'accent' },
    ] }).svg;
  }, [win, pair]);

  const sM = mo.state, sL = ml.state;
  const zNow = (pair.moore.out as (string | number)[])[sM];
  const lastM = last >= 0 ? mo.steps[last] : null, lastL = last >= 0 ? ml.steps[last] : null;
  const count = (v: (string | number)[]) => v.filter(o => String(o) === '1').length;
  const detM = pair.binaryOut ? count(cyc.map(c => c.z).slice(1).concat(zNow)) : 0; // Moore outputs seen incl. the current one
  const detL = pair.binaryOut ? count(cyc.map(c => c.y)) : 0;
  const firstZ = cyc.findIndex(c => String(c.z) === '1'), firstY = cyc.findIndex(c => String(c.y) === '1');
  const eq = String.raw`\text{Moore: } S^{+}=\delta(S,x),\; z=\lambda(S)\qquad \text{Mealy: } S^{+}=\delta(S,x),\; y=\lambda(S,x)\qquad z(t{+}1)=y(t)`;

  return (
    <SimShell title={`Finite state machines: Moore vs Mealy (${pair.title})`} onReset={reset}
      tryThis={<>pick <b>Detect 101</b> and press <b>Send 1, 0, 1</b>: the Mealy output pulses during the same cycle that the last bit arrives, while the Moore output only rises in the <i>next</i> cycle (and the Moore machine needs an extra state, S3, to remember "101"). Then send <b>1</b> again: overlapping matches (10101) are found twice. Try <b>Vending</b> with N then D.</>}
      controls={<>
        <Seg label="Machine" value={preset} onChange={setPreset} options={PRESETS.map(v => ({ value: v, label: TITLES[v] }))} />
        <div className="ctl"><span className="ctl-head"><span className="ctl-label">Send input</span></span>
          <div className="seg"><button type="button" onClick={() => push(0)}>Send {pair.inputs[0]}</button><button type="button" onClick={() => push(1)}>Send {pair.inputs[1]}</button></div></div>
        <div className="ctl"><span className="ctl-head"><span className="ctl-label">Scripted stream: {PLANS[preset].map(b => pair.inputs[b]).join(' ')}</span></span>
          <div className="seg"><button type="button" onClick={stepPlan}>Step</button><button type="button" onClick={() => setPlaying(v => !v)}>{playing ? 'Pause' : 'Play'}</button><button type="button" onClick={() => { setXs([]); setPlan(0); }}>Restart</button></div></div>
        <Toggle label="Auto-play (one input per 0.8 s)" checked={playing} onChange={setPlaying} />
        <Note>Inputs after the scripted stream is used up are random. The highlighted arrow is the transition taken at the last clock edge.</Note>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 10 }}>
        <Diagram m={pair.moore} state={sM} lastEdge={lastM ? { from: lastM.from, x: lastM.x } : null} inputs={pair.inputs} id="fm" title="Moore machine" />
        <Diagram m={pair.mealy} state={sL} lastEdge={lastL ? { from: lastL.from, x: lastL.x } : null} inputs={pair.inputs} id="fl" title="Mealy machine" />
      </div>
      <Readouts>
        <Readout k="Inputs sent" v={xs.length ? xs.map(x => pair.inputs[x]).slice(-16).join(' ') : 'none yet'} />
        <Readout k="Moore state / z" v={`${pair.moore.states[sM]} (${pair.moore.desc[sM]}) / ${zNow}`} hl tone={String(zNow) === '1' ? 'ok' : undefined} />
        <Readout k="Mealy state" v={`${pair.mealy.states[sL]} (${pair.mealy.desc[sL]})`} hl />
        <Readout k="Last Mealy y" v={lastL ? `${pair.mealy.states[lastL.from]} --${pair.inputs[lastL.x]}--> ${pair.mealy.states[lastL.to]}, y=${lastL.out}` : '-'} tone={lastL && String(lastL.out) === '1' ? 'ok' : undefined} />
        <Readout k="States (Moore / Mealy)" v={`${pair.moore.states.length} / ${pair.mealy.states.length}`} />
        {pair.binaryOut && <Readout k="Output = 1 count (Moore / Mealy)" v={`${detM} / ${detL}`} />}
        {firstY >= 0 && <Readout k="First '1' (cycle)" v={`Mealy ${firstY}, Moore ${firstZ >= 0 ? firstZ : firstY + 1}`} />}
      </Readouts>
      <div style={{ marginTop: 6 }}><RegionBadge label={lastL && String(lastL.out) === '1' && pair.binaryOut ? 'Mealy output asserted now; Moore follows next cycle' : 'Waiting for the pattern'} color={lastL && String(lastL.out) === '1' && pair.binaryOut ? 'ok' : 'info'} /></div>
      <EqBox>{eq}</EqBox>
      {timing ? <div className="figure-body" style={{ padding: 4 }} dangerouslySetInnerHTML={{ __html: timing }} /> : <Note>Send some inputs to draw the timing diagram: Mealy output y(t) is combinational from the input, Moore output z(t) is a function of the registered state, so it lags by one clock.</Note>}
    </SimShell>
  );
}
