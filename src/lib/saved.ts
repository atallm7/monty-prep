import { QUESTIONS } from './data';
import type { Store } from './progress';

/** Questions the learner bookmarked, or flagged for review. Both live in the existing progress store. */
export function savedIds(store: Store) {
  const bookmarked: string[] = []; const flagged: string[] = [];
  for (const q of QUESTIONS) {
    const s = store.q[q.id];
    if (s?.bookmarked) bookmarked.push(q.id);
    if (s?.manual === 'needs-review') flagged.push(q.id);
  }
  return { bookmarked, flagged };
}
