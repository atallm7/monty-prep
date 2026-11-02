// Writes docs/PROGRESS.md: per-batch content status + simulation status, from the actual files.
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const qdir = path.join(root, 'content/questions');
const have = new Set(fs.existsSync(qdir) ? fs.readdirSync(qdir).map(f => f.replace('.md', '')) : []);
const reviewed = {}; const rdir = path.join(root, 'docs/reviews');
for (const f of fs.existsSync(rdir) ? fs.readdirSync(rdir) : []) { const b = fs.readFileSync(path.join(root, 'docs/batches', f), 'utf8'); for (const m of b.matchAll(/^- (q\d{4})/gm)) reviewed[m[1]] = true; }
const bdir = path.join(root, 'docs/batches');
const lines = ['# Build progress checklist', '', `_Generated ${new Date().toISOString()} by scripts/progress-report.mjs_`, '', '## Question pages', '', '| Batch | Questions | Written | QA reviewed |', '|---|---|---|---|'];
let tot = 0, done = 0, rev = 0;
for (const f of fs.readdirSync(bdir).filter(f => /^b\d+\.md$/.test(f)).sort()) {
  const ids = [...fs.readFileSync(path.join(bdir, f), 'utf8').matchAll(/^- (q\d{4})/gm)].map(m => m[1]);
  const w = ids.filter(i => have.has(i)).length, r = ids.filter(i => reviewed[i]).length;
  tot += ids.length; done += w; rev += r;
  lines.push(`| ${f.replace('.md', '')} | ${ids[0]}–${ids[ids.length - 1]} (${ids.length}) | ${w === ids.length ? '✅' : '⬜'} ${w}/${ids.length} | ${r === ids.length ? '✅' : '⬜'} ${r}/${ids.length} |`);
}
lines.splice(5, 0, `**${done + (have.has('q0008') ? 1 : 0)}/1005 pages written, ${rev} QA-reviewed.** (q0008 is the hand-written reference page.)`, '');
const cat = JSON.parse(fs.readFileSync(path.join(root, 'src/sims/catalog.json'), 'utf8'));
lines.push('', '## Simulations', '', '| Sim | Implemented | Model test |', '|---|---|---|');
let si = 0;
for (const c of cat) {
  const impl = fs.existsSync(path.join(root, `src/sims/impl/${c.id}.tsx`)); const t = path.join(root, `scripts/sim-tests/${c.id}.test.ts`);
  let test = '—'; if (fs.existsSync(t)) { try { execSync(`node ${t}`, { stdio: 'ignore', timeout: 60000 }); test = '✅ pass'; } catch { test = '❌ fail'; } }
  if (impl) si++;
  lines.push(`| ${c.id} | ${impl ? '✅' : '⬜'} | ${test} |`);
}
lines.splice(lines.indexOf('## Simulations') + 1, 0, '', `**${si}/${cat.length} implemented.**`);
fs.writeFileSync(path.join(root, 'docs/PROGRESS.md'), lines.join('\n') + '\n');
console.log(`pages ${done + 1}/1005, reviewed ${rev}, sims ${si}/${cat.length}`);
