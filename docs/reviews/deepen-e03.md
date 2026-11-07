# Deepen review e03: power supplies (capacitors, LDO vs buck, TRIAC, efficiency, DCM, inductors)

Scope: the `::: deep` additions in the 19 ids of docs/deepen/e03.txt (diff against 65d169b), plus the small edits in q0159, q0194 and q0199. I recomputed every new number with node (numerical integration for the q0189 ripple claims), screenshotted the 7 new figures, and checked every page for `.katex-error` and for unrendered `$` or `\command` text in the rendered deep section. Result: 0 KaTeX errors and no stray math text on any page, so the `$`-mangling repair holds. `validate-content` reports 0 errors.

| id | Result |
|---|---|
| q0143 | OK. SRF 232 kHz, ESR corner 113 kHz, droop 72/4/3 mV and 68+60 = 128 mV all check out. The impedance plot matches the formula and the caption. |
| q0147 | Charge-pump table row rewritten. It said "cannot step down 12 V to 3.3 V at 2 A efficiently", which is too absolute: the real issue is that charge pumps are fixed-ratio and 12/3.3 is not a clean ratio. LDO-vs-buck saving at 200 mA corrected from 0.2 W to about 0.26 W. |
| q0148 | OK. Zener 68 Ω, 53%, 13 mV; r_o/(1+T) = 10 mΩ; τ = 314 µs; 0.47 V step all verified. |
| q0155 | OK. Every row of the efficiency table, the peak at 0.548 A (96.4%), the plot points and the RSS uncertainty were verified. The plot matches the equation. |
| q0159 | Firing-angle plot caption was wrong. It said the last 10% of power is crammed into the last 45° and called dimmers "touchy at the low end". In fact dp/dα = −2sin²α/π, so the curve is flat at both ends (each 45° end band is only about 9%) and steepest at 90°. Caption rewritten. Holding current changed from "about tens of mA" to "a few to tens of mA". PFC threshold note now says lighting has tighter, lower-power limits (it is not a 75 W class). Integral, table and PFC currents verified. |
| q0175 | Timing diagram was reworked so it shows a full hand-over sequence: G_L starts high, then dead time, G_H, dead time, G_L. The old version started in an unexplained dead time. Caption wording adjusted to match. L = 7.98 µH, 8.2 µH → 0.58 A, C = 7.3 µF, I_rms = 0.89 A, hot-loop spike 2 V and 8 V verified. |
| q0176 | Battery plot caption said the curves "diverge" above the crossover. On the log-log plot they run parallel with a fixed ratio of 1.85. Caption corrected. Runtime (20 h vs 36 h), the 52 µA crossover and the f_max values were verified. |
| q0180 | OK. Dead-time 13.6 mV / 2.3 ns / 28 mW (and the 2 MHz values), feed-forward 4.125 V and dD/dVin = −0.023/V verified. |
| q0187 | OK. Ripple 1.02 A, RMS values, extremum timing (275 ns / 1.275 µs), forced-CCM −0.21 to 0.81 A and 3 mW verified. The plot matches. |
| q0188 | "As in the third figure above" pointed at the wrong figure; it now names the V_in = 6/12/24 V figure. The saturation bench bullet looked for a kink on the falling edge; it now checks the rising ramp near the peak and separates saturation from current-limit truncation. Flux and volt-second numbers (4.8 µV·s) and the slope numbers verified. |
| q0189 | Numerical integration confirms 21.6 mV (12 µF, 5 mΩ), 50.9 mV (22 µF, 50 mΩ) and 12.3 mV. Softened "datasheet ripple is quoted at 20 MHz" to "commonly". Reworded a self-contradictory bench bullet about measuring with the load applied (the actual reason is to avoid DCM or pulse skipping). |
| q0190 | Fixed a wrong claim. It said the voltage "spends different times falling than rising". In fact the capacitor charges for 1 µs and discharges for 1 µs; only the arc shape is lopsided. Load-step droop 12.3 mV, overshoot 32.4 mV (ratio 2.64) and DCM D = 0.211, 0.78 A peak, 0.46 µs gap, 6.3 mV verified. |
| q0192 | OK. The p_L plot matches (21.8, −8.3 → −4.9 W). Energy ledger 13.2/3.63/9.57 µJ, cap 0.84 µJ, 61 mW DCR loss and the skew error (31 mW at 5 ns) verified. |
| q0193 | "A cleaner cable" changed to "a lower-resistance cable". The LISN bullet said a large loop shows up "above 30 MHz", which is outside the conducted band; it now reads "top of the conducted band (to 30 MHz) and radiated above". The 199/45/6 mV figures, f0 = 50 kHz, Z0 = 0.316 Ω, R_in = −19.6 Ω and Q = 3.2 verified. |
| q0194 | OK. The 17 mV fix is correct. The ripple-ratio table (L, peak, ΔV, energy) and the tolerance stack (1.41 A / 1.68 A / 38.9 + 8.4 mV) verified. |
| q0195 | "As in the table at the top" changed to "the state table above". The slope/time/ripple table and the blanking numbers (0.19 A, 3.7 mV) verified. |
| q0196 | OK. DVS slopes, C from slope (22 / 12 µF) and the harmonic-rolloff argument verified. |
| q0197 | OK. 113 MHz / 7.1 Ω / 22.5 V → 28 V derating, loss table, 11% vs 0.4% verified. |
| q0199 | OK. Ring 6.0 / 10.4 / 4.2 MHz, Z0 = 177 Ω, comparator offset 0.2 / 0.13 A, 13 mΩ at 100 °C and the 3% probe shift verified. |

Figures checked: q0143 #2, q0155 #2, q0159 #2, q0176 #2, q0187 #4 and q0192 #3 plots, and the q0175 #3 timing diagram. All render and match their equations; two captions were fixed (q0159, q0176) and the q0175 diagram was reworked.

Remaining concerns (minor, not changed):
- q0148: the "79 mV the divider passes" is the unloaded ratio (3.93/5). With the 20 mA load fitted the incremental ratio is about 0.66 (66 mV). The comparison still holds.
- q0155: "wrong by 70% at 10 mA" means the true input current is 72% higher than the 90% estimate; the wording is loose but defensible.
- q0175 and q0197 use Schottky drops of 0.4 V and 0.5 V in different sentences; both are typical.
