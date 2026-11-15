import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { META, Q_BY_ID, QUESTIONS, titleOf } from '../lib/data';
import { useStore, statusOf } from '../lib/progress';
import { orderQuestions } from '../lib/pathOrder';
import { getIndex } from '../lib/searchIndex';
import StatusChip, { DiffChip } from '../components/StatusChip';

// "What to read first": given a question, list the pages it builds on, foundations first.

/** Every page the question builds on, with how many steps away it is (1 = needed directly). */
export function prereqDepths(id: string): Map<string, number> {
  const depth = new Map<string, number>(); let frontier = [id];
  for (let d = 1; frontier.length && d <= 30; d++) {
    const next: string[] = [];
    for (const f of frontier) for (const p of META[f]?.prereqs || []) if (p !== id && Q_BY_ID.has(p) && !depth.has(p)) { depth.set(p, d); next.push(p); }
    frontier = next;
  }
  return depth;
}

const PRIMER_MIN = 2;                                   // the "Start here" box is 180–330 words
const pageMin = (id: string) => Math.max(5, Math.round((META[id]?.words || 2500) / 220));
const fmtMin = (m: number) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();

function Finder({ initial }: { initial: string }) {
  const nav = useNavigate();
  const [text, setText] = useState(initial);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!initial) box.current?.focus(); }, [initial]);
  const results = useMemo(() => {
    const t = text.trim(); if (t.length < 2) return [];
    const num = t.match(/^#?q?(\d{1,4})$/i);
    if (num) { const q = QUESTIONS[+num[1] - 1]; return q ? [q.id] : []; }
    const idx = getIndex(); const only = { filter: (r: Record<string, unknown>) => r.kind === 'q' };
    let r = idx.search(t, only);
    if (r.length < 3) r = idx.search(t, { ...only, combineWith: 'OR' });
    return r.slice(0, 8).map(x => x.id as string);
  }, [text]);
  return <div className="plan-finder">
    <label className="plan-label" htmlFor="plan-q">Type a question, a topic, or a question number</label>
    <input id="plan-q" ref={box} className="input plan-input" value={text} placeholder="e.g. how does a buck converter work, op-amp, 342"
      onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && results[0]) nav(`/plan/${results[0]}`); }} />
    {text.trim().length >= 2 && <div className="plan-results" role="list">
      {results.length ? results.map(id => <Link role="listitem" key={id} to={`/plan/${id}`} className="next-row card-link">
        <span className="small faint plan-num">Q{Q_BY_ID.get(id)!.n}</span><span>{titleOf(id)}</span>{META[id] && <DiffChip d={META[id].difficulty} />}</Link>)
        : <div className="small muted" style={{ padding: '10px 4px' }}>No matching question. Try fewer or simpler words, such as the main topic.</div>}
    </div>}
  </div>;
}

function Row({ id, tag, n }: { id: string; tag?: string; n?: number }) {
  const store = useStore(); const st = statusOf(id, store).status; const q = Q_BY_ID.get(id)!; const m = META[id];
  return <li className={'path-item s-' + st}>
    <span className="path-dot" />
    <Link to={`/q/${id}`} className="path-body card-link">
      <span className="path-main">
        <span className="small faint">{n ? `Step ${n} · ` : ''}Q{q.n}{tag ? ` · ${tag}` : ''}</span>
        <b>{m?.title || titleOf(id)}</b>
        <span className="small muted">{q.text}</span>
      </span>
      <span className="path-badges">{st === 'mastered' ? <span className="chip plan-done">Done</span> : <span className="small faint plan-time">~{pageMin(id)} min</span>}<StatusChip status={st} compact /></span>
    </Link>
  </li>;
}

export default function ReadingPlan() {
  const { id = '' } = useParams();
  const q = Q_BY_ID.get(id);
  const store = useStore();
  const depths = useMemo(() => (q ? prereqDepths(id) : new Map<string, number>()), [id, q]);
  const all = useMemo(() => orderQuestions([...depths.keys()]), [depths]);
  const direct = useMemo(() => all.filter(p => depths.get(p) === 1), [all, depths]);
  // Short chains are shown whole; long ones start with just the pages needed directly.
  const [full, setFull] = useState(false);
  useEffect(() => { setFull(all.length <= 8); window.scrollTo({ top: 0 }); }, [id, all.length]);
  const list = full ? all : direct;
  const todo = list.filter(p => statusOf(p, store).status !== 'mastered');
  const firstTodo = todo[0];

  return <div className="page page-narrow fade-in">
    <div className="eyebrow">What to read first</div>
    <h1 className="page-title">{q ? 'Your reading plan' : 'Find out what to read before a question'}</h1>
    <p className="page-sub">{q
      ? 'These are the pages this question builds on, in the order to read them: the simplest ideas first.'
      : 'Pick any question and get the list of pages to read first, in order, so the answer makes sense when you reach it.'}</p>
    <div className="card" style={{ marginTop: 18 }}><Finder key={id} initial="" /></div>

    {id && !q && <div className="empty">That question doesn't exist. Search for one above.</div>}

    {q && <>
      <div className="card plan-target">
        <div className="eyebrow">The question you want to understand</div>
        <div className="plan-target-t">Q{q.n} · {titleOf(id)}</div>
        <div className="small muted">{q.text}</div>
        {all.length > 0 ? <div className="plan-summary">
          <b>{list.length} page{list.length === 1 ? '' : 's'} to read first</b>{list.length !== todo.length && <> ({list.length - todo.length} already done)</>}.{' '}
          {todo.length > 0 && <>Quick route: read only the green “Start here” box on each, about <b>{fmtMin(todo.length * PRIMER_MIN)}</b>. Reading each page in full takes about {fmtMin(todo.reduce((a, p) => a + pageMin(p), 0))}.</>}
          {todo.length === 0 && <>You've mastered all of them, so go straight to the question.</>}
        </div> : <div className="plan-summary">This question doesn't build on any other page. You can start it directly: its “Start here” box assumes no background.</div>}
        <div className="row-wrap" style={{ marginTop: 12 }}>
          {firstTodo && <Link className="btn btn-primary" to={`/q/${firstTodo}`}>Start with step 1</Link>}
          <Link className={'btn' + (firstTodo ? '' : ' btn-primary')} to={`/q/${id}`}>Go to the question</Link>
        </div>
      </div>

      {all.length > 0 && <>
        {all.length > direct.length && all.length > 8 && <div className="plan-toggle">
          <div className="seg" role="group" aria-label="How much to read">
            <button className={!full ? 'on' : ''} aria-pressed={!full} onClick={() => setFull(false)}>Essentials ({direct.length})</button>
            <button className={full ? 'on' : ''} aria-pressed={full} onClick={() => setFull(true)}>Everything from zero ({all.length})</button>
          </div>
          <span className="small muted">{full ? 'Every page behind this question, starting from the very basics.' : 'Only the pages this question needs directly. If one of them feels hard, switch to “Everything from zero”.'}</span>
        </div>}
        <h2 className="h3 plan-h">Read these first, top to bottom</h2>
        <ol className="path-list">
          {list.map((p, i) => <Row key={p} id={p} n={i + 1} tag={full && depths.get(p) === 1 ? 'needed directly' : undefined} />)}
        </ol>
        <h2 className="h3 plan-h">Then the question itself</h2>
        <ol className="path-list"><Row id={id} /></ol>
      </>}

      {(META[id]?.related?.length || 0) > 0 && <>
        <h2 className="h3 plan-h">After that, to go further</h2>
        <p className="small muted" style={{ margin: '0 0 8px' }}>Related questions that build on the same ideas.</p>
        <div className="card" style={{ padding: '4px 14px' }}>{META[id].related.filter(r => Q_BY_ID.has(r)).map(r => <div key={r} className="next-row">
          <StatusChip status={statusOf(r, store).status} compact /><Link to={`/q/${r}`} className="card-link plan-rel">Q{Q_BY_ID.get(r)!.n} · {titleOf(r)}</Link>
          <Link to={`/plan/${r}`} className="small plan-sub">its plan</Link></div>)}</div>
      </>}
    </>}

    {!id && <p className="small muted" style={{ marginTop: 16 }}>Tip: every question page also has a “What to read first” button that opens its plan.</p>}
  </div>;
}
