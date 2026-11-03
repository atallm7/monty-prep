// Builds the claude.ai artifact version: one self-contained index.html (JS + CSS + fonts inlined)
// plus content/qNN.json bundles that the page fetches. Output: dist-artifact/
import { execSync } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'dist-artifact');
fs.rmSync(out, { recursive: true, force: true });
execSync('npx vite build --mode artifact', { cwd: root, stdio: 'inherit' });
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const assets = path.join(out, 'assets');
html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/g, (_, f) => {
  const js = fs.readFileSync(path.join(assets, f), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+)">/g, (_, f) => `<style>${fs.readFileSync(path.join(assets, f), 'utf8')}</style>`);
if (/\.\/assets\//.test(html)) throw new Error('index.html still references ./assets: ' + html.match(/.{40}\.\/assets\/.{40}/)[0]);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.rmSync(assets, { recursive: true, force: true });
// content bundles
const qdir = path.join(root, 'content/questions'); fs.mkdirSync(path.join(out, 'content'));
const bundles = {};
for (const f of fs.readdirSync(qdir).filter(f => /^q\d{4}\.md$/.test(f))) {
  const id = f.slice(0, 5); const key = 'q' + String(Math.floor(+id.slice(1) / 50)).padStart(2, '0');
  (bundles[key] ||= {})[id] = fs.readFileSync(path.join(qdir, f), 'utf8');
}
for (const [k, v] of Object.entries(bundles)) fs.writeFileSync(path.join(out, 'content', k + '.json'), JSON.stringify(v));
const mb = b => (b / 1048576).toFixed(2) + ' MB';
console.log('index.html', mb(fs.statSync(path.join(out, 'index.html')).size), '·', Object.keys(bundles).length, 'content bundles');
