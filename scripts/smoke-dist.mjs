// Serves dist/ and loads it in headless Chromium; fails if the app doesn't render or throws.
// Catches production-only bundling problems that the dev server can't show.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const root = path.resolve('dist'); const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); });
await new Promise(ok => srv.listen(0, ok)); const base = `http://localhost:${srv.address().port}/`;
const b = await chromium.launch(); const p = await b.newPage(); const errors = [];
p.on('pageerror', e => errors.push(e.message));
let ok = true;
for (const [route, expect] of [['', '1,005'], ['#/q/q0008', 'voltage divider'], ['#/sims/divider', 'Divider'], ['#/library', 'Fundamentals']]) {
  await p.goto(base + route, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const txt = await p.evaluate(() => document.body.innerText);
  const pass = txt.toLowerCase().includes(expect.toLowerCase()); ok &&= pass; console.log(`${pass ? 'ok  ' : 'FAIL'} /${route} contains "${expect}"`);
}
if (errors.length) { ok = false; console.log('page errors:\n' + errors.join('\n')); }
await b.close(); srv.close(); process.exitCode = ok ? 0 : 1;
