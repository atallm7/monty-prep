// Screenshot any app route. Requires the dev server (npm run dev) or preview server running.
// Usage: node scripts/shot.mjs <route e.g. /q/q0008> <out.png> [--dark] [--mobile] [--full] [--base http://localhost:5173] [--click "text"] [--section deep]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const route = args[0] || '/'; const out = args[1] || 'shot.png';
const flag = f => args.includes(f); const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const base = opt('--base', 'http://localhost:5173');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: flag('--mobile') ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: flag('--dark') ? 'dark' : 'light' });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await p.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: '.topbar{position:static !important}' });
await p.waitForTimeout(1200);
await p.waitForFunction(() => !document.body.innerText.includes('Rendering diagram') && !document.body.innerText.includes('Loading simulation'), null, { timeout: 15000 }).catch(() => {});
const click = opt('--click'); if (click) { await p.getByText(click, { exact: false }).first().click(); await p.waitForTimeout(600); }
const sec = opt('--section'); if (sec) { await p.evaluate(s => document.getElementById('sec-' + s)?.scrollIntoView(), sec); await p.waitForTimeout(800); }
const selq = opt('--selector'); if (selq) { const cnt = await p.locator(selq).count(); if (+opt('--nth', '0') >= cnt) { console.log(`only ${cnt} elements match ${selq}`); await b.close(); process.exit(1); } const el = p.locator(selq).nth(+opt('--nth', '0')); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(700); await el.screenshot({ path: out }); } else
await p.screenshot({ path: out, fullPage: flag('--full') });
await b.close();
console.log('wrote', out); if (errors.length) console.log(errors.join('\n'));
