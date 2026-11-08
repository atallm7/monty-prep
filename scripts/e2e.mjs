// End-to-end tests against a running server (default http://localhost:5173).
// Usage: node scripts/e2e.mjs [--base URL] [--all-questions] [--all-sims]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const base = (() => { const i = args.indexOf('--base'); return i >= 0 ? args[i + 1] : 'http://localhost:5173'; })();
const index = JSON.parse(fs.readFileSync(new URL('../src/data/index.generated.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(new URL('../src/sims/catalog.json', import.meta.url), 'utf8'));
const results = []; let failures = 0;
const ok = (name, cond, detail = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!cond) failures++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) errors.push(m.text()); });
const go = async r => { await page.goto(`${base}/#${r}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };

try {
  // 1. dashboard
  await go('/');
  // First visit (no progress) shows the welcome hero instead of the readiness stats.
  ok('dashboard renders welcome hero', await page.getByText('Start with the fundamentals').isVisible());
  ok('dashboard shows 1,005 total', (await page.textContent('body')).includes('1,005'));

  // 2. question page + quiz + persistence
  await go('/q/q0008');
  ok('question page title', (await page.textContent('h1')).includes('voltage divider'));
  for (const s of ['question', 'answer', 'terms', 'deep', 'followups', 'selfcheck', 'quiz', 'references']) ok(`section ${s} present`, await page.locator('#sec-' + s).count() === 1);
  ok('circuit svg rendered', await page.locator('.ck-svg').count() >= 2);
  ok('katex rendered', await page.locator('.katex').count() > 5);
  ok('plot rendered', await page.locator('.plot-svg').count() >= 1);
  ok('simulation rendered', await page.locator('.sim').count() >= 1);
  // answer tabs
  await page.getByRole('tab', { name: '30 seconds' }).click();
  ok('answer tab switch', (await page.locator('.answer-pane').textContent()).includes('two resistors in series'));
  // follow-up reveal
  await page.locator('.fu-q').first().click();
  ok('follow-up reveals answer', await page.locator('.fu-a').count() === 1);
  // quiz: item 1 numeric (3 V) and item 2 mcq (options are shuffled on screen, so pick the correct one by its text)
  const items = page.locator('.quiz-item');
  await items.nth(0).locator('input').fill('3'); await items.nth(0).getByText('Check answer').click();
  ok('numeric quiz marks correct', (await items.nth(0).textContent()).includes('Correct'));
  await items.nth(1).locator('.quiz-opt', { hasText: 'The same current flows through R1 and R2' }).click(); await items.nth(1).getByText('Check answer').click();
  ok('mcq quiz marks correct', (await items.nth(1).textContent()).includes('Correct'));
  await items.nth(2).locator('input').fill('6'); await items.nth(2).getByText('Check answer').click();
  ok('wrong numeric marked wrong', (await items.nth(2).textContent()).includes('Not quite'));
  // self-check
  await page.getByText('Start answering').click(); await page.waitForTimeout(300);
  await page.getByText("I'm done: reveal model answer").click();
  const boxes = page.locator('.rubric-item input'); const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await page.getByText('Interview-ready').click(); await page.getByText('Save self-check').click();
  await page.waitForTimeout(300);
  // 2 of 3 quiz answered correct = 67% < 80% → learning; answer item 4 correctly to reach 3/4 = 75%... then item 5 → 4/5 = 80%
  await items.nth(3).locator('input').fill('7.5'); await items.nth(3).getByText('Check answer').click();
  await items.nth(4).locator('.quiz-opt', { hasText: '31.25 kΩ' }).click(); await items.nth(4).getByText('Check answer').click();
  await page.waitForTimeout(300);
  const status = await page.locator('.q-header .chip.chip-dot').textContent();
  ok('mastery earned after self-check + 80% quiz', status.includes('Mastered'), status);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  ok('progress persists after reload', (await page.locator('.q-header .chip.chip-dot').textContent()).includes('Mastered'));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mcp.progress.v1') || '{}'));
  ok('localStorage has attempts + quiz', !!stored.q?.q0008?.attempts?.length && Object.keys(stored.q.q0008.quiz).length === 5);
  // opening another page does not master it
  await go('/q/q0001');
  const st1 = await page.locator('.q-header .chip.chip-dot').textContent();
  ok('opening a page does not count as mastered', !st1.includes('Mastered'), st1);
  await go('/');
  ok('dashboard counts mastered', (await page.locator('.readiness').textContent()) !== null && (await page.textContent('body')).includes('1 of 1005 questions mastered'));

  // 3. search
  await page.keyboard.press('Control+k'); await page.waitForSelector('.palette-input input'); await page.keyboard.type('voltage divider'); await page.waitForTimeout(400);
  ok('search returns results', await page.locator('.palette-item').count() > 0);
  await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  ok('search navigates to question', page.url().includes('/q/'));
  await page.keyboard.press('Control+k'); await page.waitForSelector('.palette-input input'); await page.keyboard.type('#342'); await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  ok('search by number', page.url().includes('q0342'));

  // 4. j/k navigation
  await go('/q/q0010'); await page.keyboard.press('j'); await page.waitForTimeout(400);
  ok('keyboard next (j)', page.url().includes('q0011'));

  // 5. library filters
  await go('/library'); await page.waitForSelector('.domain-card', { timeout: 15000 }).catch(() => {}); ok('library lists domains', await page.locator('.domain-card').count() === 16);
  await go('/s/the-basics-fundamentals-basic-circuits'); await page.waitForSelector('.q-row', { timeout: 15000 }).catch(() => {}); ok('section page lists 12 questions', await page.locator('.q-row').count() === 12);

  // 6. divider sim interaction
  await go('/sims/divider');
  await page.waitForSelector('.readout.hl .v', { timeout: 15000 }).catch(() => {});
  const before = await page.locator('.readout.hl .v').textContent();
  const slider = page.locator('input[type=range]').first(); await slider.focus(); for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  const after = await page.locator('.readout.hl .v').textContent();
  ok('sim recomputes on slider change', before !== after, `${before} -> ${after}`);

  // 7. interview flow (whatever content exists in Fundamentals)
  await go('/interview');
  await page.getByRole('button', { name: 'Fundamentals' }).click();
  const avail = await page.locator('text=/questions? available/').textContent();
  if (!avail.startsWith('0')) {
    await page.getByText('Start interview').click(); await page.waitForTimeout(800);
    ok('interview asks a question', await page.locator('.iv-q').count() === 1);
    await page.getByText('Done: compare with model answer').click(); await page.waitForTimeout(300);
    await page.locator('.rubric-item input').first().check(); await page.getByText('Shaky').click(); await page.getByText('Grade & continue').click(); await page.waitForTimeout(800);
    ok('interview advances after grading', (await page.textContent('body')).includes('Question 2 of') || (await page.textContent('body')).includes('How you did'));
  }

  // 8. quiz drill
  await go('/quiz'); await page.getByText('Start drill').click(); await page.waitForTimeout(1500);
  ok('quiz drill starts', await page.locator('.quiz-item').count() === 1 || (await page.textContent('body')).includes('No quiz items'));

  ok('no runtime errors on core flows', errors.length === 0, errors.slice(0, 5).join(' | '));

  // 9. every sim page
  if (args.includes('--all-sims')) {
    for (const s of catalog) {
      if (!fs.existsSync(new URL(`../src/sims/impl/${s.id}.tsx`, import.meta.url))) { ok(`sim ${s.id} implemented`, false); continue; }
      errors.length = 0; await go(`/sims/${s.id}`); await page.waitForTimeout(500);
      const rendered = await page.locator('.sim').count() === 1 && await page.locator('.figure-error').count() === 0;
      ok(`sim ${s.id} renders`, rendered && errors.length === 0, errors.slice(0, 2).join(' | '));
    }
  }
  // 10. every question page
  if (args.includes('--all-questions')) {
    for (const q of index.questions) {
      errors.length = 0; await page.goto(`${base}/#/q/${q.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#sec-quiz, .card b', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(250);
      const has = await page.locator('#sec-quiz').count() === 1;
      const figErr = await page.locator('.figure-error').allTextContents();
      ok(`question ${q.id} renders`, has && figErr.length === 0 && errors.length === 0, [!has ? 'no content' : '', ...figErr.slice(0, 2), ...errors.slice(0, 2)].filter(Boolean).join(' | '));
    }
  }
} catch (e) { ok('test run completed without exception', false, e.message); }
await browser.close();
const out = results.filter(r => r.startsWith('FAIL') || !args.includes('--quiet'));
console.log(out.join('\n'));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exitCode = failures ? 1 : 0;
