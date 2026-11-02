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
- Question pages: 312/1005 written (0 validator errors). Done: b01–b12 and b14. Partial: b13 and b15–b23 (resumable agents; new agents skip existing files). Not started: b24–b56. QA-reviewed (Opus, see docs/reviews/): b01–b12 (199 pages). Reviews correct errors on about 60% of pages, so keep reviewing every batch.
- Sims: **90/90 implemented** with model tests passing; all render (e2e --all-sims 126/126). bjt/mosfet/cmos were rebuilt and verified by Opus.
- Platform: all pages done; 36/36 e2e checks pass.

## Process
- Writers use Sonnet subagents, one batch file each, skipping existing files. Opus QA reviewers check each finished batch and write `docs/reviews/bNN.md`.
- Hit 5-hour usage limits twice. Keep ≤8 concurrent. Interrupted agents can be resumed with SendMessage (cheaper than starting new ones).

## Next tasks
1. Finish b01–b07, then b08–b56 (Sonnet writers).
2. Implement the 22 missing sims (Sonnet), then run an Opus verification pass on the sim physics.
3. Opus QA for each completed batch.
4. Final: `npm run build`, then `e2e.mjs --all-sims --all-questions`.

## Known issues / polish backlog
- Some sims expose fewer params than pages would like: dc-motor-lab J, lipo-lab rint/temperature per preset, rc-transient. Captions note the default differences. Possible future enhancement.
- Circuit DSL: no wire-crossing hop or transistor vertical flip; `vmark` minus sign hides on ground wires.
- Long top-to-bottom mermaid flowcharts are readable but tall.
