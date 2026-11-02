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
function load(): Store {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.v === 1) return { ...blank(), ...s }; } } catch { /* ignore */ }
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
  importJson(text: string) { const s = JSON.parse(text); if (!s || s.v !== 1 || typeof s.q !== 'object') throw new Error('Not a valid progress export'); store = { ...blank(), ...s }; save(); emit(); },
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
