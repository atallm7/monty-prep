# Authoring guide: question pages

This platform teaches an engineering student to answer every question in Monty Choy's *Ultimate List of Hardware Engineering Internship Interview Questions* (1,005 questions, verbatim in `source/questions.txt`) with confidence and real understanding. **Each question gets its own file** `content/questions/qNNNN.md` (4-digit, zero-padded, e.g. `q0042.md`). The reference example is `content/questions/q0008.md`. Read it fully before writing anything, and match or beat its depth and accuracy.

## 1. Non-negotiable quality rules

1. **Technical accuracy beats everything.** Verify every equation, unit, sign, and number. For any calculation, actually compute it (`node -e "console.log(...)"`) rather than doing mental arithmetic. Quiz answers and worked examples must be numerically correct.
2. **Never fabricate.** No invented references, URLs, app-note numbers, standard clause numbers, datasheet values, statistics, or "interviewers at X ask…" claims. Cite textbooks at the chapter/topic level (e.g. *Sedra & Smith, Microelectronic Circuits, chapter on MOSFETs*), well-known standards by name (e.g. NXP UM10204 I²C-bus specification, IPC-2221, JEDEC), and manufacturer docs only when you are confident they exist (e.g. TI "Basic Calculation of a Buck Converter's Power Stage" SLVA477). If unsure of an exact number, give the typical range and say so.
3. **Flag uncertainty and assumptions explicitly.** Use a `> [!UNCERTAIN]` callout when values vary by vendor, process, or convention, or when sources disagree. Use the `assumptions` section to say when the answer changes (e.g. ideal vs. real op-amp, CCM vs DCM, small-signal vs large-signal).
4. **Every question gets its own page, written for its exact wording.** Duplicates in the source (e.g. Q27/Q37/Q43, Q29/Q45, Q32/Q501, Q142/Q506) still get complete, standalone pages tailored to how *that* question is phrased and where it sits (e.g. Q142 in the power-rail context vs Q506 in PCB-layout context). Cross-link siblings with `[[qNNNN]]` and say how they differ.
5. **Typos/odd wording in the source:** keep the question as-is (the app shows it verbatim) and add an `interpretations` section explaining the likely intended meaning. Example: Q29 is under *Capacitors* but asks about an *inductor*; cover the inductor as asked and also give the capacitor version. "positive of negative" means "positive or negative". Q556 is truncated: "What if your sense resistor is far from your…" (likely "…amplifier/ADC").
6. **Voice:** a sharp, likeable engineering student or junior engineer explaining things out loud. Natural and confident, with concrete examples. Not a textbook, not a chatbot. Banned: "Great question", "delve", "In conclusion", "It's important to note that", "In the realm of", "Let's dive in", filler hedging, and walls of bold. The `answer`, `short` and `long` sections are spoken words, written in first person in quotes, something a person could actually say in an interview.
7. **Teach, don't list.** The deep dive builds understanding from first principles: why, then how, then equations, then the physical picture, then what happens in real hardware. Use worked examples with real numbers.
8. **Behavioural or experience questions** (e.g. Q633 "Describe any rework experience", Q638, Q956, Q964–966): never invent the user's experience. Teach what the interviewer is assessing, give a structure (e.g. situation → what you did → technical detail → result → what you learned), a strong example answer with clearly marked placeholders like *[your project]* plus technical substance they can adapt, how to answer honestly with little experience, and the technical knowledge needed to survive follow-ups (e.g. for rework: hot air vs iron, flux, thermal relief, ESD, inspection).
9. **Open-ended "design X" questions** (e.g. Q150, Q263, Q374, Q975): walk through requirements gathering and clarifying questions, architecture, the key calculations with a worked example, component selection trade-offs, and verification. Show the reasoning process interviewers want to hear.
10. **Diagrams must teach.** Every figure gets a caption explaining what to notice. No decorative figures. Each page should have **at least 1–2 figures** where the topic is visual (circuits, waveforms, curves, block diagrams, state machines), and should embed a relevant **simulation** when one in the catalog fits.

## 2. File format

```
---
id: q0042
title: Short nav title (3–8 words, e.g. "Inductor reactance sign")
difficulty: fundamental | intermediate | advanced
kind: conceptual | calculation | design | drawing | comparison | debugging | behavioral
concepts: [kebab-case-tag, another-tag]
prereqs: [q0039, q0040]
related: [q0026, q0052]
---

::: testing
...
:::
```

Frontmatter rules: `concepts` are 2–6 kebab-case tags from a shared vocabulary (reuse existing tags such as `ohms-law`, `kcl`, `kvl`, `power`, `voltage-divider`, `rc-circuit`, `rl-circuit`, `rlc-circuit`, `filters`, `bode-plot`, `impedance`, `reactance`, `parasitics`, `capacitor`, `inductor`, `resistor`, `dielectric`, `semiconductor-physics`, `doping`, `pn-junction`, `diode`, `bjt`, `mosfet`, `cmos`, `op-amp`, `feedback`, `slew-rate`, `gain-bandwidth`, `pll`, `buck-converter`, `boost-converter`, `ldo`, `charge-pump`, `efficiency`, `switching-losses`, `ripple`, `control-loop`, `stability`, `pwm`, `battery`, `lithium-ion`, `bms`, `dc-motor`, `bldc`, `stepper`, `servo`, `h-bridge`, `gate-drive`, `inductive-kick`, `current-sensing`, `isolation`, `protection`, `pcb-stackup`, `grounding`, `decoupling`, `emi`, `signal-integrity`, `transmission-lines`, `impedance-matching`, `differential-signaling`, `vias`, `pcb-manufacturing`, `testing`, `dfm`, `ic-packaging`, `ic-fabrication`, `fourier`, `sampling`, `square-wave`, `eye-diagram`, `power-integrity`, `microcontroller`, `i2c`, `spi`, `uart`, `gpio`, `timers`, `interrupts`, `adc`, `dac`, `memory`, `rtos`, `sensors`, `imu`, `camera`, `lidar`, `calibration`, `digital-logic`, `flip-flops`, `fsm`, `number-systems`, `computer-architecture`, `pipelining`, `cache`, `gpu`, `soc`, `pvt`, `rtl`, `assembly`, `c-programming`, `system-design`, `measurement`, `oscilloscope`, `debugging`, `behavioral`). Add new tags only when needed. `prereqs` are questions a learner should understand first (usually earlier fundamentals, e.g. Ohm's law Q1, KCL/KVL Q4, capacitance Q22). `related` covers siblings and duplicates. All IDs must exist (q0001–q1005).

Difficulty: **fundamental** = explain a basic concept; **intermediate** = apply it, calculate, design a simple circuit, compare trade-offs; **advanced** = reason through unfamiliar scenarios, debug, multi-concept system design.

### Sections (all required unless noted). Use exactly these names, in this order.

`basics` comes first: a 180–330 word plain-language primer ("In plain words", "Picture it", "Words you need", "The simplest example") for readers with no background. See docs/BASICS_PROMPT.md and the q0008 reference.

| Section | What it must contain | Target length |
|---|---|---|
| `testing` | What the interviewer is really testing; the hidden sub-skills. | 60–150 words |
| `why` | Why this matters in real engineering work and interviews. | 60–150 words |
| `concepts` | Bullet list of the fundamental concepts needed, each with a one-line explanation and `[[qNNNN]]` links to prerequisite pages. | 4–8 bullets |
| `answer` | The polished conversational answer you would actually say: first person, in quotes, natural. | 120–250 words |
| `technical` | The technically detailed answer: precise, with equations, conditions and numbers. | 200–450 words |
| `short` | The 30-second version (≈70–90 spoken words), in quotes. | 60–100 words |
| `long` | The 2-minute version (≈250–330 spoken words), in quotes. Structured, flows when spoken. | 230–350 words |
| `terms` | Bullet list `- **Term**: definition`. The terminology you should use when answering. | 5–10 terms |
| `exceptional` | What separates an average answer from an exceptional one (concrete). | 80–200 words |
| `mistakes` | Common mistakes and misconceptions, each with the correction. | 4–7 bullets |
| `deep` | **The heart of the page.** First principles → derivations/equations → physical explanation → worked examples with numbers → real hardware behaviour. Uses `##` subheadings, diagrams, plots and a simulation when one fits. | 900–2,500 words |
| `applications` | Practical applications and real-world examples (specific products, circuits, parts). | 4–7 bullets |
| `assumptions` | Assumptions behind the answer, and when/how the answer changes. Mention valid alternative answers. | 80–250 words |
| `followups` | **At least 4** likely follow-up questions as `### Question?` headings, each with a full answer (40–200 words, with numbers where appropriate). Include at least one harder "what if" probe. | — |
| `interpretations` | *(Optional)* If the wording is ambiguous, has a typo, duplicates another question, or has multiple valid readings. | — |
| `references` | 2–5 trustworthy references (textbooks at chapter/topic level, standards, real manufacturer docs). No fabricated URLs. | — |
| `rubric` | 5–8 key points a strong answer covers, each as `- point :: why it matters` (the "why" is shown to the learner when they miss the point). | — |
| `quiz` | A fenced ```json array of **4–6 items** mixing levels (at least one fundamental and one intermediate/advanced). | — |

### Quiz item schema

```json
{"type":"mcq","level":"fundamental","q":"Markdown question, $math$ ok","options":["A","B","C","D"],"answer":1,"explain":"Why B is right and why the tempting wrong answer is wrong."}
{"type":"numeric","level":"intermediate","q":"...","answer":3.3,"tolerance":0.02,"unit":"V","explain":"Worked solution."}
{"type":"truefalse","level":"advanced","q":"...","answer":false,"explain":"..."}
{"type":"multi","level":"intermediate","q":"Select all that apply...","options":["...","...","..."],"answer":[0,2],"explain":"..."}
```
- `answer` for mcq is the 0-based option index. Vary the correct position; don't always use B.
- `tolerance` is *relative* (0.02 = ±2%). Give the numeric answer in the stated `unit` (e.g. if unit is kΩ, answer 7.5, not 7500).
- In JSON strings, escape backslashes in LaTeX: `"$\\frac{1}{2}$"`. Use `\\Omega` or the Ω character.
- Explanations must teach (show the working), 1–4 sentences.

## 3. Markdown features

- Math: inline `$V = IR$`, display `$$ ... $$` (on its own lines). KaTeX syntax. Don't use `$` for currency (write "USD 5").
- Cross-links: `[[q0022]]` renders as "Q22: <title>"; `[[q0022|custom text]]`.
- Callouts: a blockquote starting `> [!TIP]`, `> [!NOTE]`, `> [!WARNING]`, `> [!INTERVIEW]` (interview strategy), `> [!UNCERTAIN]` (values or claims that vary or are uncertain).
- Tables (GFM) are great for comparisons.
- Special fenced blocks (must start at the beginning of a line, at top level, not inside lists): `circuit`, `plot`, `bode`, `timing`, `mermaid`, `svg`, `sim`. Put a caption on the line right after the closing fence: `Figure: what to notice…`.

## 4. Diagram toolkit

### 4.1 `circuit`: schematics (preferred for any circuit)
JSON `{"elements":[...]}` on a grid where **1 unit = 20 px**. Coordinates are `[x, y]` with y pointing **down**. Keep components ≥3 units long so the symbols fit.

**Two-terminal parts** `{"t":TYPE,"a":[x,y],"b":[x,y],"label":"R_1","value":"10 kΩ","labelSide":"other"?,"color":?,"mirror":?}`. The body is drawn centered between a and b, with leads filling the rest.
TYPE ∈ `R` (zigzag), `Rbox`, `Z` (generic impedance box), `FB` (ferrite bead), `C`, `Cpol` (+ at a), `L`, `Lcore`, `V` (DC source, **+ at a**), `Vac`, `Vsq` (square-wave source), `I` (current source, arrow a→b), `Vdep`/`Idep` (dependent sources, diamonds), `battery` / `cell` (+ at a), `D`, `Zener`, `Schottky`, `TVS`, `LED`, `photodiode` (diodes: **anode = a, cathode = b**, conventional current a→b), `SW` (open switch), `SWclosed`, `PB` (pushbutton), `F` (fuse), `lamp`, `M` (motor), `A` (ammeter), `VM` (voltmeter), `xtal`, `pot` (wiper arrow at middle), `thermistor`.
Labels go above horizontal parts and to the right of vertical parts by default; `"labelSide":"other"` flips the side. Labels support `_` subscripts (`V_{out}`, `R_1`) and `\n` for line breaks. For a literal underscore (e.g. `u_ha1`) write `\\_` in the JSON.

**Wires** `{"t":"wire","pts":[[x,y],[x,y],...],"flow":true?,"dashed":true?,"label":?}`. `flow:true` animates current along the wire in the pts direction (`"flow":"reverse"` reverses it). Use flow to show current paths (e.g. buck on-state vs off-state in two figures).

**Transistors** `{"t":"nmos"|"pmos"|"npn"|"pnp","at":[x,y],"label":"Q1","flip":false,"bodyDiode":true?,"depletion":true?,"circle":true?,"bubble":true?,"pinLabels":true}`. `at` is the **gate/base pin**. Pins (without flip):
- `nmos`: G=(x,y), **D=(x+2,y−2)**, **S=(x+2,y+2)**
- `pmos`: G=(x,y), **S=(x+2,y−2)**, **D=(x+2,y+2)** (source on top, as drawn in CMOS)
- `npn`: B=(x,y), **C=(x+2,y−2)**, **E=(x+2,y+2)**
- `pnp`: B=(x,y), **E=(x+2,y−2)**, **C=(x+2,y+2)**
- `flip:true` mirrors horizontally: the other pins move to x−2.
`bodyDiode:true` draws the intrinsic body diode (anode at source for NMOS).

**Op-amp** `{"t":"opamp","at":[x,y],"swap":false,"supply":false,"label":?}`: triangle from x to x+4. Inputs: **inverting (−) at (x,y−1)**, **non-inverting (+) at (x,y+1)** (`swap:true` exchanges them), **output at (x+4,y)**. `supply:true` adds V+ at (x+2,y−2) and V− at (x+2,y+2) (custom text via `vpos`/`vneg`).

**Logic gates** `{"t":"and"|"or"|"not"|"buf"|"nand"|"nor"|"xor"|"xnor","at":[x,y],"inputs":2}`: inputs at x (2 inputs: y−1 and y+1; 3 inputs: y−1, y, y+1; 1 input: y), **output at (x+4,y)**.

**Blocks** `{"t":"box","at":[x,y],"w":4,"h":4,"label":"MCU","pins":[{"side":"left|right|top|bottom","pos":1,"name":"VDD"}]}`. The pin on side left with pos p sits at (x, y+p); right at (x+w, y+p); top at (x+p, y); bottom at (x+p, y+h).

**Other parts**: `opto` at (x,y): LED anode (x,y), cathode (x,y+3), transistor collector (x+5,y), emitter (x+5,y+3). `xfmr` at (x,y): primary (x,y)/(x,y+4), secondary (x+4,y)/(x+4,y+4), `"dots":true` for dot convention.

**Annotations**: `{"t":"gnd","at":[x,y],"style":"signal|chassis"?}` (symbol hangs below the point), `{"t":"rail","at":[x,y],"label":"V_{DD}","dir":"up|down"}`, `{"t":"dot","at":[x,y]}` (junction: **use at every T-junction**), `{"t":"term","at":[x,y],"label":"V_{out}","side":"left|right|top|bottom"}` (open terminal), `{"t":"text","at":[x,y],"text":"...","anchor":"start|middle|end","muted":true?}`, `{"t":"arrow","a":[x,y],"b":[x,y],"label":"I_L"}` (current/direction arrow), `{"t":"vmark","a":[x,y],"b":[x,y],"label":"V_L","dx":0,"dy":0}` (+ at a, − at b), `{"t":"loop","at":[x,y],"r":1.2,"dir":"cw|ccw","label":"KVL"}`, `{"t":"region","at":[x,y],"w":..,"h":..,"label":"parasitics","color":"orange"}` (dashed grouping box).
Colors: `"color"` ∈ accent, red, blue, green, orange, purple, muted.

**Always check your schematics render correctly**: `node scripts/preview-circuit.mjs content/questions/q0042.md <your-scratch-dir>/q42.png` writes a PNG of every circuit in the file. Then **Read the PNG** to look for overlapping labels, wires crossing symbols, or a missing junction dot. Fix anything wrong. Electrically correct and clean are both required.

### 4.2 `plot`: curves computed from equations (waveforms, I–V curves, transfer curves, transients)
```json
{"title":"RC charging","x":{"label":"t","unit":"s","min":0,"max":"5*tau"},"y":{"label":"V_C","unit":"V","min":0,"max":5.5},
 "vars":{"vs":5,"r":1000,"c":"1e-6","tau":"r*c"},
 "series":[{"label":"V_C(t)","fn":"vs*(1-exp(-x/tau))"},{"label":"I(t)·R","fn":"vs*exp(-x/tau)","dashed":true,"color":"red"}],
 "hlines":[{"at":"0.632*vs","label":"63.2% at t = τ"}],"vlines":[{"at":"tau","label":"τ"}],
 "points":[{"x":"tau","y":"0.632*vs","label":"(τ, 3.16 V)"}],"xspans":[{"from":0,"to":"tau","label":"first τ"}]}
```
`fn` is a JS-style expression in `x` using vars and helpers: `sin cos tan exp log ln log10 sqrt abs pow min max floor ceil round sign atan atan2 sinh cosh tanh PI pi`, plus `step(x)` (Heaviside), `sqw(t,duty)` (period-1 0/1 square), `tri(t)`, `saw(t)`, `mod(a,b)`, `clamp(x,a,b)`, `sinc(x)`, `db(x)`, `ite(cond,a,b)` (piecewise, e.g. `ite(x<1, x, 1)`); `^` means power. Use `"x":{"log":true}` / `"y":{"log":true}` for log axes. Optional per-series `"points":[[x,y],...]` (data instead of fn), `"step":true`, `"fill":true`, `"n":1200` samples. Axis `unit` makes ticks print with SI prefixes (`1 kHz`, `4.7 µs`). Use `vars` so the numbers in your text and the plot agree.

### 4.3 `bode`: frequency response from a transfer function
```json
{"systems":[{"label":"RC low-pass","num":[1],"den":["r*c",1]}],"vars":{"r":1000,"c":"159e-9"},"f":{"min":10,"max":1e6},"marks":[{"f":"1/(2*pi*r*c)","label":"f_c"}],"show":"both","magRange":[-60,5]}
```
`num`/`den` are polynomial coefficients in **s, highest power first** (e.g. `[1]` / `["r*c",1]` = 1/(sRC+1); a second-order LPF is `["1"]` / `["l*c","r*c",1]`). Frequency axis in Hz.

### 4.3a Interactive `plot` / `bode`: sliders and live readouts
Add `"params"` to any `plot` or `bode` block to turn it into an interactive figure. Each param becomes a slider, and its value is a variable in every expression on the figure: series `fn`, `vars` (derived values recompute), `hlines`/`vlines`/`points`/`marks`, axis limits, and bode coefficients. Optional `"readouts"` show live computed numbers under the sliders.

```json
"params": [
  {"name": "r", "label": "R", "min": 100, "max": 1000000, "value": 10000, "log": true, "unit": "Ω"},
  {"name": "zeta", "label": "Damping ζ", "min": 0.05, "max": 2, "value": 0.3, "step": 0.01}
],
"readouts": [{"label": "Corner f_c = 1/(2πRC)", "expr": "1/(2*pi*r*c)", "unit": "Hz"}]
```

- `value` must sit inside `[min, max]`; `log: true` (min > 0) for quantities spanning decades (R, C, L, f). `unit` in V, A, W, Ω, F, H, Hz, s, J gets SI prefixes automatically.
- A param with the same name as a `vars` entry overrides it; other `vars` may depend on params.
- The validator checks that every curve stays finite at each slider's min and max. Choose ranges where the physics and the axis limits still make sense, and fix `y.min`/`y.max` (or `magRange`) so the axes don't jump while dragging.
- The caption should say what to try ("Drag ζ below 0.5 and watch the overshoot grow") and what the default values show.
- Use sliders when moving a parameter teaches something (corner frequency, damping, duty cycle, load line, tolerance). Keep a figure static when it compares fixed cases.

### 4.4 `timing`: digital timing diagrams (WaveDrom-like)
```json
{"signals":[{"name":"CLK","wave":"p......."},{"name":"D","wave":"0.1..0.1"},{"name":"Q","wave":"x0.1..0.","color":"accent"},{"name":"DATA","wave":"x=.=.x..","data":["0xA5","0x3C"]}],
 "marks":[{"t":2,"label":"t_{su}"}],"spans":[{"from":1.7,"to":2,"row":1,"label":"setup"}],"hscale":1.2}
```
Wave characters (one per period): `0` `1` low/high, `x` unknown, `z` high-Z (dashed mid), `u`/`d` pulled-up/pulled-down (dashed, for open-drain buses), `=` or `2`–`5` data bus (labels from `data`), `.` continue, `p`/`n` clock with rising/falling edge at period start.

### 4.5 `mermaid`: block diagrams, flowcharts, state machines, sequences
Standard Mermaid syntax (`flowchart LR`, `stateDiagram-v2`, `sequenceDiagram`). Use it for PLL block diagrams, power architectures, test flows, FSMs, protocol sequences. Keep labels short. Use `["text with (parens)"]` quoting where needed. **No HTML tags in labels.** Use `<br/>` only for line breaks.

### 4.6 `svg`: hand-drawn SVG (last resort)
For things the other tools can't do (PCB stack-up cross-sections, a via cross-section, an eye-diagram sketch, an IV-curve family with region shading). Use `viewBox`, no fixed colors except via CSS variables: `stroke="var(--d-ink)"`, `fill="var(--d-box)"`, text `fill="var(--d-ink)"`, accents `var(--d-accent)`, `var(--d-red)`, `var(--d-blue)`, `var(--d-green)`, `var(--d-orange)`, `var(--d-purple)`, `var(--d-muted)`. `font-family="Inter, sans-serif"`, font-size 12–14. It must work in light and dark themes.

### 4.7 `sim`: embed an interactive simulation
`{"id":"buck-lab","vin":12,"vout":3.3,"iout":2}` with the params documented in `src/sims/catalog.json` (read it: 90 simulations with ids, params and presets). Only use catalog ids and only documented params. Put the sim where it teaches something, usually inside `deep` after you've explained the concept, followed by a `Figure:` line telling the learner exactly what to try ("Drag D above 0.5 and add a perturbation: watch it grow each cycle").

## 5. Workflow per question

1. Read the question in `source/questions.txt` with its section heading and the author's section note. Consider neighbours in the same section (they shape what this one is *for*).
2. Research and verify. Derive equations yourself; compute numbers with node.
3. Write the file. Mirror `q0008.md` structure exactly.
4. Run `node scripts/validate-content.mjs qNNNN`. It must report **0 errors** for your files. Address warnings (e.g. low word count, missing diagram) unless genuinely inapplicable.
5. Preview circuits (`scripts/preview-circuit.mjs`) and Read the PNG. Fix layout problems.
6. Re-read your answer sections aloud in your head. Would a strong candidate actually say this? Is every claim true?
