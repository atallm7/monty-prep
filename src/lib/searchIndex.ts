// Shared full-text index over questions, sections and simulations (built on first use).
import MiniSearch from 'minisearch';
import { QUESTIONS, META, SECTION_BY_ID, SECTIONS } from './data';
import { SIM_CATALOG, simImplemented } from '../sims/registry';
import searchJson from '../data/search.generated.json';
const SEARCH = searchJson as Record<string, { short: string; terms: string[] }>;

export type Doc = { id: string; kind: 'q' | 'section' | 'sim'; n?: number; title: string; text: string; concepts: string; terms: string; section: string; short: string };
let index: MiniSearch<Doc> | null = null;
export function getIndex() {
  if (index) return index;
  index = new MiniSearch<Doc>({
    fields: ['title', 'text', 'concepts', 'terms', 'section', 'short'],
    storeFields: ['id', 'kind', 'n', 'title', 'text', 'section'],
    searchOptions: { boost: { title: 3, text: 2.5, concepts: 2, terms: 1.6, section: 1, short: 0.6 }, prefix: true, fuzzy: 0.18, combineWith: 'AND' },
  });
  const docs: Doc[] = QUESTIONS.map(q => {
    const m = META[q.id]; const s = SECTION_BY_ID.get(q.sectionId)!;
    return { id: q.id, kind: 'q', n: q.n, title: m?.title || '', text: q.text + ' ' + q.subItems.join(' '), concepts: (m?.concepts || []).join(' ').replace(/-/g, ' '), terms: (SEARCH[q.id]?.terms || []).join(' '), section: s.path.join(' '), short: SEARCH[q.id]?.short || '' };
  });
  for (const s of SECTIONS) docs.push({ id: 's:' + s.id, kind: 'section', title: s.title, text: s.path.join(' › '), concepts: '', terms: '', section: s.domain, short: '' });
  for (const sim of SIM_CATALOG) if (simImplemented(sim.id)) docs.push({ id: 'sim:' + sim.id, kind: 'sim', title: sim.title, text: sim.description, concepts: sim.category, terms: '', section: 'Simulation', short: '' });
  index.addAll(docs);
  return index;
}

