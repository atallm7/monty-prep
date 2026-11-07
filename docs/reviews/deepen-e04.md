# Deepen review e04: rectifiers, buck/boost design, losses, multiphase, LDOs, battery

Scope: the `::: deep` additions in commit 2c554fb (diff against 65d169b) for the 19 ids in docs/deepen/e04.txt. I recomputed every new number with node. That covered the loss budgets, the snubber and ring, the PM-vs-C table (I rebuilt the type III and delay model and it matches to within 1°), the 20 A step budget, the Li-ion dropout knee, and the battery life figures. I also checked the new plots for q0203 and q0247 in the browser. `validate-content` reports 0 errors.

| id | Result |
|---|---|
| q0200 | The UNCERTAIN callout cited a "5 nH" figure that the section never uses. Reworded it to "few-nH loop inductance". All numbers OK. |
| q0201 | OK. The budget sums to 180 mW, which gives 97.3%. With a Schottky it gives about 90%. The boot cap is 24 nF and the PFET gate term is 37 mW. |
| q0202 | OK. Checked the diode selection, 33 °C rise, Qrr 0.30 W, the 0.125 µJ coil kick and the 62 mW / 7.4 W scaling. |
| q0203 | Fixed the claim that the listed fixed losses "sum near 110 mW". They actually sum to about 140 mW at 2 A. 110 mW is now stated as an assumed round figure that sits inside the page's 100–150 mW range. Fixed the GaN sentence: GaN helps through low Qg and zero Qrr, but its reverse (third-quadrant) drop is about 2 V or more, so it makes the dead-time term worse. The efficiency figures (94.3/84.7/59/22%, PFM 92%) are correct, and the plot renders and matches them. |
| q0204 | OK. Checked 3.41 V, Dmax 0.85 giving 4.0 V, 3.69 V at 500 kHz, the RC turn-off table, and the boot droop of 0.06 V and 1 ms. |
| q0205 | The model table is correct (1.23 / 0.94 / 0.93 W, optimum A_H = 0.43, 89.8% vs 91.8%). Fixed the limiting case: at D = 0.5 only the conduction part of the model is symmetric. |
| q0208 | The ring numbers are correct: 145 MHz, Z0 = 2.7 Ω, 4.1 V overshoot, 3.4 nJ, and a 0.10 W snubber. Fixed a wrong probing claim. A long ground lead does not lower the board's ring to about 70 MHz. A 15 cm lead is about 100 nH, which resonates with the probe tip near 160 MHz and adds its own ringing. |
| q0211 | Added "12 V rail" to the LDO heat-budget headroom, because the surrounding text uses an 11.1 V pack. All numbers OK: 1.25 h vs 3.93 h, 80.8% cascade, 3.7 V crossover. |
| q0216 | OK. Checked b = 1.52e9, f_opt = 224 kHz, the 65.5 mΩ derivation (60·0.275 + 40·0.725 + 20) and the DC-bias ripple of 26 / 7.8 mV. |
| q0217 | The copper row saves 20 mW, which is larger than the dead-time row (it said "as large as"). I also noted that this row only applies if the layout adds 10 mΩ. Corrected the ESR swap saving from 0.3 mW to under 0.2 mW, and the 5 A FET conduction from 1.1 W to 1.2 W. |
| q0218 | OK. Checked the LSB and PSRR table, the LC filter (−39.8 dB), the Q = 12.6 peak of 22 dB, and the 6 mV C·dv/dt spike. |
| q0236 | Fixed the phase-imbalance arithmetic. With the loop holding the 60 A total, a 12 mV duty error moves the bad phase by 6 A (to 21 A, with the others at 13 A), not 8 A to 23 A. Added the 15 mV ESR step to the 30 A load-step estimate (about 21 mV total) and updated the bench comparison to match. Ripple numbers (2.8 vs 6.3 mV) are OK. |
| q0247 | OK. I rebuilt the model independently and the PM table and plot points match (5/29/44/45/36/24°; 62° without the delay). Q = 5.2, and 9.5 at light load. The plot renders. |
| q0248 | The step-up budget is correct: 7.4 µC, 736 µF, 1.46 mF cross-check, 336 µF with a 100 ns delay. Fixed the release paragraph. It now says the total overshoot is about 48 mV, outside the 30 mV window, and needs about 2.1 mF. It also corrected the load-line (AVP) explanation. This section is consistent with the page's 2 A example. The 71/76 mV simulation numbers and the 0.46ΔI/(2πf_cC) rule are untouched, so q0249's citations still hold. |
| q0256 | OK. Checked the 0.75 W IC budget, 91%, the 115 / 145 °C junction, the divider error (0.76 factor, about 3.4% worst case) and the 79 µA divider drain. |
| q0274 | The overlap loss used the peak current for the whole 10 ns. Recomputed it with turn-on at the valley and turn-off at the peak: 58 mW, not 74 mW. Totals are now 578 / 453 mW and 91.2% / 93.0%, and the 1.8-point sync gain is unchanged. Corrected the comparison for the electrolytic ESR loss. |
| q0277 | OK. Checked the hot pass device at 0.52 Ω, the knee table (3.37 / 3.66 / 4.02 V) and the I_Q table (14.9% / 81%, 2.9 / 15.6 years). |
| q0279 | The simulator is above the new section, not below; fixed. The follow-up scenario quotes 70 dB at DC, but the new text called it "the datasheet's 60 dB". Reconciled this as 70 dB for the datasheet and 60 dB for the model. The loop table, the 64 mV step and the thermal numbers are OK. |
| q0283 | OK on the numbers: 374 h, the buck at 436 / 395 / 364 h, the 3.59 V crossover, and 2.0 vs 1.6 years for the sleepy node. Replaced the wording "terrible 89% active efficiency" with a fair comparison. |

Remaining concerns (minor):
- q0247 plot: the "30°" hline label overlaps the curve at the right edge. This is cosmetic.
- q0216: the 276 kHz optimum and the 93.8 / 93.9 / 93.5% values come from the page's own full model. They match the existing table, but I could not regenerate them independently.
