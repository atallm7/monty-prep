# Embed the new simulations into study pages

You are a senior hardware engineer and educator working on /home/user/monty-prep. Twelve new interactive sims exist (catalog: `src/sims/catalog.json`; implementations in `src/sims/impl/<id>.tsx`; open each at http://localhost:5173/#/sims/<id> to see what it shows and which params it reads — read the impl's `params` handling so you pass names it actually uses):

trace-ampacity, return-path, yield-coverage, reflow-profile, process-capability, wafer-yield, package-thermal, amdahl-roofline, memory-hierarchy, sort-visualizer, float-explorer, ring-buffer.

Your page range is in your task. Goal: add each sim to the pages where it genuinely helps a student understand the question, prioritizing pages that currently have **no** `sim` block (PCB design, testing & manufacturing, packaging & IC fabrication, computer architecture, coding, embedded topics). Search the content (`grep -il` for the concepts) rather than relying on question wording alone. Typical good fits: trace/via current and copper weight → trace-ampacity; return paths, plane splits, stitching, EMI from layout → return-path; test coverage, escapes, AOI/ICT/functional test cost → yield-coverage; reflow, solder joints, tombstoning, BGA voids → reflow-profile; Cpk, tolerances in production, SPC → process-capability; die size, yield, cost per die, chiplets → wafer-yield; θJA, heatsinks, junction temperature, package choice → package-thermal; multicore speedup, GPU vs CPU, memory-bound code → amdahl-roofline; caches, latency, memory hierarchy, DMA vs CPU copies → memory-hierarchy; algorithms, complexity, searching/sorting in firmware → sort-visualizer; float vs fixed point, DSP on MCUs, numeric precision → float-explorer; UART/ISR buffering, producer/consumer, queues → ring-buffer.

For each embed:
1. Place it in the section where it teaches (usually `deep`, sometimes `technical`), right after the paragraph that explains the idea it demonstrates — not dumped at the end.
2. Format (see docs/AUTHORING.md §4.7):
   ```sim
   {"id":"wafer-yield","params":{"dieW":20,"dieH":20,"D0":0.1}}
   ```
   Figure: one or two sentences: what the default shows for THIS question, and one concrete thing to try ("Raise D0 to 0.3 and watch…").
   Set params so the default state matches the page's own example numbers where possible. Only use param names the impl reads.
3. One new sim per page at most (two only if the page clearly covers both ideas), and never duplicate a sim already on the page.
4. Open the page in a browser (shot script: `node scripts/shot.mjs /q/<id> out.png --section deep --selector .sim --nth N`, 0-indexed; sims render lazily, `--section deep` scrolls), confirm the sim renders with your params and the caption is true. Read the PNG.
5. `node scripts/validate-content.mjs` must report 0 errors.

Aim for roughly 30–45 well-placed embeds in your range. Rules: only edit `content/questions/qNNNN.md` in your range; American spelling; never refer to quiz options by letter; if scripting edits, don't pass page text as a String.replace replacement string (use the Edit tool or a function replacement). Don't run `npm run build`; don't start servers.

Final message: one line per embed (page id, sim id, params, section), validator summary, and any sim bugs or param names that didn't work.
