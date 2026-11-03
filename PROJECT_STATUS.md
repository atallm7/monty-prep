# PROJECT_STATUS

**Objective:** an interactive tutor for all 1,005 questions in Monty Choy's "Ultimate List of Hardware Engineering Internship Interview Questions". Every question gets its own page with model answers, a deep dive, diagrams, sims, follow-ups, a self-check and a quiz, plus interview practice and mastery tracking.

## Architecture (stable; don't rebuild)
- Vite + React 18 + TS, HashRouter. Run `npm run dev` (port 5173). Build with `npm run build`.
- Questions: `source/questions.txt` (verbatim) → `scripts/build-index.mjs` → `src/data/index.generated.json` (16 domains, 138 sections).
- Content: one Markdown file per question, `content/questions/qNNNN.md` (spec: `docs/AUTHORING.md`, reference page: `q0008.md`). Parser: `src/content/parse.mjs`. Validator: `node scripts/validate-content.mjs [ids]` (also regenerates `src/data/meta.generated.json`).
- Diagrams: `src/diagrams/circuit.mjs` (schematic DSL), `timing.mjs`, Plot/Bode/Mermaid blocks in `src/components/Blocks.tsx`.
- Sims: `src/sims/catalog.json` (90 specs) → `src/sims/impl/<id>.tsx` (auto-registered) + `src/sims/models/<id>.ts` + `scripts/sim-tests/<id>.test.ts`. Guide: `docs/SIMS.md`.
- Progress: localStorage (`src/lib/progress.ts`), with export/import in Settings. There's no backend or database, by design (static app). Mastery requires a self-check with ≥80% rubric coverage and a rating of at least "Solid", **and** ≥80% quiz accuracy. Spaced review follows.
- No AI answer grading: there's no API key or backend. The mock interview uses rubric self-assessment with "why it matters" explanations for missed points.
- Tests: `node scripts/e2e.mjs [--all-sims --all-questions]` (dev server must be running). Checklist: `node scripts/progress-report.mjs` → `docs/PROGRESS.md`.

## Status (update after each batch)
- Question pages: 928/1005 written, all valid (0 errors). 77 missing, all in batches b49–b56 (partly written; new writers skip existing files). Opus QA done: b01–b42 (751 pages). QA still needed: b43–b56. Paused 2026-11-03 at the user's request; resume next week.
- Sims: **90/90 implemented** with model tests passing; all render (e2e --all-sims 126/126). bjt/mosfet/cmos were rebuilt and verified by Opus.
- Platform: all pages done; 36/36 e2e checks pass.

## Process
- Writers use Sonnet subagents, one batch file each, skipping existing files. Opus QA reviewers check each finished batch and write `docs/reviews/bNN.md`.
- Hit 5-hour usage limits four times. Keep ≤8 concurrent. Interrupted agents can be resumed with SendMessage (cheaper than starting new ones).

## Next tasks (resume here)
1. Writers (Sonnet, prompt "Read docs/WRITER_PROMPT.md and follow it exactly. Your batch: docs/batches/bNN.md") for b49–b56. Check missing ids with `node scripts/validate-content.mjs` (it prints the missing count) or `node scripts/progress-report.mjs`.
2. Opus QA (docs/QA_PROMPT.md) for b43–b56.
3. Deepen pass: pages with the `deep section only ~N words` warning below 600 words (about 25 pages, worst q0582–q0592), then QA them.
4. Final: `npm run build`, `node scripts/e2e.mjs --all-sims --all-questions`, fix failures, republish the preview artifact (same file path dist/index.html; artifact URL https://claude.ai/artifact/ECQTxAqbRvf43Ko9DhoHoR).
5. Small sim backlog: adc-lab quantization-error axis label (mV vs step size).

## Known issues / polish backlog
- Some sims expose fewer params than pages would like: dc-motor-lab J, lipo-lab rint/temperature per preset, rc-transient. Captions note the default differences. Possible future enhancement.
- Circuit DSL: no wire-crossing hop or transistor vertical flip; `vmark` minus sign hides on ground wires.
- Long top-to-bottom mermaid flowcharts are readable but tall.
- Depth audit: ~25 pages have deep sections under 500 words (worst: q0582–q0592, q0284–q0288, q0240–q0255 range). Plan: once all pages exist, run a Sonnet "deepen" pass on pages whose deep section is under 600 words (`deep section only` validator warning), then Opus QA. The validator now warns below 800.
