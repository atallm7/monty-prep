import { Marked } from 'marked';
import katex from 'katex';

export const BLOCK_LANGS = ['circuit', 'plot', 'bode', 'timing', 'mermaid', 'svg', 'sim'] as const;
export type BlockLang = typeof BLOCK_LANGS[number];
export type Segment = { kind: 'md'; text: string } | { kind: BlockLang; code: string; caption?: string };

/** Split markdown into prose segments and special fenced blocks (top-level only). */
export function splitSegments(src: string): Segment[] {
  const out: Segment[] = [];
  const lines = src.split('\n');
  let buf: string[] = [];
  let i = 0;
  const flush = () => { const t = buf.join('\n'); if (t.trim()) out.push({ kind: 'md', text: t }); buf = []; };
  while (i < lines.length) {
    const m = lines[i].match(/^```([a-z-]+)\s*$/);
    if (m && (BLOCK_LANGS as readonly string[]).includes(m[1])) {
      const lang = m[1] as BlockLang; const code: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      // tolerate text after the closing fence on the same line (treated as the caption)
      const trailing = i < lines.length ? lines[i].replace(/^```\s*/, '').replace(/^(?:Figure|Caption):\s*/i, '').trim() : '';
      i++; // closing fence
      flush();
      // optional caption: following line(s) starting with "Figure:" / "Caption:"
      let caption: string | undefined = trailing || undefined;
      let j = i; while (j < lines.length && !lines[j].trim()) j++;
      const cm = j < lines.length ? lines[j].match(/^(?:Figure|Caption):\s*(.*)$/i) : null;
      if (cm) { caption = cm[1]; i = j + 1; }
      out.push({ kind: lang, code: code.join('\n'), caption });
      continue;
    }
    // ordinary fenced code: copy verbatim
    if (/^(```|~~~)/.test(lines[i])) {
      buf.push(lines[i]); i++;
      while (i < lines.length && !/^(```|~~~)\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      if (i < lines.length) { buf.push(lines[i]); i++; }
      continue;
    }
    buf.push(lines[i]); i++;
  }
  flush();
  return out;
}

const marked = new Marked({ gfm: true, breaks: false });

function renderMath(tex: string, display: boolean) {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'html' }); }
  catch (e) { return `<code class="math-error">${tex}</code>`; }
}

export type QResolver = (id: string) => { n: number; text: string; title?: string } | undefined;

/** Markdown (with $math$, $$display$$, [[q0001]] refs, > [!TIP] callouts) -> HTML string */
export function mdToHtml(src: string, resolve?: QResolver): string {
  const stash: string[] = [];
  const raw: string[] = [];
  const keep = (html: string) => `\uE000${stash.push(html) - 1}\uE001`;
  let s = src;
  // protect code blocks/spans from math processing (restored before markdown parsing)
  s = s.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, m => `\uE002${raw.push(m) - 1}\uE003`);
  // display math
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => '\n\n' + keep(`<div class="math-display">${renderMath(t.trim(), true)}</div>`) + '\n\n');
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => '\n\n' + keep(`<div class="math-display">${renderMath(t.trim(), true)}</div>`) + '\n\n');
  // inline math: $...$ (no leading/trailing space), and \(...\)
  s = s.replace(/(^|[^\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, (_, pre, t) => pre + keep(renderMath(t, false)));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => keep(renderMath(t, false)));
  s = s.replace(/\\\$/g, '$');
  // question cross-references
  s = s.replace(/\[\[(q\d{4})(?:\|([^\]]+))?\]\]/g, (_, id, label) => {
    const q = resolve?.(id);
    const text = label || (q ? `Q${q.n}${q.title ? ': ' + q.title : ''}` : id);
    return keep(`<a class="qref" href="#/q/${id}">${escapeHtml(text)}</a>`);
  });
  s = s.replace(/\uE002(\d+)\uE003/g, (_, n) => raw[+n]);
  let html = marked.parse(s) as string;
  // callouts
  html = html.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|WARNING|INTERVIEW|UNCERTAIN)\]\s*(?:<br>)?/g, (_, kind) => {
    const k = kind.toLowerCase();
    const title = { note: 'Note', tip: 'Tip', warning: 'Watch out', interview: 'Interview angle', uncertain: 'Uncertain / depends' }[k as 'note'];
    return `<blockquote class="callout callout-${k}"><div class="callout-title">${title}</div><p>`;
  });
  html = html.replace(/<blockquote class="callout/g, '<div class="callout').replace(/(<div class="callout[\s\S]*?)<\/blockquote>/g, '$1</div>');
  // restore stash (may be nested once)
  html = html.replace(/<p>\s*(\uE000\d+\uE001)\s*<\/p>/g, '$1');
  html = html.replace(/\uE000(\d+)\uE001/g, (_, n) => stash[+n]);
  // tables: wrap; external links open new tab
  html = html.replace(/<a href="(https?:[^"]+)"/g, '<a target="_blank" rel="noopener noreferrer" href="$1"');
  return html;
}

export function mdInline(src: string, resolve?: QResolver): string {
  const html = mdToHtml(src, resolve).trim();
  return html.replace(/^<p>([\s\S]*)<\/p>$/, '$1');
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Strip markdown to plain text (for search indexing / excerpts). */
export function plainText(md: string) {
  return md.replace(/```[\s\S]*?```/g, ' ').replace(/\$\$[\s\S]*?\$\$/g, ' ').replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/[#>*_`|\[\]]/g, ' ').replace(/\(https?:[^)]+\)/g, ' ').replace(/\s+/g, ' ').trim();
}
