// Writes lessons/scripts.json: the exact narration of every lesson, built by the site's own code.
// Usage: VITE_AUTH_OFF=1 npx vite --port 5174 --strictPort &   then   NODE_PATH=$(npm root -g) node scripts/lesson-audio/export.cjs
// If the narration of a lesson changes, its hash changes and the Lesson audio workflow re-records it.
const { chromium } = require('playwright'); const fs=require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('http://localhost:5174/#/library'); await p.waitForTimeout(2500);
  const out = await p.evaluate(async () => {
    const L = await import('/src/components/Lesson.tsx'); const D = await import('/src/lib/data.ts');
    const LB = await import('/src/components/ListenBar.tsx');
    const test = LB.speakable('It drops $0.5\\text{ mA} \\times 10\\text{ k}\\Omega = 5$ V, about 5 mA at 3.3 V and 10 kΩ, 100 nF, 1 kHz, −5 V, 25°C.');
    const res = []; for (const q of D.QUESTIONS) { const r = await L.lessonScriptFor(q.id); if (r) res.push(r); }
    return { test, res };
  });
  console.log('units test:', out.test);
  fs.writeFileSync('lessons/scripts.json', JSON.stringify(out.res));
  const chars = out.res.reduce((a,r)=>a+r.slides.flat().join(' ').length,0);
  console.log('lessons', out.res.length, 'chunks', out.res.reduce((a,r)=>a+r.slides.flat().length,0), 'chars', chars, '≈ min audio', Math.round(chars/15/60));
  await b.close(); })();
