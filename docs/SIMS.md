# Simulation builder guide

Simulations are the most important interactive feature: a learner must be able to **change inputs and see physically correct outputs**. A sim that only *looks* interactive is a failure. Every sim is listed in `src/sims/catalog.json` (id, title, description, **params**, presets). Content pages embed sims with ```` ```sim {"id":"...", ...params} ```` and rely on the documented param names, so **honor every documented param name and default exactly**, and ignore unknown params gracefully.

## Files & architecture
- Component: `src/sims/impl/<id>.tsx`, default export `function X({ params }: SimProps)`. The registry auto-discovers it by filename (filename = catalog id). Lazy-loaded, so heavy code is fine.
- **Physics/logic model:** pure, framework-free TypeScript in `src/sims/models/<id>.ts` (no imports except other model files via relative path *with* `.ts` extension; no DOM, no React). Export functions that compute everything the UI shows.
- **Model test:** `scripts/sim-tests/<id>.test.ts` imports `../../src/sims/models/<id>.ts` and asserts known textbook results with `node:assert` (e.g. RC at t = τ is 63.2%; buck ripple matches ΔI = (Vin−Vout)·D/(L·f); MOSFET region boundaries; 2-bit predictor accuracy on a loop of 10 is 90%). Run with `node scripts/sim-tests/<id>.test.ts`. **Every sim must have a passing test.**
- Reference implementation: `src/sims/impl/divider.tsx`. Read it first.

## UI kit (`src/sims/kit.tsx`)
- `<SimShell title controls={...} tryThis={...} onReset layout="side|stacked">stage</SimShell>`: the standard frame (stage on the left, controls panel on the right, "Try this" footer).
- `<Slider label value onChange min max step unit log format/>` (use `log` for R, C, L, f spanning decades), `<Select>`, `<Seg>` (segmented buttons), `<Toggle>`.
- `<Readouts><Readout k="Vout" v={si(v,'V')} hl tone="ok|warn|bad"/></Readouts>`
- `<EqBox>{String.raw`latex`}</EqBox>` and `<TeX>`: show the governing equation, ideally with live numbers substituted.
- `<RegionBadge label="Saturation" color="ok|warn|bad|info|accent"/>`, `<Note>`.
- `si(value, unit)` formats with SI prefixes, and `num()` too (re-exported from `lib/units.ts`, which also has `logspace`, `linspace`, `clamp`, `nearestE`, `E24`).
- Plots: `import Plot from '../../components/Plot'`. Props: `series=[{x:[],y:[],label,color:'accent|red|blue|green|orange|purple|muted',dashed,step,fill}]`, `xLog`, `yLog`, `xRange`, `yRange`, `xLabel`, `yLabel`, `xUnit`, `yUnit`, `hlines/vlines=[{at,label,color}]`, `points=[{x,y,label}]`, `xspans`, `height`. Hover shows values automatically.
- Schematics: `import { renderCircuit } from '../../diagrams/circuit.mjs'` and render `renderCircuit({elements}).svg` via `dangerouslySetInnerHTML` inside `<div className="figure-body" style={{padding:0}}>`. The DSL is documented in `docs/AUTHORING.md` §4.1. Rebuild it from state so labels show live values; use `flow:true` wires to animate current paths and `color` to highlight active parts. Timing diagrams: `renderTiming` from `../../diagrams/timing.mjs`.
- For custom drawings (rotor, FSM bubbles, pipeline grid, H-bridge switches), write inline SVG/JSX using the CSS variables `var(--d-ink)`, `var(--d-bg)`, `var(--d-box)`, `var(--d-muted)`, `var(--d-accent)`, `var(--d-red|blue|green|orange|purple)` so it works in light and dark themes. Never hard-code colors like `#000`/`#fff`.

## Requirements checklist
1. **Correct physics/logic.** Use real equations (cite them in a code comment). Numerical integration: use small fixed steps or RK4. Use backward Euler/trapezoidal for stiff circuits. Check energy/charge balance where applicable, and handle edge cases (0, ∞, divide-by-zero, negative values) without NaN.
2. **Live and responsive.** Recompute in `useMemo` on input change. Keep heavy loops < ~30 ms. For animations use `requestAnimationFrame` with a play/pause button, and stop animating when unmounted.
3. **Teach.** Show the governing equation, key readouts, a region/state label, and a "Try this" prompt with 1–2 concrete experiments. Mark important thresholds on plots (cutoff frequency, Vt, dropout, Nyquist…).
4. **Honor params** from the catalog for initial state (`Number(params.x ?? default)`), and include a Reset button (`onReset`) that restores them. Presets listed in the catalog must all work.
5. **Responsive:** must work at 360 px width (the controls panel stacks below the stage automatically). Avoid fixed widths > 340 px. SVGs use `viewBox` + `width:100%`.
6. **Accessible:** controls have labels, and clickable SVG parts use `role="button"`, `tabIndex`, `onKeyDown` (Enter/Space).
7. **No new npm dependencies.**
8. Type-check with `npx tsc --noEmit -p .` (zero errors in your files) and run your model tests.
9. **Visually verify.** A Vite dev server is running at http://localhost:5173 (start your own with `npx vite --port 5174` if it's not reachable). Screenshot your sim with `node scripts/shot.mjs /sims/<id> <your-scratch-dir>/<id>.png --full` (add `--dark` for dark mode, `--mobile` for phone width, `--base http://localhost:5174` if using your own server), then **Read the PNG** and fix layout problems. Check the console errors printed by the script.
