// Parses source/questions.txt -> src/data/index.generated.json
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const txt = fs.readFileSync(path.join(root, 'source/questions.txt'), 'utf8');
const slug = s => s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const sections = []; const questions = []; let cur = null; let lastQ = null;
for (const raw of txt.split('\n')) {
  const line = raw.replace(/\s+$/,'');
  if (!line || line.startsWith('#')) continue;
  if (line.startsWith('@ ')) {
    const [domain, p] = line.slice(2).split(' | ');
    const pathParts = p.split(' > ');
    cur = { id: slug(p), domain, domainId: slug(domain), path: pathParts, title: pathParts[pathParts.length-1], note: null, questions: [] };
    sections.push(cur); lastQ = null; continue;
  }
  if (line.startsWith('> ')) { cur.note = line.slice(2); continue; }
  const m = line.match(/^(\d+)\. (.*)$/);
  if (m) {
    const n = +m[1];
    lastQ = { n, id: 'q' + String(n).padStart(4,'0'), text: m[2], subItems: [], sectionId: cur.id, domainId: cur.domainId };
    questions.push(lastQ); cur.questions.push(n); continue;
  }
  const s = line.match(/^\s+- (.*)$/);
  if (s && lastQ) { lastQ.subItems.push(s[1]); continue; }
  throw new Error('Unparsed line: ' + line);
}
questions.forEach((q, i) => { if (q.n !== i + 1) throw new Error(`Numbering gap at ${q.n}, expected ${i+1}`); });
const domains = [];
for (const s of sections) { let d = domains.find(x => x.id === s.domainId); if (!d) domains.push(d = { id: s.domainId, title: s.domain, sections: [] }); d.sections.push(s.id); }
const ids = new Set(); for (const s of sections) { if (ids.has(s.id)) throw new Error('dup section ' + s.id); ids.add(s.id); }
fs.mkdirSync(path.join(root, 'src/data'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/data/index.generated.json'), JSON.stringify({ domains, sections, questions }, null, 0));
console.log(`questions=${questions.length} sections=${sections.length} domains=${domains.length}`);
for (const d of domains) console.log(' ', d.title, d.sections.reduce((a, sid) => a + sections.find(s => s.id === sid).questions.length, 0));
