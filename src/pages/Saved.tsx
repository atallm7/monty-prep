import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QUESTIONS, Q_BY_ID, titleOf, SECTION_BY_ID } from '../lib/data';
import { useStore, statusOf } from '../lib/progress';
import { savedIds } from '../lib/saved';
import StatusChip from '../components/StatusChip';

type Tab = 'bookmarked' | 'flagged';

export default function Saved() {
  const store = useStore();
  const { bookmarked, flagged } = savedIds(store);
  const [tab, setTab] = useState<Tab>('bookmarked');
  const ids = tab === 'bookmarked' ? bookmarked : flagged;
  const tabs: { id: Tab; label: string; n: number }[] = [{ id: 'bookmarked', label: 'Bookmarked', n: bookmarked.length }, { id: 'flagged', label: 'Flagged for review', n: flagged.length }];
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { setTab(tab === 'bookmarked' ? 'flagged' : 'bookmarked'); } };
  return <div className="page page-narrow fade-in">
    <div className="eyebrow">Saved</div>
    <h1 className="page-title">Your saved questions</h1>
    <p className="page-sub">Questions you bookmarked, and ones you flagged to come back to. Use the bookmark or flag buttons on a question page to add to this list.</p>
    <div className="saved-tabs" role="tablist" aria-label="Saved lists" onKeyDown={onKey}>
      {tabs.map(t => <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="saved-panel" tabIndex={tab === t.id ? 0 : -1} className={'saved-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>{t.label} <span className="faint">{t.n}</span></button>)}
    </div>
    <div id="saved-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {ids.length === 0
        ? <div className="empty">{tab === 'bookmarked' ? 'Nothing bookmarked yet. Open any question and press Bookmark to keep it here.' : 'Nothing flagged for review. Mark a question “needs review” on its page and it will appear here.'} <Link to="/library">Browse the library</Link></div>
        : <div className="q-list">{ids.map(id => {
          const q = Q_BY_ID.get(id)!;
          return <Link key={id} to={`/q/${id}`} className="q-row card-link">
            <span className="q-row-n">{q.n}</span>
            <span className="q-row-main"><span className="q-row-text">{titleOf(id)}</span><span className="tiny faint">{SECTION_BY_ID.get(q.sectionId)?.path.join(' › ')}</span></span>
            <span className="q-row-meta"><StatusChip status={statusOf(id, store).status} /></span>
          </Link>;
        })}</div>}
    </div>
  </div>;
}
