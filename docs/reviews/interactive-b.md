# Review: interactive figures, batch B (q0342–q0670)

Scope: the 27 `plot` blocks that gained `params`/`readouts` since 7fd7037 on q0342, q0351, q0352, q0359, q0374, q0377, q0395, q0416, q0418, q0429, q0431, q0444, q0454, q0477, q0485, q0513, q0517, q0547, q0549, q0629, q0630, q0652, q0663, q0664, q0665, q0666 and q0670. (The brief said 28 blocks, but each page has exactly one interactive block.)

Method: I evaluated every series, var, line, point and readout with the site's own `src/lib/expr.ts` in node, at the defaults and at the slider extremes and corners. I compared the defaults with the page text, worked out each caption's "drag…" claim, and screenshotted each figure at its defaults and with sliders moved, on the dev server. For q0477 I also checked the closed-form impedance formulas against a 2-D finite-difference Laplace solver. `node scripts/validate-content.mjs` reports 0 errors.

## Per figure

| Page | Verdict | Notes |
|---|---|---|
| q0342 | fixed | The x axis is `6*tau`, so the curve never moves. The caption said the 5τ line "slides out"; it now says the axis follows τ and the tick labels stretch. |
| q0351 | fixed | The f₀ line label "f₀ = 170 Hz" went stale when f₀ moved; it is now "f₀". The caption described a "fixed 170 Hz drive" that the figure did not show, so I added a fixed orange "187 Hz drive" line (the frequency used in the text and readout) and rewrote the claim: at f₀ = 150 Hz, the 187 Hz drive is 25% above resonance and the amplitude is 1.76. y max raised from 11 to 12 (the peak at Q = 11 is 11.01). |
| q0352 | fixed | At 15 V and 1 Ω the no-load speed (7114 rpm) fell off the 7000 rpm axis; x max is now 7500 and y max 320. The physics and both caption claims check out (28 mN·m; +25%). |
| q0359 | fixed | The title "runout 20 µm" and the line label "spring force 0.5 N" went stale; now "default runout 20 µm" and "spring force". Changed "idealised" to "idealized". Claims check out (−37%, −55%). The µm param and `e = eu*1e-6` are correct. |
| q0374 | fixed | y max raised from 50 to 55 (the 60 A total reaches 50.8 W at 96 kHz and 6 mΩ). Claims check out (×4; 25 → 10.8 W). |
| q0377 | fixed | The title overflowed the plot; I shortened it. The physics (f_elec = steps/4; the crossover formula) and both claims (6.4k, 894 steps/s) check out. |
| q0395 | fixed | Most of the L and f range drove the curve off the fixed 0.2 A axis: up to 1.5 A, which the caption itself admitted ("off the top of the plot"). Ranges narrowed to L 0.3–10 mH and f 6–100 kHz, y max 0.6 A; the caption now says "0.3 mH: more than triples, to 0.5 A". Changed "centre" to "center". |
| q0416 | fixed | The title overflowed; shortened. The vague claim "a much lower current" is now quantified (2.0 A → 1.6 A). 92 °C checks out. |
| q0418 | fixed | Caption claim was wrong: it said "slow edges cost more than extra conduction loss does". Over the slider ranges, 1 W of conduction loss gives an 86 kHz ceiling against 95 kHz for 300 ns edges. Rewritten with both numbers. The caption called the 1.3 W line "dashed" (it is solid); the new hline label also collided with the point label, so the label was removed and the point renamed "1.3 W ceiling". |
| q0429 | fixed | The title "diode + 18 V Zener" went stale; now "(default 18 V Zener, 50 mH)". Added a "Drain peak V_S + V_clamp" readout, because the caption talks about the drain spike. Release-time formula and claims check out. |
| q0431 | fixed | The log y axis (10 ns–1 µs) lost the curve: at 12 V drive (the caption's own example) both points fell below 10 ns, and at Q_gd = 10 nC the curve rose above 1 µs. The axis is now 1 ns–10 µs. Title shortened and "2 V plateau" restored. The eightfold claim checks out (7.7×). |
| q0444 | fixed | The y minimum (5 mΩ) equaled the R slider minimum, and at 20 nH |Z| reached 12.6 Ω, above the 3 Ω top; the axis is now 2 mΩ–20 Ω. The caption's "the volts you must resolve rise with it" was muddled (a higher R gives more signal); now "at the cost of more I²R heat in the shunt". Title shortened. |
| q0454 | OK | The cross-section `w*1.378*oz` mil² and the IPC-2221 formula are correct; 20 mil gives 20.3 °C. Note that halving the copper while doubling the width leaves the curve unchanged, because the formula uses area only. |
| q0477 | fixed (serious) | The IPC-2141 closed forms were driven over εr 3.2–4.8 and h 0.1–0.4 mm, where the microstrip form is badly off. Against Hammerstad–Jensen the 50 Ω width is 8% narrow at the default and 21% narrow at h = 0.1 mm, εr = 3.2. The caption's "h = 0.1 → about 0.15 mm" was really about 0.18 mm. I replaced the series with Hammerstad–Jensen (microstrip, t = 35 µm) and Wheeler (stripline with thickness, t = 17.5 µm as the text states). The 50 Ω widths now come from Hammerstad's synthesis and Wheeler's inverted formula, both within 0.1 Ω of the plotted curves. A finite-difference field solve agrees with Wheeler to 0.1% and with H-J to about 2%. Defaults: 0.365 mm microstrip and 0.154 mm stripline. I updated the text ("about 0.37 mm") and the caption, added a paragraph saying IPC-2141 underestimates the microstrip width, and updated the references. The x axis is now log 0.03–1.2 mm, because the 50 Ω widths span 0.055–0.93 mm over the slider ranges, and y is 10–130 Ω. |
| q0485 | fixed | The ranges overlapped (short-loop L up to 10 nH, long-loop L down to 1 nH), so the "short" loop could have more inductance than the "long" one. Now 0.3–3 nH and 3–20 nH. y max raised from 100 to 200 Ω (125 Ω at 1 GHz with 20 nH). Title shortened. |
| q0513 | fixed | The worst-case ζ is 0.77, so the underdamped formula stays valid over the whole range. y max raised from 24 to 26: at the extreme corner the peak is 23.8 V and its label was clipped. Claims check out (1.47, 1.93). |
| q0517 | fixed | The caption's logic was garbled ("a slower-setup receiver buys more than any amount of length matching"); it is now "the receiver's timing window, not length matching, sets the limit", and the rate is given as 2.2 Gb/s. y max raised from 140 to 170. |
| q0547 | fixed | The damping τ was fixed at 9 ns while L changed. For a series-R damped loop τ = 2L/R, so it is now `3*l` (9 ns at the default). The caption adds that the ring "dies out three times faster" at 1 nH, and there is a new τ readout. The amplitude readout is labeled as an illustrative envelope. The √(L/C) amplitude scaling and the frequencies check out. |
| q0549 | fixed | The long hline label collided with the "10 nH" point; it is now "18 V headroom", and the caption says the line is dashed. Claims check out (3.6 nH, ×3). |
| q0629 | OK | ζ ≤ 0.88 across both ranges (spring-tip minimum 8 nH; critical damping would be at 6.25 nH), so the underdamped step response and the overshoot readouts stay valid. 12% and 20% check out. |
| q0630 | OK | Overdamped cases are handled with `ite`; the ζ = 0.5 line at R²C is correct; 5 pF gives 12%. |
| q0652 | OK | 9.1% and 54.9% check out. |
| q0663 | fixed | y max raised from 1.3 to 1.4 (a GPC of 1.25 crowded the top). The claim checks out (45% of saturation at 0.3 s). |
| q0664 | OK | λ/(2NA) is right; NA 0.8 gives 121 nm. |
| q0665 | fixed | The quantizer gives 2^bits levels and a square wave at 1 bit. "Too coarse to show the sine at all" overstated the 3-samples case, which is still above Nyquist; reworded. |
| q0666 | fixed | X(0) = 1.2 sat on the top edge at T = 1.2 ms; y max is now 1.3. Claims check out. |
| q0670 | fixed | The caption's example (fs = 600 Hz) put the 900 Hz tone exactly at Nyquist (900 = 1.5 fs), a degenerate case. It now uses fs = 750 Hz: the tone folds to 150 Hz, and the point labels no longer collide. y max raised from 600 to 650. |

## Most serious

1. **q0477**: the IPC-2141 microstrip formula gave 50 Ω widths 8–21% too narrow across the slider range. The default (0.335 mm) and the caption's h = 0.1 mm figure were both off. I replaced it with Hammerstad–Jensen and Wheeler and checked against a field solver.
2. **q0395, q0431**: for much of the slider range, including the caption's own suggested moves, the curve sat off the fixed axes.
3. **q0418, q0517**: the caption's "drag…" conclusion was false (q0418) or garbled (q0517).
4. **q0547**: the decay time constant did not scale with L.
5. Stale numbers in labels and titles (q0351, q0359, q0429), and overlapping ranges in q0485.

## Left as is

- Titles that overflowed are shortened. The renderer now wraps titles (commit 3b0c71c), so this is cosmetic.
- Some point labels at the right edge clip (q0374 "60 A"), and some line labels overlap at extreme slider corners (q0663 at τ = 0.5 s with GPC = 1.25). These are renderer layout issues.
- q0416 and q0454 readouts happily report temperatures far above any rating (for example 625 °C) at extreme corners. The figures already mark the 150 °C and 100 °C validity lines, so I left them.
- British spellings elsewhere in these pages, outside the figures ("millimetre", "synchronised"), were not in scope.
