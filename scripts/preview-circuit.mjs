// Usage: node scripts/preview-circuit.mjs <spec.json|question.md> [out.png] [--dark]
// Renders every ```circuit block (or a single spec JSON) to a PNG for visual QA.
import fs from 'node:fs'; import path from 'node:path';
import { renderCircuit } from '../src/diagrams/circuit.mjs';
const { chromium } = await import(process.env.PW_PATH || 'playwright').catch(async () => (await import('module')).createRequire(import.meta.url)('playwright'));
const [inp, outArg, ...rest] = process.argv.slice(2);
const dark = rest.includes('--dark') || outArg === '--dark';
const out = outArg && !outArg.startsWith('--') ? outArg : inp.replace(/\.(json|md)$/, '') + '.png';
const src = fs.readFileSync(inp, 'utf8');
let specs = [];
if (inp.endsWith('.json')) { const j = JSON.parse(src); specs = Array.isArray(j) ? j : [j]; }
else { const re = /```circuit\n([\s\S]*?)\n```/g; let m; while ((m = re.exec(src))) specs.push(JSON.parse(m[1])); }
const css = fs.readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8');
const body = specs.map((s, i) => { const r = renderCircuit(s); return `<div class="figure"><div class="figure-body">${r.svg}</div><div class="figure-cap">#${i + 1} ${s.caption || ''} ${r.errors.length ? '<b style="color:red">' + r.errors.join('; ') + '</b>' : ''}</div></div>`; }).join('');
const html = `<!doctype html><html data-theme="${dark ? 'dark' : 'light'}"><head><style>${css} body{padding:20px;width:900px}</style></head><body>${body}</body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 940, height: 800 } });
await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close();
console.log('wrote', out, specs.length, 'circuits');
