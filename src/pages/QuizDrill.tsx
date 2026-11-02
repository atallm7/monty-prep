import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DOMAINS, QUESTIONS, META, Q_BY_ID, loadQuestion, QuizItem, Difficulty, titleOf } from '../lib/data';
import { actions, getStore, statusOf } from '../lib/progress';
import QuizItemView from '../components/QuizItem';
import { IQuiz, IArrowR } from '../components/Icons';

type Item = { qid: string; idx: number; item: QuizItem };
function shuffle<T>(a: T[]) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

export default function QuizDrill() {
  const [scope, setScope] = useState<string[]>([]);
  const [level, setLevel] = useState<Difficulty | 'any'>('any');
  const [count, setCount] = useState(10);
  const [only, setOnly] = useState<'all' | 'weak' | 'unseen'>('all');
  const [items, setItems] = useState<Item[] | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [loading, setLoading] = useState(false);
  const [t0, setT0] = useState(0);

  async function start() {
    setLoading(true);
    const s = getStore();
    let ids = QUESTIONS.filter(q => META[q.id]?.quizCount).map(q => q.id);
    if (scope.length) ids = ids.filter(id => scope.includes(Q_BY_ID.get(id)!.domainId));
    if (only === 'weak') ids = ids.filter(id => statusOf(id, s).status === 'needs-review' || statusOf(id, s).status === 'learning');
    if (only === 'unseen') ids = ids.filter(id => statusOf(id, s).status === 'not-started');
    const picked = shuffle(ids).slice(0, count * 2);
    const all: Item[] = [];
    for (const id of picked) {
      const c = await loadQuestion(id); if (!c) continue;
      const cand = c.quiz.map((item, idx) => ({ qid: id, idx, item })).filter(x => level === 'any' || x.item.level === level);
      if (cand.length) all.push(cand[Math.floor(Math.random() * cand.length)]);
      if (all.length >= count) break;
    }
    setItems(all); setI(0); setAnswers([]); setLoading(false); setT0(Date.now());
  }

  if (!items) return <div className="page page-narrow fade-in">
    <div className="eyebrow">Quiz drill</div><h1 className="page-title">Rapid-fire check</h1>
    <p className="page-sub">Multiple-choice, numeric and true/false questions pulled from the question pages, with instant explanations. Results count toward mastery of each source question.</p>
    <div className="card stack" style={{ marginTop: 20, gap: 16 }}>
      <div><div className="eyebrow" style={{ marginBottom: 8 }}>Topics {scope.length ? `(${scope.length})` : '(all)'}</div>
        <div className="row-wrap">{DOMAINS.map(d => <button key={d.id} className={'chip' + (scope.includes(d.id) ? ' on' : '')} onClick={() => setScope(s => s.includes(d.id) ? s.filter(x => x !== d.id) : [...s, d.id])}>{d.title}</button>)}</div></div>
      <div className="row-wrap" style={{ gap: 16 }}>
        <div className="seg">{(['any', 'fundamental', 'intermediate', 'advanced'] as const).map(l => <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{l}</button>)}</div>
        <div className="seg">{[5, 10, 20, 30].map(n => <button key={n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>{n}</button>)}</div>
        <div className="seg">{(['all', 'weak', 'unseen'] as const).map(n => <button key={n} className={only === n ? 'on' : ''} onClick={() => setOnly(n)}>{n === 'all' ? 'All questions' : n === 'weak' ? 'Learning / needs review' : 'Not started'}</button>)}</div>
      </div>
      <div><button className="btn btn-primary btn-lg" onClick={start} disabled={loading}><IQuiz size={16} /> {loading ? 'Building quiz…' : 'Start drill'}</button></div>
    </div>
  </div>;

  if (!items.length) return <div className="page page-narrow"><div className="empty">No quiz items match that selection. <button className="btn btn-sm" onClick={() => setItems(null)}>Back</button></div></div>;

  if (i >= items.length) {
    const correct = answers.filter(Boolean).length;
    return <div className="page page-narrow fade-in">
      <div className="eyebrow">Drill complete</div><h1 className="page-title">{correct}/{items.length} correct ({Math.round(correct / items.length * 100)}%)</h1>
      <div className="stack" style={{ marginTop: 18 }}>{items.map((it, k) => <Link key={k} className="q-row" to={`/q/${it.qid}`}><span className="q-row-n">{answers[k] ? '✓' : '✗'}</span><span className="q-row-main"><span className="q-row-text">{it.item.q.replace(/\$[^$]*\$/g, '…').slice(0, 140)}</span><span className="tiny faint">From Q{Q_BY_ID.get(it.qid)!.n}: {titleOf(it.qid)}</span></span><IArrowR size={14} /></Link>)}</div>
      <div className="row" style={{ marginTop: 18 }}><button className="btn btn-primary" onClick={() => setItems(null)}>New drill</button><Link className="btn" to="/">Dashboard</Link></div>
    </div>;
  }
  const it = items[i];
  return <div className="page page-narrow fade-in">
    <div className="iv-top"><span className="small muted">Item {i + 1} of {items.length}</span><div className="progress" style={{ flex: 1 }}><i className="pb-learning" style={{ width: `${i / items.length * 100}%` }} /></div><span className="small">{answers.filter(Boolean).length} correct</span></div>
    <div className="small faint" style={{ margin: '16px 0 6px' }}>From <Link to={`/q/${it.qid}`}>Q{Q_BY_ID.get(it.qid)!.n}: {titleOf(it.qid)}</Link></div>
    <QuizItemView key={i} item={it.item} onAnswered={ok => { actions.answerQuiz(it.qid, it.idx, ok); setAnswers(a => [...a, ok]); if (i === items.length - 1) actions.recordSession({ t: Date.now(), mode: 'quiz', questions: items.map(x => x.qid), score: [...answers, ok].filter(Boolean).length / items.length, seconds: Math.round((Date.now() - t0) / 1000) }); }} />
    {answers.length > i && <div className="row" style={{ marginTop: 14 }}><button className="btn btn-primary" onClick={() => setI(i + 1)}>{i === items.length - 1 ? 'See results' : 'Next'} <IArrowR size={14} /></button></div>}
  </div>;
}
