import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DOMAINS, QUESTIONS, META, SECTION_BY_ID, DOMAIN_BY_ID, Q_BY_ID, loadQuestion, QContent, titleOf, Difficulty, resolveQ } from '../lib/data';
import { useStore, statusOf, actions, scoreOf, getStore, dueForReview } from '../lib/progress';
import Markdown from '../components/Markdown';
import { RubricGrader, useTimer, mmss } from '../components/SelfCheck';
import { DiffChip } from '../components/StatusChip';
import { mdInline } from '../lib/markdown';
import { IMic, ITimer, IArrowR, IReview } from '../components/Icons';

const LEVELS: Difficulty[] = ['fundamental', 'intermediate', 'advanced'];
type Setup = { scope: string[]; level: Difficulty | 'adaptive' | 'any'; count: number; seconds: number; followups: boolean; prioritize: boolean };
type Result = { id: string; covered: number; total: number; rating: number; seconds: number; missed: number[]; followup?: { q: string; result: 'nailed' | 'partial' | 'missed' }; level: Difficulty; remedial?: boolean };

function shuffle<T>(a: T[]) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function buildPool(setup: Setup, reviewMode: boolean): string[] {
  const s = getStore();
  let ids = QUESTIONS.filter(q => META[q.id] && (META[q.id].rubricCount > 0)).map(q => q.id);
  if (reviewMode) ids = ids.filter(id => statusOf(id, s).status === 'needs-review');
  if (setup.scope.length) ids = ids.filter(id => { const q = Q_BY_ID.get(id)!; return setup.scope.includes(q.domainId) || setup.scope.includes(q.sectionId); });
  if (setup.level !== 'adaptive' && setup.level !== 'any') ids = ids.filter(id => META[id].difficulty === setup.level);
  // behavioural questions make poor timed drills unless explicitly scoped
  if (!setup.scope.length && !reviewMode) ids = ids.filter(id => META[id].kind !== 'behavioral');
  const shuffled = shuffle(ids);
  if (!setup.prioritize) return shuffled;
  const w = (id: string) => { const st = statusOf(id, s).status; const sc = scoreOf(s.q[id]); return (st === 'mastered' ? 3 : st === 'not-started' ? 1 : st === 'needs-review' ? 0 : 2) + (sc ?? 0.5) * 0.5 + Math.random() * 1.2; };
  return shuffled.sort((a, b) => w(a) - w(b));
}

export default function Interview({ reviewMode = false }: { reviewMode?: boolean }) {
  const [params] = useSearchParams();
  const store = useStore();
  const preScope = [params.get('domain'), params.get('section')].filter(Boolean) as string[];
  const [setup, setSetup] = useState<Setup>({ scope: preScope, level: reviewMode ? 'any' : 'adaptive', count: reviewMode ? 10 : 8, seconds: 120, followups: true, prioritize: true });
  const [phase, setPhase] = useState<'setup' | 'ask' | 'grade' | 'fu-ask' | 'fu-reveal' | 'summary'>('setup');
  const [pool, setPool] = useState<string[]>([]);
  const [asked, setAsked] = useState<string[]>([]);
  const [cur, setCur] = useState<{ id: string; content: QContent; remedial?: boolean } | null>(null);
  const [level, setLevel] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [fu, setFu] = useState<{ q: string; a: string } | null>(null);
  const [notes, setNotes] = useState('');
  const [secs, setSecs] = useTimer(phase === 'ask' || phase === 'fu-ask');
  const [answerSecs, setAnswerSecs] = useState(0);
  const [sessionStart, setSessionStart] = useState(0);

  const available = useMemo(() => buildPool({ ...setup, prioritize: false }, reviewMode).length, [setup.scope, setup.level, reviewMode, store]);

  async function ask(id: string, remedial = false) {
    const content = await loadQuestion(id);
    if (!content) return;
    setCur({ id, content, remedial }); setAsked(a => [...a, id]); setNotes(''); setSecs(0); setPhase('ask');
  }
  function pickNext(lv: number, exclude: string[]): string | undefined {
    const left = pool.filter(id => !exclude.includes(id));
    if (!left.length) return undefined;
    if (setup.level !== 'adaptive') return left[0];
    for (const d of [0, 1, -1, 2, -2]) { const L = lv + d; if (L < 0 || L > 2) continue; const hit = left.find(id => META[id].difficulty === LEVELS[L]); if (hit) return hit; }
    return left[0];
  }
  function start() {
    const p = buildPool(setup, reviewMode);
    setPool(p); setResults([]); setAsked([]); setSessionStart(Date.now());
    const L = 0; setLevel(L);
    const first = setup.level === 'adaptive' ? (p.find(id => META[id].difficulty === 'fundamental') || p[0]) : p[0];
    if (first) ask(first);
  }
  function afterQuestion(res: Result, nextLevel: number, remediate?: string) {
    const all = [...results, res]; setResults(all);
    if (all.length >= setup.count) { finish(all); return; }
    const nextId = remediate || pickNext(nextLevel, [...asked]);
    if (!nextId) { finish(all); return; }
    ask(nextId, !!remediate);
  }
  function finish(all: Result[]) {
    const score = all.length ? all.reduce((a, r) => a + r.covered / Math.max(1, r.total), 0) / all.length : 0;
    actions.recordSession({ t: Date.now(), mode: reviewMode ? 'review' : 'interview', questions: all.map(r => r.id), score, seconds: Math.round((Date.now() - sessionStart) / 1000) });
    setPhase('summary');
  }
  const pending = (res: Omit<Result, 'followup'>) => res;
  const [lastRes, setLastRes] = useState<Result | null>(null);

  // ---------- Setup ----------
  if (phase === 'setup') {
    const toggleScope = (id: string) => setSetup(s => ({ ...s, scope: s.scope.includes(id) ? s.scope.filter(x => x !== id) : [...s.scope, id] }));
    return <div className="page page-narrow fade-in">
      <div className="eyebrow">{reviewMode ? 'Spaced review' : 'Interview simulator'}</div>
      <h1 className="page-title">{reviewMode ? 'Review what slipped' : 'Mock technical interview'}</h1>
      <p className="page-sub">{reviewMode ? 'Questions you flagged, missed key points on, or that are due for spaced review. Each is asked like a real interview question.' : 'One question at a time, answered out loud against the clock. After each answer you compare it with the model answer, mark the key points you actually said, and get pushed: good answers earn a harder follow-up and a harder next question, while weak ones step back to a prerequisite.'}</p>
      {reviewMode && <ReviewQueue ids={dueForReview(store)} store={store} />}
      {!(reviewMode && !dueForReview(store).length) && <div className="card stack" style={{ marginTop: 20, gap: 18 }}>
        {reviewMode && <div className="eyebrow">Session options</div>}
        <div><div className="eyebrow" style={{ marginBottom: 8 }}>Topics {setup.scope.length ? `(${setup.scope.length} selected)` : '(all)'}</div>
          <div className="row-wrap">{preScope.filter(s => SECTION_BY_ID.has(s)).map(s => <button key={s} className={'chip' + (setup.scope.includes(s) ? ' on' : '')} onClick={() => toggleScope(s)}>{SECTION_BY_ID.get(s)!.title}</button>)}
            {DOMAINS.map(d => <button key={d.id} className={'chip' + (setup.scope.includes(d.id) ? ' on' : '')} onClick={() => toggleScope(d.id)}>{d.title}</button>)}</div></div>
        <div className="grid-2">
          <div><div className="eyebrow" style={{ marginBottom: 8 }}>Difficulty</div>
            <div className="seg">{(['adaptive', 'fundamental', 'intermediate', 'advanced', 'any'] as const).map(l => <button key={l} className={setup.level === l ? 'on' : ''} onClick={() => setSetup(s => ({ ...s, level: l }))}>{l}</button>)}</div>
            <div className="tiny faint" style={{ marginTop: 6 }}>Fundamental: explain the concept · Intermediate: apply it and solve · Advanced: reason through unfamiliar scenarios.</div></div>
          <div><div className="eyebrow" style={{ marginBottom: 8 }}>Questions · time per answer</div>
            <div className="row-wrap"><div className="seg">{[5, 8, 12, 20].map(n => <button key={n} className={setup.count === n ? 'on' : ''} onClick={() => setSetup(s => ({ ...s, count: n }))}>{n}</button>)}</div>
              <div className="seg">{[60, 120, 180, 0].map(n => <button key={n} className={setup.seconds === n ? 'on' : ''} onClick={() => setSetup(s => ({ ...s, seconds: n }))}>{n ? `${n / 60} min` : 'untimed'}</button>)}</div></div></div>
        </div>
        <div className="row-wrap">
          <label className="toggle"><input type="checkbox" checked={setup.followups} onChange={e => setSetup(s => ({ ...s, followups: e.target.checked }))} />Ask follow-up questions</label>
          <label className="toggle"><input type="checkbox" checked={setup.prioritize} onChange={e => setSetup(s => ({ ...s, prioritize: e.target.checked }))} />Prioritize weak and unseen questions</label>
        </div>
        <div className="spread"><span className="small muted">{available} question{available === 1 ? '' : 's'} {reviewMode ? 'in this review session' : 'available in this scope'}</span>
          <button className="btn btn-primary btn-lg" disabled={!available} onClick={start}><IMic size={16} /> {reviewMode ? 'Start review session' : 'Start interview'}</button></div>
      </div>}
    </div>;
  }

  // ---------- Summary ----------
  if (phase === 'summary') {
    const avgCov = results.length ? results.reduce((a, r) => a + r.covered / Math.max(1, r.total), 0) / results.length : 0;
    const avgRating = results.length ? results.reduce((a, r) => a + r.rating, 0) / results.length : 0;
    const fus = results.filter(r => r.followup);
    return <div className="page page-narrow fade-in">
      <div className="eyebrow">Session complete</div>
      <h1 className="page-title">How you did</h1>
      <div className="grid-4 stat-grid" style={{ marginTop: 18 }}>
        <div className="card"><div className="stat-num">{results.length}</div><div className="stat-label">Questions</div></div>
        <div className="card"><div className="stat-num">{Math.round(avgCov * 100)}%</div><div className="stat-label">Key points covered</div></div>
        <div className="card"><div className="stat-num">{avgRating.toFixed(1)}/4</div><div className="stat-label">Avg. self-rating</div></div>
        <div className="card"><div className="stat-num">{fus.filter(r => r.followup!.result === 'nailed').length}/{fus.length}</div><div className="stat-label">Follow-ups nailed</div></div>
      </div>
      <div className="stack" style={{ marginTop: 18 }}>
        {results.map((r, i) => { const q = Q_BY_ID.get(r.id)!; return <SummaryRow key={i} r={r} n={q.n} text={q.text} />; })}
      </div>
      <div className="row" style={{ marginTop: 20 }}><button className="btn btn-primary" onClick={() => setPhase('setup')}>New session</button><Link className="btn" to="/">Dashboard</Link></div>
    </div>;
  }

  if (!cur) return <div className="page"><div className="empty">Loading question…</div></div>;
  const q = Q_BY_ID.get(cur.id)!; const meta = META[cur.id]; const sec = SECTION_BY_ID.get(q.sectionId)!;
  const limit = setup.seconds; const over = limit > 0 && secs >= limit;
  const progress = (results.length + (phase === 'ask' ? 0 : 0.5)) / setup.count;

  return <div className="page page-narrow fade-in" key={cur.id + phase}>
    <div className="iv-top">
      <span className="small muted">Question {results.length + 1} of {setup.count}</span>
      <div className="progress" style={{ flex: 1 }}><i className="pb-learning" style={{ width: `${progress * 100}%` }} /></div>
      <button className="btn btn-sm btn-ghost" onClick={() => finish(results)}>End session</button>
    </div>
    {cur.remedial && <div className="callout callout-note" style={{ marginTop: 14 }}><div className="callout-title">Stepping back to a prerequisite</div><p className="small" style={{ margin: 0 }}>The last answer missed key ideas that build on this one, so here's the foundation first.</p></div>}
    <div className="iv-card">
      <div className="row-wrap small muted" style={{ marginBottom: 8 }}><DiffChip d={meta.difficulty} /><span>{DOMAIN_BY_ID.get(q.domainId)?.title} › {sec.title}</span><span className="faint">Q{q.n}</span></div>
      {(phase === 'ask' || phase === 'grade') && <h2 className="iv-q">{q.text}</h2>}
      {(phase === 'ask' || phase === 'grade') && q.subItems.length > 0 && <ul className="q-subitems">{q.subItems.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      {(phase === 'fu-ask' || phase === 'fu-reveal') && fu && <><div className="eyebrow" style={{ color: 'var(--accent)' }}>Follow-up</div><h2 className="iv-q" dangerouslySetInnerHTML={{ __html: mdInline(fu.q, resolveQ) }} /></>}

      {(phase === 'ask' || phase === 'fu-ask') && <div className="stack" style={{ marginTop: 16 }}>
        <div className={'timer-big' + (over ? ' over' : '')}><ITimer size={18} /> {mmss(secs)}{limit > 0 && <span className="small faint"> / {mmss(phase === 'fu-ask' ? Math.round(limit / 2) : limit)}</span>}{over && phase === 'ask' && <span className="small" style={{ color: 'var(--bad)' }}>Time's up. Wrap up your answer.</span>}</div>
        {limit > 0 && <div className="progress"><i className={over ? 'pb-review' : 'pb-learning'} style={{ width: `${Math.min(1, secs / (phase === 'fu-ask' ? limit / 2 : limit)) * 100}%` }} /></div>}
        <textarea className="input" placeholder="Answer out loud. Jot key points here if it helps you grade yourself honestly." value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="row">
          {phase === 'ask' ? <button className="btn btn-accent" onClick={() => { setAnswerSecs(secs); setPhase('grade'); }}>Done: compare with model answer</button>
            : <button className="btn btn-accent" onClick={() => setPhase('fu-reveal')}>Reveal follow-up answer</button>}
        </div>
      </div>}

      {phase === 'grade' && <div className="stack" style={{ marginTop: 16 }}>
        <details className="card card-tight iv-notes" open><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Your notes · {mmss(answerSecs)}</summary><div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{notes || <span className="faint">(spoken answer, no notes typed)</span>}</div></details>
        <div className="card card-tight"><div className="eyebrow">Model answer (30 s)</div><Markdown src={cur.content.sections.short} /></div>
        <details className="card card-tight"><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Model answer (2 min)</summary><Markdown src={cur.content.sections.long} /></details>
        <RubricGrader content={cur.content} helper="Pick how it went to continue" submitLabel="Grade & continue" onSubmit={(covered, rating) => {
          const total = cur.content.rubric.length; const cov = covered.length / Math.max(1, total);
          const res: Result = { id: cur.id, covered: covered.length, total, rating, seconds: answerSecs, missed: cur.content.rubric.map((_, i) => i).filter(i => !covered.includes(i)), level: meta.difficulty, remedial: cur.remedial };
          actions.recordAttempt(cur.id, { mode: 'interview', covered: covered.length, total, rating, seconds: answerSecs, missed: res.missed });
          const good = cov >= 0.8 && rating >= 3, poor = cov < 0.5 || rating <= 2;
          const nextLevel = good ? Math.min(2, level + 1) : poor ? Math.max(0, level - 1) : level;
          setLevel(nextLevel);
          setLastRes(res);
          if (setup.followups && !poor && cur.content.followups.length) {
            setTimeout(() => { setFu(cur.content.followups[Math.floor(Math.random() * cur.content.followups.length)]); setNotes(''); setSecs(0); setPhase('fu-ask'); }, 50);
          } else {
            const pre = poor ? (META[cur.id].prereqs || []).find(p => META[p] && !asked.includes(p) && statusOf(p, getStore()).status !== 'mastered') : undefined;
            setTimeout(() => afterQuestion(res, nextLevel, pre), 50);
          }
        }} />
      </div>}

      {phase === 'fu-reveal' && fu && lastRes && <div className="stack" style={{ marginTop: 16 }}>
        <div className="card card-tight"><div className="eyebrow">Model answer</div><Markdown src={fu.a} /></div>
        <div className="eyebrow">How did your follow-up answer compare?</div>
        <div className="row-wrap">
          {(['nailed', 'partial', 'missed'] as const).map(r => <button key={r} className="btn" onClick={() => {
            const res = { ...lastRes, followup: { q: fu.q, result: r } };
            const nextLevel = r === 'missed' ? Math.max(0, level - 1) : level;
            setLevel(nextLevel);
            afterQuestion(res, nextLevel);
          }}>{r === 'nailed' ? 'Nailed it' : r === 'partial' ? 'Partially' : 'Missed it'}</button>)}
        </div>
      </div>}
    </div>
    <div className="tiny faint" style={{ marginTop: 10 }}>Current difficulty: {LEVELS[level]}{setup.level !== 'adaptive' ? ' (fixed)' : ' (adaptive)'}</div>
  </div>;
}

function SummaryRow({ r, n, text }: { r: Result; n: number; text: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<QContent | null>(null);
  useEffect(() => { if (open && !content) loadQuestion(r.id).then(setContent); }, [open]);
  const cov = r.covered / Math.max(1, r.total);
  return <div className="card card-tight">
    <div className="spread" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
      <div className="stack" style={{ gap: 2 }}><span className="small faint">Q{n} · {r.level}{r.remedial ? ' · prerequisite' : ''}</span><b className="small">{text}</b></div>
      <div className="row"><span className={'chip ' + (cov >= 0.8 ? 's-mastered' : cov >= 0.5 ? 's-learning' : 's-needs-review')}>{Math.round(cov * 100)}%</span><span className="small faint">{mmss(r.seconds)}</span></div>
    </div>
    {r.followup && <div className="small muted" style={{ marginTop: 6 }}>Follow-up: <i dangerouslySetInnerHTML={{ __html: mdInline(r.followup.q, resolveQ) }} /> · <b>{r.followup.result}</b></div>}
    {open && content && <div className="stack" style={{ marginTop: 10 }}>
      {r.missed.length > 0 ? <><div className="eyebrow">What you missed, and why it matters</div>
        {r.missed.map(i => <div key={i} className="missed-pt"><b dangerouslySetInnerHTML={{ __html: mdInline(content.rubric[i]?.point || '', resolveQ) }} />{content.rubric[i]?.why && <div className="small muted" dangerouslySetInnerHTML={{ __html: mdInline(content.rubric[i].why, resolveQ) }} />}</div>)}</>
        : <div className="small" style={{ color: 'var(--ok)' }}>You covered every key point.</div>}
      <Link className="btn btn-sm" to={`/q/${r.id}`}>Study this question <IArrowR size={13} /></Link>
    </div>}
    {!open && r.missed.length > 0 && <div className="tiny faint" style={{ marginTop: 4 }}>Click to see the {r.missed.length} missed point{r.missed.length > 1 ? 's' : ''} explained</div>}
  </div>;
}

function reasonLabel(reason: string) {
  if (/flagged/i.test(reason)) return 'Flagged';
  if (/spaced review/i.test(reason)) return 'Scheduled review';
  if (/missed key points/i.test(reason)) return 'Missed key points';
  if (/Quiz accuracy/i.test(reason)) return 'Low quiz accuracy';
  return reason;
}

function ReviewQueue({ ids, store }: { ids: string[]; store: ReturnType<typeof getStore> }) {
  if (!ids.length) return <div className="card review-empty" style={{ marginTop: 20 }}>
    <h2 className="review-h">Nothing due for review</h2>
    <p className="small muted" style={{ margin: '4px 0 12px' }}>No questions are flagged, overdue or weak right now. Flag a question from its page, or complete a self-check, and it will show up here.</p>
    <div className="row-wrap"><Link className="btn btn-primary" to="/interview">Try a mock interview</Link><Link className="btn" to="/quiz">Quiz drill</Link></div>
  </div>;
  return <div className="card review-queue" style={{ marginTop: 20 }}>
    <div className="spread"><h2 className="review-h">Due for review</h2><span className="small muted">{ids.length} question{ids.length === 1 ? '' : 's'}</span></div>
    <div className="review-list">
      {ids.map(id => { const q = Q_BY_ID.get(id)!; const st = statusOf(id, store); return <Link key={id} className="review-row" to={`/q/${id}`}>
        <span className="review-main"><span className="review-title">{titleOf(id)}</span><span className="tiny faint">Q{q.n} · {DOMAIN_BY_ID.get(q.domainId)?.title}</span></span>
        <span className="chip s-needs-review review-why" title={st.reason}>{reasonLabel(st.reason)}</span>
        <span className="small review-read">Read <IArrowR size={13} /></span>
      </Link>; })}
    </div>
  </div>;
}
