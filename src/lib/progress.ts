import { useSyncExternalStore } from 'react';
import { QUESTIONS, META, Q_BY_ID } from './data';

export type Status = 'not-started' | 'learning' | 'needs-review' | 'mastered';
export const STATUS_LABEL: Record<Status, string> = { 'not-started': 'Not started', learning: 'Learning', 'needs-review': 'Needs review', mastered: 'Mastered' };
export type Attempt = { t: number; mode: 'self-check' | 'interview' | 'quiz'; covered: number; total: number; rating?: number; missed?: number[]; seconds?: number; followupsOk?: number; followupsTotal?: number };
export type QuizRecord = { c: boolean; t: number; n: number };
export type QState = { viewed?: number; manual?: 'needs-review' | 'learning' | null; attempts: Attempt[]; quiz: Record<string, QuizRecord>; due?: number; interval?: number; bookmarked?: boolean; notes?: string };
export type Session = { t: number; mode: string; questions: string[]; score: number; seconds: number };
export type Store = { v: 1; q: Record<string, QState>; sessions: Session[]; last?: string; activity: Record<string, number> };

const KEY = 'mcp.progress.v1';
const DAY = 86400000;
function blank(): Store { return { v: 1, q: {}, sessions: [], activity: {} }; }
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const posInt = (x: unknown, d = 0) => (fin(x) && x >= 0 ? Math.floor(x) : d);
const MODES = ['self-check', 'interview', 'quiz'];
function cleanAttempt(a: unknown): Attempt | null {
  if (!isObj(a) || !fin(a.t)) return null;
  const out: Attempt = { t: a.t, mode: MODES.includes(a.mode as string) ? (a.mode as Attempt['mode']) : 'self-check', covered: posInt(a.covered), total: posInt(a.total) };
  if (fin(a.rating)) out.rating = a.rating;
  if (Array.isArray(a.missed)) out.missed = a.missed.filter(fin);
  if (fin(a.seconds)) out.seconds = a.seconds;
  if (fin(a.followupsOk)) out.followupsOk = a.followupsOk;
  if (fin(a.followupsTotal)) out.followupsTotal = a.followupsTotal;
  return out;
}
function cleanQState(x: unknown): QState | null {
  if (!isObj(x)) return null;
  const q: QState = { attempts: [], quiz: {} };
  if (fin(x.viewed)) q.viewed = x.viewed;
  if (x.manual === 'needs-review' || x.manual === 'learning' || x.manual === null) q.manual = x.manual;
  if (Array.isArray(x.attempts)) q.attempts = x.attempts.map(cleanAttempt).filter((a): a is Attempt => !!a);
  if (isObj(x.quiz)) for (const [k, r] of Object.entries(x.quiz)) { if (isObj(r) && typeof r.c === 'boolean') q.quiz[k] = { c: r.c, t: fin(r.t) ? r.t : 0, n: posInt(r.n, 1) }; }
  if (fin(x.due)) q.due = x.due;
  if (fin(x.interval)) q.interval = x.interval;
  if (typeof x.bookmarked === 'boolean') q.bookmarked = x.bookmarked;
  if (typeof x.notes === 'string') q.notes = x.notes;
  return q;
}
/** Coerce arbitrary parsed JSON into a valid Store; throws only if structurally not a progress export. */
export function sanitize(raw: unknown): Store {
  if (!isObj(raw) || raw.v !== 1) throw new Error('not a progress export (expected an object with "v": 1)');
  if (!isObj(raw.q)) throw new Error('"q" must be an object mapping question ids to progress');
  const out = blank();
  for (const [id, v] of Object.entries(raw.q)) { const q = cleanQState(v); if (q) out.q[id] = q; }
  if (Array.isArray(raw.sessions)) for (const s of raw.sessions) {
    if (!isObj(s)) continue;
    out.sessions.push({ t: fin(s.t) ? s.t : 0, mode: typeof s.mode === 'string' ? s.mode : 'interview', questions: Array.isArray(s.questions) ? s.questions.filter((x): x is string => typeof x === 'string') : [], score: fin(s.score) ? s.score : 0, seconds: fin(s.seconds) ? s.seconds : 0 });
  }
  if (typeof raw.last === 'string') out.last = raw.last;
  if (isObj(raw.activity)) for (const [d, n] of Object.entries(raw.activity)) if (fin(n)) out.activity[d] = n;
  return out;
}
function load(): Store {
  try { const raw = localStorage.getItem(KEY); if (raw) return sanitize(JSON.parse(raw)); } catch { /* ignore */ }
  return blank();
}
let store: Store = load();
const subs = new Set<() => void>();
function emit() { for (const f of subs) f(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage full/blocked */ } }
function mutate(fn: (s: Store) => void) {
  const next: Store = structuredClone(store);
  fn(next); store = next; save(); emit();
}
function today() { return new Date().toISOString().slice(0, 10); }
function bumpActivity(s: Store) { const d = today(); s.activity[d] = (s.activity[d] || 0) + 1; }
const qs = (s: Store, id: string): QState => (s.q[id] ||= { attempts: [], quiz: {} });

window.addEventListener('storage', e => { if (e.key === KEY) { store = load(); emit(); } });

export function useStore(): Store { return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => store); }
export function getStore() { return store; }

export const actions = {
  view(id: string) { mutate(s => { const q = qs(s, id); if (!q.viewed) q.viewed = Date.now(); s.last = id; }); },
  setManual(id: string, m: QState['manual']) { mutate(s => { qs(s, id).manual = m; }); },
  bookmark(id: string, on: boolean) { mutate(s => { qs(s, id).bookmarked = on; }); },
  notes(id: string, text: string) { mutate(s => { qs(s, id).notes = text; }); },
  answerQuiz(id: string, item: number, correct: boolean) {
    mutate(s => { const q = qs(s, id); const prev = q.quiz[item]; q.quiz[item] = { c: correct, t: Date.now(), n: (prev?.n || 0) + 1 }; bumpActivity(s); });
  },
  recordAttempt(id: string, a: Omit<Attempt, 't'>) {
    mutate(s => {
      const q = qs(s, id); q.attempts.push({ ...a, t: Date.now() }); if (q.attempts.length > 30) q.attempts.shift();
      bumpActivity(s);
      const pass = a.total > 0 && a.covered / a.total >= 0.8 && (a.rating ?? 3) >= 3;
      if (pass) { q.interval = Math.min(90, Math.max(3, Math.round((q.interval || 1.5) * 2.2))); q.due = Date.now() + q.interval * DAY; if (q.manual === 'needs-review') q.manual = null; }
      else { q.interval = 1; q.due = Date.now() + DAY; }
    });
  },
  recordSession(sess: Session) { mutate(s => { s.sessions.push(sess); if (s.sessions.length > 200) s.sessions.shift(); }); },
  reset() { store = blank(); save(); emit(); },
  importJson(text: string) {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error('file is not valid JSON. Your existing progress was kept.'); }
    let next: Store;
    try { next = sanitize(parsed); } catch (e) { throw new Error((e as Error).message + '. Your existing progress was kept.'); }
    store = next; save(); emit();
  },
  exportJson() { return JSON.stringify(store, null, 1); },
};

/** Quiz accuracy for a question (latest answer per item) */
export function quizStats(q?: QState) {
  if (!q) return { answered: 0, correct: 0 };
  const recs = Object.values(q.quiz); return { answered: recs.length, correct: recs.filter(r => r.c).length };
}
function lastAssessment(q?: QState) { return q?.attempts.filter(a => a.mode !== 'quiz').slice(-1)[0]; }

/** A 0..1 readiness score combining latest self-assessment and quiz accuracy */
export function scoreOf(q?: QState): number | null {
  const a = lastAssessment(q); const { answered, correct } = quizStats(q);
  const parts: number[] = [];
  if (a && a.total) parts.push(a.covered / a.total * (a.rating ? 0.75 + a.rating / 16 : 1));
  if (answered) parts.push(correct / answered);
  if (!parts.length) return null;
  return Math.min(1, parts.reduce((x, y) => x + y, 0) / parts.length);
}

/**
 * Mastery is earned, never granted by opening a page:
 * - mastered: latest self-assessment covered ≥80% of rubric with confidence ≥3/4, AND quiz accuracy ≥80% with at least
 *   min(2, #items) items answered, AND not past its spaced-review due date.
 * - needs-review: flagged manually, latest assessment <60% or low confidence, quiz accuracy <60%, or a mastered item came due.
 * - learning: opened or attempted but not yet either of the above.
 */
export function statusOf(id: string, s: Store = store): { status: Status; reason: string } {
  const q = s.q[id];
  if (!q || (!q.viewed && !q.attempts.length && !Object.keys(q.quiz).length)) return { status: 'not-started', reason: 'Not opened yet' };
  const a = lastAssessment(q); const { answered, correct } = quizStats(q);
  const needQuiz = Math.min(2, META[id]?.quizCount ?? 2);
  const quizOk = answered >= needQuiz && (answered === 0 || correct / answered >= 0.8);
  const assessOk = !!a && a.total > 0 && a.covered / a.total >= 0.8 && (a.rating ?? 3) >= 3;
  if (q.manual === 'needs-review') return { status: 'needs-review', reason: 'You flagged this for review' };
  if (assessOk && quizOk) {
    if (q.due && Date.now() > q.due) return { status: 'needs-review', reason: 'Mastered earlier — due for spaced review' };
    return { status: 'mastered', reason: 'Strong self-check and quiz results' };
  }
  if (a && (a.covered / Math.max(1, a.total) < 0.6 || (a.rating ?? 3) <= 2)) return { status: 'needs-review', reason: 'Last self-check missed key points' };
  if (answered >= 2 && correct / answered < 0.6) return { status: 'needs-review', reason: 'Quiz accuracy below 60%' };
  if (assessOk && !quizOk) return { status: 'learning', reason: answered < needQuiz ? 'Answer the quiz questions to confirm mastery' : 'Quiz accuracy must reach 80%' };
  if (quizOk && answered > 0 && !assessOk) return { status: 'learning', reason: 'Do a self-check (answer aloud + rubric) to confirm mastery' };
  return { status: 'learning', reason: 'In progress' };
}

export function overall(s: Store = store) {
  const counts: Record<Status, number> = { 'not-started': 0, learning: 0, 'needs-review': 0, mastered: 0 };
  let qa = 0, qc = 0, cov = 0, covN = 0;
  for (const q of QUESTIONS) {
    counts[statusOf(q.id, s).status]++;
    const st = s.q[q.id]; const { answered, correct } = quizStats(st); qa += answered; qc += correct;
    const a = lastAssessment(st); if (a && a.total) { cov += a.covered / a.total; covN++; }
  }
  const total = QUESTIONS.length;
  const completed = total - counts['not-started'];
  // readiness: mastered = 1, in-progress items earn partial credit from their measured score
  let partial = 0; for (const q of QUESTIONS) { const st = statusOf(q.id, s).status; if (st === 'learning' || st === 'needs-review') partial += 0.5 * (scoreOf(s.q[q.id]) ?? 0); }
  const readiness = (counts.mastered + partial) / total;
  return { counts, total, completed, quizAnswered: qa, quizCorrect: qc, accuracy: qa ? qc / qa : null, coverage: covN ? cov / covN : null, readiness };
}

export function dueForReview(s: Store = store) {
  return QUESTIONS.filter(q => statusOf(q.id, s).status === 'needs-review').map(q => q.id);
}

export function streak(s: Store = store) {
  let n = 0; const d = new Date();
  for (;;) { const k = d.toISOString().slice(0, 10); if (s.activity[k]) { n++; d.setDate(d.getDate() - 1); } else break; }
  return n;
}

export function conceptStats(s: Store = store) {
  const map = new Map<string, { score: number; n: number; qs: string[] }>();
  for (const q of QUESTIONS) {
    const m = META[q.id]; if (!m) continue; const sc = scoreOf(s.q[q.id]); if (sc === null) continue;
    for (const c of m.concepts) { const e = map.get(c) || { score: 0, n: 0, qs: [] }; e.score += sc; e.n++; e.qs.push(q.id); map.set(c, e); }
  }
  return [...map.entries()].map(([concept, e]) => ({ concept, avg: e.score / e.n, n: e.n, qs: e.qs })).sort((a, b) => a.avg - b.avg);
}

export function exists(id: string) { return Q_BY_ID.has(id); }
