# Review: deepen batch d02 (expanded `::: deep` sections)

Scope: q0245, q0246, q0249, q0250, q0251, q0252, q0253, q0254, q0255, q0284, q0285, q0286. I isolated the new deep-section text by diffing against the pre-expansion backup bundle, then recomputed every new equation and number with node. I also ran the buck-control sim model (`src/sims/models/buck-control.ts`) and a hand-written ideal-controller integration for q0249, plus a numerical switched-capacitor integration that confirms the coth R_out model for q0284. The new figures render correctly: q0245 (sensitivity plot and S Bode), q0249 (droop-floor plot, re-shot after the fix), q0251 (f_max vs V_in), q0284 (R_out vs f) and q0286 (timing). There are 0 KaTeX errors on all 12 pages, and `validate-content` reports 0 errors for these ids.

- **q0245**:
  - Crossover/PM-from-ζ table (0.716/59.2°, 0.821/47.6°, 0.914/33.3°, 0.990/11.4°) is OK, and so are the |S(jωc)| = 1/(2 sin(PM/2)) values (1.12, 1.31, 1.76, 2.88, 5.7; 1.87 at 31°), the scope-capture example (ζ = 0.078, 6.4×) and the delay phase (14.4°).
  - Fixed: the text said PM/100 "overstates ζ for large margins". It actually *under*states ζ there (ζ = 0.7 gives 65°, ζ = 1 gives 76°), and in the table it is good to about 10%, not "a few percent".
  - Fixed: the text said the ring frequency ωd is "80% to 99.5% of the crossover". Those are ωd/ωn values. ωd/ωc is actually 1.005 to 1.12, so the ring sits slightly *above* crossover.
- **q0246**:
  - Fixed: the exact-coefficient table had wrong f0 and decay values. f0 was shown falling with load, but it actually rises slightly because (R+r)/(R+R_L) < 1. Corrected values: 10.71/10.72/10.74 kHz, σ 3,513/6,402/9,594 s⁻¹, envelopes 285/156/104 µs, ring 10.70/10.68/10.63 kHz. Q values were OK.
  - Fixed (serious): the constant-power-load bullet used −V²/P = −10.9 Ω for 3.3 V at 1 A. 3.3 W gives −3.3 Ω. Then 1/Q = 0.0949 − 0.0958 ≈ −0.001: the filter has zero or negative damping (right at the |R_neg| > Z0²/(r+R_L) = 3.3 Ω edge), not "Q = 15.2". The bullet is rewritten with the Middlebrook framing.
  - Ripple (1.02 A, 5.4 mV, 10.2 mV, −60 vs −66.8 dB, ESR zero 339 kHz), R→0/large-ESR limits and the DCR-temperature check are OK.
- **q0249**: the known inconsistency is resolved. Details below.
- **q0250**: OK. Max-lead derivation, 30°/46.4° examples, the C_ff tolerance table (all 5 rows exact), FB ripple (4.8 mV vs 20 mV, 2.5%), the 131 kHz parasitic pole and the 796 kHz zero all check.
- **q0251**: the line-rejection numbers (0.825 V, 75 mV), the minimum-on-time table and plot (2.5 MHz/1.04 MHz/521 kHz/260 kHz), the COT example (167 ns, 1.83 A, 18 mV vs 1.8 mV) and the DPWM/ADC limit cycle (11.7 vs 3.2 mV, 3.6×, 28.8°) are OK. Added a caveat to the bench-identification bullets: adaptive-on-time COT parts look like fixed-frequency PWM in steady state, so only the load-step test separates them.
- **q0252**: the plant phase comparison (−171° vs −82°, |G| 0.93/0.85) and the Ridley Qp table (1.41/0.88/0.64/−3.2/1.59/0.64) are OK, as is the S_e = S_f → Qp = 2/π identity. Also OK: the DCR network (235 µs; 3.9 A trip hot) and the load-pole shift (103 Hz → 1.03 kHz). Clarified that the D = 0.6 rows assume a 7.2 V output, so S_n = 1.02 A/µs and S_f = 1.53 A/µs there.
- **q0253**: the α map, 11.4 cycles/57 µs, the boost D/(1−D), the ramp example (α = −0.49, no-ramp −1.94, 0.46 A limit loss) and the L-tolerance table (−0.66, −0.75) are OK. Softened "subharmonic oscillation does not respond to C_out/compensation" to "barely responds".
- **q0254**: the f_sw/2 spectral gain table (1/(1−a), 1/(1+a), 1/√(1−a²)), jitter (69/76/82 ns), settling cycles and line-dip growth (470×, 55×, 2.7e17, 5.8e5) are OK. Fixed: "saturates in about 5 cycles" at 5 V. The 100× growth takes about 7 cycles.
- **q0255**: the dead-beat tolerance table, the minimum-ramp −1.0 → −1.21, L_min (4.7/7.1/8.9 µH), the 0.35 µA ramp current, the current-limit table and the α-decay example are OK. Fixed: "trips at about 4.5 A in dropout". It is 4.5 A at D = 0.66 and about 4.4 A at D = 0.9.
- **q0284**:
  - Charge balance and power numbers (87.5 %, 82.5 mW), the derating table (8.17/8.46/11.79/17.19 Ω, 5.78→5.75 V, 5.42→4.88 V), gate-drive loss (3.3 mW) and the bench R_out (8.25 Ω) are OK.
  - The exact R_SSL·coth(R_SSL/R_FSL) model matches a time-domain switched-RC integration to 3 decimals.
  - Fixed caption: the RSS-vs-exact gap is largest at about 87 kHz (8.8%), not at the 125 kHz corner (7.7%).
- **q0285**: OK. The ½CΔV² example (100 nC, 0.1 V, 5 nJ, 5 mW = I²R_SSL), the Dickson node table (3.0/6.3, 6.0/9.3, 9.0/12.3 → 12.0 V), I_in = 4 × I_out, η 90.5 % and the stray-capacitance shortfall (2.75 V/stage, 10.35 V, 14 %) all check.
- **q0286**: the node-voltage audit, timing figure, switch-stress table and start-up diode are OK, and the overlap arithmetic checks (1.65 A, 33 nC, 16.5 mA, +41 %). Fixed: "lowers efficiency by a similar factor" now says efficiency is divided by 1.41 (a 29 % relative drop).

## q0249: the "81 mV floor" vs the 76 mV simulated overshoot

The simulation was right, and the "floor" was wrong. Finite step slew does not explain the gap. The buck-control model applies an instantaneous (piecewise-constant) load step, and the 71/76 mV figures come from the simulation described in q0248. The real error is in how the bound was built. It added the ΔI·ESR step (largest at t = 0) to the capacitive ΔI²L/(2CV_L) term (largest at t = T, when the capacitor current is zero). Those peaks never coincide. Maximizing v(t) = ESR·i_C + v_C gives the true floor ΔI²L/(2CV_L) + ESR²CV_L/(2L), valid when T > ESR·C.

For the 2 A release that floor is **62 mV**, and for the step-up it is **27 mV** (about 30 mV with the sim's 90 % duty clamp). A nonlinear ideal-controller integration that includes DCR and the rising v_out gives 61 mV and 27 mV. This matches q0248's own "60 mV ideal overshoot".

The page now:
- gives the corrected floor derivation;
- states 27/62 mV as the floors and calls 43/81 mV a conservative budgeting estimate, not a floor;
- removes the "finite slew rate" speculation;
- says the 76 mV overshoot sits 14 mV above the floor and the 71 mV undershoot about 44 mV above it;
- uses the corrected expression in the plot (with `max(ΔI·ESR, …)`), with the 100 mV crossing now at 2.5 A instead of 2.3 A;
- labels both simulated points without overlapping text;
- notes in the 3 A worked example that adding the full ESR term is conservative;
- updates the "How the numbers tie together" summary.

A second inconsistency turned up on q0249 while I checked this, and it is now fixed. The page's Z_out curve (Type III, 53°, peak 118 mΩ) and the embedded sim both use the K-factor design. That design gives about **135 mV** for a 2 A step (I ran the sim model at 53° and 55°). Yet the page claimed "a single step passes (71 mV)". The 71 mV belongs to the differently tuned loop in q0248. The technical example, the Z_out caption, the sim caption and the summary paragraph now say the Type III design's step is about 135 mV (over the 100 mV budget). They also attribute 71 mV to the q0248 loop.

## Remaining concerns

- q0249's step-response figure and table (71/76 mV, 8 µs, +22 mV) are not reproducible with the embedded simulator, because they come from the q0248 simulation with a different compensator. They are now labeled as such. A future pass could regenerate one consistent set from `buck-control.ts` (at 40 kHz/55° it gives about 135 mV, symmetric). That would ripple into q0248, which is out of scope.
- q0251 and q0255 use illustrative minimum on-time and ramp values, and both are already flagged with UNCERTAIN.
