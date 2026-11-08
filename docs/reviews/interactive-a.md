# Review: interactive plot/bode figures, q0001–q0335

Scope: the 31 `plot`/`bode` blocks that gained `params`/`readouts` since 7fd7037 (29 files). For each block:
- I evaluated every series, var, marker and readout with the site's own expression compiler (`src/lib/expr.ts`). I did this at the default values, at each slider's min and max, and at every min/max corner.
- I checked how much of each curve stays inside the fixed axis limits, and flagged labeled markers that land off-chart. Point labels are not clipped, so an off-chart marker draws its text outside the plot.
- I recomputed each caption's "drag…" claim.
- I took screenshots at the defaults and with sliders moved (dev server, Playwright), then read them.

After the fixes, `node scripts/validate-content.mjs` reports 0 errors and 0 warnings. My harness reports no off-chart labeled markers and no non-finite readouts.

## Per figure

| Page | Verdict | Notes |
|---|---|---|
| q0006 | fixed | At φ = 90° the readouts showed float noise ("0.612 fW", "6.12e-17"); they are now rounded. Removed "default 60°" from the series label. The caption said "the two curves become the dashed case"; it now says the red curve does. |
| q0008 | OK | |
| q0009 #1 (bode) | fixed | Labels "R_a (default 20 Ω, Q = 1.58)" went stale while dragging; they are now generic ("R = R_a (slider)") and the caption states the defaults. Widened magRange from −50 to −70 dB so the Q ≈ 32 skirts at R = 1 Ω stay visible. Added an R_b bandwidth readout. |
| q0009 #2 | fixed | Made the series label generic. The "first peak" marker sat on the final-value label when overdamped; it is now labeled "first peak (ζ < 1)" and parked mid-plot when ζ ≥ 1. The physics checks out: underdamped, critical and overdamped branches, the hard-coded R = 200 Ω roots and the overshoot readout are all correct. |
| q0011 | fixed | At ESR = 5 mΩ the notch fell below y.min = 10 mΩ; y.min is now 1 mΩ. Shortened the clipped title. |
| q0015 | fixed | The title "(B = 3950)" went stale and was clipped; it now reads "(default B = 3950 K)". At B = 4200 the NTC curve clipped at 0 °C; y.max is now 4. |
| q0027 | fixed | At τ = 1 ms the "37% of I₀" marker sat beyond x.max = 0.5 ms and its label floated outside the plot; τ.max is now 0.4 ms. |
| q0028 | OK | |
| q0046 | OK (title shortened) | The ≈32% / ≈71% figures and the 5 A / 2 A drag claims check out. |
| q0056 | fixed | The radius readout showed "5.00e-4 m"; the slider now works in mm. The title "1 mm wire" went stale; it now reads "default 1 mm diameter". At a = 2 mm the curve exceeded y.max = 50; y.max is now 200. |
| q0074 | OK | The 120 mV for 100× I_S and 2 mV/°C claims check out. |
| q0084 | fixed | In saturation the Q point was hard-coded at V_CE = 0.1 V and drawn off the I_B curve (for example 3.96 mA against a curve value of 2.3 mA at R_C = 2.5 kΩ). Q is now the exact load-line ∩ curve intersection, solved with 6 unrolled Newton steps (residual below 1e-10 A over the whole slider grid). The caption now says Q reaches the saturation knee at I_B = 100 µA, which is where the intersection actually lands (0.31 V). |
| q0095 | fixed | At V_t = 0.5 V and k_n = 3 mA/V² the curve (9.4 mA) left the axis and the "V_GS = 3 V" label floated outside it; y.max is now 9.5 mA. The k_n unit showed as "2 mA"; it is now A/V². |
| q0100 | fixed | At R_D = 500 Ω the 6 V Q point (16 mA) went off-chart; R_D.min is now 900 Ω. The title went stale and was clipped. The "past about 2 kΩ" claim checks out (R_D ≤ 2 kΩ keeps the 3 V point in saturation). |
| q0110 | fixed | At C = 50 pF the 3.3 V marker (5.4 mW) went off-chart; C.max is now 20 pF and y.max 5.5 mW. Made the title generic. |
| q0113 | fixed | **Physics error.** V_C restarted from 0 V (or 3.3 V) at every edge, so the curve jumped whenever τ was not ≪ T/2, which is exactly what the slider is for. Replaced it with the exact response from 0 V at t = 0, which converges to the periodic steady state (L_k = V_DD·a(1 − a^{2k})/(1 + a), a = e^{−T/2τ}). The readout is now the steady-state swing. The caption said "blue curve" but the curve renders orange. Made the title generic. |
| q0116 (bode) | fixed | Labels "(default …)" are now generic. |
| q0138 #2 | fixed | Every curve is the type-II PLL response with a zero, (2ζω_n s + ω_n²)/(s² + 2ζω_n s + ω_n²). I verified this analytically for all three regimes, and the peak-time overshoot readout is correct. The page's 21% at ζ = 0.7 matches this response and q0135, so I kept it and made it explicit: the title is "Type-II PLL step response (loop with a zero)", and the caption gives H(s) and notes 21% against the textbook 4.6%. **The caption's drag claim was false**: "above 1: overshoot below 5%". With the zero, overshoot is 13.5% at ζ = 1 and drops below 5% only near ζ ≈ 1.95. Rewritten. |
| q0141 | OK (title shortened) | This file already had an uncommitted edit from someone else (R_L max 400 Ω plus a caption). That caption checks out (39.5%, 88.9%). |
| q0145 | fixed | "RMS rises faster at first" is false from D = 0.3: dRMS/dD = 4.6 V against 5 V for the average. Rewritten, with a 5% claim added (RMS = 4.5× the average). Title now says default. |
| q0162 | fixed | The peak at √(P₀/R) is *exact*, not "≈ ignoring the linear term": η = V/(V + P₀/I + k_s + RI), and k_s is a constant there. The caption now says so. The marker sits on the curve maximum across all slider corners, and the 51% → 84% claim checks out. |
| q0165 | fixed | At I_rest = 5 µA the 1 µA marker (4.2 years) went above y.max = 3; y.max is now 6. Title now says default. |
| q0183 | fixed | "Every curve collapses onto the grey line" overstated it: the 150 Ω curve stays in DCM at small D. Reworded, with a checked claim that the 8 Ω load stays in CCM at every D. Shortened the stale, clipped title. |
| q0212 | fixed | At f = 200 kHz the 4.7 µH marker (2.55 A) went above y.max = 2.5; y.max is now 3.2. Title now says default. |
| q0216 | fixed | **Physics error (pre-existing sentence).** "With fixed L the ripple … hits the ESR floor" is wrong: with fixed L, ΔI ∝ 1/f, so the ESR term keeps falling as 1/f and there is no floor. The drag sentence ("both curves flatten") was wrong for the same reason. Rewritten; at 30 mΩ the constant-ripple floor is 31 mV, above the 20 mV target. |
| q0247 | fixed | Raising f_sw above about 600 kHz pushed the f_sw/10 line off the top (y.max = 60 kHz), so "raising f_sw lifts the line" could not be seen; y.max is now 300 kHz. |
| q0283 #1 | OK (title shortened) | The 66%, dropout-current-off-edge and I_Q-decade claims check out. |
| q0283 #2 | OK (title shortened) | |
| q0303 (bode) | fixed | At R₀ = 30 mΩ the whole curve (−30.5 to −28 dB at one corner) fell below magRange [−27, −18]; magRange is now [−32, −17]. |
| q0306 | fixed | The default curve already clipped at −30 °C (9.7 > 9), and at 4500 K the "−20 °C" marker (14.6×, the value the caption quotes) was off-chart; y.max is now 16. Title shortened. |
| q0315 | fixed | The default curve clipped (211 W > 200 W), and the 60C marker went off-chart (up to 880 W) at large Q or R. Removed the 60C marker (not referenced in the text) and set y.max to 250 W. Title now says default. |

## Most serious problems found
1. q0113: the capacitor waveform was physically wrong (discontinuous) over most of the slider range.
2. q0138: the caption's "above ζ = 1, overshoot below 5%" was false for the loop-with-zero response drawn; the page now states explicitly which response it shows.
3. q0216: the caption claimed an ESR floor for the fixed-L curve, which does not exist (1/f slope).
4. q0084: the saturation Q point was drawn off the characteristic curve.
5. Many figures had markers whose labels floated outside the plot at slider extremes (q0027, q0095, q0100, q0110, q0165, q0212, q0306, q0315), or curves that clipped at the defaults (q0306, q0315).

## Left as is / notes
- q0135 (not one of the changed figures) says the 21% figure is "for a phase step in the reference … not for a frequency step". For a linear PLL, output frequency over input frequency has the same H(s), so a frequency step also gives 21%; q0138 relies on that. Worth a look by whoever owns q0135.
- Plot titles do not wrap and clip beyond about 70 characters at desktop width (more on mobile). I shortened every title over 70 characters in scope; other pages may have the same issue.
- Some curves still leave the axes at slider extremes where that is expected and harmless: steep low-frequency arms in q0011/q0216, the hot-diode curve above 1 A in q0074, and the V_GS = 6 V curve in q0100, which already clipped in the static figure.
