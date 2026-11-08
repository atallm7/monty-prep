import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DOMAINS, SECTIONS, SECTION_BY_ID, DOMAIN_BY_ID, META, QUESTIONS, titleOf, Difficulty, Section, Domain } from '../lib/data';
import { useStore, statusOf, Status, STATUS_LABEL } from '../lib/progress';
import StatusChip, { DiffChip } from '../components/StatusChip';
import { IMic, ISim, IChevron, IBookmark } from '../components/Icons';

const STATUSES: Status[] = ['not-started', 'learning', 'needs-review', 'mastered'];
const DIFFS: Difficulty[] = ['fundamental', 'intermediate', 'advanced'];

/** Lower-case and drop everything but letters/digits, so "op-amp", "op amp" and "opamp" all compare equal. */
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
let hayCache: Map<string, string> | null = null;
const hayOf = (id: string, text: string, subItems: string[]) => {
  hayCache ||= new Map();
  let h = hayCache.get(id);
  if (h === undefined) { h = norm([text, titleOf(id), ...subItems, ...(META[id]?.concepts || [])].join(' ')); hayCache.set(id, h); }
  return h;
};
/** Section heading shown under its topic: drops the repeated parent ("Analog Circuits/Electronics › Opamps" -> "Opamps"). */
function sectionLabel(s: Section, domain?: Domain) {
  if (!domain) return s.path.join(' › ');
  if (s.path.length < 2) return 'Overview';
  let p = s.path.slice(1);
  if (p.length > 1 && norm(p[0]) === norm(domain.title)) p = p.slice(1);
  return p.join(' › ');
}
const shortLabel = (s: Section) => s.path.length < 2 ? 'Overview' : s.title;

export default function Library() {
  const { domainId, sectionId } = useParams();
  const store = useStore();
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [diff, setDiff] = useState<Difficulty | 'all'>('all');
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const narrow = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches, []);
  const section = sectionId ? SECTION_BY_ID.get(sectionId) : undefined;
  const domain = domainId ? DOMAIN_BY_ID.get(domainId) : section ? DOMAIN_BY_ID.get(section.domainId) : undefined;

  const sections = useMemo(() => section ? [section] : domain ? SECTIONS.filter(s => s.domainId === domain.id) : SECTIONS, [section, domain]);
  const tokens = filter.toLowerCase().split(/\s+/).map(norm).filter(Boolean);
  const textActive = tokens.length > 0;
  const filtersActive = textActive || status !== 'all' || diff !== 'all' || saved;
  const visible = (q: { id: string; text: string; subItems: string[] }) => {
    if (status !== 'all' && statusOf(q.id, store).status !== status) return false;
    if (diff !== 'all' && META[q.id]?.difficulty !== diff) return false;
    if (saved && !store.q[q.id]?.bookmarked) return false;
    if (textActive) { const h = hayOf(q.id, q.text, q.subItems); if (!(h.includes(tokens.join('')) || (tokens.length > 2 && tokens.every(t => h.includes(t))))) return false; }
    return true;
  };
  const scopeQs = QUESTIONS.filter(q => sections.some(s => s.id === q.sectionId));
  const counts = STATUSES.map(s => scopeQs.filter(q => statusOf(q.id, store).status === s).length);
  const savedCount = scopeQs.filter(q => store.q[q.id]?.bookmarked).length;
  const matched = filtersActive ? scopeQs.filter(visible) : scopeQs;
  const title = section ? section.title : domain ? domain.title : 'Question library';
  const practiceHref = section ? `/interview?section=${section.id}` : domain ? `/interview?domain=${domain.id}` : '/interview';
  const showQuestions = !!domain || !!section || filtersActive;
  const shown = sections.map(s => ({ s, qs: matched.filter(q => q.sectionId === s.id) })).filter(x => x.qs.length);
  const collapsible = !!domain && !section && shown.length > 1;
  const isOpen = (id: string, i: number) => !collapsible || filtersActive || (open[id] ?? (!narrow || i === 0));
  const jump = (id: string) => {
    setOpen(o => ({ ...o, [id]: true }));
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('lib-sec-' + id)?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })));
  };
  const setAll = (v: boolean) => setOpen(Object.fromEntries(shown.map(x => [x.s.id, v])));

  return (
    <div className="page fade-in">
      <nav className="crumbs small" aria-label="Breadcrumb"><Link to="/library">Library</Link>{domain && <> › <Link to={`/d/${domain.id}`}>{domain.title}</Link></>}{section && <> › {section.path.slice(0, -1).join(' › ')}</>}</nav>
      <div className="spread" style={{ alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{scopeQs.length} questions{section?.note ? '' : domain ? ` across ${sections.length} sections` : ` across ${DOMAINS.length} topics and ${SECTIONS.length} sections`}. Every question has its own page with model answers, deep explanation, diagrams, follow-ups and a quiz.</p>
          {section?.note && <p className="q-note small" style={{ maxWidth: 760 }}><b>Source note:</b> {section.note}</p>}
        </div>
        <div className="row"><Link className="btn btn-primary" to={practiceHref}><IMic size={15} /> Practice {section ? 'this section' : domain ? 'this topic' : ''}</Link></div>
      </div>

      <div className="lib-filters">
        <input className="input" style={{ maxWidth: 280 }} type="search" aria-label="Filter questions by text or concept" placeholder="Filter by text or concept…" value={filter} onChange={e => setFilter(e.target.value)} />
        <div className="row-wrap">
          <button className={'chip' + (status === 'all' && !saved ? ' on' : '')} onClick={() => { setStatus('all'); setSaved(false); }}>All · {scopeQs.length}</button>
          {STATUSES.map((s, i) => <button key={s} className={'chip' + (status === s ? ' on' : '')} onClick={() => setStatus(status === s ? 'all' : s)}>{STATUS_LABEL[s]} · {counts[i]}</button>)}
          <button className={'chip' + (saved ? ' on' : '')} aria-pressed={saved} onClick={() => setSaved(v => !v)}><IBookmark size={12} /> Bookmarked · {savedCount}</button>
        </div>
        <div className="row-wrap">
          <button className={'chip' + (diff === 'all' ? ' on' : '')} onClick={() => setDiff('all')}>Any level</button>
          {DIFFS.map(d => <button key={d} className={'chip' + (diff === d ? ' on' : '')} onClick={() => setDiff(d)}>{d}</button>)}
        </div>
      </div>
      <div className="small muted lib-count" role="status" aria-live="polite">{filtersActive ? <>{matched.length} of {scopeQs.length} questions match{textActive ? <> “{filter.trim()}”</> : null}</> : null}</div>

      {!showQuestions && <div className="domain-grid">
        {DOMAINS.map(d => {
          const qs = QUESTIONS.filter(q => q.domainId === d.id); const m = qs.filter(q => statusOf(q.id, store).status === 'mastered').length;
          return <Link key={d.id} to={`/d/${d.id}`} className="domain-card"><b>{d.title}</b><span className="small muted">{qs.length} questions · {d.sections.length} sections</span><div className="progress" style={{ marginTop: 8 }}><i className="pb-mastered" style={{ width: `${m / qs.length * 100}%` }} /></div></Link>;
        })}
      </div>}

      {showQuestions && filtersActive && matched.length === 0 && <div className="empty">No questions match these filters.</div>}

      {collapsible && <div className="jump-bar" role="navigation" aria-label="Jump to section">
        <div className="jump-chips">{shown.map(({ s, qs }) => <button key={s.id} className="chip" onClick={() => jump(s.id)}>{shortLabel(s)} <span className="faint">{qs.length}</span></button>)}</div>
        <div className="jump-all"><button className="btn btn-sm btn-ghost" onClick={() => setAll(true)}>Expand all</button><button className="btn btn-sm btn-ghost" onClick={() => setAll(false)}>Collapse all</button></div>
      </div>}

      {showQuestions && shown.map(({ s, qs }, i) => {
        const o = isOpen(s.id, i);
        return <section key={s.id} id={'lib-sec-' + s.id} className="lib-section">
          {!section && <div className="lib-section-head">
            {collapsible
              ? <h2 className="h3 lib-h"><button className="lib-toggle" aria-expanded={o} aria-controls={'list-' + s.id} onClick={() => setOpen(x => ({ ...x, [s.id]: !o }))}><span className={'lib-chev' + (o ? ' open' : '')}><IChevron size={14} /></span>{sectionLabel(s, domain)}</button></h2>
              : <Link to={`/s/${s.id}`}><h2 className="h3">{sectionLabel(s, domain)}</h2></Link>}
            <span className="faint small">{filtersActive ? `${qs.length} of ${s.questions.length}` : s.questions.length}</span>
            {collapsible && <Link className="small lib-open" to={`/s/${s.id}`}>Open section</Link>}
          </div>}
          {o && <div className="q-list" id={'list-' + s.id}>
            {qs.map(q => {
              const m = META[q.id];
              return <Link key={q.id} to={`/q/${q.id}`} className="q-row card-link">
                <span className="q-row-n">{q.n}</span>
                <span className="q-row-main"><span className="q-row-text">{q.text}</span>{q.subItems.length > 0 && <span className="tiny faint">{q.subItems.join(' · ')}</span>}{m?.title && <span className="tiny faint">{m.title}</span>}</span>
                <span className="q-row-meta">{store.q[q.id]?.bookmarked ? <span className="chip" title="Bookmarked" aria-label="Bookmarked"><IBookmark size={12} /></span> : null}{m?.sims?.length ? <span className="chip" title="Has interactive simulation"><ISim size={12} /></span> : null}{m && <DiffChip d={m.difficulty} />}<StatusChip status={statusOf(q.id, store).status} /></span>
              </Link>;
            })}
          </div>}
        </section>;
      })}
    </div>
  );
}
