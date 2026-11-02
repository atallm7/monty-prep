import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Q_BY_ID, SECTION_BY_ID, DOMAIN_BY_ID, META, loadQuestion, neighbors, titleOf, QContent, resolveQ } from '../lib/data';
import { useStore, statusOf, actions } from '../lib/progress';
import { SECTION_DEFS } from '../content/parse.mjs';
import Markdown from '../components/Markdown';
import StatusChip, { DiffChip } from '../components/StatusChip';
import QuizItemView from '../components/QuizItem';
import SelfCheck from '../components/SelfCheck';
import { IArrowL, IArrowR, IBookmark, IEye, IFlag } from '../components/Icons';
import { mdInline } from '../lib/markdown';

const TITLE = Object.fromEntries(SECTION_DEFS.map(d => [d.key, d.title])) as Record<string, string>;
const ANSWER_TABS = [
  { key: 'answer', label: 'Say it like this' },
  { key: 'short', label: '30 seconds' },
  { key: 'long', label: '2 minutes' },
  { key: 'technical', label: 'Technical detail' },
] as const;
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function usePref(key: string, def: boolean) {
  const [v, setV] = useState<boolean>(() => { try { const x = localStorage.getItem(key); return x === null ? def : x === '1'; } catch { return def; } });
  return [v, (n: boolean) => { setV(n); try { localStorage.setItem(key, n ? '1' : '0'); } catch { /* */ } }] as const;
}

function Section({ id, title, children, eyebrow }: { id: string; title: string; children: React.ReactNode; eyebrow?: string }) {
  return <section id={`sec-${id}`} className="q-section">
    {eyebrow && <div className="eyebrow">{eyebrow}</div>}
    <h2 className="q-h2">{title}</h2>
    {children}
  </section>;
}

function FollowUps({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  return <div className="followups">
    {items.map((f, i) => (
      <div key={i} className={'fu' + (open.has(i) ? ' open' : '')}>
        <button className="fu-q" onClick={() => { const n = new Set(open); n.has(i) ? n.delete(i) : n.add(i); setOpen(n); }}>
          <span className="fu-n">{i + 1}</span><span dangerouslySetInnerHTML={{ __html: mdInline(f.q, resolveQ) }} /><span className="fu-toggle">{open.has(i) ? 'Hide' : 'Think, then reveal'}</span>
        </button>
        {open.has(i) && <div className="fu-a fade-in"><Markdown src={f.a} /></div>}
      </div>
    ))}
  </div>;
}

export default function QuestionPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = Q_BY_ID.get(id);
  const store = useStore();
  const [content, setContent] = useState<QContent | null | undefined>(undefined);
  const [tab, setTab] = useState<(typeof ANSWER_TABS)[number]['key']>('answer');
  const [hide, setHide] = usePref('mcp.hideAnswers', false);
  const [revealed, setRevealed] = useState(false);
  const [active, setActive] = useState('question');

  useEffect(() => { setContent(undefined); setRevealed(false); setTab('answer'); if (q) { actions.view(q.id); loadQuestion(q.id).then(setContent); } }, [id]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/input|textarea|select/i.test((e.target as HTMLElement).tagName) || e.metaKey || e.ctrlKey) return;
      const { prev, next } = neighbors(id);
      if (e.key === 'ArrowRight' && e.altKey && next) nav(`/q/${next.id}`);
      if (e.key === 'ArrowLeft' && e.altKey && prev) nav(`/q/${prev.id}`);
      if (e.key === 'j' && next) nav(`/q/${next.id}`);
      if (e.key === 'k' && prev) nav(`/q/${prev.id}`);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [id]);
  // scroll-spy for the table of contents
  useEffect(() => {
    if (!content) return;
    const els = [...document.querySelectorAll('.q-section')];
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) setActive(e.target.id.replace('sec-', '')); }, { rootMargin: '-30% 0px -60% 0px' });
    els.forEach(e => io.observe(e)); return () => io.disconnect();
  }, [content]);

  const toc = useMemo(() => {
    if (!content) return [];
    const t = [{ id: 'question', label: 'The question' }];
    if (content.sections.interpretations) t.push({ id: 'interpretations', label: 'Interpretations' });
    t.push({ id: 'answer', label: 'Model answers' }, { id: 'terms', label: 'Terminology' }, { id: 'exceptional', label: 'Average vs exceptional' }, { id: 'mistakes', label: 'Mistakes to avoid' }, { id: 'deep', label: 'Deep dive' }, { id: 'applications', label: 'Applications' }, { id: 'assumptions', label: 'Assumptions' }, { id: 'followups', label: `Follow-ups (${content.followups.length})` }, { id: 'selfcheck', label: 'Self-check' }, { id: 'quiz', label: `Quiz (${content.quiz.length})` }, { id: 'references', label: 'References' });
    return t;
  }, [content]);

  if (!q) return <div className="page"><div className="empty">Question not found. <Link to="/library">Browse the library</Link></div></div>;
  const sec = SECTION_BY_ID.get(q.sectionId)!; const dom = DOMAIN_BY_ID.get(q.domainId)!;
  const { prev, next } = neighbors(q.id);
  const st = statusOf(q.id, store); const qs = store.q[q.id];
  const meta = META[q.id];
  const answersHidden = hide && !revealed;

  return (
    <div className="page q-page fade-in" key={q.id}>
      <div className="q-layout">
        <article className="q-main">
          <nav className="crumbs small">
            <Link to={`/d/${dom.id}`}>{dom.title}</Link>
            {sec.path.map((p, i) => <span key={i}> › {i === sec.path.length - 1 ? <Link to={`/s/${sec.id}`}>{p}</Link> : <span className="faint">{p}</span>}</span>)}
          </nav>
          <header className="q-header">
            <div className="row-wrap" style={{ marginBottom: 10 }}>
              <span className="q-num">Question {q.n}</span>
              {meta && <DiffChip d={meta.difficulty} />}
              {meta && <span className="chip">{meta.kind}</span>}
              <StatusChip status={st.status} title={st.reason} />
            </div>
            <h1 className="q-title">{q.text}</h1>
            {q.subItems.length > 0 && <ul className="q-subitems">{q.subItems.map((s, i) => <li key={i}>{s}</li>)}</ul>}
            {sec.note && <p className="q-note small"><b>Source note for this section:</b> {sec.note}</p>}
            <div className="row-wrap" style={{ marginTop: 14 }}>
              <button className="btn btn-sm btn-accent" onClick={() => scrollTo('sec-selfcheck')}>Practice answering</button>
              <button className={'btn btn-sm' + (qs?.bookmarked ? ' btn-primary' : '')} onClick={() => actions.bookmark(q.id, !qs?.bookmarked)}><IBookmark size={14} />{qs?.bookmarked ? 'Bookmarked' : 'Bookmark'}</button>
              <button className={'btn btn-sm' + (qs?.manual === 'needs-review' ? ' btn-primary' : '')} title="Flag for your review queue" onClick={() => actions.setManual(q.id, qs?.manual === 'needs-review' ? null : 'needs-review')}><IFlag size={14} />{qs?.manual === 'needs-review' ? 'Flagged for review' : 'Flag for review'}</button>
              <span style={{ flex: 1 }} />
              <label className="toggle small" title="Hide model answers until you try"><input type="checkbox" checked={hide} onChange={e => setHide(e.target.checked)} />Hide answers until I try</label>
            </div>
          </header>

          {content === undefined && <div className="empty">Loading…</div>}
          {content === null && <div className="card" style={{ marginTop: 24 }}><b>Content for this question isn't available yet.</b><p className="muted small">The question is listed in the source material; its study page hasn't been generated.</p></div>}
          {content && <>
            <Section id="question" title="Understand the question">
              <div className="q-cards">
                <div className="q-card"><div className="q-card-t">{TITLE.testing}</div><Markdown src={content.sections.testing} /></div>
                <div className="q-card"><div className="q-card-t">{TITLE.why}</div><Markdown src={content.sections.why} /></div>
              </div>
              <div className="q-card" style={{ marginTop: 12 }}><div className="q-card-t">{TITLE.concepts}</div><Markdown src={content.sections.concepts} />
                {(meta?.prereqs?.length || 0) > 0 && <div className="row-wrap small" style={{ marginTop: 10 }}><span className="faint">Learn first:</span>{meta!.prereqs.map(p => <Link key={p} className="chip" to={`/q/${p}`}>Q{Q_BY_ID.get(p)?.n}: {titleOf(p)}</Link>)}</div>}
                {(meta?.related?.length || 0) > 0 && <div className="row-wrap small" style={{ marginTop: 8 }}><span className="faint">Related:</span>{meta!.related.map(p => <Link key={p} className="chip" to={`/q/${p}`}>Q{Q_BY_ID.get(p)?.n}: {titleOf(p)}</Link>)}</div>}
              </div>
            </Section>

            {content.sections.interpretations && <Section id="interpretations" title={TITLE.interpretations}><Markdown src={content.sections.interpretations} /></Section>}

            <Section id="answer" title="Model answers">
              <div className="seg" role="tablist" style={{ marginBottom: 14 }}>
                {ANSWER_TABS.map(t => <button key={t.key} role="tab" className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
              </div>
              {answersHidden ? <div className="hidden-answer">
                <p>Try answering out loud first, then reveal. (Turn this off with “Hide answers until I try”.)</p>
                <div className="row"><button className="btn btn-primary" onClick={() => setRevealed(true)}><IEye size={15} /> Reveal model answers</button><button className="btn" onClick={() => scrollTo('sec-selfcheck')}>Do a timed self-check instead</button></div>
              </div> : <div className="answer-pane fade-in" key={tab}><Markdown src={content.sections[tab]} /></div>}
            </Section>

            <Section id="terms" title={TITLE.terms}><div className="terms"><Markdown src={content.sections.terms} /></div></Section>
            <Section id="exceptional" title={TITLE.exceptional}><Markdown src={content.sections.exceptional} /></Section>
            <Section id="mistakes" title={TITLE.mistakes}><Markdown src={content.sections.mistakes} /></Section>
            <Section id="deep" title={TITLE.deep} eyebrow="Learn the engineering"><Markdown src={content.sections.deep} /></Section>
            <Section id="applications" title={TITLE.applications}><Markdown src={content.sections.applications} /></Section>
            <Section id="assumptions" title={TITLE.assumptions}><Markdown src={content.sections.assumptions} /></Section>
            <Section id="followups" title="Follow-up questions" eyebrow="What the interviewer asks next"><FollowUps items={content.followups} /></Section>
            <Section id="selfcheck" title="Self-check: answer it out loud" eyebrow="Earn mastery"><SelfCheck id={q.id} content={content} /></Section>
            <Section id="quiz" title="Quiz" eyebrow="Check your understanding">
              <div className="stack">{content.quiz.map((it, i) => <QuizItemView key={q.id + i} item={it} index={i} prior={qs?.quiz[i]} onAnswered={ok => actions.answerQuiz(q.id, i, ok)} />)}</div>
            </Section>
            <Section id="references" title={TITLE.references}><div className="refs"><Markdown src={content.sections.references} /></div></Section>
          </>}

          <div className="q-pager">
            {prev ? <Link className="pager-card" to={`/q/${prev.id}`}><span className="faint small"><IArrowL size={12} /> Previous · Q{prev.n}</span><span>{titleOf(prev.id)}</span></Link> : <span />}
            {next ? <Link className="pager-card right" to={`/q/${next.id}`}><span className="faint small">Next · Q{next.n} <IArrowR size={12} /></span><span>{titleOf(next.id)}</span></Link> : <span />}
          </div>
          <div className="tiny faint" style={{ textAlign: 'center', marginTop: 12 }}>Shortcuts: <kbd>j</kbd> next · <kbd>k</kbd> previous · <kbd>Ctrl K</kbd> search</div>
        </article>
        {content && <aside className="q-toc">
          <div className="eyebrow" style={{ marginBottom: 8 }}>On this page</div>
          {toc.map(t => <button key={t.id} className={'toc-link' + (active === t.id ? ' on' : '')} onClick={() => scrollTo('sec-' + t.id)}>{t.label}</button>)}
          <div className="toc-status">
            <StatusChip status={st.status} />
            <div className="tiny muted" style={{ marginTop: 6 }}>{st.reason}</div>
          </div>
        </aside>}
      </div>
    </div>
  );
}
