# Deepen-pass review: group e01

Scope: the `::: deep` additions (diff against 65d169b) for the 19 ids in docs/deepen/e01.txt. Every new equation, table and worked number was recomputed with `node`. The new material adds no diagrams. `validate-content` reports 0 errors and no warnings for these ids. All deep sections are 1,490–1,910 words.

## Per-page results

- **q0065** OK. Checked the box-profile dose, the Arora mobility (94 cm²/V·s), 66 Ω/sq, the implant time (113 s), the 4.532 four-point factor and the B diffusion table. All correct.
- **q0066** OK. Checked the n_i-crossing temperatures, the (398/298)^2.4 = 2.0 resistance ratio and the pinch-resistor depletion depths (0.34/0.61/0.87 µm, ×1.47). All correct.
- **q0067** Fixed. The ionization table's 200 K column, and the P figures at 100 K and 50 K, held N_V/N_C fixed at their 300 K values. With the correct T^3/2 scaling: B 92 %, Al 79 %, Ga 74 %, In 11 % at 200 K, and P is about 68 % at 100 K and 5 % at 50 K (the writer had 89 % and 18 %). Added a note that the new example uses Al/Ga = 67/72 meV while the page's table gives 57/65 meV (both appear in the literature). The diffusivity table is correct for the stated D0/Ea, and those D0/Ea values match common textbook (Ghandhi/Sze-type) tables.
- **q0069** Fixed. The n_i ratio from 25 to 85 °C is about 50x, not 44x (the writer used 300 K as 25 °C). The diffusion-term factor is therefore about 2,600x, not 1,900x. Also changed "heavily doped base" to "heavily doped emitter (one-sided junction)". Is, the 0.717 V bias, the 0.714 V high-injection onset and the generation leakage all check out.
- **q0070** OK. Checked τn/τp, D_n/D_p, Cox = 8.6 fF/µm², Ec and the velocity-saturation table (57/20, 223/95, 409/226 µA/µm). All reproduce.
- **q0081** Fixed. The base-side Early depletion depths were wrong: they are 0.009/0.026/0.035 µm (Vbi ≈ 0.71 V), not 0.013/0.027/0.037 µm. The neutral base goes from 0.191 to 0.165 µm, a 16 % change in I_C rather than 14 %. V_A ≈ 70 V, β ≈ 99.5/198, I_S and V_BE = 0.78 V check.
- **q0082** Fixed. The emitter-bypass resistance formula left out the 1 kΩ source. Correct is R_E ∥ (r_e + (R_S∥R_th)/(β+1)) ≈ 39 Ω, giving a 41 Hz corner. The old formula actually evaluates to 144 Ω, not the 37 Ω stated. The loaded gain (−115/−83), Miller pole (0.9 MHz), coupling corners and headroom all check.
- **q0084** OK. Checked the V_A extraction, the small-signal set, the Q-point at 4.23 mA, and the I_S ∝ T³ result (×1.98 per 10 K, −1.8 mV/K). All correct.
- **q0085** OK. Checked Q_B, τ_F = 62.6 ps, C_de, C_j0 = 9.3 pF, C_µ ≈ 1.4 pF, f_T ≈ 0.77 GHz and the Gummel currents. All correct.
- **q0086** Fixed. Corrected the crossover-distortion THD (full Fourier/RMS computation): 59 / 23.6 / 8.9 / 4.4 % (was 59 / 23.5 / 8.7 / 4.1 %). The third-harmonic level at 5 V (−23 dB) and the lateral-PNP transit times are correct.
- **q0087** Fixed. The reverse-active row of the mode table contradicted itself: V_B = 0, V_C = 0.5 V gives a reverse-biased collector junction. Replaced it with V_B = −0.2 V, V_C = −0.85 V. The Ebers-Moll V_CE(sat) derivation and table (18–178 mV), and the storage-time cases (230/60/10 ns), are correct. τ_s = 100 ns and β_R = 2 are already labelled illustrative.
- **q0088** Fixed (wording). "Nearly all" of the I_C drift from V_BE is overstated: β alone moves I_C about 11 % of the 50 %. Changed to "most of it", added the β-only figure, and noted that β follows roughly T^1.5 and varies by part. The β-vs-T values 65/100/140 at −40/25/100 °C fit β ∝ T^1.5 (about 69/100/140) and the stated +0.5–1 %/K, so they are plausible. S_β, the I_C table and the Darlington numbers check.
- **q0099** Fixed. The triode device is about 330 Ω (1 V at 3 mA), not "250-ohm-ish". The quadratic, the λ case (3.08 V, 4.62 mA, gain −5.3), V_DS,sat = 0.75 V and the subthreshold swing all check.
- **q0100** Fixed. The mobility temperature coefficient was given as 0.3 %/K. Changed it to about 0.5 %/K, which matches the page's T^−1.5 to T^−2.4 range. Checked the R_S bias roots, the V_t/k sensitivity figures (4.40/4.00/3.60 mA and 4.88 mA), the AC-load-line swing and the power parabola. All correct.
- **q0103** Fixed. The finger example was inconsistent: it set up 40 × 4 µm fingers, computed a 2 µm finger at L = 0.18 µm, and W/L = 160 doesn't give W = 160 µm at that L. Redone with L = 1 µm: 1280 Ω for a single strip (430 Ω effective), 32 Ω per finger, about 0.27 Ω for 40 in parallel. The Pelgrom math (3.2 mV, 3.2 %) and the ~1 mV·µm per nm of oxide rule are fine and already marked UNCERTAIN.
- **q0110** OK. Checked the power budget, the leakage ×32 (64 mW), the alpha-power DVFS factors (0.775, 0.50), the short-circuit factor of about 250x and the LDO/buck figures. All correct.
- **q0113** Fixed. Rewrote the confused PWM-accuracy sentence: equal R_on values add to R, and only a mismatch or a DC load shifts the average. Also corrected the claim that a single R_on is best "near the middle of the swing": it is best in deep triode at the end of the edge. All timing, swing, current-limited-edge (84/245 ns), ripple and bounce numbers check.
- **q0114** Fixed (minor). Square-law V_IL = 1.41 V, V_IH = 1.89 V, 0.36 V margins, 61 µA static current, 3.26/0.04 V outputs, follower gain 0.90/0.88, R_out ≈ 1.3 kΩ and the 1/t tail times are all correct. The midpoint row's "0.95 V" output is arbitrary, because the ideal square law is indeterminate at V_M. Changed it to about 1.65 V with that caveat.
- **q0115** Fixed. 100 dB at A_d = 10 needs about 0.003 % matching, not "better than 0.001 %". The tail-pole CMRR at 10 kHz is 96 dB, not 98 dB. The in-amp (94 dB) and ECG numbers check.

## Physical constants checked

Si ionization energies (P 45, As 54, Sb ~40, B 45, In 160 meV; Al/Ga vary between references), N_C = 2.8e19 and N_V = 1.04e19 (flagged in the text as differing between references), n_i = 1e10 anchor, intrinsic D0/Ea for B/P/As/Sb, μ ∝ T^−2.4 (lightly doped electrons), Pelgrom rule of thumb, β_R and τ_s: all are standard or already marked `> [!UNCERTAIN]` or illustrative. No new UNCERTAIN callouts were needed beyond the in-text notes added in q0067 and q0088.

## Remaining concerns

- In q0115, "typical CMRR is about 2 to 3 times better than the worst-case bound" with random resistor errors is a reasonable but loose statistical claim.
- In q0085, the "C_je ≈ 2·C_j0" forward-bias approximation is rough. It is flagged.
