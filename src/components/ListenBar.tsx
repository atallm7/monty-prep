import { useEffect, useRef, useState } from 'react';
import type { QContent } from '../lib/data';
import { plainText } from './AskClaude';

// Reads the page aloud with the browser's built-in voice (Web Speech API): no service, no cost.

const PARTS = [
  { key: 'basics', label: 'Start here' },
  { key: 'answer', label: 'The answer' },
  { key: 'short', label: '30-second version' },
  { key: 'long', label: '2-minute version' },
] as const;
const SPEEDS = [0.85, 1, 1.25, 1.5];

/** Markdown + LaTeX → something a voice can say. */
export function speakable(md: string): string {
  let s = plainText(md);
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_m, x) => ' ' + math(x) + '. ').replace(/\$([^$\n]+)\$/g, (_m, x) => math(x));
  return s
    .replace(/^#{1,6}\s*(.*)$/gm, '$1.')            // headings become their own sentence
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')        // links keep their words
    .replace(/[*_`>|]/g, ' ')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s*\n\s*\n\s*/g, '. ').replace(/\s*\n\s*/g, ' ')
    .replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
}
function math(x: string): string {
  const words: Record<string, string> = { Omega: ' ohms', omega: ' omega', mu: ' micro', pi: ' pi', tau: ' tau', theta: ' theta', alpha: ' alpha', beta: ' beta', Delta: ' change in ', delta: ' delta', approx: ' about ', times: ' times ', cdot: ' times ', le: ' at most ', ge: ' at least ', leq: ' at most ', geq: ' at least ', neq: ' not equal to ', to: ' to ', infty: ' infinity', sqrt: ' square root of ', circ: ' degrees', pm: ' plus or minus ', propto: ' proportional to ', ll: ' much less than ', gg: ' much greater than ', int: ' the integral of ', sum: ' the sum of ', partial: ' partial ', ln: ' log ', log: ' log ', sin: ' sine ', cos: ' cosine ' };
  let s = x;
  const grp = (t: string) => /[+\-−]|\\(?:pm|cdot|times)/.test(t.trim().replace(/^-/, '')) ? ` the quantity ${t}, ` : ` ${t} `;
  for (let i = 0; i < 4; i++) s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a, b) => `${grp(a)} over ${grp(b)}`);
  s = s.replace(/\\[dt]?frac\s*([A-Za-z0-9])\s*([A-Za-z0-9])/g, ' $1 over $2 ');
  s = s.replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, ' $1 ')
    .replace(/\\([A-Za-z]+)/g, (_m, w) => words[w] ?? ' ')
    .replace(/_\{([^{}]*)\}/g, ' $1').replace(/_([A-Za-z0-9])/g, ' $1')
    .replace(/\^\{2\}|\^2\b/g, ' squared').replace(/\^\{([^{}]*)\}/g, ' to the $1').replace(/\^([A-Za-z0-9])/g, ' to the $1')
    .replace(/=/g, ' equals ').replace(/\+/g, ' plus ').replace(/(\s)-(\s)/g, ' minus ').replace(/\//g, ' over ')
    .replace(/[{}\\,;]/g, ' ');
  return ' ' + s.replace(/\s{2,}/g, ' ').trim() + ' ';
}
function sentences(t: string): string[] {
  // Chrome stops long utterances after ~15 s, so speak one or two sentences at a time.
  const raw = t.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [t]; const out: string[] = [];
  for (const r of raw) { const x = r.trim(); if (!x) continue; if (out.length && (out[out.length - 1] + ' ' + x).length < 180) out[out.length - 1] += ' ' + x; else out.push(x); }
  return out;
}

export default function ListenBar({ content, title }: { content: QContent; title: string }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const available = PARTS.filter(p => content.sections[p.key]);
  const [part, setPart] = useState<string>(available[0]?.key || 'answer');
  const [state, setState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [speed, setSpeed] = useState(() => { try { return +(localStorage.getItem('mcp.speechRate') || 1) || 1; } catch { return 1; } });
  const [idx, setIdx] = useState(0);
  const queue = useRef<string[]>([]); const run = useRef(0);

  const stop = () => { run.current++; window.speechSynthesis?.cancel(); setState('idle'); setIdx(0); };
  useEffect(() => stop, []);                 // stop talking when leaving the page
  useEffect(() => { stop(); }, [content]);   // or when moving to another question

  const speakFrom = (i: number, rate = speed) => {
    const synth = window.speechSynthesis; synth.cancel(); const my = ++run.current;
    const next = (k: number) => {
      if (my !== run.current) return;
      if (k >= queue.current.length) { setState('idle'); setIdx(0); return; }
      setIdx(k);
      const u = new SpeechSynthesisUtterance(queue.current[k]); u.rate = rate; u.lang = 'en-US';
      const v = synth.getVoices().find(v => /en[-_]US/i.test(v.lang) && /natural|google|samantha|aria|jenny/i.test(v.name)) || synth.getVoices().find(v => /^en/i.test(v.lang));
      if (v) u.voice = v;
      u.onend = () => next(k + 1); u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') next(k + 1); };
      synth.speak(u);
    };
    setState('playing'); next(i);
  };
  const play = (key = part) => {
    const label = PARTS.find(p => p.key === key)?.label || '';
    queue.current = sentences(`${label}. ${speakable(content.sections[key] || '')}`);
    if (key === available[0]?.key) queue.current.unshift(title + '.');
    speakFrom(0);
  };
  const toggle = () => {
    const synth = window.speechSynthesis;
    if (state === 'idle') play();
    else if (state === 'playing') { synth.pause(); setState('paused'); }
    else { synth.resume(); setState('playing'); }
  };
  const changeSpeed = (r: number) => { setSpeed(r); try { localStorage.setItem('mcp.speechRate', String(r)); } catch { /* ignore */ } if (state !== 'idle') speakFrom(idx, r); };

  if (!supported || !available.length) return null;
  const pct = state === 'idle' || !queue.current.length ? 0 : Math.round((idx / queue.current.length) * 100);
  return <div className="listen" role="group" aria-label="Listen to this page">
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
  </div>;
}

/** YouTube search for this topic (opens in a new tab). */
export function videoSearchUrl(title: string) {
  const q = title.replace(/[:?()]/g, ' ').replace(/\s+/g, ' ').trim() + ' explained';
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
}
