import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SIM_CATALOG, simImplemented } from '../sims/registry';
import { SimBlock } from '../components/Blocks';
import { META, QUESTIONS, titleOf } from '../lib/data';

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '');

export default function SimsLab() {
  const { simId } = useParams();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const sims = SIM_CATALOG.filter(s => simImplemented(s.id));
  if (simId) {
    const s = SIM_CATALOG.find(x => x.id === simId);
    if (!s || !simImplemented(simId)) return <div className="page"><div className="empty">Simulation not found. <Link to="/sims">All simulations</Link></div></div>;
    const usedIn = QUESTIONS.filter(q => META[q.id]?.sims?.includes(simId));
    return <div className="page fade-in" style={{ maxWidth: 1100 }}>
      <nav className="crumbs small"><Link to="/sims">Simulation lab</Link> › {s.category}</nav>
      <h1 className="page-title">{s.title}</h1>
      <p className="page-sub">{s.description}</p>
      <div style={{ marginTop: 18 }}><SimBlock code={JSON.stringify({ id: s.id })} /></div>
      {Object.keys(s.presets || {}).length > 0 && <div className="card" style={{ marginBottom: 16 }}><div className="eyebrow" style={{ marginBottom: 6 }}>Presets</div><div className="small muted">{Object.entries(s.presets!).map(([k, v]) => <div key={k}><code>{k}</code>: {v}</div>)}</div></div>}
      {usedIn.length > 0 && <div className="card"><div className="eyebrow" style={{ marginBottom: 8 }}>Used in {usedIn.length} question pages</div><div className="stack" style={{ gap: 4 }}>{usedIn.map(q => <Link key={q.id} to={`/q/${q.id}`} className="small">Q{q.n} · {titleOf(q.id)}</Link>)}</div></div>}
    </div>;
  }
  const cats = [...new Set(sims.map(s => s.category))];
  const tokens = q.toLowerCase().split(/\s+/).map(norm).filter(Boolean);
  const match = (s: typeof sims[number]) => (cat === 'all' || s.category === cat) && tokens.every(t => norm(`${s.title} ${s.description} ${s.category}`).includes(t));
  const total = sims.filter(match).length;
  return <div className="page fade-in">
    <div className="eyebrow">Simulation lab</div>
    <h1 className="page-title">Experiment with the engineering</h1>
    <p className="page-sub">{sims.length} working simulations. Each one calculates its outputs from the physics or logic, so you can change values and watch what happens. They're also embedded in the question pages where they help.</p>
    <div className="sim-filters">
      <input className="input" type="search" aria-label="Search simulations" placeholder="Search simulations…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="sim-chips">
        <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>All · {sims.length}</button>
        {cats.map(c => <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(cat === c ? 'all' : c)}>{c} · {sims.filter(s => s.category === c).length}</button>)}
      </div>
    </div>
    <div className="small muted lib-count" role="status" aria-live="polite">{(tokens.length || cat !== 'all') ? `${total} of ${sims.length} simulations` : ''}</div>
    {total === 0 && <div className="empty">No simulations match.</div>}
    {cats.map(c => { const list = sims.filter(s => s.category === c && match(s)); if (!list.length) return null; return <section key={c} style={{ marginTop: 26 }}>
      <h2 className="h3" style={{ marginBottom: 10 }}>{c}</h2>
      <div className="sim-grid">{list.map(s => <Link key={s.id} to={`/sims/${s.id}`} className="sim-card"><b>{s.title}</b><span className="small muted">{s.description.slice(0, 150)}{s.description.length > 150 ? '…' : ''}</span></Link>)}</div>
    </section>; })}
  </div>;
}
