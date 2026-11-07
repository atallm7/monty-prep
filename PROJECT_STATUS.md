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
- Question pages: **1005/1005 written**, all valid (0 errors). Opus QA done for all batches b01–b56 (reviews in docs/reviews/). MCQ options shuffled at render (src/lib/quizShuffle.ts) because 74% of authored answers were index 1.
- Sims: **90/90 implemented** with model tests passing; all render (e2e --all-sims 126/126). bjt/mosfet/cmos were rebuilt and verified by Opus.
- Platform: all pages done; 36/36 e2e checks pass.

## Process
- Writers use Sonnet subagents, one batch file each, skipping existing files. Opus QA reviewers check each finished batch and write `docs/reviews/bNN.md`.
- Hit 5-hour usage limits four times. Keep ≤8 concurrent. Interrupted agents can be resumed with SendMessage (cheaper than starting new ones).

## Next tasks (resume here)
1. (done 2026-11-06) Writers (Sonnet, prompt "Read docs/WRITER_PROMPT.md and follow it exactly. Your batch: docs/batches/bNN.md") for b49–b56. Check missing ids with `node scripts/validate-content.mjs` (it prints the missing count) or `node scripts/progress-report.mjs`.
2. (done 2026-11-06) Opus QA for b43–b56.
3. (done 2026-11-06) Deepen pass: 70 pages with deep < 600 words expanded to ~1,100–1,800 (groups docs/deepen/d00–d05) and Opus-reviewed (docs/reviews/deepen-dNN.md). Original note — pages with the `deep section only ~N words` warning below 600 words (about 25 pages, worst q0582–q0592), then QA them.
4. (done 2026-11-06: e2e --all-sims --all-questions 1131/1131, artifact v5 republished) Final: `npm run build`, `node scripts/e2e.mjs --all-sims --all-questions`, fix failures, republish the preview artifact: `node scripts/build-artifact.mjs` → publish `dist-artifact/index.html` with root `dist-artifact` + files `content/q00..q19.json` to https://claude.ai/artifact/ECQTxAqbRvf43Ko9DhoHoR (v3 published 2026-11-03). Test under CSP first: `node scripts/serve-csp.mjs` (port 5199) then `node scripts/e2e.mjs --base http://localhost:5199`.
5. (done 2026-11-06) adc-lab error axis in LSB, SAR code label fixed.

## Known issues / polish backlog
- Artifact CSP: own-file scripts/fonts blocked, so the artifact build inlines JS/CSS, fetches content JSON bundles, loads mermaid from jsDelivr, and uses a no-eval expression parser (`src/lib/expr.ts`). Settings' progress export download doesn't work inside the artifact (sandbox blocks downloads); fine in the normal build.
- Fixed 2026-11-06: quiz crash when moving between questions (stale content rendered under new id). e2e 36/36 on dev and under CSP.
- Some sims expose fewer params than pages would like: dc-motor-lab J, lipo-lab rint/temperature per preset, rc-transient. Captions note the default differences. Possible future enhancement.
- Circuit DSL: no wire-crossing hop or transistor vertical flip; `vmark` minus sign hides on ground wires.
- Long top-to-bottom mermaid flowcharts are readable but tall.
- Depth audit: ~25 pages have deep sections under 500 words (worst: q0582–q0592, q0284–q0288, q0240–q0255 range). Plan: once all pages exist, run a Sonnet "deepen" pass on pages whose deep section is under 600 words (`deep section only` validator warning), then Opus QA. The validator now warns below 800.

## Open follow-ups (minor)
- q0249's step-response figure/table (71/76 mV) come from q0248's loop tuning and are labeled as such; regenerate one consistent set across q0248/q0249 with the buck-control sim.
- (done 2026-11-07) Second deepen pass: all 217 pages with deep 600–800 words expanded (groups docs/deepen/e00–e11) and Opus-reviewed (docs/reviews/deepen-eNN.md). Validator: 0 errors, 0 warnings.
- pvt-power sim: FF corner runs away at default θ=10 K/W (captions match this; changing defaults would require caption updates).
- Circuit gates: a few pages wire inputs off the gate pin positions (extra stubs). Cosmetic.

## Public website (GitHub Pages)
- Workflow ready: .github/workflows/deploy.yml (builds on push to main/master, publishes dist/ to Pages). Clean-clone build verified.
- Source attribution footer on every page + per-question source line (src/App.tsx SOURCE_URL).
- BLOCKED on the user: create an empty public GitHub repo (planned atallm7/monty-prep), then add_repo with push access, `git remote add origin`, push, and set Settings → Pages → Source: GitHub Actions if not automatic. Expected URL https://atallm7.github.io/monty-prep/.
- Preview artifact v6 republished 2026-11-07 (https://claude.ai/artifact/ECQTxAqbRvf43Ko9DhoHoR).
