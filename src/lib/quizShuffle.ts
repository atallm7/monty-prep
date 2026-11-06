import type { QuizItem } from './data';

/**
 * Authored MCQs over-use one answer position (~74% at index 1), so options are shown in a
 * deterministic shuffled order (seeded by the question text, so it is stable across visits).
 * "All/None of the above"-style options stay last, and items whose text names options by
 * letter ("option A") are left unshuffled.
 */
const PINNED = /of the above|^(none|both|neither)\b/i;
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function shuffleItem(item: QuizItem): QuizItem {
  if ((item.type !== 'mcq' && item.type !== 'multi') || !Array.isArray(item.options)) return item;
  if (/\boptions? \(?[A-D]\)?\b/.test(item.q + ' ' + (item.explain || ''))) return item;
  const idx = item.options.map((_, i) => i);
  const free = idx.filter(i => !PINNED.test(String(item.options![i]).trim()));
  const pinned = idx.filter(i => PINNED.test(String(item.options![i]).trim()));
  let seed = hash(item.q);
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  const order = [...free, ...pinned]; // order[newPos] = oldPos
  const newPos = (old: number) => order.indexOf(old);
  return { ...item, options: order.map(o => item.options![o]),
    answer: item.type === 'mcq' ? newPos(item.answer as number) : (item.answer as number[]).map(newPos) };
}
