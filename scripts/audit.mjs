// Site-wide audit: loads every question page (mobile viewport by default) and reports
// horizontal overflow, KaTeX/mermaid/figure render errors, broken internal question links and page errors.
// Usage: node scripts/audit.mjs [--base http://localhost:5173] [--desktop] [--ids q0001,q0002]
import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const args = process.argv.slice(2); const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const base = opt('--base') || 'http://localhost:5173';
const idx = JSON.parse(fs.readFileSync('src/data/index.generated.json', 'utf8'));
const all = (idx.questions || idx).map(q => q.id).filter(Boolean);
const ids = opt('--ids') ? opt('--ids').split(',') : all; const known = new Set(all);
const b = await chromium.launch();
const ctx = await b.newContext(args.includes('--desktop') ? { viewport: { width: 1280, height: 900 } } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); let errs = [];
p.on('pageerror', e => errs.push(e.message.slice(0, 160)));
const issues = []; let n = 0;
for (const id of ids) {
  errs = [];
  await p.goto(`${base}/#/q/${id}`, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(300);
  // scroll through so lazy figures/mermaid render
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 900) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await p.waitForFunction(() => !document.body.innerText.includes('Rendering diagram'), null, { timeout: 8000 }).catch(() => {});
  const r = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const over = document.documentElement.scrollWidth - vw;
    const wide = [...document.querySelectorAll('main *')].filter(e => { const b = e.getBoundingClientRect(); if (b.width === 0) return false; let a = e.parentElement; while (a && a !== document.body) { const s = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(s.overflowX)) return false; a = a.parentElement; } return b.right > vw + 2; }).slice(0, 3).map(e => e.tagName.toLowerCase() + '.' + (e.className?.baseVal ?? e.className ?? '').toString().split(' ')[0]);
    const links = [...document.querySelectorAll('a[href*="#/q/"]')].map(a => a.getAttribute('href').split('#/q/')[1]);
    return { over, wide, katex: document.querySelectorAll('.katex-error').length, figErr: document.querySelectorAll('.figure-error').length,
      mermaidErr: [...document.querySelectorAll('.figure')].filter(f => /Syntax error|Parse error|Unsupported markdown/i.test(f.innerText)).length,
      raw$$: (document.querySelector('main')?.innerText.match(/\$\$/g) || []).length, links,
      empty: !document.querySelector('#sec-deep') };
  });
  const bad = r.links.filter(l => !known.has(l.slice(0, 5)));
  const prob = [];
  if (r.over > 1) prob.push(`page overflows ${r.over}px (${r.wide.join(', ')})`);
  if (r.katex) prob.push(`${r.katex} KaTeX errors`);
  if (r.figErr) prob.push(`${r.figErr} figure errors`);
  if (r.mermaidErr) prob.push(`${r.mermaidErr} mermaid errors`);
  if (r.raw$$) prob.push(`${r.raw$$} raw $$ in text`);
  if (bad.length) prob.push(`broken links: ${bad.join(',')}`);
  if (r.empty) prob.push('page did not render');
  if (errs.length) prob.push('page errors: ' + errs.join(' | '));
  if (prob.length) { issues.push(`${id}: ${prob.join('; ')}`); console.log(`${id}: ${prob.join('; ')}`); }
  if (++n % 100 === 0) console.error(`… ${n}/${ids.length}`);
}
await b.close();
console.log(`\nAudited ${ids.length} pages: ${issues.length} with issues.`);
process.exitCode = issues.length ? 1 : 0;
