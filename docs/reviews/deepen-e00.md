# Deepen review e00 (fundamentals: dividers, resistors, E-series, C, L, PDN, RC/LC filters, semiconductors)

Scope: the 19 ids in docs/deepen/e00.txt, checked against the `::: deep` additions since 65d169b. I recomputed every new number with node. I screenshotted the 5 new figures with `--section deep`, and all of them render and match their captions. `validate-content` reports 0 errors.

## Requested spot checks
- **q0053, 50 Ω/50 Ω series-L low-pass:** confirmed. $(R_s+R_L)/(2\pi L)$ = 19.41 MHz for the 820 nH E12 part, and the passband gain is 0.5 (−6.02 dB). With the exact 796 nH the corner would be 20.0 MHz, so I now state both values. 1.59 µH for a true 10 MHz corner is correct.
- **q0017, real-E24 worst case:** confirmed. 13→15 is the largest step in E24 (×1.154), so the worst-case distance to the nearest value is √1.154 − 1 = 7.4 %. The claim that 27/30/33/36 sit 3.4–4.4 % above 10^(k/24) is also correct.

## Per page
- **q0008 (reference page):** I fixed three things.
  - "Limiting cases" said that with R2 → ∞ "the node floats". In fact it is tied to Vin through R1. Only when both resistors go to infinity does it float. Rewritten.
  - The "Choosing values" bullet ("1 % parts → up to ~2 %") is now $(1-k)\times2\%$, consistent with the page's formula and the new worked example.
  - Reworded the "often-quoted 2 %" sentence to match.
  - All Li-ion example numbers verified: 3.15 V, 75 kΩ, τ 0.75 µs, 9τ = 6.8 µs, 0.32 mV = 0.39 LSB, 21 Hz, 68 ms, 0.7462–0.7537, 7.5 mV ≈ 9 LSB, ~0.2 µV noise, 3.127 V DMM loading.
- **q0015:** Trace self-heating said 43 mV extra at 1 A. The correct value is 0.19 Ω × 0.0039 × 60 K ≈ 45 mV, now fixed. The NTC table (R, V, slope, α) and the self-heating and error-budget numbers all check out.
- **q0017:** OK. Feedback-divider table, 75k/24k = 3.125 exact, and ±1.5 % 1 % corners all verified.
- **q0018:** Two fixes.
  - θ derived from the derating curve is film-to-ambient, not "above its pads".
  - The claim "series is better than parallel because dissipation splits evenly" was wrong. Both topologies split within tolerance. Series' real advantage is half the voltage per part. Rewritten.
  - θ table, 729 mW, the 28.8 mJ pulse and the 600 V string are correct.
- **q0019:** OK. Arrhenius AF 3.6/5.9/12.7, fault table, flex strain 6tδ/L² = 1.9×10⁻³, CTE shear 1.4 %/5.7 %, and the 0.1 J vs 0.2 mJ surge comparison all verified.
- **q0020:** OK. 16.7 kΩ, 967 Ω, 0.85 µs, 0.55 V glitch, 1.9 µs, 4.26 kΩ, 2.7 V strap and 270/575 µA backfeed all verified.
- **q0026:** OK. 47.7 nH and 53.1 pF match; the PF correction gives 127 µF, −16 % current, −29 % I²R; −72.6° phase, tan δ 0.31; bench values 1879.6 Ω, −57.9°, 161 µs. Plot verified.
- **q0032:** Two fixes.
  - Table error: the 300 kHz "with 1 µF" entry said 7.2 mΩ. The model gives 8.3 mΩ, and the plot already showed 8.3.
  - The text said the first network fails only at 6.7–11 MHz. It also exceeds 18 mΩ above about 38 MHz, and the second network above about 53 MHz. Text and caption now say so.
  - Renamed "Infinite ESR damping" to "Heavy ESR damping".
  - I re-ran the whole ladder model: the peaks at 61.5 mΩ / 9.0 MHz and 16.2 mΩ / 11.9 MHz, and all other table values, match. The plot points match the model.
- **q0033:** Four fixes.
  - The bench step said a DC-bias capacitance drop makes the corner *lower*. It makes it **higher**. Fixed.
  - Leakage shift: the source resistance is on the other side of the capacitor, so the node moves by 1 µA × 5 kΩ = 5 mV, not 5.6 mV.
  - The DC-block "high SRF" rationale was replaced. At Gb/s rates the capacitor is far above its SRF anyway; what matters is mounted inductance and pad discontinuity.
  - The step-test frequency wording was clarified (period several times τ).
  - Cascade numbers (4.41 Hz, 0.17 dB, 16°, 11 µF) and droop numbers are correct.
- **q0035:** Rounding errors fixed: at f_c, 3.03/6.07/9.6 dB should be 3.01/6.02/9.54 dB (caption 9.6 → 9.5). The integrator table, the noise equality (0.2035 µV both ways), the −3 dB points 0.374/0.644 f_c and the 2.2RC rise time are correct. Bode verified.
- **q0037:** OK. Charge sharing (25 µC, 62.5 µJ), 712 kHz / 45 mΩ / 112 A, hot-plug (50.3 kHz, ζ 0.158, 60 % overshoot, 19.3 V, 0.63 Ω critical) all verified.
- **q0040:** OK. Every |Z| and phase in the table and every L_app value was recomputed from the stated model and matches. Buck ripple 1.02 A and 32.1° are correct.
- **q0041:** Fixes:
  - The volt-second bench step integrated the *switch-node* voltage, which gives V_out·T per cycle, not zero. It now integrates v_L = v_SW − v_out.
  - The Euler Δt = 2τ row is marginal (it oscillates without decay), not divergent. Clarified.
  - The load-step slews, 23/61 mV, L_crit 4.79 µH, D = 0.278 and the Euler table are correct.
- **q0042:** The bench step said inductor phase "climbs sharply" before flipping to −90°. Phase cannot exceed +90°; it falls through 0° at the SRF. Fixed. The parallel/series reactances, the SRF table, the bench trick (65.4/−94.1 Ω) and the motor PF numbers (7.31 A, 107 W, 1677 VAR, 101 µF) are correct.
- **q0047:** OK. C_w 7.8 pF, R_eff 400 Ω, Q 2.8, f₁ 11.9 MHz, AC/DC copper loss and the 25.9 mΩ hot DCR all verified.
- **q0048:** Two fixes.
  - The common-mode choke said "100× more impedance". Corrected to (1+k)/(1−k) ≈ 200× per winding (1.99 mH vs 10 µH).
  - Softened "the one situation where ungapped ferrite is correct" to "the classic case".
  - The gap design (N = 7, 0.090 mm, 449 nH/t², μ_eff 715, 4.77 A, 61.6 µH / 1.7 A ungapped, 64 % gap energy), fringing, temperature and tolerance numbers are correct. Plot verified.
- **q0049:** The MnZn/Si-steel resistivity ratio is about 2×10⁶–2×10⁷, not "ten million or more". The NiZn claim ("a million times more again") is generalized to "several orders of magnitude, grade-dependent". The Steinmetz ratios and the powder-core example (N = 7.1, 1.17/1.34 kA/m, 0.10 T, 26 mT p-p) are correct.
- **q0053:** Fixes:
  - Corner clarified for 820 vs 796 nH.
  - The "R → 0" limiting case was muddled; rewritten for the LPF and HPF separately.
  - Rail choke (38 kHz, 54.6 kHz, Q 0.24/10), bias-tee loss (0.64/0.007 dB) and the Q-loss figures (−0.29/−0.85 dB) are correct.
- **q0062:** Fixes:
  - The bench step "press the sample against a reference of known type to form a junction" isn't a reliable method. Replaced with a point-contact (metal–semiconductor) rectification check.
  - SVG labels now use real subscripts and superscripts (E_c → E<sub>c</sub>, 10^16 → 10¹⁶). Re-rendered and checked.
  - The band numbers (0.358/0.20 eV, which match the SVG geometry), the n_i(T) table (exact neutrality solution), the ~222 °C crossover for 10¹⁴, the Hall numbers (0.62 mV, −624 cm³/C, 1250 cm²/V·s) and the 4-point probe (2.2 Ω) are correct.

## Remaining concerns
- The q0032 model is illustrative, and the text says so. Its "just under target" margin is about 2 mΩ.
- q0062 uses "leakage doubles every ~10 °C" as a rule of thumb. Diffusion-dominated leakage can double faster.
