# QA review: deepen batch d01 (multiphase/buck and power pages)

Scope: the expanded `::: deep` sections of q0129, q0163, q0191, q0219, q0237, q0238, q0239, q0240, q0241, q0242, q0243 and q0244. I also checked that each deep section agrees with the rest of its page and with the shared 12 V to 1 V, 60 A loss model in q0241.

Method: I recomputed every equation, table and worked example with `node`. That covered:
- the ripple-cancellation factor κ, checked against a brute-force sum of shifted triangles for six (N, D) pairs;
- loss against load and phase count, including the break-even currents and the energy-weighted profile;
- the current-sharing loop: plant τ, crossover, K_i and the closed-loop damping;
- electro-thermal feedback;
- overshoot against sag, and the slew-versus-loop crossover;
- the PM-to-ζ relations and the q0244 type III Bode coefficients. A numerical sweep gives crossover at 40.0 kHz with PM 53.1°.

I screenshot the new plots on the dev server: q0163 fig 2, q0237 fig 1, q0239 fig 2, and q0242 figs 0 and 1 (both rewritten). All of them render and match their equations. `validate-content.mjs` on all 12 ids: 0 errors, and no warnings for these ids.

- **q0129**: The slope derivative (−10 dB/dec at the corner, 66°/decade phase), the anti-alias table, the cascade figures (644 Hz buffered, 374 Hz unbuffered) and the probe-loading numbers all check out. One fix: the probe bullet used a "100 kΩ / 1 nF filter node" that appeared nowhere else on the page. It is now introduced as a higher-impedance version of the filter, with f_c = 1.59 kHz.
- **q0163**: The loss model, η peak (1.12 A, 97.4%), worked examples and cascade (48.2%) are correct. Fixed:
  - The table gave 97.4% at 1 A. It is 97.3% (the peak is 97.4% at 1.12 A).
  - The RSS efficiency uncertainty was given as ±0.67% of value / ±0.64 points. It is ±0.71% / ±0.67 points.
  - "the earlier followup" now reads "the follow-up below", because the follow-ups come after the deep section.
- **q0191**: OK. Verified the slopes (1.85 and −0.70 A/µs), ΔI = 1.02 A, the 5.2 / 14.8 / 9.57 µJ energies, the DCM boundary at 0.51 A, the DCR-sense numbers (470 µs, 14.9–25.1 mV), the dead-time 17 mA and the diode-drop duty cycle (0.299).
- **q0219**: Fixed:
  - In the stored-energy table, the 140% row is 1.71 µH and 9.9 µJ (it said 1.70 µH and 9.8 µJ).
  - An earlier figure caption said 60% ripple gives "about half the volume". The new table shows only 36% less stored energy, so the caption now points to the table.
  - The garbled bench tip "AC-coupled mode with 1:1 averaging off" is rewritten.

  The ripple budget (78 mV pp, ratio 1.4), the harmonics (−19 and −28 dB), the LED RMS and the input-cap figures are correct.
- **q0237**: The κ derivation is correct. It matches brute force to four digits (0.727 at N = 4, D = 1/12; 0.84 for 3.3 V from 24 V). The input-cap RMS (16.6 → 7.07 A) and the 614/153 µF and 845 µF sag figures also check out. I reworded the writer's first-person "I checked this against a brute-force sum…".
- **q0238**: The balance plant (τ = 150 µs, pole 1.06 kHz), the 3000 A per unit duty gain, K_i = 1.24 and PM 63° are all correct. Fixed:
  - The closed-loop decay was stated as "≈270 µs" from 1/(3000K_i). The loop is actually second-order with ζ ≈ 0.67 and an envelope of 2τ = 300 µs. The text and the bench step now say this.
  - The thermal-sharing example said "a 0.86 A shift from equal sharing". Each phase is actually 0.43 A off, a 0.85 A difference between them.
  - "the same 13% found in the previous section" now points to the technical section, where that 13% actually appears.
- **q0239**: The loss table, the break-evens (17/30/42/55 A), N*, the 0.9 V/150 A selection (N = 6, κ = 0.59) and the on-time figures are correct. Fixed:
  - Trigger 1 said conduction is "the main loss mechanism". That contradicts q0241, where switching (3.6 W) is the largest term at 12 V to 1 V. It is now phrased as I² and I scaling, with a link to q0241.
  - A muddled sentence about "5% inductance tolerance would tip it" is rewritten. N_tr = 4.05 sits just above 4, so a 1.3% low L or the usual ±20% tolerance decides whether 4 phases would do.
- **q0240**: The numbers are correct (I_pk 24.1/24.8/25.8 A, copper 0.49 mΩ/sq, 78 mV/6.3 W, Cin 9.4 vs 22.1 A, N−1 at 26.7 A). I added one sentence: the "loss per device falls as N²" table counts conduction only. With switching included, the per-device factor lies between N and N². For four phases on q0241's model it is 8.75 → 1.27 W, a factor of 6.9. This keeps the page consistent with q0242.
- **q0241**: OK. Verified the break-evens (8.4/14.6/20.6 A; 2-vs-4 at 16.8 A), the ripple-RMS conduction (8.9 → 26 mW), the energy-weighted profile (12.50 vs 12.41 W, 92.0% vs 92.7%, +0.64 pt) and the 1 A idle case (79.3% vs 90.0%).
- **q0242**: **The known issue is resolved at the source.** The one-stage comparison used the four-phase total (5.08 W) as the single-stage dissipation. It now uses one stage on the same parts: 3.6 W switching + 60²·1.417 mΩ = 5.10 W conduction + 0.05 W gate = **8.75 W**, giving 0.29 W/mm² and ΔT = 219 °C, against 1.27 W and 32 °C per stage for four phases. The per-package loss falls by 6.9, not 4. The appended "like-for-like correction" section is deleted. Everything that depended on the old figure is now consistent with 8.75 W:
  - testing, why, answer, short and long. The answer no longer claims that multiphase never reduces total heat: the total is lower at full load and can be higher at light load.
  - the technical worked example and temperature-feedback line;
  - the SVG labels and caption;
  - the hot-spot plot, now P_ph(N) = 3.6/N + 5.10/N² + 0.05;
  - the assumptions, one quiz item (now 8.75 W → 0.292 W/mm²) and the true/false explanation.

  The board-spreading section now says plainly that it holds the total at 5.08 W to isolate geometry, and it notes the 8.75 W case (144 °C). I also fixed an existing error: thermal coupling makes the inner stage "about 10% above" the isolated figure, but 39.4/31.8 is 24%. The electro-thermal table (32.8 °C; loop gain 0.51 → 446 °C) and the spreading math were already correct.
- **q0243**: The slews, sag and overshoot (12.3/3.1 mV; 127/33 mV), the plot peak (k = 0.459, 11 mV), the slew-vs-loop crossover (537 kHz) and the capacitor sizing (1.46 mF, 40 mV release, 1.97 mF) are correct. Fixed:
  - The phase-overlap paragraph implied that interleaving inherently limits slew to 26.7 A/µs. It now says this is the limit when the controller keeps non-overlapping T/N slots, which caps each duty at 1/N.
  - "measured droop sits somewhere above both numbers" now reads: the slew-limited value is a floor, and a linear loop lands near the loop-limited figure.
- **q0244**: The exact PM(ζ) table, overshoots, delay phase loss (14.4°, 18°, 36°, 7.2°), capacitor-derating shifts, the R_in = −39 Ω / −1.44 Ω Middlebrook example and the type III Bode PM (53.1°) are correct. Fixed: a note said the exact PM is "higher than the 100× rule at large ζ". The new exact table shows it is lower (ζ = 0.75 → 67.7°). The note now gives the right direction and says the shortcut table's 75° row really corresponds to ζ ≈ 0.95, with essentially no overshoot.

Remaining concerns:
- The q0242 single-stage case on the same parts is deliberately unrealistic. The page says so, and a real single-phase design would use more silicon.
- The q0239 plot's "3→4 at 42 A" marker refers to an N = 3 curve that is not drawn. The caption explains the break-evens, so I left it.
