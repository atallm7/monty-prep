// Shared content parser used by the app (runtime) and scripts/validate-content.mjs (build time).
// A question file is Markdown with a small frontmatter block and `::: section` ... `:::` blocks.

export const SECTION_DEFS = [
  { key: 'testing', title: 'What the interviewer is really testing', required: true },
  { key: 'why', title: 'Why this question matters', required: true },
  { key: 'concepts', title: 'Concepts you need', required: true },
  { key: 'answer', title: 'The answer, as you would say it', required: true },
  { key: 'technical', title: 'Technically detailed answer', required: true },
  { key: 'short', title: '30-second version', required: true },
  { key: 'long', title: '2-minute version', required: true },
  { key: 'terms', title: 'Terminology to use', required: true },
  { key: 'exceptional', title: 'Average vs. exceptional', required: true },
  { key: 'mistakes', title: 'Common mistakes & misconceptions', required: true },
  { key: 'deep', title: 'Deep dive', required: true },
  { key: 'applications', title: 'Real-world applications', required: true },
  { key: 'assumptions', title: 'Assumptions & when the answer changes', required: true },
  { key: 'followups', title: 'Follow-up questions', required: true },
  { key: 'interpretations', title: 'Interpreting the question', required: false },
  { key: 'references', title: 'References', required: true },
  { key: 'rubric', title: 'Self-assessment rubric', required: true },
  { key: 'quiz', title: 'Check yourself', required: true },
];
export const SECTION_KEYS = SECTION_DEFS.map(s => s.key);
export const DIFFICULTIES = ['fundamental', 'intermediate', 'advanced'];
export const KINDS = ['conceptual', 'calculation', 'design', 'drawing', 'comparison', 'debugging', 'behavioral'];

function parseValue(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v.replace(/^["']|["']$/g, '');
}

/** Parse a question markdown file. Returns { meta, sections, followups, rubric, quiz, errors } */
export function parseQuestion(src) {
  const errors = [];
  src = src.replace(/\r\n/g, '\n');
  const meta = {};
  let body = src;
  const fm = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      if (!line.trim()) continue;
      const i = line.indexOf(':');
      if (i < 0) { errors.push(`Bad frontmatter line: ${line}`); continue; }
      meta[line.slice(0, i).trim()] = parseValue(line.slice(i + 1));
    }
    body = src.slice(fm[0].length);
  } else errors.push('Missing frontmatter');

  const sections = {};
  const lines = body.split('\n');
  let cur = null; let buf = []; let inFence = false;
  for (const line of lines) {
    if (/^(```|~~~)/.test(line.trim())) inFence = !inFence;
    if (!inFence) {
      const open = line.match(/^:::\s*([a-z0-9-]+)\s*$/);
      if (open && cur === null) { cur = open[1]; buf = []; continue; }
      if (/^:::\s*$/.test(line) && cur !== null) {
        if (sections[cur] !== undefined) errors.push(`Duplicate section: ${cur}`);
        sections[cur] = buf.join('\n').trim();
        cur = null; continue;
      }
      if (open && cur !== null) errors.push(`Section "${open[1]}" opened inside "${cur}" (missing closing :::)`);
    }
    if (cur !== null) buf.push(line);
  }
  if (cur !== null) errors.push(`Unclosed section: ${cur}`);

  for (const k of Object.keys(sections)) if (!SECTION_KEYS.includes(k)) errors.push(`Unknown section: ${k}`);

  // Follow-ups: "### <question>" headings followed by answer markdown.
  const followups = [];
  if (sections.followups) {
    const parts = sections.followups.split(/^###\s+/m).slice(1);
    for (const p of parts) {
      const nl = p.indexOf('\n');
      const q = (nl < 0 ? p : p.slice(0, nl)).trim().replace(/^Q:\s*/i, '');
      const a = nl < 0 ? '' : p.slice(nl + 1).trim();
      followups.push({ q, a });
    }
  }
  // Rubric: bullet list items. "- point :: why it matters" (explanation optional)
  const rubric = [];
  if (sections.rubric) {
    for (const line of sections.rubric.split('\n')) {
      const m = line.match(/^\s*[-*]\s+(.*)$/);
      if (!m) continue;
      const [point, why] = m[1].split(/\s+::\s+/);
      rubric.push({ point: point.trim(), why: (why || '').trim() });
    }
  }
  // Quiz: a ```json fenced array.
  let quiz = [];
  if (sections.quiz) {
    const m = sections.quiz.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (!m) errors.push('Quiz section must contain a ```json array');
    else {
      try { quiz = JSON.parse(m[1]); if (!Array.isArray(quiz)) { errors.push('Quiz JSON must be an array'); quiz = []; } }
      catch (e) { errors.push('Quiz JSON parse error: ' + e.message); }
    }
  }
  return { meta, sections, followups, rubric, quiz, errors };
}

/** Deep validation used by the validator script. `ctx` = { simIds:Set, questionIds:Set } */
export function validateQuestion(parsed, ctx = {}) {
  const { meta, sections, followups, rubric, quiz } = parsed;
  const errors = [...parsed.errors];
  const warnings = [];
  if (!meta.id || !/^q\d{4}$/.test(meta.id)) errors.push('frontmatter id must be like q0001');
  if (!meta.title) errors.push('frontmatter title (short nav title) required');
  if (!DIFFICULTIES.includes(meta.difficulty)) errors.push(`difficulty must be one of ${DIFFICULTIES.join('|')}`);
  if (!KINDS.includes(meta.kind)) errors.push(`kind must be one of ${KINDS.join('|')}`);
  if (!Array.isArray(meta.concepts) || meta.concepts.length === 0) errors.push('concepts: [tag, ...] required');
  for (const k of ['prereqs', 'related']) {
    if (meta[k] !== undefined && !Array.isArray(meta[k])) errors.push(`${k} must be a list`);
    for (const r of meta[k] || []) {
      if (!/^q\d{4}$/.test(r)) errors.push(`${k} entry "${r}" must be a question id like q0014`);
      else if (ctx.questionIds && !ctx.questionIds.has(r)) errors.push(`${k} entry ${r} does not exist`);
    }
  }
  for (const d of SECTION_DEFS) if (d.required && !sections[d.key]) errors.push(`Missing required section: ${d.key}`);
  if (followups.length < 3) errors.push(`Need at least 3 follow-ups (### headings), found ${followups.length}`);
  for (const f of followups) if (!f.a || f.a.length < 40) errors.push(`Follow-up "${f.q.slice(0, 50)}" needs a real answer`);
  if (rubric.length < 4) errors.push(`Rubric needs at least 4 bullet points, found ${rubric.length}`);
  if (quiz.length < 3) errors.push(`Quiz needs at least 3 items, found ${quiz.length}`);
  quiz.forEach((it, i) => {
    const p = `quiz[${i}]`;
    if (!['mcq', 'numeric', 'truefalse', 'multi'].includes(it.type)) errors.push(`${p}.type must be mcq|numeric|truefalse|multi`);
    if (!DIFFICULTIES.includes(it.level)) errors.push(`${p}.level must be fundamental|intermediate|advanced`);
    if (!it.q) errors.push(`${p}.q missing`);
    if (!it.explain || it.explain.length < 20) errors.push(`${p}.explain missing/too short`);
    if (it.type === 'mcq') {
      if (!Array.isArray(it.options) || it.options.length < 3) errors.push(`${p}.options needs >= 3`);
      if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer >= (it.options || []).length) errors.push(`${p}.answer must be an index into options`);
    }
    if (it.type === 'multi') {
      if (!Array.isArray(it.options) || it.options.length < 3) errors.push(`${p}.options needs >= 3`);
      if (!Array.isArray(it.answer) || !it.answer.every(a => Number.isInteger(a) && a >= 0 && a < (it.options || []).length)) errors.push(`${p}.answer must be an array of option indexes`);
    }
    if (it.type === 'truefalse' && typeof it.answer !== 'boolean') errors.push(`${p}.answer must be true/false`);
    if (it.type === 'numeric') {
      if (typeof it.answer !== 'number' || !isFinite(it.answer)) errors.push(`${p}.answer must be a number`);
      if (it.tolerance !== undefined && typeof it.tolerance !== 'number') errors.push(`${p}.tolerance must be a number (relative, e.g. 0.02)`);
      if (!it.unit && it.unit !== '') warnings.push(`${p} numeric item has no unit`);
    }
  });
  // Embedded blocks
  const all = SECTION_KEYS.map(k => sections[k] || '').join('\n');
  const fence = /```([a-z-]+)\n([\s\S]*?)\n```/g; let m;
  while ((m = fence.exec(all))) {
    const lang = m[1]; const code = m[2];
    if (['circuit', 'plot', 'bode', 'timing', 'sim', 'logic'].includes(lang)) {
      let obj; try { obj = JSON.parse(code); } catch (e) { errors.push(`\`\`\`${lang} block JSON error: ${e.message} :: ${code.slice(0, 80)}`); continue; }
      if (lang === 'sim') {
        if (!obj.id) errors.push('sim block needs "id"');
        else if (ctx.simIds && !ctx.simIds.has(obj.id)) errors.push(`sim id "${obj.id}" is not in the sim catalog`);
      }
      if (lang === 'circuit' && !Array.isArray(obj.elements)) errors.push('circuit block needs "elements" array');
      if (lang === 'plot' && !Array.isArray(obj.series)) errors.push('plot block needs "series" array');
      if (lang === 'timing' && !Array.isArray(obj.signals)) errors.push('timing block needs "signals" array');
      if (lang === 'bode' && !Array.isArray(obj.systems)) errors.push('bode block needs "systems" array');
      if (lang === 'logic' && !Array.isArray(obj.gates)) errors.push('logic block needs "gates" array');
    }
  }
  // Math sanity: unbalanced $$
  const dd = (all.replace(/```[\s\S]*?```/g, '').match(/\$\$/g) || []).length;
  if (dd % 2) errors.push('Unbalanced $$ display math');
  const words = all.replace(/```[\s\S]*?```/g, '').split(/\s+/).length;
  if (words < 900) warnings.push(`Only ~${words} words; pages should be comprehensive`);
  if (!/```(circuit|plot|bode|timing|mermaid|svg|logic|sim)/.test(all)) warnings.push('No diagram or simulation embedded');
  return { errors, warnings, words };
}
