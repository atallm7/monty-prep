import { Link, useParams } from 'react-router-dom';
import { SIM_CATALOG, simImplemented } from '../sims/registry';
import { SimBlock } from '../components/Blocks';
import { META, QUESTIONS, titleOf } from '../lib/data';

export default function SimsLab() {
  const { simId } = useParams();
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
  return <div className="page fade-in">
    <div className="eyebrow">Simulation lab</div>
    <h1 className="page-title">Experiment with the engineering</h1>
    <p className="page-sub">{sims.length} working simulations. Each one calculates its outputs from the physics or logic, so you can change values and watch what happens. They're also embedded in the question pages where they help.</p>
    {cats.map(c => <section key={c} style={{ marginTop: 26 }}>
      <h2 className="h3" style={{ marginBottom: 10 }}>{c}</h2>
      <div className="sim-grid">{sims.filter(s => s.category === c).map(s => <Link key={s.id} to={`/sims/${s.id}`} className="sim-card"><b>{s.title}</b><span className="small muted">{s.description.slice(0, 150)}{s.description.length > 150 ? '…' : ''}</span></Link>)}</div>
    </section>)}
  </div>;
}
