// Validates every content/questions/*.md and regenerates src/data/meta.generated.json.
// Usage: node scripts/validate-content.mjs [--quiet] [q0001 q0002 ...]
import fs from 'node:fs'; import path from 'node:path';
import { parseQuestion, validateQuestion } from '../src/content/parse.mjs';
import { renderCircuit } from '../src/diagrams/circuit.mjs';
import { renderTiming } from '../src/diagrams/timing.mjs';
import { compile, evalNum } from '../src/lib/expr.ts';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2); const quiet = args.includes('--quiet'); const only = args.filter(a => /^q\d{4}$/.test(a));
const index = JSON.parse(fs.readFileSync(path.join(root, 'src/data/index.generated.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/sims/catalog.json'), 'utf8'));
const ctx = { simIds: new Set(catalog.map(s => s.id)), questionIds: new Set(index.questions.map(q => q.id)) };
const dir = path.join(root, 'content/questions');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^q\d{4}\.md$/.test(f)).sort() : [];
const meta = {}; const search = {}; let nErr = 0, nWarn = 0; const report = [];
const strip = s => (s || '').replace(/```[\s\S]*?```/g, ' ').replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$([^$\n]+)\$/g, '$1').replace(/\[\[(q\d{4})(\|[^\]]+)?\]\]/g, '').replace(/[#>*_`|]/g, '').replace(/\s+/g, ' ').trim();
for (const f of files) {
  const id = f.replace('.md', '');
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const p = parseQuestion(src);
  const v = validateQuestion(p, ctx);
  if (p.meta.id && p.meta.id !== id) v.errors.push(`frontmatter id ${p.meta.id} != filename ${id}`);
  // render-check diagrams
  const all = Object.values(p.sections).join('\n');
  for (const m of all.matchAll(/```circuit\n([\s\S]*?)\n```/g)) { try { const r = renderCircuit(JSON.parse(m[1])); for (const e of r.errors) v.errors.push('circuit: ' + e); } catch { /* reported by validator */ } }
  for (const m of all.matchAll(/```timing\n([\s\S]*?)\n```/g)) { try { const r = renderTiming(JSON.parse(m[1])); for (const e of r.errors) v.errors.push('timing: ' + e); } catch { /* reported */ } }
  // evaluate plot/bode expressions so broken formulas are caught at build time
  const ev = (spec, kind) => {
    const vars = {};
    for (const pr of spec.params || []) {
      if (!pr.name || typeof pr.min !== 'number' || typeof pr.max !== 'number' || typeof pr.value !== 'number') throw new Error(`param needs name, numeric min/max/value: ${JSON.stringify(pr)}`);
      if (!(pr.min < pr.max) || pr.value < pr.min || pr.value > pr.max) throw new Error(`param ${pr.name}: need min < max and min ≤ value ≤ max`);
      if (pr.log && pr.min <= 0) throw new Error(`param ${pr.name}: log slider needs min > 0`);
      vars[pr.name] = pr.value;
    }
    for (const [k, val] of Object.entries(spec.vars || {})) if (!(k in vars)) vars[k] = evalNum(val, vars);
    for (const r of spec.readouts || []) { if (!r.label || !r.expr) throw new Error('readout needs label and expr'); evalNum(r.expr, vars); }
    // also check the curve stays finite at the slider extremes
    for (const pr of spec.params || []) for (const edge of [pr.min, pr.max]) { const v2 = { ...vars, [pr.name]: edge }; for (const [k, val] of Object.entries(spec.vars || {})) if (!(spec.params || []).some(q => q.name === k)) v2[k] = evalNum(val, v2);
      if (kind === 'plot') for (const sr of spec.series || []) { if (!sr.fn) continue; const f = compile(sr.fn, ['x'], v2); const a = evalNum(spec.x?.min ?? 0, v2), b = evalNum(spec.x?.max ?? 1, v2); let fin = 0; for (let i = 0; i < 50; i++) if (Number.isFinite(f(a + (b - a) * i / 49))) fin++; if (fin < 10) throw new Error(`series "${sr.label || sr.fn}" is non-finite when ${pr.name} = ${edge}`); } }
    if (kind === 'plot') {
      const a = evalNum(spec.x?.min ?? 0, vars), b = evalNum(spec.x?.max ?? 1, vars);
      for (const sr of spec.series || []) { if (!sr.fn) continue; const f = compile(sr.fn, ['x'], vars); let fin = 0; for (let i = 0; i < 50; i++) { const y = f(a + (b - a) * i / 49); if (Number.isFinite(y)) fin++; } if (fin < 10) v.errors.push(`plot series "${sr.label || sr.fn}" is non-finite over the x range`); }
      for (const k of ['hlines', 'vlines']) for (const h of spec[k] || []) evalNum(h.at, vars);
      for (const pt of spec.points || []) { evalNum(pt.x, vars); evalNum(pt.y, vars); }
    } else { for (const sy of spec.systems || []) [...sy.num, ...sy.den].forEach(c => { if (!Number.isFinite(evalNum(c, vars))) throw new Error('non-finite coefficient ' + c); }); evalNum(spec.f.min, vars); evalNum(spec.f.max, vars); }
  };
  for (const kind of ['plot', 'bode']) for (const m of all.matchAll(new RegExp('```' + kind + '\\n([\\s\\S]*?)\\n```', 'g'))) { try { ev(JSON.parse(m[1]), kind); } catch (e) { v.errors.push(`${kind}: ${e.message}`); } }
  for (const m of all.matchAll(/```sim\n([\s\S]*?)\n```/g)) { try { const o = JSON.parse(m[1]); const c = catalog.find(s => s.id === o.id); if (c) for (const k of Object.keys(o)) if (!['id', 'title'].includes(k) && !(k in c.params)) v.warnings.push(`sim ${o.id}: param "${k}" not in catalog params`); if (c && o.preset && c.presets && Object.keys(c.presets).length && !(o.preset in c.presets)) v.errors.push(`sim ${o.id}: unknown preset "${o.preset}"`); } catch { /* reported */ } }
  if (only.length && !only.includes(id)) { /* still include meta */ }
  for (const m of all.matchAll(/^```[ \t]*\S.*$/gm)) if (!/^```[a-z-]+\s*$/.test(m[0])) v.errors.push('text on a fence line (put captions on the next line): ' + m[0].slice(0, 60));
  { let inF = false; src.split('\n').forEach((l, i) => { if (l.trim().startsWith('```')) { inF = !inF; return; } if (inF || l.includes('$$')) return; const t = l.replace(/\\\$/g, '').replace(/`[^`]*`/g, ''); if ((t.match(/\$/g) || []).length % 2) v.errors.push(`line ${i + 1}: unbalanced $ (currency? write "USD 5" or \\$): ${l.trim().slice(0, 60)}`); }); }
  nErr += v.errors.length; nWarn += v.warnings.length;
  if ((v.errors.length || (!quiet && v.warnings.length)) && (!only.length || only.includes(id))) report.push(`\n${id}:` + v.errors.map(e => `\n  ERROR ${e}`).join('') + v.warnings.map(w => `\n  warn  ${w}`).join(''));
  const sims = [...all.matchAll(/```sim\n([\s\S]*?)\n```/g)].map(m => { try { return JSON.parse(m[1]).id; } catch { return null; } }).filter(Boolean);
  const terms = (p.sections.terms || '').split('\n').map(l => (l.match(/^\s*[-*]\s+\*\*(.+?)\*\*/) || [])[1]).filter(Boolean);
  meta[id] = { title: p.meta.title || id, difficulty: p.meta.difficulty, kind: p.meta.kind, concepts: p.meta.concepts || [], prereqs: p.meta.prereqs || [], related: p.meta.related || [], words: v.words, sims, quizCount: p.quiz.length, rubricCount: p.rubric.length, followupCount: p.followups.length };
  search[id] = { short: strip(p.sections.short).slice(0, 420), terms };
}
fs.writeFileSync(path.join(root, 'src/data/meta.generated.json'), JSON.stringify(meta));
// Search-only fields live in their own file so they load with the search palette, not on every first visit.
fs.writeFileSync(path.join(root, 'src/data/search.generated.json'), JSON.stringify(search));
// Prerequisite graph must be acyclic, or the learning path can't order the questions.
{ const color = {}; const seen = new Set();
  const dfs = (u, stack) => { color[u] = 1; stack.push(u);
    for (const v of meta[u]?.prereqs || []) { if (color[v] === 1) { const cyc = stack.slice(stack.indexOf(v)).concat(v).join(' → '); if (!seen.has(cyc)) { seen.add(cyc); nErr++; report.push(`\nprereqs: ERROR cycle ${cyc} (a question can't be its own prerequisite; move one link to "related")`); } } else if (!color[v]) dfs(v, stack); }
    stack.pop(); color[u] = 2; };
  for (const id of Object.keys(meta)) if (!color[id]) dfs(id, []); }
const missing = index.questions.filter(q => !meta[q.id]).map(q => q.n);
console.log(report.join('') || '');
console.log(`\nValidated ${files.length} files: ${nErr} errors, ${nWarn} warnings. Missing content for ${missing.length}/${index.questions.length} questions.`);
if (!quiet && missing.length && missing.length < 60) console.log('Missing:', missing.join(', '));
process.exitCode = nErr ? 1 : 0;
