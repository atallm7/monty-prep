import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Q_BY_ID, META, loadQuestion, titleOf, type QContent } from '../lib/data';
import { IX } from './Icons';

// "Ask Claude" hand-off: the site has no server and no API key, so the question is sent to
// claude.ai (the reader's own account) with this page's content attached.

const CLAUDE_URL = 'https://claude.ai/new?q=';
const URL_BUDGET = 6000; // encoded characters of prompt carried in the link; the full page goes via the clipboard

// Sections in the order they are most useful as context for a question about the page.
const CONTEXT_ORDER: [string, string][] = [
  ['basics', 'The idea in plain words'], ['answer', 'Spoken answer'], ['technical', 'Technical answer'],
  ['concepts', 'Concepts'], ['terms', 'Terminology'], ['mistakes', 'Common mistakes'], ['deep', 'Deep dive'],
  ['assumptions', 'Assumptions'], ['applications', 'Applications'], ['exceptional', 'Average vs exceptional'],
];

/** Markdown → plain study text: drop figures/sims (they are JSON or SVG, useless as chat context). */
export function plainText(md: string): string {
  return md
    .replace(/```(circuit|plot|bode|timing|mermaid|svg|sim)[\s\S]*?```/g, '')
    .replace(/^Figure:.*$/gm, '')
    .replace(/\[\[(q\d{4})\]\]/g, (_m, id) => `"${titleOf(id)}"`)
    .replace(/\n{3,}/g, '\n\n').trim();
}

function pageContext(id: string, c: QContent): { full: string; parts: string[] } {
  const q = Q_BY_ID.get(id)!;
  const head = `Interview question ${q.n}: ${q.text}`;
  const parts = CONTEXT_ORDER.filter(([k]) => c.sections[k]).map(([k, t]) => `## ${t}\n${plainText(c.sections[k])}`);
  return { full: [head, ...parts].join('\n\n'), parts: [head, ...parts] };
}

const INTRO = 'I am studying for hardware engineering interviews using a study page. Answer my question using the page content below. Start from the basics, define any term you use, and keep it short unless I ask for more. If the page seems wrong or incomplete, say so.';

export function buildPrompts(question: string, selection: string, ctx: { full: string; parts: string[] } | null, where: string) {
  const ask = `My question: ${question.trim()}` + (selection ? `\n\nThe part I am asking about:\n"${selection}"` : '');
  if (!ctx) return { link: `${INTRO.replace(' using the page content below', '')}\n\nI am on the "${where}" page of a hardware interview prep site.\n\n${ask}`, full: '' };
  const full = `${INTRO}\n\n${ask}\n\n--- PAGE CONTENT ---\n${ctx.full}`;
  // Fit as many whole sections as the link budget allows, then a cut piece of the next one.
  let body = '';
  for (const p of ctx.parts) {
    const trial = body ? body + '\n\n' + p : p;
    if (encodeURIComponent(`${INTRO}\n\n${ask}\n\n--- PAGE CONTENT (shortened) ---\n${trial}`).length <= URL_BUDGET) { body = trial; continue; }
    let lo = 0, hi = p.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; const t = (body ? body + '\n\n' : '') + p.slice(0, mid) + ' …';
      if (encodeURIComponent(`${INTRO}\n\n${ask}\n\n--- PAGE CONTENT (shortened) ---\n${t}`).length <= URL_BUDGET) lo = mid; else hi = mid - 1; }
    if (lo > 200) body = (body ? body + '\n\n' : '') + p.slice(0, lo) + ' …';
    break;
  }
  return { link: `${INTRO}\n\n${ask}\n\n--- PAGE CONTENT (shortened) ---\n${body}`, full };
}

const STARTERS_Q = ['Explain this like I am new to electronics', 'Give me a simpler example', 'Why does this matter in a real product?', 'Quiz me on this page, one question at a time'];
const STARTERS_ANY = ['What should I study first for a hardware internship interview?', 'How do I structure an answer to a technical interview question?'];

export default function AskClaude() {
  const loc = useLocation();
  const id = useMemo(() => { const m = loc.pathname.match(/^\/q\/(q\d{4})/); return m && Q_BY_ID.has(m[1]) ? m[1] : null; }, [loc.pathname]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [selection, setSelection] = useState('');
  const [content, setContent] = useState<{ id: string; c: QContent | null } | null>(null);
  const [sent, setSent] = useState<null | { copied: boolean; hasPage: boolean }>(null);
  const [copiedAgain, setCopiedAgain] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const lastFull = useRef('');

  // Remember what the reader highlighted before the panel takes focus.
  const openPanel = () => {
    const s = (window.getSelection()?.toString() || '').trim().replace(/\s+/g, ' ');
    setSelection(s.length > 3 ? s.slice(0, 600) : '');
    setSent(null); setOpen(true);
  };
  useEffect(() => { if (open) box.current?.focus(); }, [open]);
  useEffect(() => { setSent(null); setSelection(''); }, [id]);
  useEffect(() => {
    if (!open || !id || content?.id === id) return;
    let live = true;
    loadQuestion(id).then(c => { if (live) setContent({ id, c }); });
    return () => { live = false; };
  }, [open, id, content]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open]);

  const ready = !id || (content?.id === id);
  const where = id ? titleOf(id) : (document.title.split('·')[0].trim() || 'home');

  const send = (question: string) => {
    if (!question.trim() || !ready) return;
    const ctx = id && content?.id === id && content.c ? pageContext(id, content.c) : null;
    const p = buildPrompts(question, selection, ctx, where);
    lastFull.current = p.full;
    // Open first, inside the click, so the browser does not treat it as a pop-up.
    window.open(CLAUDE_URL + encodeURIComponent(p.link), '_blank', 'noopener');
    const done = (copied: boolean) => setSent({ copied, hasPage: !!p.full });
    if (p.full && navigator.clipboard?.writeText) navigator.clipboard.writeText(p.full).then(() => done(true), () => done(false));
    else done(false);
  };
  const copyFull = () => {
    navigator.clipboard?.writeText(lastFull.current).then(() => { setCopiedAgain(true); setTimeout(() => setCopiedAgain(false), 1800); }, () => {});
  };

  const starters = id ? STARTERS_Q : STARTERS_ANY;
  return <>
    {!open && <button className="ask-fab" onClick={openPanel} aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z" /></svg>
      <span>Ask Claude</span>
    </button>}
    {open && <aside className="ask-panel" role="dialog" aria-label="Ask Claude about this page">
      <div className="ask-head">
        <div><div className="ask-title">Ask Claude</div>
          <div className="ask-sub">{id ? <>About: <b>{META[id]?.title || where}</b></> : 'About hardware interview prep'}</div></div>
        <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><IX /></button>
      </div>
      <div className="ask-body">
        {selection && <div className="ask-quote"><span className="ask-quote-t">Asking about the text you highlighted</span>“{selection.length > 180 ? selection.slice(0, 180) + '…' : selection}”
          <button className="ask-link" onClick={() => setSelection('')}>Remove</button></div>}
        <label className="ask-label" htmlFor="ask-box">Your question</label>
        <textarea id="ask-box" ref={box} className="ask-box" rows={4} value={text} placeholder={id ? 'e.g. Why does the capacitor block DC?' : 'e.g. Where should I start?'}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
        <button className="btn btn-primary ask-send" disabled={!text.trim() || !ready} onClick={() => send(text)}>{ready ? 'Ask in Claude' : 'Loading page…'}</button>
        {sent && <div className="ask-sent" role="status">
          <b>Opened Claude in a new tab.</b>{' '}
          {sent.hasPage ? <>Your question went with a shortened copy of this page.{' '}
            {sent.copied ? <>The <b>full page is on your clipboard</b>: paste it into the chat if Claude needs more detail.</>
              : <>For more detail, <button className="ask-link" onClick={copyFull}>{copiedAgain ? 'copied' : 'copy the full page'}</button> and paste it into the chat.</>}</>
            : 'Your question was sent.'}
          <div className="ask-hint">Nothing opened? Allow pop-ups for this site, then ask again.</div>
        </div>}
        <div className="ask-starters">
          <span className="ask-label">Or try one</span>
          {starters.map(s => <button key={s} className="ask-chip" disabled={!ready} onClick={() => { setText(s); send(s); }}>{s}</button>)}
        </div>
        <p className="ask-note">{id
          ? 'Tip: highlight any sentence on the page before opening this panel to ask about that exact part.'
          : 'Open a question page first to ask about its content.'}{' '}
          Answers come from claude.ai in your own account; this site sends nothing anywhere else.</p>
      </div>
    </aside>}
  </>;
}
