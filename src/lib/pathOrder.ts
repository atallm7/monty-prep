import { META, Q_BY_ID } from './data';

const RANK = { fundamental: 0, intermediate: 1, advanced: 2 } as const;
/** Topological order by prerequisites (within the whole set), then difficulty, then source order. */
export function orderQuestions(ids: string[]) {
  const set = new Set(ids); const seen = new Set<string>(); const out: string[] = [];
  const sorted = [...ids].sort((a, b) => (RANK[META[a]?.difficulty ?? 'fundamental'] - RANK[META[b]?.difficulty ?? 'fundamental']) || (Q_BY_ID.get(a)!.n - Q_BY_ID.get(b)!.n));
  const visit = (id: string, depth = 0) => { if (seen.has(id) || depth > 30) return; seen.add(id); for (const p of META[id]?.prereqs || []) if (set.has(p)) visit(p, depth + 1); out.push(id); };
  sorted.forEach(id => visit(id));
  return out;
}
