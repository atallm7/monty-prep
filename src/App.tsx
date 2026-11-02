import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, Link } from 'react-router-dom';
import { DOMAINS, SECTIONS, SECTION_BY_ID, questionsInDomain } from './lib/data';
import { useStore, statusOf } from './lib/progress';
import { useTheme } from './lib/theme';
import { IHome, ILibrary, IMic, IQuiz, IReview, ISim, IPath, ISettings, ISearch, ISun, IMoon, IMenu, IChevron, ILogo } from './components/Icons';
import SearchPalette from './components/SearchPalette';
import Dashboard from './pages/Dashboard';

const Library = lazy(() => import('./pages/Library'));
const QuestionPage = lazy(() => import('./pages/QuestionPage'));
const Interview = lazy(() => import('./pages/Interview'));
const QuizDrill = lazy(() => import('./pages/QuizDrill'));
const SimsLab = lazy(() => import('./pages/SimsLab'));
const LearningPath = lazy(() => import('./pages/LearningPath'));
const Settings = lazy(() => import('./pages/Settings'));

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const loc = useLocation();
  const activeSection = loc.pathname.startsWith('/s/') ? loc.pathname.slice(3) : null;
  return (
    <aside className={'sidebar' + (open ? ' open' : '')} aria-label="Navigation">
      <div className="sidebar-head">
        <Link to="/" className="brand" onClick={onClose}>
          <span className="brand-mark"><ILogo size={17} /></span>
          <span>Circuit Interview Lab<small>1,005 hardware questions</small></span>
        </Link>
      </div>
      <nav className="nav">
        <NavLink to="/" end onClick={onClose}><IHome />Dashboard</NavLink>
        <NavLink to="/library" onClick={onClose}><ILibrary />Question library</NavLink>
        <NavLink to="/path" onClick={onClose}><IPath />Learning path</NavLink>
        <NavLink to="/interview" onClick={onClose}><IMic />Interview simulator</NavLink>
        <NavLink to="/quiz" onClick={onClose}><IQuiz />Quiz drill</NavLink>
        <NavLink to="/review" onClick={onClose}><IReview />Review queue</NavLink>
        <NavLink to="/sims" onClick={onClose}><ISim />Simulation lab</NavLink>
        <NavLink to="/settings" onClick={onClose}><ISettings />Settings & data</NavLink>
      </nav>
      <div className="side-section-title">Topics</div>
      <div className="tree">
        {DOMAINS.map(d => {
          const qs = questionsInDomain(d.id);
          const mastered = qs.filter(q => statusOf(q.id, store).status === 'mastered').length;
          const isOpen = !!activeSection && SECTION_BY_ID.get(activeSection)?.domainId === d.id;
          return (
            <details key={d.id} open={isOpen || undefined}>
              <summary><IChevron size={12} /><span>{d.title}</span><span className="tree-count">{mastered}/{qs.length}</span></summary>
              {d.sections.map(sid => {
                const s = SECTIONS.find(x => x.id === sid)!;
                const label = s.path.length > 1 && s.path[s.path.length - 1] === s.title ? s.title : s.title;
                return <Link key={sid} to={`/s/${sid}`} className={'tree-sec' + (activeSection === sid ? ' active' : '')} onClick={onClose}
                  style={{ paddingLeft: 30 + Math.max(0, Math.min(2, s.path.length - 2)) * 10 }}>{label}</Link>;
              })}
            </details>
          );
        })}
      </div>
    </aside>
  );
}

export default function App() {
  const [nav, setNav] = useState(false);
  const [search, setSearch] = useState(false);
  const { effective, setMode } = useTheme();
  const loc = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/input|textarea|select/i.test((e.target as HTMLElement).tagName))) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="app">
      <Sidebar open={nav} onClose={() => setNav(false)} />
      {nav && <div className="scrim" onClick={() => setNav(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open navigation" onClick={() => setNav(true)}><IMenu /></button>
          <button className="search-trigger" onClick={() => setSearch(true)}><ISearch size={16} /><span>Search questions, concepts…</span><kbd>Ctrl K</kbd></button>
          <span className="topbar-spacer" />
          <button className="icon-btn" aria-label="Toggle theme" title="Toggle light/dark" onClick={() => setMode(effective === 'dark' ? 'light' : 'dark')}>{effective === 'dark' ? <ISun /> : <IMoon />}</button>
        </header>
        <Suspense fallback={<div className="page"><div className="empty">Loading…</div></div>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/d/:domainId" element={<Library />} />
            <Route path="/s/:sectionId" element={<Library />} />
            <Route path="/q/:id" element={<QuestionPage />} />
            <Route path="/interview" element={<Interview />} />
            <Route path="/review" element={<Interview reviewMode />} />
            <Route path="/quiz" element={<QuizDrill />} />
            <Route path="/sims" element={<SimsLab />} />
            <Route path="/sims/:simId" element={<SimsLab />} />
            <Route path="/path" element={<LearningPath />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<div className="page"><div className="empty">Page not found. <Link to="/">Go home</Link></div></div>} />
          </Routes>
        </Suspense>
      </div>
      {search && <SearchPalette onClose={() => setSearch(false)} />}
    </div>
  );
}
