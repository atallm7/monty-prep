# Deepen review e07

Scope: the `::: deep` additions (per `git diff HEAD`) on q0390–q0395, q0397, q0399, q0404, q0434, q0441, q0443, q0446–q0448, q0450, q0462, q0466, q0470. Every new equation and number was recomputed with node. The two new plots (q0390 release time vs clamp voltage, q0462 RC delay vs length) were screenshotted (`.figure` nth 2 on both pages) and render correctly; their curves match the stated formulas and the marked points. `validate-content` reports 0 errors and no warnings for these ids.

## Per page

- **q0390**: The Zener in the 30 V clamp absorbs about 5 mJ per release, not the whole 6.25 mJ, because the coil resistance takes the rest. Corrected that, and the 10 Hz power from 62 mW to about 50 mW. The I²t budget (505 A²s, 21 s and 63 s), the 24 s hot-copper integration, the release times (6.0, 0.69 and 0.38 ms) and the plot were already right.
- **q0391**: OK. Coast time 6.3 s, braking with τm = 0.08 s and 247 W, and the 210 A short all check.
- **q0392**: "a resistance error shows up almost one-for-one in speed" was wrong. The sensitivity is IR/(V−IR) ≈ 0.54, which matches the page's own 10 % → 5.4 % figure, so the sentence now says that. The numbers were right.
- **q0393**: Two fixes in the NTC example. (1) The text said 1 % resistor and 1 % thermistor tolerances give "a few kelvin" at the 3.2 mV/K slope. They actually give about 0.4 K each, and that error does not depend on the divider choice. The text now says this and adds the B-tolerance term (about 1.3 K). (2) "Self-heating is also lower than you might fear" contradicted the advice that followed it. Reworded: 6.7 mW against 0.04 mW in the 10 kΩ divider. Resistances (from B = 3950), slopes and the PWM ripple (0.29 A peak-to-peak) were right.
- **q0394**: The trip-time table had two errors. At 5 A with a 90 K budget the trip time is 43 s, not 36 s. At 3 A from a cold start the steady rise is 108 K, which is above the 105 K limit, so the motor does trip, at 430 s; the table said "never". The table and the sentence after it are fixed. The derating equilibrium (x = 25, 115 °C, 2.5 A) and the discrete-update check (51.69 s) were right.
- **q0395**: OK. CMRR error, the model-sensitivity numbers, the 80 µs RC and the 0.15 A ripple all check.
- **q0397**: OK. The thermal-runaway iteration (85/110/121/125 → 128 °C, 8.6 mΩ, 3.45 W), the closed form ΔT = RθP/(1−αRθP), loop gain 0.42 and 0.84 (750 K), the 71 K/W limit, the 1.80× hot copper loss and the back-EMF of 2.62 V cold and 2.30 V hot all check, and they agree with the page's 8 mΩ / 121 °C example.
- **q0399**: BPFO and BPFI formulas and values (160 and 240 Hz) are correct, as are 900 Hz commutator ripple and L10 × 0.58 = 3200 h. Three fixes: (1) the alarm paragraph called a 40 % (3σ) threshold "tighter" than the 10–20 % rule, when it is looser; reworded with the scatter needed for 10 %. (2) Added the caveat that with two brushes an odd segment count doubles the ripple count per revolution. (3) A flat spot on one bar is now described as a once-per-revolution modulation.
- **q0404**: The RSS total is 0.86°, not 0.87°. The atan2 gain-mismatch and offset errors (0.57° each) were confirmed numerically, and the encoder and Hall numbers check.
- **q0434**: A closing sentence said designing for worst-case CTR "costs LED power". It actually costs a larger pull-up; it is raising I_F that costs LED power. Reworded. The other numbers (3.72 mA, 0.56 mA, 8.4 kΩ, the 4.4× spread, 4 kHz PWM limit, 20 mA / 400 pC CMTI) check.
- **q0441**: The 4.44fNAB rule uses peak flux density, so "0.3 T of flux swing" now reads "peak flux density". The other numbers (3.33 V, 27.8 A, 3.3 A, fL = 3.8 Hz, gains and phases, the Rogowski 50 µV/A, 0.16 Hz corner, 1.2 % at 1 Hz) check.
- **q0443**: OK. The error budget (20 mA offset, 1.65 % gain error, 23 mA ≈ 12 % at 0.2 A) and L/R = 1 µs / 50 mV overshoot check.
- **q0446**: OK. 375 mΩ, 7.8 mΩ power limit, G = 75, 2.15 mA/LSB, the 7.5 mΩ variant and 13 kHz bandwidth check.
- **q0447**: The (1+G)/(4t) worst-case CMRR is the standard result, and 34, 82 and 62 dB check, as do 9.4 mV / 0.94 A, 480 µV / 48 mA, 114 dB and 132 dB. Two fixes: 100 mV on 3.3 V is about 124 counts at 12 bits, not 123; and the bench step had CMRR inverted (error ÷ applied voltage is 1/CMRR).
- **q0448**: OK. 1.68 factor, 10.9 mΩ, 197 mV, 39 A, 2.2× window, comparator offset ±1 A / ±0.46 A, 18 ns Miller time, and the self-heating figure, which agrees with q0397.
- **q0450**: OK. The error table, 20 mA output floor, 6.5 A with REF bias, G = 30 → 5.5 A / 3.15 V / 2.7 mA, and 1.75 µs rise time check.
- **q0462**: OK. The RC delays 4.8, 121 and 485 ps, the 48 ps with repeaters, 6.1 ps/mm, Z0 = 55 Ω, 0.15 mW against 1.6 mW, and the break-even volumes check. The plot renders correctly.
- **q0466**: The via-inductance formula 5.08·h·[ln(4h/d)+1] nH is applied in inches correctly (h = 0.063 in, d = 0.0118 in → 1.30 nH). 0.82 Ω at 100 MHz, the 1.26 mΩ barrel, sheet resistances and the 4.2 % / 0.4 % / 60 µm z-expansion also check. One fix: the new stack-up sum (1.555 mm) used 0.2 mm prepreg and a 1.0 mm core, while the technical section uses 210 µm and 1.065 mm (1.59 mm). The sentence now names both so they no longer conflict.
- **q0470**: OK. Parallel/series εr bounds (4.6/4.17, 4.32/3.93, 4.88/4.44), dielectric loss 0.085/0.43/1.07 dB/in, 69 ps skew, thermal-via 192 → 21 → 15 K/W, the 61 pF coupon and the 30 g board check.

## Remaining concerns

- q0392: the technical section's torque example (Kt = 0.02, I0 = 0.2 A) uses a different motor from the deep-section example (Kt = 0.025, I0 = 0.4 A). This was already on the page and is not wrong, but a reader may find it confusing.
- q0394: the derating curve (shutdown at 140 °C) and the "105 K rise limit" used elsewhere (130 °C at 25 °C ambient) imply slightly different absolute limits. This came from the earlier version of the page and is left as is.
