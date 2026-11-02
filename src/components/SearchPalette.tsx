import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MiniSearch from 'minisearch';
import { QUESTIONS, META, SECTION_BY_ID, SECTIONS, titleOf } from '../lib/data';
import { SIM_CATALOG, simImplemented } from '../sims/registry';
import { useStore, statusOf } from '../lib/progress';
import StatusChip from './StatusChip';

type Doc = { id: string; kind: 'q' | 'section' | 'sim'; n?: number; title: string; text: string; concepts: string; terms: string; section: string; short: string };
let index: MiniSearch<Doc> | null = null;
function getIndex() {
  if (index) return index;
  index = new MiniSearch<Doc>({
    fields: ['title', 'text', 'concepts', 'terms', 'section', 'short'],
    storeFields: ['id', 'kind', 'n', 'title', 'text', 'section'],
    searchOptions: { boost: { title: 3, text: 2.5, concepts: 2, terms: 1.6, section: 1, short: 0.6 }, prefix: true, fuzzy: 0.18, combineWith: 'AND' },
  });
  const docs: Doc[] = QUESTIONS.map(q => {
    const m = META[q.id]; const s = SECTION_BY_ID.get(q.sectionId)!;
    return { id: q.id, kind: 'q', n: q.n, title: m?.title || '', text: q.text + ' ' + q.subItems.join(' '), concepts: (m?.concepts || []).join(' ').replace(/-/g, ' '), terms: (m?.terms || []).join(' '), section: s.path.join(' '), short: m?.short || '' };
  });
  for (const s of SECTIONS) docs.push({ id: 's:' + s.id, kind: 'section', title: s.title, text: s.path.join(' › '), concepts: '', terms: '', section: s.domain, short: '' });
  for (const sim of SIM_CATALOG) if (simImplemented(sim.id)) docs.push({ id: 'sim:' + sim.id, kind: 'sim', title: sim.title, text: sim.description, concepts: sim.category, terms: '', section: 'Simulation', short: '' });
  index.addAll(docs);
  return index;
}

export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const store = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const results = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    const num = t.match(/^#?q?(\d{1,4})$/i);
    const idx = getIndex();
    let r = idx.search(t).slice(0, 40);
    if (!r.length) r = idx.search(t, { combineWith: 'OR' }).slice(0, 40);
    const out = r.map(x => ({ id: x.id as string, kind: x.kind as Doc['kind'], n: x.n as number | undefined, title: x.title as string, text: x.text as string, section: x.section as string }));
    if (num) { const n = +num[1]; const qq = QUESTIONS[n - 1]; if (qq) out.unshift({ id: qq.id, kind: 'q', n, title: META[qq.id]?.title || '', text: qq.text, section: '' }); }
    return out.slice(0, 40);
  }, [q]);
  useEffect(() => setSel(0), [q]);
  const go = (r: (typeof results)[number]) => {
    onClose();
    if (r.kind === 'q') nav(`/q/${r.id}`); else if (r.kind === 'section') nav(`/s/${r.id.slice(2)}`); else nav(`/sims/${r.id.slice(4)}`);
  };
  return (
    <div className="palette-scrim" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Search" onMouseDown={e => e.stopPropagation()}>
        <div className="palette-input">
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search 1,005 questions, concepts, sections, simulations… (try “#342” or “bootstrap”)"
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(results.length - 1, s + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
              if (e.key === 'Enter' && results[sel]) go(results[sel]);
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-results">
          {!q && <div className="palette-empty">Type to search. Matches question text, short titles, concepts, terminology and section names.</div>}
          {q && !results.length && <div className="palette-empty">No matches for “{q}”.</div>}
          {results.map((r, i) => (
            <button key={r.id + i} className={'palette-item' + (i === sel ? ' sel' : '')} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
              {r.kind === 'q' && <><span className="pi-num">Q{r.n}</span><span className="pi-main"><span className="pi-title">{r.text}</span><span className="pi-sub">{titleOf(r.id) !== r.text ? titleOf(r.id) + ' · ' : ''}{SECTION_BY_ID.get(QUESTIONS[(r.n || 1) - 1].sectionId)?.path.join(' › ')}</span></span><StatusChip status={statusOf(r.id, store).status} compact /></>}
              {r.kind === 'section' && <><span className="pi-num">§</span><span className="pi-main"><span className="pi-title">{r.title}</span><span className="pi-sub">{r.text}</span></span></>}
              {r.kind === 'sim' && <><span className="pi-num">SIM</span><span className="pi-main"><span className="pi-title">{r.title}</span><span className="pi-sub">{r.text.slice(0, 110)}…</span></span></>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
