// Serves dist-artifact/ with a CSP like the claude.ai artifact frame, to test the artifact build locally.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const dir = path.resolve(process.argv[2] || 'dist-artifact'); const port = +(process.argv[3] || 5199);
const CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; connect-src 'self'; worker-src blob: 'self'";
const types = { '.html': 'text/html', '.json': 'application/json' };
http.createServer((req, res) => {
  const p = path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!p.startsWith(dir) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log('serving', dir, 'on', port));
