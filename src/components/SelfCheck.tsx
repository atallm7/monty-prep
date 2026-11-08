import { useEffect, useRef, useState } from 'react';
import type { QContent } from '../lib/data';
import { actions, useStore, statusOf } from '../lib/progress';
import Markdown from './Markdown';
import { mdInline } from '../lib/markdown';
import { resolveQ } from '../lib/data';
import { ITimer, IPlay } from './Icons';
import StatusChip from './StatusChip';

export function useTimer(running: boolean) {
  const [s, setS] = useState(0);
  const start = useRef<number>(0);
  useEffect(() => {
    if (!running) return;
    start.current = Date.now() - s * 1000;
    const t = setInterval(() => setS(Math.floor((Date.now() - start.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [running]);
  return [s, setS] as const;
}
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const RATINGS = [
  { v: 1, label: 'Couldn’t answer', hint: 'Blank or mostly wrong' },
  { v: 2, label: 'Shaky', hint: 'Got pieces, wouldn’t pass' },
  { v: 3, label: 'Solid', hint: 'Correct and clear' },
  { v: 4, label: 'Interview-ready', hint: 'Confident, handles follow-ups' },
];

/** Rubric checklist + rating; used by the question page and the interview simulator. */
export function RubricGrader({ content, onSubmit, submitLabel = 'Save self-check', helper }: { content: QContent; onSubmit: (covered: number[], rating: number) => void; submitLabel?: string; helper?: string }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [rating, setRating] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const missed = content.rubric.map((_, i) => i).filter(i => !checked.has(i));
  return <div className="stack">
    <div className="eyebrow">Which of these key points did you actually say?</div>
    <div className="rubric">
      {content.rubric.map((r, i) => (
        <label key={i} className={'rubric-item' + (checked.has(i) ? ' on' : '') + (done && !checked.has(i) ? ' missed' : '')}>
          <input type="checkbox" disabled={done} checked={checked.has(i)} onChange={() => { const n = new Set(checked); n.has(i) ? n.delete(i) : n.add(i); setChecked(n); }} />
          <span><span dangerouslySetInnerHTML={{ __html: mdInline(r.point, resolveQ) }} />
            {done && !checked.has(i) && r.why && <span className="rubric-why" dangerouslySetInnerHTML={{ __html: mdInline('**Why it matters:** ' + r.why, resolveQ) }} />}</span>
        </label>
      ))}
    </div>
    <div className="eyebrow" style={{ marginTop: 4 }}>How did it go?</div>
    <div className="rating-row" role="radiogroup" aria-label="How did it go?">
      {RATINGS.map(r => <button key={r.v} role="radio" aria-checked={rating === r.v} disabled={done} className={'rating-btn' + (rating === r.v ? ' on' : '')} onClick={() => setRating(r.v)}><b>{r.label}</b><span>{r.hint}</span></button>)}
    </div>
    {!done && <div className="row-wrap rubric-actions"><button className="btn btn-accent btn-lg" disabled={rating === null} onClick={() => { setDone(true); onSubmit([...checked], rating!); }}>{submitLabel}</button>
      <span className="small faint">{rating === null ? (helper || 'Pick how it went to save') + ' · ' : ''}{checked.size}/{content.rubric.length} points covered</span></div>}
    {done && <div className={'callout ' + (missed.length === 0 ? 'callout-tip' : 'callout-warning')}>
      <div className="callout-title">{missed.length === 0 ? 'You hit every key point.' : `You missed ${missed.length} key point${missed.length > 1 ? 's' : ''}. Each one's reason is shown above.`}</div>
      <p className="small" style={{ margin: 0 }}>Coverage {Math.round(checked.size / Math.max(1, content.rubric.length) * 100)}%. Mastery needs ≥80% coverage with a rating of “Solid” or better, plus ≥80% on the quiz.</p>
    </div>}
  </div>;
}

export default function SelfCheck({ id, content }: { id: string; content: QContent }) {
  const store = useStore();
  const [phase, setPhase] = useState<'idle' | 'answering' | 'grading' | 'done'>('idle');
  const [secs, setSecs] = useTimer(phase === 'answering');
  const [notes, setNotes] = useState('');
  const st = statusOf(id, store);
  const attempts = (store.q[id]?.attempts || []).filter(a => a.mode !== 'quiz');
  return (
    <div className="selfcheck">
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <div className="row"><StatusChip status={st.status} /><span className="small muted">{st.reason}</span></div>
        {attempts.length > 0 && <span className="small faint">{attempts.length} previous attempt{attempts.length > 1 ? 's' : ''} · last {Math.round(attempts[attempts.length - 1].covered / Math.max(1, attempts[attempts.length - 1].total) * 100)}% coverage</span>}
      </div>
      {phase === 'idle' && <div className="selfcheck-start">
        <p className="muted" style={{ margin: 0 }}>Answer out loud as if the interviewer just asked. Aim for the 30-second version first, then expand. The model answer stays hidden until you're done.</p>
        <button className="btn btn-primary" onClick={() => { setSecs(0); setPhase('answering'); }}><IPlay size={14} /> Start answering</button>
      </div>}
      {phase === 'answering' && <div className="stack">
        <div className="timer-big"><ITimer size={18} /> {mmss(secs)} <span className="small faint">target 0:30–2:00</span></div>
        <textarea className="input" placeholder="Optional: jot down key points as you speak (helps you grade honestly)…" value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="row"><button className="btn btn-accent" onClick={() => setPhase('grading')}>I'm done: reveal model answer</button></div>
      </div>}
      {(phase === 'grading' || phase === 'done') && <div className="stack">
        <div className="grid-2 selfcheck-compare">
          <div className="card card-tight"><div className="eyebrow">Your notes · {mmss(secs)}</div><div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{notes || <span className="faint">(spoken answer, no notes)</span>}</div></div>
          <div className="card card-tight"><div className="eyebrow">Model 30-second answer</div><Markdown src={content.sections.short} className="prose small-prose" /></div>
        </div>
        <details className="card card-tight"><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Show the 2-minute model answer</summary><Markdown src={content.sections.long} /></details>
        <RubricGrader content={content} onSubmit={(covered, rating) => {
          actions.recordAttempt(id, { mode: 'self-check', covered: covered.length, total: content.rubric.length, rating, seconds: secs, missed: content.rubric.map((_, i) => i).filter(i => !covered.includes(i)) });
          setPhase('done');
        }} />
        {phase === 'done' && <div className="row"><button className="btn" onClick={() => { setNotes(''); setPhase('idle'); }}>Try again</button><button className="btn btn-ghost" onClick={() => document.getElementById('sec-quiz')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Continue to the quiz ↓</button></div>}
      </div>}
    </div>
  );
}
