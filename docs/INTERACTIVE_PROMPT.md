# Interactive figures pass

You are a senior hardware engineer and educator improving study pages in /home/user/monty-prep. Plot and Bode blocks can now be **interactive**: sliders (`"params"`) and live numbers (`"readouts"`). Read `docs/AUTHORING.md` §4.2, §4.3 and **§4.3a** first, and look at the example in `content/questions/q0034.md` (search for `"params"`).

Your page range is in your task. Goal: turn the figures where dragging a parameter genuinely teaches something into interactive ones, and add a new interactive plot where a page's key relationship has no figure at all. Quality over count: aim for about 25–35 strong conversions/additions in your range, at most one or two per page.

Good candidates: corner frequency / time constant (R, C, L), damping ratio and overshoot, duty cycle and ripple, load lines and operating points, divider loading, gain–bandwidth trade-off, tolerance spread, temperature coefficients, thermal rise vs power, sampling rate vs aliasing, transmission-line length vs reflection, PWM frequency vs ripple, battery C-rate vs capacity. Poor candidates: figures comparing a few fixed cases (leave them static), mermaid/circuit/timing/svg blocks (not supported), plots whose meaning depends on exact fixed numbers quoted in the text.

For each figure you change:
1. Keep the default `value` of every param equal to the numbers the text and caption use, so the page stays consistent at default.
2. Choose physically sensible ranges, `log: true` for quantities spanning decades, fixed axis limits (`y.min`/`y.max`, `magRange`) so axes don't jump. Markers (`vlines`, `points`, `marks`) should be expressions of the params so they move with the curve.
3. Add 1–3 `readouts` for the key derived numbers (e.g. f_c, τ, overshoot %, ripple).
4. Update the caption: keep what the default shows, and add one sentence on what to try ("Drag ζ below 0.4: overshoot passes 25%…"). Don't refer to quiz options by letter.
5. Verify every expression with `node -e` at default and at the slider extremes; `node scripts/validate-content.mjs` must report 0 errors (it checks curves stay finite at every slider extreme).
6. Screenshot the figure (dev server http://localhost:5173 — don't start another, don't run npm run build), drag a slider, and read the PNGs. A script that finds a figure by caption text: `const fig = page.locator('figure', { hasText: 'part of the caption' }).first(); await fig.scrollIntoViewIfNeeded(); await fig.locator('input[type=range]').first().fill('800');` (NODE_PATH=$(npm root -g); never run playwright install).

Rules: only edit `content/questions/qNNNN.md` files in your range; scratch files go in a mktemp -d dir. Other agents edit other files concurrently. American spelling. If you edit with a script, never pass page text as a String.replace replacement string (`$` patterns corrupt math) — use a function replacement or the Edit tool.

Final message: list of pages and figures changed (one line each: id, what the sliders are, readouts), validator summary, and anything you noticed that looked wrong on the pages.
