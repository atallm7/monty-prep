# Basics review: group p09 (q0380–q0421)

Method: I read every basics block against the page's answer, short answer and the relevant technical lines. I recomputed every number in "The simplest example" with node (stepper pulse rates, lead-screw torque, holding deflection, RMS torque, encoder counts, emissivity readings, I²t trip times, braking time constants, clamp decay times, switching-loss ceilings, ripple), and checked every `[[qNNNN]]` link against the target page's title. All numbers matched the pages. Result: 42 pages: 1 OK, 41 fixed. The main problem was undefined jargon: the later power-electronics pages (q0409–q0421) used MOSFET, gate, PWM, ADC, Zener, rms, inductance, BV_DSS, Q_gd, SOA, synchronous rectification and similar terms without defining them. Several blocks went over 330 words once the definitions were added, so I tightened them. All are now at or under 330. Validator: 0 errors.

Changes:
- q0380: Defined "winding" in the Driver bullet. STEP now says one step "or one microstep", which matches the 3200-pulse example.
- q0381: Replaced "losing sync" with "skipping steps". Swapped the generic Safety-margin bullet for Torque-speed curve, which the example relies on. Explained how the 20 N force becomes 0.075 N·m (the screw and its losses).
- q0382: Defined rotor. The overload slip is now "7.2 degrees, or a multiple of it", because the rotor can jump more than one cycle. "Windings" became "coils".
- q0383: Dropped the unexplained "proportional-integral-derivative". The Controller bullet now gives the simple proportional rule and names PID.
- q0384: Replaced the jargon "jitter" and the bridge's "gain, damping and backlash" with plain wording.
- q0385: OK (1.47 + 0.44 = 1.91 N·m, 2× gives 3.8 N·m).
- q0386: The Holding-torque and Continuous/peak bullets were not used in the block. Replaced them with Stepper (link q0376) and Phase (winding), which the 9 W example uses.
- q0387: "Compare value" was undefined. The example now says "end each pulse after 1500 ticks" and names the prescaler.
- q0388: Added Inertia (kg·m² was undefined). Folded reflected inertia into the Gear-ratio bullet. Dropped the unused Back-EMF bullet. Explained rad/s².
- q0389: Added Encoder. Removed "loop gain" and "feedforward". Backlash text: the old "far more than the encoder could ever resolve" was confused. It now says the motor-side encoder cannot see the slop.
- q0390: K/s became °C per second. Defined the winding in the Stall bullet. "Clamp" is now explained.
- q0391: Defined torque, horn, rotor, transistor and "floats". Dropped the undefined inertia term from the example. The 9.9 J figure is kept.
- q0392: Kelvin became °C. Explained rad/s. Removed the Current-ripple bullet, which used PWM undefined and was not used in the example.
- q0393: Replaced the Kelvin-connection bullet ("trace", unused in the block) with Gain, which the example uses. Explained 12-bit. Removed jargon from the bridge.
- q0394: The trip times (52 s, 95 s) depend on a 2-minute thermal time constant that the block never stated. Added it with a plain definition. Rewrote the Hardware-trip bullet without "comparator and latch". Tightened.
- q0395: Fixed the stray ",." typo. Defined ADC, PWM and the flyback diode. Explained 12-bit.
- q0396: Added Voltage divider (link q0008, the example's circuit) in place of the RTD bullet, which the block never used. "ADC node" became "midpoint". K became °C.
- q0397: Removed flux, kelvin and K_t from the example. Defined the transistors.
- q0398: The K_e bullet never defined back-EMF. It is now a Back-EMF bullet. "Fibre" changed to American "fiber". Defined the winding.
- q0399: Rewrote the example without K_t = K_e notation. Replaced the unused L10 bullet with Insulation, which the block relies on.
- q0400: Added a Back-EMF bullet: it was used undefined and drives all three examples. Dropped the unused Soft-start bullet. Defined winding and rotor.
- q0401: Showed where 200 ampere-turns comes from (50 mm² × 4 A/mm²). "Cook the coil in under a minute" became "heats it 100 °C in under a minute", which matches the page's 51 s figure. K became °C.
- q0402: Added Back-EMF. Rewrote the example without the unitless "K_t = K_e = 0.02" and explained rad/s. Tightened.
- q0403: Defined encoder and Hall sensor. Removed "M/T hybrid" and "current-ripple counting" from the bridge.
- q0404: Explained "decoded 4 times" and "pole pairs/Hall sensors" in the example (6 states × 7 = 42 per turn, 8.6°). Defined potentiometer.
- q0405: Defined square waves. Removed "CPU interrupts", "state machine", "M/T" and "line drivers".
- q0406: Replaced "differentiate", "tachometer" and the dL/dx formula in the Motional-EMF bullet with plain wording. Fixed the bridge's missing "and".
- q0407: Added Inductance. It was the whole basis of the self-sensing example but was never defined. Simplified the LVDT and linear-Hall bullets. Tightened.
- q0408: Defined PWM, ADC and rad/s. Dropped the duplicate Blanking-time bullet. Replaced the bridge's "IR correction".
- q0409: Defined MOSFET, low-side, time constant and PWM. The Inrush bullet relied on undefined back-EMF. Fixed the broken bridge ending "PWM ripple,.". Tightened.
- q0410: Defined low-side switches, K_e units and "exponentially / time constant". Replaced "bus pumping".
- q0411: Added PWM. Defined leg. Removed "freewheel paths, high-side gate drive, MCU" jargon from the bridge.
- q0412: Removed the undefined "K" and "controlled bridge". The 240 rpm load result now states its point: electrical braking cannot hold. Replaced "bus pumping".
- q0413: The coil resistance (12 Ω) behind 1.58/0.21 ms was missing. Added it. Defined Zener, gate and regeneration. Dropped the unused Snubber ("ringing") bullet.
- q0414: Rewrote the Words list in plain terms (relay, SSR, MOSFET, BJT/IGBT, PWM), replacing R_DS(on)/V_CE(sat) symbols. Removed "saturation", "base drive", "triac" and "DC arc". Tightened.
- q0415: Defined Zener/TVS and air gap. Noted the 1 ms release from hold current. The 22.5 ms cycle total uses that figure, not 4 ms.
- q0416: Defined IC and junction. Replaced the symbol bullets. Dropped OCP/OTP/UVLO and gate driver in favor of terms the example uses (thermal shutdown).
- q0417: Rewrote the Words list without BV_DSS, Q_g/Q_gd/Miller, SOA, linear mode or rms. Fixed "roughly 20 °C": (0.4 + 0.06) W × 50 °C/W is about 23 °C.
- q0418: Rewrote the Words list without formulas, "complementary", "sense blanking" or "gate network". Defined EMI and thermal budget. Clarified "100 ns edges" as total switching time per cycle.
- q0419: Large rewrite for level. Explained the edge-time example in words (2 V / 47 Ω ≈ 43 mA, 5 nC / 43 mA ≈ 117 ns). Removed undefined synchronous rectification, Q_gd, plateau, three-level and FOM. Defined ringing. Tightened from 382 to 330 words.
- q0420: Added Node. Defined MOSFET in passing.
- q0421: Added Inductive load. Defined MOSFET. Replaced the dense ripple formula with the result (about 0.11 A). Added the missing "That is the whole idea" and removed "floating high-side gate supply" and "buck" jargon from the bridge.

Open: none. The source typos in titles and interpretations (for example "H-bidge") were left as they are, on purpose.
