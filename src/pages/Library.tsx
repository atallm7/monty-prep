import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DOMAINS, SECTIONS, SECTION_BY_ID, DOMAIN_BY_ID, META, QUESTIONS, titleOf, Difficulty } from '../lib/data';
import { useStore, statusOf, Status, STATUS_LABEL } from '../lib/progress';
import StatusChip, { DiffChip } from '../components/StatusChip';
import { IMic, ISim } from '../components/Icons';

const STATUSES: Status[] = ['not-started', 'learning', 'needs-review', 'mastered'];
const DIFFS: Difficulty[] = ['fundamental', 'intermediate', 'advanced'];

export default function Library() {
  const { domainId, sectionId } = useParams();
  const store = useStore();
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [diff, setDiff] = useState<Difficulty | 'all'>('all');
  const [filter, setFilter] = useState('');
  const section = sectionId ? SECTION_BY_ID.get(sectionId) : undefined;
  const domain = domainId ? DOMAIN_BY_ID.get(domainId) : section ? DOMAIN_BY_ID.get(section.domainId) : undefined;

  const sections = useMemo(() => section ? [section] : domain ? SECTIONS.filter(s => s.domainId === domain.id) : SECTIONS, [section, domain]);
  const f = filter.trim().toLowerCase();
  const visible = (id: string, text: string) => {
    if (status !== 'all' && statusOf(id, store).status !== status) return false;
    if (diff !== 'all' && META[id]?.difficulty !== diff) return false;
    if (f && !(text.toLowerCase().includes(f) || titleOf(id).toLowerCase().includes(f) || (META[id]?.concepts || []).some(c => c.includes(f)))) return false;
    return true;
  };
  const scopeQs = QUESTIONS.filter(q => sections.some(s => s.id === q.sectionId));
  const counts = STATUSES.map(s => scopeQs.filter(q => statusOf(q.id, store).status === s).length);
  const title = section ? section.title : domain ? domain.title : 'Question library';
  const practiceHref = section ? `/interview?section=${section.id}` : domain ? `/interview?domain=${domain.id}` : '/interview';

  return (
    <div className="page fade-in">
      <nav className="crumbs small"><Link to="/library">Library</Link>{domain && <> › <Link to={`/d/${domain.id}`}>{domain.title}</Link></>}{section && <> › {section.path.slice(0, -1).join(' › ')}</>}</nav>
      <div className="spread" style={{ alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{scopeQs.length} questions{section?.note ? '' : domain ? ` across ${sections.length} sections` : ` across ${DOMAINS.length} topics and ${SECTIONS.length} sections`}. Every question has its own page with model answers, deep explanation, diagrams, follow-ups and a quiz.</p>
          {section?.note && <p className="q-note small" style={{ maxWidth: 760 }}><b>Source note:</b> {section.note}</p>}
        </div>
        <div className="row"><Link className="btn btn-primary" to={practiceHref}><IMic size={15} /> Practice {section ? 'this section' : domain ? 'this topic' : ''}</Link></div>
      </div>

      <div className="lib-filters">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Filter by text or concept…" value={filter} onChange={e => setFilter(e.target.value)} />
        <div className="row-wrap">
          <button className={'chip' + (status === 'all' ? ' on' : '')} onClick={() => setStatus('all')}>All · {scopeQs.length}</button>
          {STATUSES.map((s, i) => <button key={s} className={'chip' + (status === s ? ' on' : '')} onClick={() => setStatus(s)}>{STATUS_LABEL[s]} · {counts[i]}</button>)}
        </div>
        <div className="row-wrap">
          <button className={'chip' + (diff === 'all' ? ' on' : '')} onClick={() => setDiff('all')}>Any level</button>
          {DIFFS.map(d => <button key={d} className={'chip' + (diff === d ? ' on' : '')} onClick={() => setDiff(d)}>{d}</button>)}
        </div>
      </div>

      {!domain && !section && <div className="domain-grid">
        {DOMAINS.map(d => {
          const qs = QUESTIONS.filter(q => q.domainId === d.id); const m = qs.filter(q => statusOf(q.id, store).status === 'mastered').length;
          return <Link key={d.id} to={`/d/${d.id}`} className="domain-card"><b>{d.title}</b><span className="small muted">{qs.length} questions · {d.sections.length} sections</span><div className="progress" style={{ marginTop: 8 }}><i className="pb-mastered" style={{ width: `${m / qs.length * 100}%` }} /></div></Link>;
        })}
      </div>}

      {sections.map(s => {
        const qs = QUESTIONS.filter(q => q.sectionId === s.id && visible(q.id, q.text));
        if (!qs.length) return null;
        return <section key={s.id} className="lib-section">
          {!section && <div className="lib-section-head"><Link to={`/s/${s.id}`}><h2 className="h3">{s.path.join(' › ')}</h2></Link><span className="faint small">{s.questions.length}</span></div>}
          <div className="q-list">
            {qs.map(q => {
              const m = META[q.id];
              return <Link key={q.id} to={`/q/${q.id}`} className="q-row">
                <span className="q-row-n">{q.n}</span>
                <span className="q-row-main"><span className="q-row-text">{q.text}</span>{q.subItems.length > 0 && <span className="tiny faint">{q.subItems.join(' · ')}</span>}{m?.title && <span className="tiny faint">{m.title}</span>}</span>
                <span className="q-row-meta">{m?.sims?.length ? <span className="chip" title="Has interactive simulation"><ISim size={12} /></span> : null}{m && <DiffChip d={m.difficulty} />}<StatusChip status={statusOf(q.id, store).status} /></span>
              </Link>;
            })}
          </div>
        </section>;
      })}
    </div>
  );
}
