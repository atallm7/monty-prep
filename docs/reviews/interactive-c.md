# Review interactive-c (slider figures, q0687–q1005)

Scope: the 30 `plot`/`bode` blocks that gained `params`/`readouts` (diff against 7fd7037). For every figure, each series `fn`, var, marker, vline/hline and readout was evaluated in node with the site's own expression compiler (`src/lib/expr.ts`). This was done at the defaults and at every slider's min and max. The checks covered finite values, the curve staying inside the axes, markers drifting off the plot, and the formula staying valid over the whole range. Every number in each new "Drag…" sentence was recomputed. Each figure was screenshotted on the dev server at the defaults and again with the slider set to the caption's suggested value. Each readout's live value was read from the DOM and compared with the caption. Validator: 0 errors, 0 warnings.

British spellings in these 30 files were also converted to American (behaviour, modelled, centre, metre, travelling, characterise, colour, stabilisation and others). This came to about 80 replacements in 17 files.

## Per figure

- **q0687** Fixed. ζ max lowered from 0.95 to 0.9. At ζ = 0.95 with f0 = 100 MHz the first peak (16 ns) fell outside the 14 ns window, which left a stray "first peak" label. The caption now says the 0.84 V figure is for the default ζ = 0.4. "Push ζ toward 1 and the ringing disappears" became "up to 0.9: overshoot under 0.2%". Added a finding the sliders reveal: below ζ ≈ 0.15 the first ringback drops back under V_IH (2.0 V), so the "monotonic through the threshold" claim stops holding.
- **q0688** Fixed. At N = 16 the peak (1.61 V) went past the ±1.5 V axis and the "peak" marker was clipped. The axis is now ±2 V. The caption claimed that slowing the edge to 2 ns or using 1 nH brings the bounce "back under 0.5 V". That reads as following the N = 16 step, where it would actually be 0.80 V. It now says "from the defaults … halves it to about 0.4 V". Physics OK: i = I_p sin²(πt/T) gives a peak N·L·I_p·π/T at T/4.
- **q0693** Fixed. Across τ = 30–300 ps the 3 ns and 1 ns markers left the 1e-3…1e15 axis, so their labels floated outside the plot. τ is now 70–250 ps and the y axis runs 1e-6…1e16. With every f_c in range, both markers stay inside. The title was shortened (it had been clipped) and "characterised" corrected. The caption numbers check out (τ = 150 ps gives an MTBF at 3 ns of 81 min).
- **q0695** OK. 0.3 ps gives 74.5 dB at 100 MHz. The readouts are correct, and the 74 dB jitter readout is intentionally static.
- **q0710** Fixed. The title quoted "R′ = 3.3 Ω/m" as fixed, so it now says "default R′". The caption's 670 Ω figure is now tied to the default. At 30 Ω/m the corner is 16.5 MHz, which checks out. |Z0| = √(|R′+jωL′|/(ωC′)) with G′ = 0 is correct.
- **q0714** OK. At R_S = 20 Ω the peak is 136 mW and the efficiency at the match is 50%. The "within 11% between R_S/2 and 2R_S" statement holds at every slider value.
- **q0721** Fixed. 0.1 pF on a 30 ps edge gives −8.3%, so the caption now says "about −8%" (it said −9%). The ramp response of a shunt C, −(τ/t_r)(1−e^{−t/τ}), is correct, and the 2 pF numbers (−43%, −10%) check out.
- **q0725** OK. Corner at 0.1 mm is 426 kHz. The 10 MHz readout uses the annulus formula, which is valid because δ(10 MHz) = 21 µm is less than the 50 µm minimum radius. At r = 2 mm the curve runs off the top above about 400 MHz, which is acceptable.
- **q0747** OK. 1 mA gives 2.9 kΩ and 122 pF; 120 ns at 3 mA gives 146 pF. At extreme slider values the vline goes past 450 pF and is hidden, which is fine.
- **q0755** Fixed. The x axis was widened from 1.2 µs to 1.5 µs so that the 70% marker stays visible at R_p = 10 kΩ (it sits at 1.20 µs). The caption's numbers (746 ns; 169 ns at 500 Ω) check out and are now marked as defaults.
- **q0758** Fixed. The rise times in the caption are now tied to the default 100 pF. The 200 pF numbers (373 ns, 169 ns) check out.
- **q0805** Fixed, and this was a physics error. The re-close discharge used a hard-coded 0.33 ms time constant, which was R_s·C only at the default C. It is now `rs*c` with R_s = 330 Ω, matching the page text. The caption said a longer bounce "would register as a press". In fact this is a bounce during release, and crossing V_IH gives a spurious extra edge, so the wording was changed. The 0.1 µF peak of 2.09 V checks out.
- **q0806** Fixed. V_S could be dragged below V_f (1.8 V against 2.0 V), which gave negative LED current, negative readouts and a curve off the axis. The current is now clamped with `max(0, V_S − V_f)` in the fn, markers and readouts. The ±8% sentence is now tied to the defaults. The 5 V reading (11 mA) and the 3.0 V reading (1.1 mA) check out.
- **q0815** Fixed (caption only). The crossing times are now tied to 10 pF. 1 pF with 100 pA gives 4.03 µs, which checks out.
- **q0818** Fixed. magRange widened from −60 to −80 dB. At C = 100 nF the second-order curve sat exactly on the bottom edge (−59.9 dB) at Nyquist. The attenuation formulas and the caption (30 dB and 60 dB, corner 1.59 kHz) check out.
- **q0844** OK. 100 pF gives 1.59 kHz and 159 Hz.
- **q0846** Fixed. The red series label "(default 5, underdamped)" went stale when Q was dragged, so "underdamped" was dropped from it. The blue Q = 0.5 curve was called "overdamped", but Q = 0.5 is critically damped. "Drag Q below 1 to flatten the peak" was wrong, because the peak only disappears for Q ≤ 1/√2, so it now says "below about 0.7". The 4 kHz sensitivity of 15.5 nm/g checks out.
- **q0848** Fixed (wording only). The caption now reads "default τ = 0.49 s". τ = 2 s gives 0.080 Hz, a 12.6 s period, which checks out.
- **q0857** Fixed. The title quoted ω = 2°/s and 1.0 µm pixels as fixed, and both are sliders, so it now says "default". "Moves out five stops to 0.16 s" was ambiguous (it is five stops beyond no-OIS, not beyond the 20 dB case), so it was reworded. 8°/s gives 1.28 ms, which checks out.
- **q0868** Fixed. The title said "sensor height 1.8 m", which is a slider, so it now says "default". The caption is now tied to the default. 1.0 m gives 2.14 m and 57.3 m, which checks out.
- **q0872** OK. A 0.5 mV floor gives N = 1600.
- **q0947** OK. The alpha-power model matches the page text and table (0.714, 0.432). V_t = 0.45 V gives 0.599. V_t max (0.45) stays below x min (0.5), so the fn is always real. The slider range for α (1.1–2) matches the page's "1.1–1.5 short channel, 2 long channel".
- **q0951** Fixed. With T_a = 105 °C and T_j,max = 85 °C the "max power" readouts went negative, so they are now clamped at 0. The 55 °C value (2.33 W) and the 105 °C value (0.67 W) check out.
- **q0976** OK. λ = 0.03/kh gives a crossover of 23.1 kh.
- **q0977** Fixed. The title was clipped at desktop width, so it was shortened. Prose against the plot: the page's 77.7× (125 °C against 55 °C, 0.7 eV) matches the curve, the readout and the numeric quiz. The values for 1.0 eV (501×), 0.4 eV (12.0×) and a 25 °C reference (938×) all check out.
- **q0985** OK. At C = 1 µF the τ marker leaves the 5 ms window. That is deliberate (the caption makes this point), and its label is not drawn.
- **q0993** Fixed (caption tied to the defaults). L = 0.5 nH gives 3.18 MHz and 3.3×, which checks out.
- **q0997** Fixed. "Only the middle (compensated) curve stays flat" was false once C1 moved, so it was rewritten as "At its default of 11.1 pF the adjustable curve is compensated and is the only one that stays flat". The transfer function, C1/(C1+C2) and R2·C2/R1 are correct. The −30…−10 dB range covers 4–30 pF.
- **q0998** Fixed. At L = 1 H, f_L = 0.8 Hz fell off the 1 Hz axis edge, so the caption described something the plot could not show. L max is now 0.5 H, which gives 1.6 Hz, and the caption was updated. The 50 Ω value (796 Hz) checks out.
- **q1005** Fixed (known item). The readout "Battery needed for 8 h at 300 W = 3530 Wh" sat next to the caption's "2400 Wh of usable energy, more than 10x this battery". The two figures are actually load energy and nameplate rating, but nothing said so. Changes:
  - Readouts are now "Energy delivered to the load (E·η·DoD)" and "Battery rating needed to deliver 2400 Wh (8 h at 300 W)", and runtime now carries its "min" unit.
  - Sliders are now "Battery rating (nameplate)" and "Usable depth of discharge", which is the name the caption uses.
  - The caption now says the load needs 2400 Wh delivered, which means a battery rated about 3530 Wh at 85% and 80%, more than 16 times the 216 Wh battery.
  - The 600 Wh value (81.6 min) and the 50% DoD value (18.4 min) check out.

## Remaining / cross-cutting
- Slider and readout labels show raw underscores (R_p,min, V_DD, C_b, f_c) because labels go through mdInline, which does not subscript bare `_`. The reference q0034 does the same, so I left this alone. A renderer-level fix (subscripting `X_y` in labels, as plot titles already do) would tidy every interactive figure.
- Point labels in `Plot.tsx` are drawn outside the clip group. A marker that leaves the axis range still prints its label just beyond the edge, while the dot itself is clipped. I avoided this by choosing ranges, but clipping the labels too, or skipping off-range ones, would be more robust.
- q0944 was in the brief, but it has no interactive figure in this diff and is not one of my 30 files, so I did not edit it.
