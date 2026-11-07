# Circuit Interview Lab

An interactive study site for all 1,005 questions in Monty Choy's
[Ultimate List of Hardware Engineering Internship Interview Questions](https://montychoy.com/blog/the_ultimate_list_of_hardware_engineering_internship_interview_questions).

Each question has its own page: what the interviewer is testing, a spoken answer, a technical answer,
30-second and 2-minute versions, a deep dive with derivations and worked numbers, diagrams,
interactive simulations, follow-ups, a self-assessment rubric and a quiz. There is also an interview
simulator, quiz drills, a spaced-review queue and mastery tracking. Progress is stored in your browser.

The questions are quoted word for word from Monty Choy's list. The answers, explanations, diagrams,
quizzes and simulations are original study material, written and technically reviewed by AI. Verify
anything you plan to rely on.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Build and test

```bash
npm run build
```

```bash
npm test
```

`npm run build` regenerates the question index, validates every content file, type-checks and builds to `dist/`.
`npm test` runs the 90 simulation model tests. With the dev server running, `node scripts/e2e.mjs --all-sims --all-questions` opens every page and sim in a headless browser.

## Deploy

Pushing to `main` or `master` builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).
Enable it once under Settings → Pages → Source: GitHub Actions.

## Layout

- `content/questions/qNNNN.md`: one page per question (format in `docs/AUTHORING.md`)
- `src/sims/`: simulation catalog, models and components
- `src/diagrams/`: schematic and timing-diagram renderers
- `scripts/`: index build, validator, screenshots, end-to-end tests, artifact build
- `docs/reviews/`: technical review notes per batch
- `PROJECT_STATUS.md`: current status and next steps
