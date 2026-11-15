import { useEffect, useMemo, useRef, useState } from 'react';
import type { QContent } from '../lib/data';
import { speakable, chunks, narrationHash, fetchRecording, answerNarration, AUDIO_BASE, type Recording } from '../lib/narration';
import { buildSlides, narration } from './Lesson';

export { speakable } from '../lib/narration';

// Reads parts of the page aloud. Uses the recorded natural voice when a recording exists
// (the lesson recording covers "Start here" and the 30-second version; "The answer" has its own),
// otherwise the browser's built-in voice.

const PARTS = [
  { key: 'basics', label: 'Start here' },
  { key: 'answer', label: 'The answer' },
  { key: 'short', label: '30-second version' },
] as const;
const SPEEDS = [0.85, 1, 1.25, 1.5];
type Seg = { src: string; start: number; end: number; rec: Recording };

export default function ListenBar({ id, content, title, question }: { id: string; content: QContent; title: string; question: string }) {
  const available = PARTS.filter(p => content.sections[p.key]);
  const [part, setPart] = useState<string>(available[0]?.key || 'answer');
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [speed, setSpeed] = useState(() => { try { return +(localStorage.getItem('mcp.speechRate') || 1) || 1; } catch { return 1; } });
  const [pct, setPct] = useState(0);
  const queue = useRef<string[]>([]); const idx = useRef(0); const run = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [lessonRec, setLessonRec] = useState<Recording | null>(null);
  const [answerRec, setAnswerRec] = useState<Recording | null>(null);

  const slides = useMemo(() => (content.sections.basics ? buildSlides(content, title, question) : []), [content, title, question]);
  useEffect(() => {
    let live = true; setLessonRec(null); setAnswerRec(null);
    if (slides.length) fetchRecording(id, narrationHash(narration(slides))).then(r => { if (live) setLessonRec(r); });
    if (content.sections.answer) fetchRecording(id + '.answer', narrationHash(answerNarration(content.sections.answer))).then(r => { if (live) setAnswerRec(r); });
    return () => { live = false; };
  }, [id, slides, content]);

  /** Where in a recording each part lives. */
  const segment = (key: string): Seg | null => {
    if (key === 'answer' && answerRec) return { src: answerRec.url, start: 0, end: answerRec.dur, rec: answerRec };
    if (!lessonRec) return null;
    const at = (k: number) => lessonRec.slides[k]?.start ?? lessonRec.dur;
    const interview = slides.findIndex(s => s.eyebrow === 'Say this in the interview');
    if (key === 'basics') { const end = interview > 0 ? interview : slides.findIndex(s => s.kind === 'quiz'); return { src: lessonRec.url, start: at(1), end: end > 0 ? at(end) - 0.5 : lessonRec.dur, rec: lessonRec }; }
    if (key === 'short' && interview > 0) return { src: lessonRec.url, start: at(interview), end: at(interview + 1) - 0.5, rec: lessonRec };
    return null;
  };
  const seg = useRef<Seg | null>(null);

  const stop = () => { run.current++; window.speechSynthesis?.cancel(); audio.current?.pause(); seg.current = null; setState('idle'); setPct(0); };
  useEffect(() => stop, []);
  useEffect(() => { stop(); }, [content]);

  const speakFrom = (i: number, rate = speed) => {
    const synth = window.speechSynthesis; synth.cancel(); const my = ++run.current;
    const next = (k: number) => {
      if (my !== run.current) return;
      if (k >= queue.current.length) { setState('idle'); setPct(0); return; }
      idx.current = k; setPct(Math.round((k / queue.current.length) * 100));
      const u = new SpeechSynthesisUtterance(queue.current[k]); u.rate = rate; u.lang = 'en-US';
      const v = synth.getVoices().find(v => /en[-_]US/i.test(v.lang) && /natural|google|samantha|aria|jenny/i.test(v.name)) || synth.getVoices().find(v => /^en/i.test(v.lang));
      if (v) u.voice = v;
      u.onend = () => next(k + 1); u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') next(k + 1); };
      synth.speak(u);
    };
    setState('playing'); next(i);
  };
  const play = (key = part) => {
    stop();
    const sg = segment(key);
    if (sg && audio.current) {
      const a = audio.current; seg.current = sg;
      if (!a.src.endsWith(AUDIO_BASE + sg.src) && a.getAttribute('src') !== AUDIO_BASE + sg.src) a.src = AUDIO_BASE + sg.src;
      a.playbackRate = speed; a.currentTime = sg.start;
      a.play().then(() => setState('playing')).catch(() => { seg.current = null; browserPlay(key); });
      return;
    }
    browserPlay(key);
  };
  const browserPlay = (key: string) => {
    if (!('speechSynthesis' in window)) return;
    const label = PARTS.find(p => p.key === key)?.label || '';
    queue.current = chunks(`${label}. ${speakable(content.sections[key] || '')}`);
    if (key === available[0]?.key) queue.current.unshift(title + '.');
    speakFrom(0);
  };
  const toggle = () => {
    if (state === 'idle') return play();
    if (seg.current && audio.current) { if (state === 'playing') { audio.current.pause(); setState('paused'); } else { audio.current.play(); setState('playing'); } return; }
    const synth = window.speechSynthesis;
    if (state === 'playing') { synth.pause(); setState('paused'); } else { synth.resume(); setState('playing'); }
  };
  const onTime = () => {
    const a = audio.current, sg = seg.current; if (!a || !sg) return;
    if (a.currentTime >= sg.end) { stop(); return; }
    setPct(Math.round(((a.currentTime - sg.start) / Math.max(1, sg.end - sg.start)) * 100));
  };
  const changeSpeed = (r: number) => {
    setSpeed(r); try { localStorage.setItem('mcp.speechRate', String(r)); } catch { /* ignore */ }
    if (seg.current && audio.current) audio.current.playbackRate = r; else if (state !== 'idle') speakFrom(idx.current, r);
  };

  const natural = (key: string) => !!segment(key);
  if (!available.length) return null;
  return <div className="listen" role="group" aria-label="Listen to this page">
    <audio ref={audio} preload="none" onTimeUpdate={onTime} onEnded={() => { seg.current = null; setState('idle'); setPct(0); }} />
    <button className="btn btn-sm listen-play" onClick={toggle} aria-label={state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Listen'}>
      {state === 'playing'
        ? <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        : <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>}
      {state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Listen'}
    </button>
    <select className="listen-sel" aria-label="What to listen to" value={part} onChange={e => { setPart(e.target.value); if (state !== 'idle') play(e.target.value); }}>
      {available.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>
    <select className="listen-sel" aria-label="Speaking speed" value={speed} onChange={e => changeSpeed(+e.target.value)}>
      {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
    </select>
    {state !== 'idle' && <>
      <span className="listen-prog" aria-hidden="true"><span style={{ width: pct + '%' }} /></span>
      <button className="btn btn-sm" onClick={stop}>Stop</button>
    </>}
    {state === 'idle' && !natural(part) && <span className="listen-note small faint">natural voice coming soon for this part</span>}
  </div>;
}

/** YouTube search for this topic (opens in a new tab). */
export function videoSearchUrl(title: string) {
  const q = title.replace(/[:?()]/g, ' ').replace(/\s+/g, ' ').trim() + ' explained';
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
}
