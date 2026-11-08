import { Link } from 'react-router-dom';
import { DOMAINS, QUESTIONS, META, Q_BY_ID, questionsInDomain, titleOf } from '../lib/data';
import { useStore, overall, statusOf, conceptStats, dueForReview, streak, scoreOf, Status } from '../lib/progress';
import StatusChip from '../components/StatusChip';
import { IMic, IQuiz, IReview, IArrowR, IPath } from '../components/Icons';

const pctS = (x: number | null) => x === null ? '—' : Math.round(x * 100) + '%';

function Segmented({ counts, total }: { counts: Record<Status, number>; total: number }) {
  return <div className="progress" style={{ height: 10 }}>
    <i className="pb-mastered" style={{ width: `${counts.mastered / total * 100}%` }} />
    <i className="pb-learning" style={{ width: `${counts.learning / total * 100}%` }} />
    <i className="pb-review" style={{ width: `${counts['needs-review'] / total * 100}%` }} />
  </div>;
}

function Heatmap({ activity }: { activity: Record<string, number> }) {
  const days: { k: string; v: number }[] = [];
  const d = new Date(); d.setDate(d.getDate() - 7 * 16 + 1);
  for (let i = 0; i < 7 * 16; i++) { const k = d.toISOString().slice(0, 10); days.push({ k, v: activity[k] || 0 }); d.setDate(d.getDate() + 1); }
  const lvl = (v: number) => v === 0 ? 0 : v < 4 ? 1 : v < 10 ? 2 : v < 25 ? 3 : 4;
  return <div className="heatmap">{days.map(x => <i key={x.k} className={'hm' + lvl(x.v)} title={`${x.k}: ${x.v} answers`} />)}</div>;
}

export default function Dashboard() {
  const store = useStore();
  const o = overall(store);
  const concepts = conceptStats(store).filter(c => c.avg < 0.8).slice(0, 8);
  const due = dueForReview(store);
  const last = store.last ? Q_BY_ID.get(store.last) : null;
  const contentCount = Object.keys(META).length;
  const unseenFundamental = QUESTIONS.filter(q => META[q.id]?.difficulty === 'fundamental' && statusOf(q.id, store).status === 'not-started').slice(0, 5);
  return (
    <div className="page fade-in">
      <div className="dash-hero">
        <div>
          <div className="eyebrow">Interview readiness</div>
          <div className="row" style={{ alignItems: 'baseline', gap: 14, marginTop: 4 }}>
            <span className="readiness">{Math.round(o.readiness * 100)}%</span>
            <span className="muted">{o.counts.mastered} of {o.total} questions mastered</span>
          </div>
          <div style={{ marginTop: 14, maxWidth: 560 }}><Segmented counts={o.counts} total={o.total} /></div>
          <div className="row-wrap small muted" style={{ marginTop: 10 }}>
            <span className="legend-item"><span className="legend-dot m" />Mastered {o.counts.mastered}</span><span className="legend-item"><span className="legend-dot l" />Learning {o.counts.learning}</span><span className="legend-item"><span className="legend-dot r" />Needs review {o.counts['needs-review']}</span><span className="legend-item"><span className="legend-dot n" />Not started {o.counts['not-started']}</span>
          </div>
        </div>
        <div className="dash-cta">
          {last && <Link className="cta-card" to={`/q/${last.id}`}><span className="eyebrow">Continue</span><b>Q{last.n} · {titleOf(last.id)}</b><span className="small muted">{last.text.slice(0, 90)}</span><IArrowR size={16} /></Link>}
          <div className="row" style={{ gap: 10 }}>
            <Link className="btn btn-primary btn-lg" to="/interview"><IMic size={16} /> Mock interview</Link>
            <Link className="btn btn-lg" to="/review"><IReview size={16} /> Review {due.length ? `(${due.length})` : ''}</Link>
          </div>
        </div>
      </div>

      <div className="grid-4 stat-grid">
        <div className="card"><div className="stat-num">{o.total}</div><div className="stat-label">Total questions</div><div className="tiny faint">{contentCount} with full study pages</div></div>
        <div className="card"><div className="stat-num">{o.completed}</div><div className="stat-label">Started or completed</div><div className="tiny faint">{pctS(o.completed / o.total)} of the list</div></div>
        <div className="card"><div className="stat-num" style={{ color: 'var(--ok)' }}>{o.counts.mastered}</div><div className="stat-label">Mastered</div><div className="tiny faint">earned through self-checks + quizzes</div></div>
        <div className="card"><div className="stat-num" style={{ color: 'var(--warn)' }}>{o.counts['needs-review']}</div><div className="stat-label">Need improvement</div><div className="tiny faint">missed points or due for review</div></div>
        <div className="card"><div className="stat-num">{pctS(o.accuracy)}</div><div className="stat-label">Quiz accuracy</div><div className="tiny faint">{o.quizCorrect}/{o.quizAnswered} correct</div></div>
        <div className="card"><div className="stat-num">{pctS(o.coverage)}</div><div className="stat-label">Avg. key-point coverage</div><div className="tiny faint">from spoken self-checks</div></div>
        <div className="card"><div className="stat-num">{streak(store)}</div><div className="stat-label">Day streak</div><div className="tiny faint">{store.sessions.length} interview/quiz sessions</div></div>
        <div className="card"><div className="stat-label" style={{ marginBottom: 8 }}>Last 16 weeks</div><Heatmap activity={store.activity} /></div>
      </div>

      <div className="dash-cols">
        <div className="card">
          <div className="spread"><h3 className="h3">Performance by category</h3><Link className="small" to="/library">Library →</Link></div>
          <table className="cat-table">
            <thead><tr><th>Category</th><th>Progress</th><th className="num">Mastered</th><th className="num">Avg score</th></tr></thead>
            <tbody>
              {DOMAINS.map(d => {
                const qs = questionsInDomain(d.id);
                const c: Record<Status, number> = { 'not-started': 0, learning: 0, 'needs-review': 0, mastered: 0 };
                let sc = 0, n = 0;
                for (const q of qs) { c[statusOf(q.id, store).status]++; const s = scoreOf(store.q[q.id]); if (s !== null) { sc += s; n++; } }
                return <tr key={d.id}>
                  <td><Link to={`/d/${d.id}`}>{d.title}</Link><div className="tiny faint">{qs.length} questions</div></td>
                  <td style={{ minWidth: 120 }}><Segmented counts={c} total={qs.length} /></td>
                  <td className="num">{c.mastered}</td>
                  <td className="num">{n ? Math.round(sc / n * 100) + '%' : <span className="faint">—</span>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="stack">
          <div className="card">
            <h3 className="h3">Weakest concepts</h3>
            {concepts.length === 0 ? <p className="small muted">Once you've self-checked or quizzed a few questions, the concepts you're weakest on show up here, ranked by your measured score.</p> :
              <div className="stack" style={{ gap: 8, marginTop: 10 }}>{concepts.map(c => <div key={c.concept}>
                <div className="spread small"><span>{c.concept.replace(/-/g, ' ')}</span><span className="faint">{Math.round(c.avg * 100)}% · {c.n} q</span></div>
                <div className="progress"><i className={c.avg < 0.6 ? 'pb-review' : 'pb-learning'} style={{ width: `${c.avg * 100}%` }} /></div>
                <div className="row-wrap tiny" style={{ marginTop: 4 }}>{c.qs.slice(0, 4).map(id => <Link key={id} to={`/q/${id}`}>Q{Q_BY_ID.get(id)?.n}</Link>)}</div>
              </div>)}</div>}
          </div>
          <div className="card">
            <h3 className="h3">Suggested next</h3>
            {due.length > 0 && <Link className="next-row" to="/review"><IReview size={15} /><span>{due.length} question{due.length > 1 ? 's' : ''} need review</span><IArrowR size={14} /></Link>}
            <Link className="next-row" to="/quiz"><IQuiz size={15} /><span>Quick 10-question quiz drill</span><IArrowR size={14} /></Link>
            <Link className="next-row" to="/path"><IPath size={15} /><span>Follow the learning path</span><IArrowR size={14} /></Link>
            {unseenFundamental.map(q => <Link key={q.id} className="next-row" to={`/q/${q.id}`}><StatusChip status="not-started" compact /><span>Q{q.n} · {titleOf(q.id)}</span><IArrowR size={14} /></Link>)}
          </div>
        </div>
      </div>
    </div>
  );
}
