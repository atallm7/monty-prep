import { useMemo, useState } from 'react';
import type { QuizItem } from '../lib/data';
import { mdInline, mdToHtml } from '../lib/markdown';
import { resolveQ } from '../lib/data';
import { ICheck, IX } from './Icons';
import { parseNumericAnswer } from '../lib/units';
import { shuffleItem } from '../lib/quizShuffle';

export function checkAnswer(item: QuizItem, resp: unknown): boolean {
  switch (item.type) {
    case 'mcq': return resp === item.answer;
    case 'truefalse': return resp === item.answer;
    case 'multi': { const a = [...(item.answer as number[])].sort().join(','); const r = [...((resp as number[]) || [])].sort().join(','); return a === r; }
    case 'numeric': {
      const v = typeof resp === 'number' ? resp : parseNumericAnswer(String(resp), item.unit);
      if (!isFinite(v)) return false;
      const ans = item.answer as number; const tol = item.tolerance ?? 0.02;
      return ans === 0 ? Math.abs(v) <= tol : Math.abs(v - ans) / Math.abs(ans) <= tol;
    }
  }
}

/** Renders one quiz item; calls onAnswered(correct) once checked. */
export default function QuizItemView({ item: raw, index, onAnswered, prior }: { item: QuizItem; index?: number; onAnswered?: (correct: boolean) => void; prior?: { c: boolean } }) {
  const item = useMemo(() => shuffleItem(raw), [raw]);
  const [resp, setResp] = useState<unknown>(item.type === 'multi' ? [] : null);
  const [checked, setChecked] = useState<null | boolean>(null);
  const html = (s: string) => ({ __html: mdInline(s, resolveQ) });
  const submit = () => { const ok = checkAnswer(item, resp); setChecked(ok); onAnswered?.(ok); };
  const reveal = checked !== null;
  const correctIdx = (i: number) => item.type === 'mcq' ? item.answer === i : item.type === 'multi' ? (item.answer as number[]).includes(i) : false;
  return (
    <div className={'quiz-item' + (reveal ? (checked ? ' ok' : ' bad') : '')}>
      <div className="quiz-q">
        {index !== undefined && <span className="quiz-n">{index + 1}</span>}
        <span className={`chip d-${item.level}`}>{item.level}</span>
        {prior && !reveal && <span className={'tiny ' + (prior.c ? 'ok-t' : 'bad-t')}>{prior.c ? 'previously correct' : 'previously missed'}</span>}
      </div>
      <div className="quiz-prompt prose" dangerouslySetInnerHTML={{ __html: mdToHtml(item.q, resolveQ) }} />
      {(item.type === 'mcq' || item.type === 'multi') && (
        <div className="quiz-opts">
          {item.options!.map((o, i) => {
            const chosen = item.type === 'mcq' ? resp === i : (Array.isArray(resp) ? resp : []).includes(i);
            const cls = reveal ? (correctIdx(i) ? ' correct' : chosen ? ' wrong' : '') : chosen ? ' chosen' : '';
            return <button key={i} className={'quiz-opt' + cls} disabled={reveal}
              onClick={() => { if (item.type === 'mcq') setResp(i); else { const r = new Set(resp as number[]); r.has(i) ? r.delete(i) : r.add(i); setResp([...r]); } }}>
              <span className="quiz-key">{item.type === 'multi' ? (chosen ? '☑' : '☐') : String.fromCharCode(65 + i)}</span>
              <span dangerouslySetInnerHTML={html(o)} />
              {reveal && correctIdx(i) && <ICheck size={16} />}
              {reveal && chosen && !correctIdx(i) && <IX size={16} />}
            </button>;
          })}
          {item.type === 'multi' && !reveal && <div className="tiny faint">Select all that apply.</div>}
        </div>
      )}
      {item.type === 'truefalse' && (
        <div className="quiz-opts">
          {[true, false].map(v => <button key={String(v)} disabled={reveal} className={'quiz-opt tf' + (reveal ? (item.answer === v ? ' correct' : resp === v ? ' wrong' : '') : resp === v ? ' chosen' : '')} onClick={() => setResp(v)}>{v ? 'True' : 'False'}</button>)}
        </div>
      )}
      {item.type === 'numeric' && (
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" style={{ maxWidth: 200 }} inputMode="decimal" placeholder="Your answer" disabled={reveal}
            value={(resp as string) ?? ''} onChange={e => setResp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && resp) submit(); }} />
          {item.unit && <span className="muted" dangerouslySetInnerHTML={html(item.unit)} />}
          {reveal && <span className="muted small">Answer: <b>{item.answer as number}</b> {item.unit && <span dangerouslySetInnerHTML={html(item.unit)} />} (±{Math.round((item.tolerance ?? 0.02) * 100)}%)</span>}
        </div>
      )}
      {!reveal && <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary quiz-check" disabled={resp === null || resp === '' || (Array.isArray(resp) && !resp.length)} onClick={submit}>Check answer</button>
      </div>}
      {reveal && <div className={'quiz-explain ' + (checked ? 'ok' : 'bad')}>
        <div className="quiz-verdict">{checked ? 'Correct' : 'Not quite'}</div>
        <div className="prose" dangerouslySetInnerHTML={{ __html: mdToHtml(item.explain, resolveQ) }} />
      </div>}
    </div>
  );
}
