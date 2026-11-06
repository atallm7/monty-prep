# QA review: deepen batch d00 (fundamentals)

Scope: the expanded `::: deep` sections of q0013, q0014, q0016, q0029, q0030, q0031, q0034, q0052, q0071, q0080, q0098 and q0125. I also checked that each deep section agrees with the rest of its page.

Method: I recomputed every equation, table and worked example with `node`. For q0016 that meant the full complex |Z| model, an |Z|-peak sweep against R/R0 and the Q values. For q0071 I recomputed the Arora mobility fit. For q0098 I solved the self-bias equation by bisection. For q0125 I ran a numerical loop-gain and phase-margin sweep for an integrator op-amp with C_in/C_f. I rendered every circuit with `preview-circuit.mjs`. I screenshot the new plots on the dev server: q0013 fig 3, q0029 fig 0, q0034 fig 1, plus q0016 fig 1, q0071 fig 0 and q0098 fig 1. All of them render and match their equations. Sim params match `src/sims/catalog.json`. `validate-content.mjs`: 0 errors.

- **q0013**: The potentiometer loading numbers (0.400, 0.488, 0.499; max deviation 12.2% / 1.4%), the NTC beta table, the divider voltages, dR/dT, self-heating, TCR, power and voltage limits and the EIA-96 code all check out, and the plot renders. One fix: "lead or termination inductance of a few nanohenries" contradicted q0016 (chip parts are 0.3–1 nH). It now reads "a fraction of a nanohenry for a chip, several nanohenries for a leaded part".
- **q0014**: OK. The diode operating point checks out: I = 12.0 mA at 0.6 V with I_s = 1e-12, static resistance 49.9 Ω, dynamic V_T/I = 2.15 Ω. Also correct: drift velocity, wire and trace resistance, sheet resistance, the winding-thermometer example (83.6 °C, ×1.31, −24% / +31%), Fermi mean free path (39 nm), Si resistivity estimate and Kelvin example.
- **q0016**: All |Z| values are verified (1.57 kΩ, 848 Ω, 100 Ω, 11 Ω at 1 GHz; 1 kΩ at 100 MHz = 996 − j62 Ω), as are L_eff and the |Z|²/R² = (1+u)/(1−u+u²) identity with its 2.5% and 10% values. Q = R0/R is correct, and so are the peak values L_s/(RC_p) of 700 Ω and 2 kΩ, f0 of 19 GHz and 2.25 GHz, the shunt, TIA and noise numbers. **One fix, in the deep and technical sections:** the claim that "for R > R0 (Q < 1) the response is overdamped and |Z| just rolls off with no peak" was wrong. At R = R0, |Z| still peaks about 47% above R. The peak above R disappears only above about 1.55·R0, and the poles become real only for R > 2R0 (Q < 0.5). Both sections now say this.
- **q0029**: OK. Verified the 335 Ω at 100 MHz, the Q·ω0L peak (2 MΩ, or 71 kΩ at Q = 50), the 318 Ω and 64 Ω above the SRF, the RL divider table, the f_c of 1.59 MHz, the capacitor mirror numbers, the ring test (13.0 MHz, C = 15.2 pF), the 10% deviation limit (about 3.3× below the SRF) and the 100 nH/0.5 pF choke SRF (712 MHz). The plot renders correctly.
- **q0030**: Fixed three things:
  - The anti-resonance series capacitance was given as 98.0 nF. It is 99.0 nF (f_ar = 9.2 MHz is unchanged).
  - In the DC-bias example, "two 22 µF + one 10 µF" gave only 54 µF against the 55 µF needed. It is now three 22 µF parts (66 µF nominal, about 26 µF effective).
  - A pointer said "uncertainty note above" when the note is below. It now says "DC-bias note below".

  The Q values (5 and 0.033), the via inductance (1.27 nH), the 10.5 MHz and 1.45 Ω figures, and the leakage and DA numbers are all correct.
- **q0031**: OK. Recomputed the target-impedance band table with a sweep (12.7–20.0, 9.9–25.5, 6.6–38.3, 3.1–82.6 MHz), the anti-resonance (10.6 MHz formula, 0.25 Ω peak at 10.5 MHz against about 85 mΩ for each part alone), the ESL extraction (1.03 nH, 1.76 nH) and the shunt-through S21 (−62 dB).
- **q0034**: The plot renders and matches its equation (the 0.905 droop and −0.095 undershoot are right). Fixed two things:
  - The coupling time constant RC_m = 50 Ω × 0.5 pF was given as "25 fs". It is 25 ps.
  - A nonsensical comparison ("not the 0.27 Hz that a 600 kΩ 'ideal' assumption would give") is replaced with the correct one: 15.0 Hz against 15.9 Hz for the 10 kΩ alone, and 8 Hz with a 10 kΩ source.

  The HPF table, the 39% droop, the τ for 1% droop (0.50 s, 50 µF), the 1.43 V crosstalk peak and the corner frequencies check out.
- **q0052**: OK. Verified Q = 21.6 and 2.4, the 26.7 dB peak, the 60.2 dB attenuation at 500 kHz for both loads, ΔI = 1.02 A, the time-domain (11.6 mV) and Fourier (11.4 mV) ripple cross-check, the 5.1 mV ESR term and the saturation numbers.
- **q0071**: **Fixed the mobility fit used throughout the page (deep, technical, followup and two quiz items).** The page labels it Caughey-Thomas/Arora, but it used Arora's μ0 as μ_max (88 + (1252 − 88)/…), so every mobility came out about 10% low. That gave ρ_n = 0.55 and ρ_p = 1.62 Ω·cm at 1e16 (ratio 2.96). That contradicted the rubric's "ratio ~2.8", the sim's model (about 2.8) and standard resistivity–doping data (about 0.5 / 1.4 Ω·cm). I corrected the plot formula to μ = μmin + μ0/(1+(N/Nref)^α) and recomputed:
  - the table (47/135, 0.51/1.43, 0.080/0.19, 0.024/0.044, 0.00068/0.0011);
  - μn ≈ 1220 and μp ≈ 437 at 1e16, ratio 2.8;
  - sheet resistance 803 / 1890 Ω/sq (8.0 / 18.9 kΩ for 10 squares);
  - four-point-probe V/I of 177 / 417 Ω;
  - the temperature example (0.51 → 1.0 Ω·cm);
  - the 1e19 followup (1340 → 114, 460 → 69);
  - the sim caption ("about 2.8");
  - the quiz numbers (0.512 Ω·cm for μ = 1220; 1890 Ω/sq).

  The effective-mass/τ decomposition and the Baliga scaling are fine.
- **q0080**: OK. Verified the LED switch (10.4 mA, 1.18 mA, forced β 8.8), V_BE = 0.715 V and 0.655 V, 17.9 mV per doubling, ±60 mV per decade of I_S, R_B = 2.5 kΩ, the PNP level-shift resistor (1.1 kΩ) and α. Circuit renders are correct: arrow directions, PNP current directions and LED polarity.
- **q0098**: The self-bias solution is verified: I_D = 1.00 mA at 1 kΩ, 1.53 mA at 500 Ω. Also correct: the V_t spread (0.68 / 1.34 mA), g_m = 2 mS, r_o × (1 + g_m R_S) = 150 kΩ, C_ox = 3.45 mF/m², the dose of 6.5e12 cm⁻² and the start-up resistor loss (138 mW). The circuit is electrically correct. Cosmetic fix: the "enhancement: 1 mA at 2 V" point label was clipped at the plot edge, so I shortened it to "1 mA at 2 V".
- **q0125**: Fixed the finite-gain numbers. With A = 1e5 the exact gain is 10.9988, an error of 0.011% (the page said 10.9990 and 0.009%). With A = 1e3 it is 10.88, an error of 1.1% (the page said 10.89 and 1%). The phase-margin claims are confirmed by numerical loop evaluation: no C_f gives crossover at 38 kHz and PM 25°; C_f = 0.4 pF gives 70°; C_f = 1 pF gives 90° at 91 kHz; 10 k/100 k gives 87°. The noise-gain zero is at 17.5 kHz, and the C_f rule of thumb gives 0.40 pF. The DC-error example (11 + 5 mV, then 11.5 mV) and the 1° phase limit (f_c/57) are correct.

Remaining concerns (minor, not changed):
- q0071: the plot's 2.8 reference line now sits slightly below the curve's light-doping plateau (2.9). Both are correct as stated.
- q0029: the figure caption calls the real-inductor trace "(accent)", which matches the series colour token but may read oddly to a learner.
