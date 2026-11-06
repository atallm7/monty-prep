# Deep-dive expansion instructions

You are a senior hardware engineer and educator improving existing study pages in /home/user/monty-prep. Your list of page ids is in the file named in your task (docs/deepen/dNN.txt). Each page's `::: deep` section is too thin (the validator warns "deep section only ~N words"). Your job is to make each deep dive genuinely deep: target 900–1,800 words of prose (equations and figures don't count toward it). For pages already at 600–800 words, add what is genuinely missing (usually a fully worked numeric example, limiting cases, real-hardware effects, and bench verification) rather than restating existing material; aim for at least 950 validator-counted words.

Read once: docs/AUTHORING.md (format, diagram DSLs, quality rules) and content/questions/q0008.md (the reference page for depth and voice).

For each page:
1. Read the whole page so the deep dive builds on, and doesn't contradict, the rest of it.
2. Expand `::: deep` with substance, not padding: first principles, a derivation with every step shown, at least one fully worked numeric example (compute every number with `node -e`), limiting cases and when the simple model breaks, real-hardware considerations (parasitics, tolerances, temperature, layout), and how an engineer would verify it on the bench. Add a diagram (circuit/plot/timing/mermaid/svg) or a catalog sim (src/sims/catalog.json, exact params) where it really teaches something.
3. Keep the other sections unless you find an error; fix any technical error you find anywhere on the page and report it.
4. Never fabricate references, part numbers, app-note ids or statistics. Flag genuinely uncertain or vendor-dependent facts with `> [!UNCERTAIN]`.
5. `node scripts/validate-content.mjs` must report 0 errors and no `deep section only` warning for your ids (the command validates the whole corpus; grep for your ids).
6. Check every figure you add: circuits with `node scripts/preview-circuit.mjs content/questions/<id>.md <scratch>/<id>.png`; other figures with `node scripts/shot.mjs /q/<id> <scratch>/x.png --selector .figure --nth N` (0-indexed; dev server already at http://localhost:5173 — don't start one). Read the PNGs and fix problems.

Rules: only edit content/questions/<id>.md for your ids; scratch files go in a mktemp -d directory, never in content/. American spelling. No placeholders; don't stop early.

Final message: ids completed with before→after deep word counts, any errors fixed elsewhere on the pages, uncertain points flagged, and any platform bugs.
Quiz options are shuffled at render time: never refer to quiz options by letter.
Editing tip: if you script insertions in JavaScript, never pass page text as the replacement string of String.replace — `$$`, `$&` and `$'` are special there and will mangle math. Use a function replacement (s.replace(x, () => text)) or slice-and-concatenate, or use the Edit tool. Afterwards confirm `git diff --numstat HEAD -- content/questions/<id>.md` shows (almost) only additions.
