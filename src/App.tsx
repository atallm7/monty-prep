import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import AskClaude from './components/AskClaude';
import { NavLink, Route, Routes, useLocation, Link } from 'react-router-dom';
import { DOMAINS, SECTIONS, SECTION_BY_ID, questionsInDomain } from './lib/data';
import { useStore, statusOf, actions } from './lib/progress';
import { useTheme } from './lib/theme';
import { IHome, ILibrary, IMic, IQuiz, IReview, ISim, IPath, ISettings, ISearch, ISun, IMoon, IMenu, IChevron, ILogo, IBookmark } from './components/Icons';
import Dashboard from './pages/Dashboard';
// Search (MiniSearch + search index data) loads the first time the palette opens.
const SearchPalette = lazy(() => import('./components/SearchPalette'));
const prefetchSearch = () => { void import('./components/SearchPalette'); };
export const SOURCE_URL = 'https://montychoy.com/blog/the_ultimate_list_of_hardware_engineering_internship_interview_questions';

type TextSize = 'small' | 'normal' | 'large';
/** Reading text size, remembered per browser; applied as <html data-text>. */
function useTextSize(): [TextSize, (t: TextSize) => void] {
  const read = (): TextSize => { try { const v = localStorage.getItem('mcp.textSize'); return v === 'small' || v === 'large' ? v : 'normal'; } catch { return 'normal'; } };
  const [size, setSize] = useState<TextSize>(read);
  useEffect(() => {
    if (size === 'normal') document.documentElement.removeAttribute('data-text'); else document.documentElement.setAttribute('data-text', size);
    try { localStorage.setItem('mcp.textSize', size); } catch { /* storage unavailable */ }
  }, [size]);
  return [size, setSize];
}

const Library = lazy(() => import('./pages/Library'));
const QuestionPage = lazy(() => import('./pages/QuestionPage'));
const Interview = lazy(() => import('./pages/Interview'));
const QuizDrill = lazy(() => import('./pages/QuizDrill'));
const SimsLab = lazy(() => import('./pages/SimsLab'));
const LearningPath = lazy(() => import('./pages/LearningPath'));
const Saved = lazy(() => import('./pages/Saved'));
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
        <NavLink to="/saved" onClick={onClose}><IBookmark />Saved</NavLink>
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

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null; confirming: boolean }> {
  state = { err: null as Error | null, confirming: false };
  static getDerivedStateFromError(err: Error) { return { err, confirming: false }; }
  componentDidCatch(err: Error) { console.error('Route crashed:', err); }
  render() {
    const { err, confirming } = this.state;
    if (!err) return this.props.children;
    return <div className="page page-narrow"><div className="card stack" role="alert" style={{ marginTop: 24 }}>
      <h1 className="page-title" style={{ margin: 0 }}>Something went wrong</h1>
      <p className="small muted" style={{ margin: 0 }}>This page hit an unexpected error{err.message ? <>: <code>{err.message}</code></> : ''}. Your saved progress is untouched unless you reset it below.</p>
      <div className="row-wrap">
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button>
        <button className="btn" onClick={() => { window.location.hash = '#/settings'; this.setState({ err: null, confirming: false }); }}>Go to Settings</button>
        {!confirming && <button className="btn" style={{ color: 'var(--bad)' }} onClick={() => this.setState({ confirming: true })}>Reset progress</button>}
      </div>
      {confirming && <div className="callout callout-note"><p className="small" style={{ margin: '0 0 8px' }}>Erase all saved progress in this browser? This cannot be undone.</p>
        <div className="row-wrap"><button className="btn" style={{ color: 'var(--bad)' }} onClick={() => { actions.reset(); this.setState({ err: null, confirming: false }); window.location.hash = '#/'; }}>Yes, erase progress</button>
          <button className="btn" onClick={() => this.setState({ confirming: false })}>Cancel</button></div></div>}
    </div></div>;
  }
}

export default function App() {
  const [nav, setNav] = useState(false);
  const [search, setSearch] = useState(false);
  const { effective, setMode } = useTheme();
  const [textSize, setTextSize] = useTextSize();
  const loc = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);
  // Prefetch the lazy search palette once idle so keystrokes after Ctrl+K aren't lost.
  useEffect(() => {
    const go = () => { void import('./components/SearchPalette'); };
    const w = window as any;
    const h = w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200);
    return () => (w.cancelIdleCallback ? w.cancelIdleCallback(h) : clearTimeout(h));
  }, []);
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
          <button className="search-trigger" onClick={() => setSearch(true)} onPointerEnter={prefetchSearch} onFocus={prefetchSearch}><ISearch size={16} /><span>Search questions, concepts…</span><kbd className="kbd-hint">Ctrl K</kbd></button>
          <span className="topbar-spacer" />
          <button className="textsize-btn" aria-label={`Text size: ${textSize}. Activate to change.`} title={`Text size: ${textSize} (click to change)`} data-size={textSize}
            onClick={() => setTextSize(textSize === 'small' ? 'normal' : textSize === 'normal' ? 'large' : 'small')}><span aria-hidden="true">Aa</span></button>
          <button className="icon-btn" aria-label="Toggle theme" title="Toggle light/dark" onClick={() => setMode(effective === 'dark' ? 'light' : 'dark')}>{effective === 'dark' ? <ISun /> : <IMoon />}</button>
        </header>
        <main id="main">
        <ErrorBoundary key={loc.pathname}>
        <Suspense fallback={<div className="page"><div className="empty">Loading…</div></div>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/library" element={<Library />} />
            <Route path="/d/:domainId" element={<Library />} />
            <Route path="/s/:sectionId" element={<Library />} />
            <Route path="/q/:id" element={<QuestionPage />} />
            <Route path="/interview" element={<Interview key="interview" />} />
            <Route path="/review" element={<Interview key="review" reviewMode />} />
            <Route path="/quiz" element={<QuizDrill />} />
            <Route path="/sims" element={<SimsLab />} />
            <Route path="/sims/:simId" element={<SimsLab />} />
            <Route path="/path" element={<LearningPath />} />
            <Route path="/saved" element={<Saved />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<div className="page"><div className="empty">Page not found. <Link to="/">Go home</Link></div></div>} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
        </main>
        <footer className="site-footer small muted">
          Questions are reproduced from Monty Choy's{' '}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">“The Ultimate List of Hardware Engineering Internship Interview Questions”</a>.
          {' '}Answers, explanations, diagrams, quizzes and simulations are original study material; verify anything you rely on. <Link to="/settings">About this site</Link>
        </footer>
      </div>
      <AskClaude />
      {search && <Suspense fallback={null}><SearchPalette onClose={() => setSearch(false)} /></Suspense>}
    </div>
  );
}
