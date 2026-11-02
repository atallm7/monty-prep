import { useRef, useState } from 'react';
import { actions, useStore, overall } from '../lib/progress';
import { useTheme } from '../lib/theme';
import { META, QUESTIONS } from '../lib/data';
import { SIM_CATALOG, simImplemented } from '../sims/registry';

export default function Settings() {
  const { mode, setMode } = useTheme();
  const store = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const o = overall(store);
  const download = () => {
    const blob = new Blob([actions.exportJson()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `interview-progress-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  return <div className="page page-narrow fade-in">
    <h1 className="page-title">Settings & data</h1>
    <div className="card stack" style={{ marginTop: 20 }}>
      <h3 className="h3">Appearance</h3>
      <div className="seg">{(['system', 'light', 'dark'] as const).map(m => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m}</button>)}</div>
    </div>
    <div className="card stack" style={{ marginTop: 16 }}>
      <h3 className="h3">Your progress</h3>
      <p className="small muted" style={{ margin: 0 }}>Progress is saved in this browser (localStorage) and persists between sessions. Export it to back up or move to another device.</p>
      <div className="small">{o.completed} questions started · {o.counts.mastered} mastered · {o.quizAnswered} quiz answers · {store.sessions.length} sessions</div>
      <div className="row-wrap">
        <button className="btn" onClick={download}>Export progress (.json)</button>
        <button className="btn" onClick={() => file.current?.click()}>Import progress…</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { actions.importJson(await f.text()); setMsg('Progress imported.'); } catch (err) { setMsg('Import failed: ' + (err as Error).message); } e.target.value = ''; }} />
        <button className="btn" style={{ color: 'var(--bad)' }} onClick={() => { if (confirm('Erase all progress? This cannot be undone (export first if unsure).')) { actions.reset(); setMsg('Progress reset.'); } }}>Reset all progress</button>
      </div>
      {msg && <div className="small" style={{ color: 'var(--accent)' }}>{msg}</div>}
    </div>
    <div className="card stack" style={{ marginTop: 16 }}>
      <h3 className="h3">How mastery works</h3>
      <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
        <li><b>Not started</b>: you haven't opened or attempted the question.</li>
        <li><b>Learning</b>: opened or partly attempted. Opening a page never counts as mastery.</li>
        <li><b>Mastered</b>: your latest spoken self-check (or interview answer) covered ≥80% of the key points with a rating of “Solid” or better, <i>and</i> you've answered at least two quiz items for it with ≥80% accuracy.</li>
        <li><b>Needs review</b>: you flagged it, covered under 60% of the key points, rated yourself low, scored under 60% on its quiz, or a mastered question came due for spaced review (intervals grow ×2.2 after each pass: 3 → 7 → 15 → 33 days).</li>
      </ul>
    </div>
    <div className="card stack" style={{ marginTop: 16 }}>
      <h3 className="h3">About the content</h3>
      <p className="small muted" style={{ margin: 0 }}>All {QUESTIONS.length} questions come word for word from Monty Choy's <a href="https://montychoy.com/blog/the_ultimate_list_of_hardware_engineering_internship_interview_questions" target="_blank" rel="noreferrer">“The Ultimate List of Hardware Engineering Internship Interview Questions”</a>, including the original typos. The answers, explanations, diagrams, quizzes and simulations are original study material written for this platform and checked in a separate technical review pass. Each page lists its references. Where an answer depends on assumptions, the page says so.</p>
      <div className="small">{Object.keys(META).length}/{QUESTIONS.length} study pages · {SIM_CATALOG.filter(s => simImplemented(s.id)).length} simulations</div>
    </div>
  </div>;
}
