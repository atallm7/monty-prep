# QA review: deepen pass e06 (DC/BLDC/stepper motors, drivers, servos)

Scope: the `::: deep` additions on the 19 pages in `docs/deepen/e06.txt` (diff against 65d169b). Every new equation and number was recomputed with node. Thermal, start-up and plugging claims were checked by numerically integrating the ODEs. Embedded sims and the new plots were screenshotted. `validate-content` reports 0 errors and no warnings for these ids.

## Sim readouts (claims that existed before this pass)
- q0370 `dc-motor-lab` transient: the readout shows peak 81.2 A, steady 530 mA, τe = 2 ms. The caption ("about 81 A", "150 times 0.53 A") is correct.
- q0372 `bootstrap-driver`: Max duty reads 99.94% and hold time 13.3 ms. The caption ("about 99.9%") is correct.
- q0383 `servo-lab`: its model differs from the new page's worked example (τm = 30 ms, kp in duty/rad), so the claim "this is what the sim shows" was wrong (see below).

## Per page
- **q0337**: OK. Checked viscous no-load point (561 rad/s, 0.78 A), η_max = (1 − √(Inl/Istall))² = 63.3% with a derivation check, the 1 A and 5 A efficiencies, the hot-copper stall current and the ADC step.
- **q0338**: Stall with a 3 A current limit: the two-node model settles near **86 °C**, not 77 °C, and the loss rises 9 → 11 W (fixed). The adiabatic result with R(T) (6.8 s, 102 W, 8.5 A) and the two-node result (33 s, housing 85 °C) both reproduce.
- **q0339**: Softened "5 mJ is far above a small MOSFET's avalanche rating" to "at or beyond the repetitive rating of many small FETs; some have none". Decay times (3.2 ms diode, 0.45 ms Zener) verified with the exact exponential.
- **q0341**: OK (R drift 20% speed error, Kv→Ke, √3, electrical frequency, divider).
- **q0342**: OK (2.18 A at 1 ms, peak-and-hold 9 W, ripple 22.5 mA, 0.36 J).
- **q0343**: Two-motor start used the resistive bound (18.5 A, 2.8 V) and compared it with the second-order 1.4 V single start. With L the two motors give 17.2 A and a 2.6 V dip (fixed). The hold-up capacitor example used 5 ms although the dip lasts 22 ms. Recomputed for 22 ms (8.8 mF) and reframed it as the case where the regulator would actually drop out. The I²t (1.57 A²s) and the >5 A / >7 A durations (21.7 / 11.9 ms) verified by simulation.
- **q0344**: The new plot's y-axis (max 2) clipped the speed/50 trace, which starts at +11.5. Changed it to −26…14 and renamed the axis. The regeneration bullet wrongly said plugging pushes energy into the bus. Full-voltage plugging draws 3.45 J from the supply, while current-limited braking (back-EMF 11.5 V > IR 10 V) does regenerate. Rewrote it. Clarified the "current falls from −23.5 to −12 A" wording as magnitude, i(t) = −23.5e^(−t/τm). The 16.8 ms stop, 5.1 J = 1.65 J + 3.45 J and the 10 A-limit numbers are all verified.
- **q0349**: Marked the 2,400 steps/s corner as a rough criterion and noted that a full ±1.5 A reversal takes 0.38 ms. All other numbers are OK.
- **q0350**: OK (kinematics, 22.1 V headroom, RMS 1.50 A, Km, reflected mass 19.7 kg, 16 mN·m, encoder 5 µm / ~5 nm).
- **q0366**: "At 24 V the gain falls to a few percent" was wrong. With the page's assumptions the brush loss is 0.11 W, less than the 0.15 W controller loss, so the gain vanishes. Fixed. The 3.7 V runtimes (1.04 h / 1.35 h, +30%) are OK.
- **q0368**: Duty-cycle RMS current 13.2 A is **58%** above 8.33 A, not 79% (fixed, and noted 2.5× the copper loss). The hot-copper ΔT of 66 K, fan affinity and Kt-drop numbers are OK.
- **q0370**: Added the qualifier that six-step's 4.5% torque-per-amp penalty applies to sinusoidal-back-EMF motors. The locked-rotor, PWM and timing-error table are all verified.
- **q0372**: Current-sense offset: 100 µV across a 1 mΩ shunt is **0.1 A** of error, not 1.7 A. Fixed, and reframed it around 1–2 mV-offset amplifiers. Loss budget, bootstrap and capacitor-ripple numbers are OK.
- **q0376**: OK (deflection 0.53°, k = 22.5 N·m/rad, fn = 316/224 Hz, microstep dead zone ±0.05°).
- **q0378**: The edited self-locking sentence said the 8 mm-lead (η = 0.4) screw holds the load and only "multi-start" screws back-drive, but an 8 mm-lead screw *is* a 4-start Tr8×8. Thread mechanics with μ = 0.1–0.2 give a ~20° lead angle and η ≈ 0.6–0.75, so it back-drives, while a 2 mm lead (≈5°) self-locks. Rewrote it with the friction-angle condition and the <50% rule of thumb. The router example claimed 0.16 N·m "eats most of the margin". It actually exceeds the 0.1 N·m limit and nears the 0.2 N·m pull-out (fixed). Telescope and syringe numbers are OK.
- **q0380**: Made the swing-within-one-step criterion explicit, because each phase reverses every second step. Changed the rated-voltage claim from "a few hundred steps/s" to about 100 steps/s. The table, the 225 µs follow-up and the bulk-capacitor energy (31.2 V / 25.7 V) are verified.
- **q0383**: ζ = 0.071 / 0.42 / 0.70, overshoot 80 / 23 / 5%, Kd = 0.178, ts ≈ 40 ms and the plot formula are all correct, and the plot renders. Fixed the false "this is what the sim shows" (the sim gives ζ ≈ 0.2 and ~50% overshoot for kd = 0, kp = 20).
- **q0386**: The gearing claim ("torque falls faster than the ratio helps") was wrong for the page's one-pole curve. Torque falls about as 1/speed above the corner, so gearing roughly cancels and saturates at about 72% of the needed torque. Fixed. Also fixed the "volume and volume" typo. Kinematics, 0.26 N·m, 1.2 N·m and RMS 0.22 N·m are OK.
- **q0387**: Fixed the inverted "slowest tick" wording. The droop budget, timer (PSC 23, ARR 59,999) and slew limit are OK.

## Remaining concerns
- Several illustrative parameters (brush drop, thermal resistances, ESR) are labelled illustrative or UNCERTAIN, which is appropriate.
- q0387's droop budget adds the cable IR and the capacitor discharge as a conservative worst case. Physically, the capacitor supplies most of the step at first.
