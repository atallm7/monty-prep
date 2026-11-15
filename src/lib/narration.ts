// Narration shared by the lesson player, the Listen bar and the recording script (scripts/lesson-audio/).
import { plainText } from '../components/AskClaude';

/** Markdown + LaTeX → something a voice can say. */
export function speakable(md: string): string {
  let s = plainText(md);
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_m, x) => ' ' + math(x) + '. ').replace(/\$([^$\n]+)\$/g, (_m, x) => math(x));
  return units(s)
    .replace(/^#{1,6}\s*(.*)$/gm, '$1.')            // headings become their own sentence
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')        // links keep their words
    .replace(/[*_`>|]/g, ' ')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s*\n\s*\n\s*/g, '. ').replace(/\s*\n\s*/g, ' ')
    .replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
}
// Spoken units after a number: "5 mA" → "5 milliamps".
const UNIT: Record<string, string> = { V: 'volts', mV: 'millivolts', kV: 'kilovolts', A: 'amps', mA: 'milliamps', 'µA': 'microamps', uA: 'microamps', nA: 'nanoamps',
  'Ω': 'ohms', 'kΩ': 'kilohms', 'MΩ': 'megohms', 'mΩ': 'milliohms', W: 'watts', mW: 'milliwatts', kW: 'kilowatts', Hz: 'hertz', kHz: 'kilohertz', MHz: 'megahertz', GHz: 'gigahertz',
  F: 'farads', 'µF': 'microfarads', uF: 'microfarads', nF: 'nanofarads', pF: 'picofarads', H: 'henries', mH: 'millihenries', 'µH': 'microhenries', uH: 'microhenries', nH: 'nanohenries',
  s: 'seconds', ms: 'milliseconds', 'µs': 'microseconds', us: 'microseconds', ns: 'nanoseconds', ps: 'picoseconds', dB: 'decibels', 'mAh': 'milliamp hours', Wh: 'watt hours', 'V/µs': 'volts per microsecond', '°C': 'degrees Celsius' };
const UNIT_RE = new RegExp('(\\d(?:[\\d.,]*\\d)?)[ \\u00a0]{0,3}(' + Object.keys(UNIT).sort((a, b) => b.length - a.length).map(k => k.replace(/[/]/g, '\\/')).join('|') + ')(?![A-Za-z0-9µΩ])', 'g');
function units(t: string): string { return t.replace(UNIT_RE, (_m, n, u) => `${n} ${UNIT[u]}`).replace(/\b(\d[\d.,]*)\s+([kMm])\s+ohms\b/g, (_m, n, p) => `${n} ${p === 'k' ? 'kilohms' : p === 'M' ? 'megohms' : 'milliohms'}`).replace(/−/g, 'minus ').replace(/×/g, ' times ').replace(/≈/g, ' about ').replace(/→/g, ' to '); }
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

/** Split narration into sentence groups (Chrome cuts long utterances; captions show one group at a time). */
export function chunks(t: string): string[] {
  const raw = t.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [t]; const out: string[] = [];
  for (const r of raw) { const x = r.trim(); if (!x) continue; if (out.length && (out[out.length - 1] + ' ' + x).length < 180) out[out.length - 1] += ' ' + x; else out.push(x); }
  return out;
}
/** Short fingerprint of the narration: a recording is used only if it was made from the same words. */
export function narrationHash(n: string[][]): string {
  let h = 0x811c9dc5; const str = JSON.stringify(n);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export type Recording = { hash: string; url: string; dur: number; slides: { start: number; chunks: [number, string][] }[] };
export const AUDIO_BASE = import.meta.env.BASE_URL + 'lessons/';
const recCache = new Map<string, Promise<Recording | null>>();
/** Recording `name` (e.g. "q0012" or "q0012.answer"), or null if missing or made from different words. */
export function fetchRecording(name: string, wantHash: string): Promise<Recording | null> {
  const key = name + ':' + wantHash;
  if (!recCache.has(key)) recCache.set(key, fetch(AUDIO_BASE + name + '.json').then(r => (r.ok ? r.json() : null))
    .then((r: Recording | null) => (r && r.hash === wantHash && r.url ? r : null)).catch(() => null));
  return recCache.get(key)!;
}

/** Narration of a page's spoken answer (recorded as "<id>.answer"). */
export const answerNarration = (answerMd: string) => [chunks(speakable(answerMd))];
export async function answerScriptFor(id: string) {
  const { loadQuestion } = await import('./data');
  const c = await loadQuestion(id); if (!c?.sections.answer) return null;
  const n = answerNarration(c.sections.answer);
  return { id: id + '.answer', hash: narrationHash(n), slides: n };
}
