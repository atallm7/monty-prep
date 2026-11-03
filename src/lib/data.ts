import indexJson from '../data/index.generated.json';
import metaJson from '../data/meta.generated.json';
import { parseQuestion } from '../content/parse.mjs';
import { getRaw } from './contentSource';

export type QIndex = { n: number; id: string; text: string; subItems: string[]; sectionId: string; domainId: string };
export type Section = { id: string; domain: string; domainId: string; path: string[]; title: string; note: string | null; questions: number[] };
export type Domain = { id: string; title: string; sections: string[] };
export type Difficulty = 'fundamental' | 'intermediate' | 'advanced';
export type QMeta = { title: string; difficulty: Difficulty; kind: string; concepts: string[]; prereqs: string[]; related: string[]; words: number; sims: string[]; quizCount: number; rubricCount: number; followupCount: number; short: string; terms: string[] };
export type QuizItem = { type: 'mcq' | 'numeric' | 'truefalse' | 'multi'; level: Difficulty; q: string; options?: string[]; answer: number | boolean | number[]; tolerance?: number; unit?: string; explain: string };
export type QContent = Omit<ReturnType<typeof parseQuestion>, 'sections' | 'quiz'> & { quiz: QuizItem[]; sections: Record<string, string> & { [K in 'testing' | 'why' | 'concepts' | 'answer' | 'technical' | 'short' | 'long' | 'terms' | 'exceptional' | 'mistakes' | 'deep' | 'applications' | 'assumptions' | 'references']: string } };

const idx = indexJson as { domains: Domain[]; sections: Section[]; questions: QIndex[] };
export const DOMAINS = idx.domains;
export const SECTIONS = idx.sections;
export const QUESTIONS = idx.questions;
export const META = metaJson as Record<string, QMeta>;
export const Q_BY_ID = new Map(QUESTIONS.map(q => [q.id, q]));
export const SECTION_BY_ID = new Map(SECTIONS.map(s => [s.id, s]));
export const DOMAIN_BY_ID = new Map(DOMAINS.map(d => [d.id, d]));
export const qid = (n: number) => 'q' + String(n).padStart(4, '0');

export function questionsInDomain(domainId: string) { return QUESTIONS.filter(q => q.domainId === domainId); }
export function questionsInSection(sectionId: string) { return QUESTIONS.filter(q => q.sectionId === sectionId); }
export function titleOf(id: string) { const m = META[id]; const q = Q_BY_ID.get(id); return m?.title || (q ? shortText(q.text) : id); }
export function shortText(t: string, n = 80) { const s = t.replace(/\s*\(.*?\)\s*$/, ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
export function difficultyOf(id: string): Difficulty { return META[id]?.difficulty || 'fundamental'; }
export function hasContent(id: string) { return !!META[id]; }

const cache = new Map<string, QContent | null>();
export async function loadQuestion(id: string): Promise<QContent | null> {
  if (cache.has(id)) return cache.get(id)!;
  const src = await getRaw(id);
  if (src === null) { cache.set(id, null); return null; }
  const parsed = parseQuestion(src) as QContent;
  cache.set(id, parsed);
  return parsed;
}

export const resolveQ = (id: string) => { const q = Q_BY_ID.get(id); return q ? { n: q.n, text: q.text, title: titleOf(id) } : undefined; };

export function neighbors(id: string) {
  const i = QUESTIONS.findIndex(q => q.id === id);
  return { prev: i > 0 ? QUESTIONS[i - 1] : null, next: i >= 0 && i < QUESTIONS.length - 1 ? QUESTIONS[i + 1] : null };
}
