import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { QContent, QuizItem } from '../lib/data';
import { splitSegments, mdToHtml } from '../lib/markdown';
import { resolveQ } from '../lib/data';
import { CircuitBlock, TimingBlock, PlotBlock, BodeBlock, MermaidBlock, SvgBlock } from './Blocks';
import { speakable } from './ListenBar';
import { shuffleItem } from '../lib/quizShuffle';
import { IX } from './Icons';

// "Watch the lesson": the page's primer, key diagram and 30-second answer as a narrated slideshow.
// Each slide shows only the key line on screen; the browser's voice says the rest.

type Fig = { kind: string; code: string; caption?: string };
type Slide = { kind: 'title' | 'text' | 'terms' | 'figure' | 'quiz'; eyebrow: string; show: string; say: string; fig?: Fig; terms?: { t: string; d: string }[]; quiz?: QuizItem };

const FIG_KINDS = new Set(['circuit', 'plot', 'bode', 'timing', 'mermaid', 'svg']);

function sub(basics: string, head: string): string {
  const m = basics.match(new RegExp(`###\\s*${head}\\s*\\n([\\s\\S]*?)(?=\\n###|$)`, 'i'));
  return m ? m[1].trim() : '';
}
/** First one or two sentences (the on-screen line); the full text is spoken. */
function lead(md: string, max = 2): string {
  const flat = md.replace(/\n+/g, ' ').trim();
  const parts = flat.match(/[^.!?]+(?:\$[^$]*\$[^.!?]*)*[.!?]+(?=\s|$)/g) || [flat];
  let out = parts.slice(0, max).join(' ').trim();
  if (out.length > 260 && max > 1) out = parts[0].trim();
  return out;
}
function firstFigure(c: QContent): Fig | undefined {
  for (const k of ['answer', 'technical', 'concepts', 'deep', 'applications']) {
    for (const s of splitSegments(c.sections[k] || '')) if (s.kind !== 'md' && FIG_KINDS.has(s.kind)) return s as Fig;
  }
  return undefined;
}

export function buildSlides(c: QContent, title: string, question: string): Slide[] {
  const b = c.sections.basics || '';
  const slides: Slide[] = [{ kind: 'title', eyebrow: 'Lesson', show: title, say: `${title}. The question: ${question}` }];
  const plain = sub(b, 'In plain words'), pic = sub(b, 'Picture it'), words = sub(b, 'Words you need'), ex = sub(b, 'The simplest example');
  if (plain) slides.push({ kind: 'text', eyebrow: 'The idea', show: lead(plain), say: plain });
  if (pic) slides.push({ kind: 'text', eyebrow: 'Picture it', show: lead(pic, 1), say: pic });
  const fig = firstFigure(c);
  if (fig) slides.push({ kind: 'figure', eyebrow: 'Look at this', show: '', say: fig.caption || 'Here is the key diagram for this question.', fig });
  if (words) {
    const terms = [...words.matchAll(/^\s*-\s*\*\*([^*]+)\*\*\s*[:—-]?\s*(.*)$/gm)].map(m => ({ t: m[1].trim(), d: m[2].replace(/\s*See \[\[q\d{4}\]\]\.?/g, '').trim() }));
    if (terms.length) slides.push({ kind: 'terms', eyebrow: 'Words you need', show: '', say: terms.map(x => `${x.t}: ${x.d}`).join('. '), terms });
  }
  if (ex) slides.push({ kind: 'text', eyebrow: 'Simplest example', show: lead(ex.replace(/That is the whole idea[\s\S]*$/i, ''), 3), say: ex.replace(/The rest of this page[\s\S]*$/i, '') });
  if (c.sections.short) slides.push({ kind: 'text', eyebrow: 'Say this in the interview', show: lead(c.sections.short, 2), say: c.sections.short });
  const qz = (c.quiz as QuizItem[]).find(q => q.type === 'mcq' && q.level === 'fundamental') || (c.quiz as QuizItem[]).find(q => q.type === 'mcq');
  if (qz) slides.push({ kind: 'quiz', eyebrow: 'Quick check', show: qz.q, say: 'Quick check. ' + qz.q, quiz: shuffleItem(qz) });
  return slides;
}

function Html({ md, className }: { md: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: mdToHtml(md, resolveQ) }} />;
}
function Figure({ f }: { f: Fig }) {
  switch (f.kind) {
    case 'circuit': return <CircuitBlock code={f.code} caption={f.caption} />;
    case 'timing': return <TimingBlock code={f.code} caption={f.caption} />;
    case 'plot': return <PlotBlock code={f.code} caption={f.caption} />;
    case 'bode': return <BodeBlock code={f.code} caption={f.caption} />;
    case 'mermaid': return <MermaidBlock code={f.code} caption={f.caption} />;
    case 'svg': return <SvgBlock code={f.code} caption={f.caption} />;
  }
  return null;
}
function Quiz({ item }: { item: QuizItem }) {
  const [pick, setPick] = useState<number | null>(null);
  const ans = item.answer as number;
  return <div className="lesson-quiz">
    {(item.options || []).map((o, i) => <button key={i} disabled={pick !== null}
      className={'lesson-opt' + (pick !== null && i === ans ? ' ok' : '') + (pick === i && i !== ans ? ' bad' : '')} onClick={() => setPick(i)}>
      <Html md={String(o)} className="lesson-inline" /></button>)}
    {pick !== null && <div className={'lesson-explain ' + (pick === ans ? 'ok' : 'bad')}><b>{pick === ans ? 'Correct.' : 'Not quite.'}</b> <Html md={item.explain} className="lesson-inline" /></div>}
  </div>;
}

function chunks(t: string): string[] {
  const raw = t.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [t]; const out: string[] = [];
  for (const r of raw) { const x = r.trim(); if (!x) continue; if (out.length && (out[out.length - 1] + ' ' + x).length < 180) out[out.length - 1] += ' ' + x; else out.push(x); }
  return out;
}

export default function Lesson({ content, title, question, onClose }: { content: QContent; title: string; question: string; onClose: () => void }) {
  const slides = useMemo(() => buildSlides(content, title, question), [content, title, question]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem('mcp.lessonVoice') !== '0'; } catch { return true; } });
  const [caption, setCaption] = useState('');
  const run = useRef(0);
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  const rate = (() => { try { return +(localStorage.getItem('mcp.speechRate') || 1) || 1; } catch { return 1; } })();
  const s = slides[i];

  // Narrate the current slide, then move on (quiz slides wait for the learner).
  useEffect(() => {
    const my = ++run.current; synth?.cancel(); setCaption('');
    if (!playing) return;
    if (!voice || !synth) {
      if (s.kind === 'quiz') return;
      const t = setTimeout(() => { if (my === run.current && i < slides.length - 1) setI(i + 1); }, Math.min(14000, 3500 + s.say.length * 45));
      return () => clearTimeout(t);
    }
    const parts = chunks(speakable(s.say));
    const next = (k: number) => {
      if (my !== run.current) return;
      if (k >= parts.length) { setCaption(''); if (s.kind !== 'quiz' && i < slides.length - 1) setTimeout(() => { if (my === run.current) setI(i + 1); }, 700); else if (i >= slides.length - 1) setPlaying(false); return; }
      setCaption(parts[k]);
      const u = new SpeechSynthesisUtterance(parts[k]); u.rate = rate; u.lang = 'en-US';
      const v = synth.getVoices().find(v => /en[-_]US/i.test(v.lang) && /natural|google|samantha|aria|jenny/i.test(v.name)) || synth.getVoices().find(v => /^en/i.test(v.lang));
      if (v) u.voice = v;
      u.onend = () => next(k + 1); u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') next(k + 1); };
      synth.speak(u);
    };
    const t = setTimeout(() => next(0), 350);
    return () => { clearTimeout(t); };
  }, [i, playing, voice]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { run.current++; synth?.cancel(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI(x => Math.min(slides.length - 1, x + 1));
      else if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1));
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [slides.length, onClose]);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  const go = (k: number) => { setI(Math.max(0, Math.min(slides.length - 1, k))); setPlaying(true); };
  const toggleVoice = () => { const v = !voice; setVoice(v); try { localStorage.setItem('mcp.lessonVoice', v ? '1' : '0'); } catch { /* ignore */ } };

  return createPortal(<div className="lesson" role="dialog" aria-modal="true" aria-label={`Lesson: ${title}`}>
    <div className="lesson-top">
      <div className="lesson-dots" aria-hidden="true">{slides.map((_, k) => <span key={k} className={k < i ? 'done' : k === i ? 'on' : ''} />)}</div>
      <span className="lesson-count">{i + 1} / {slides.length}</span>
      <button className="icon-btn" aria-label="Close lesson" onClick={onClose}><IX /></button>
    </div>
    <div className="lesson-stage" key={i}>
      <div className="lesson-eyebrow">{s.eyebrow}</div>
      {s.kind === 'title' && <><h2 className="lesson-title">{s.show}</h2><p className="lesson-q">{question}</p><p className="lesson-hint">About {Math.max(1, Math.round(slides.reduce((a, x) => a + x.say.length, 0) / 900))} min · press play and just listen</p></>}
      {s.kind === 'text' && <Html md={s.show} className="lesson-big" />}
      {s.kind === 'figure' && s.fig && <div className="lesson-fig"><Figure f={s.fig} /></div>}
      {s.kind === 'terms' && <ul className="lesson-terms">{s.terms!.map(t => <li key={t.t}><b>{t.t}</b><Html md={t.d} className="lesson-inline" /></li>)}</ul>}
      {s.kind === 'quiz' && s.quiz && <><Html md={s.show} className="lesson-big lesson-qq" /><Quiz item={s.quiz} /></>}
    </div>
    <div className="lesson-cap" aria-live="polite">{voice && caption ? caption : ' '}</div>
    <div className="lesson-ctrl">
      <button className="btn" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide">‹ Back</button>
      <button className="btn lesson-play" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : 'Play'}</button>
      {i < slides.length - 1 ? <button className="btn" onClick={() => go(i + 1)} aria-label="Next slide">Next ›</button>
        : <button className="btn" onClick={onClose}>Finish</button>}
      <button className={'btn lesson-voice' + (voice ? '' : ' off')} onClick={toggleVoice} aria-pressed={voice}>{voice ? 'Voice on' : 'Voice off'}</button>
    </div>
  </div>, document.body);
}
