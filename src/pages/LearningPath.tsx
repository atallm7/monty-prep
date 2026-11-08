import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DOMAINS, QUESTIONS, META, titleOf, Q_BY_ID } from '../lib/data';
import { useStore, statusOf } from '../lib/progress';
import { orderQuestions } from '../lib/pathOrder';
import StatusChip, { DiffChip } from '../components/StatusChip';

export default function LearningPath() {
  const store = useStore();
  const [dom, setDom] = useState(DOMAINS[0].id);
  const ordered = useMemo(() => orderQuestions(QUESTIONS.filter(q => q.domainId === dom).map(q => q.id)), [dom]);
  const nextUp = useMemo(() => {
    const all = orderQuestions(QUESTIONS.map(q => q.id));
    return all.filter(id => statusOf(id, store).status !== 'mastered' && (META[id]?.prereqs || []).every(p => statusOf(p, store).status !== 'not-started')).slice(0, 8);
  }, [store]);
  return <div className="page fade-in">
    <div className="eyebrow">Learning path</div>
    <h1 className="page-title">Prerequisites first, then build up</h1>
    <p className="page-sub">Questions are ordered so the concepts each one depends on come before it, fundamentals before applications. Follow a topic top to bottom, or start with what's unlocked next.</p>
    <div className="card" style={{ marginTop: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Unlocked next for you</div>
      <div className="stack" style={{ gap: 6 }}>{nextUp.map(id => <Link key={id} to={`/q/${id}`} className="next-row card-link"><StatusChip status={statusOf(id, store).status} compact /><span>Q{Q_BY_ID.get(id)!.n} · {titleOf(id)}</span>{META[id] && <DiffChip d={META[id].difficulty} />}</Link>)}</div>
    </div>
    <div className="row-wrap" style={{ margin: '22px 0 12px' }}>{DOMAINS.map(d => <button key={d.id} className={'chip' + (dom === d.id ? ' on' : '')} onClick={() => setDom(d.id)}>{d.title}</button>)}</div>
    <ol className="path-list">
      {ordered.map((id, i) => { const q = Q_BY_ID.get(id)!; const m = META[id]; const st = statusOf(id, store).status;
        return <li key={id} className={'path-item s-' + st}>
          <span className="path-dot" />
          <Link to={`/q/${id}`} className="path-body card-link">
            <span className="path-main">
              <span className="small faint">Step {i + 1} · Q{q.n}</span>
              <b>{m?.title || titleOf(id)}</b>
              <span className="small muted">{q.text}</span>
              {m?.prereqs?.length ? <span className="tiny faint">Builds on: {m.prereqs.map(p => 'Q' + Q_BY_ID.get(p)?.n).join(', ')}</span> : null}
            </span>
            <span className="path-badges">{m && <DiffChip d={m.difficulty} />}<StatusChip status={st} /></span>
          </Link>
        </li>; })}
    </ol>
  </div>;
}
