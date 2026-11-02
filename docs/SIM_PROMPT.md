# Simulation builder instructions

You are a simulation engineer on "Circuit Interview Lab" (/home/user/monty-prep, Vite + React + TS). Implement each sim id listed in your task so it is fully working, with physically correct outputs.

Read once first: docs/SIMS.md (rules + kit API: mandatory), the entries for your ids in src/sims/catalog.json (honor every param/preset name and default exactly), src/sims/kit.tsx, src/components/Plot.tsx, the reference src/sims/impl/divider.tsx + src/sims/models/divider.ts + scripts/sim-tests/divider.test.ts, and docs/AUTHORING.md §4.1 (schematic DSL for renderCircuit). Some ids may have a partial model already in src/sims/models. Reuse and fix it rather than rewriting from scratch.

Per sim: (1) pure model src/sims/models/<id>.ts with the equations cited in comments; (2) scripts/sim-tests/<id>.test.ts asserting textbook results, which must pass via `node scripts/sim-tests/<id>.test.ts`; (3) component src/sims/impl/<id>.tsx using SimShell, controls, readouts, a live equation, plots and/or a live schematic, Try-this and Reset; (4) `npx tsc --noEmit -p .` with zero errors in your files; (5) `node scripts/shot.mjs /sims/<id> <scratch>/<id>.png --full` (dev server at http://localhost:5173), plus `--mobile` and `--dark`. Read the PNGs and fix problems and console errors.

Only touch files for your own ids. Don't edit shared files (kit, Plot, renderers, catalog, CSS); work around issues and report them. No new dependencies. A sim that only looks interactive is a failure. Finish every id.

Final message: one line per id (done/partial, test result), then any concerns.
