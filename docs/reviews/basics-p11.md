# QA review: basics primers, group p11 (q0464–q0505, PCB stack-ups, grounding, decoupling)

Method: I read each primer against its page's answer, technical section and worked examples. I recomputed every number with `node`, checked each `[[qNNNN]]` link against the linked page's title, and counted words without headings (an earlier count treated bullet dashes as words). Before this pass 29 primers were over 330 words; all 42 are now 291–330. `validate-content.mjs`: 0 errors.

The two primers that quote a 50 Ω microstrip width (q0474, q0491) both match their pages' IPC-2141 numbers (0.335 mm at h = 0.2 mm; about 3 mm / 2.99 mm at 1.6 mm), and now say "the page's quick formula (IPC-2141)". No other primer in this group quotes a trace width.

- **q0464**: Replaced the undefined "thermal resistance / K/W / dielectric" with a plain heat-path explanation (160 °C vs 1.5 °C, recomputed). Relinked FR-4 to q0470 and layer count to q0475. Tightened to under 330 words.
- **q0465**: Defined "strain" and stated the idea before the $d/R$ formula. Dropped a self-referential link. Tightened.
- **q0466**: Defined pads in the soldermask bullet, dropped the finish acronyms, linked soldermask and silkscreen.
- **q0467**: Explained what "100 squares" means, which had been used but never defined. Cleaned up the analogy's break point. Tightened.
- **q0468**: **Numeric error.** The primer said a 51 µm gold layer weighs 6.8 g. 6.8 g is the page's 35 µm figure; 51 µm would be 9.8 g. Reworded to the page's "gold as thick as the copper" case. Dropped the unused skin-effect term. Tightened.
- **q0469**: Defined dB, which the example relied on, and GHz. Swapped the unused thermal-conductivity term for dB.
- **q0470**: Replaced the undefined "1 oz copper" with "0.035 mm copper foil".
- **q0471**: OK.
- **q0472**: "IC" changed to "chip".
- **q0473**: Defined "pitch", which the example uses. It replaces the unused solder-paste term.
- **q0474**: The width now names IPC-2141. Gave "impedance" a real definition. Reference-plane link changed from q0022 (capacitance) to q0478.
- **q0475**: Rewrote the BGA escape example in plain words, defining BGA, pitch and via pad. EMI defined. Tightened from 349 words.
- **q0476**: (longest at 361) Replaced the hiker/sun-angle shadow analogy. It did not model the point: a high sun makes a short shadow whatever the plane height. The new analogy is a hand held low or high under a lamp, where spread grows with height. Stated the 80%-within-±3h rule in words before using it, with no formula. Defined crosstalk. Tightened to 330.
- **q0477**: Defined via, ps and Gb/s. Removed the wrong link for orthogonal routing (q0490 is about shielding). Tightened.
- **q0478**: Defined reactance and nH. Removed the weak q0489 link for loop area. Tightened.
- **q0479**: Defined impedance, via, Gb/s and resonance, and explained "quarter-wave" in words. Replaced the undefined "Nyquist" and "notch". Tightened.
- **q0480**: Defined capacitance, inductance and impedance plainly, and replaced the formula bullets. Replaced "droop" and "fast step".
- **q0481**: Removed the wrong BGA link (q0462 is PCB vs IC). Defined via pad. Spelled out the gap arithmetic.
- **q0482**: The example sized the trace at 0.30 mm, then computed the voltage drop on a 1 mm trace. Now it is consistent: the 0.30 mm trace drops 82 mV, and 1 mm gives 24 mV, the page's figure. Defined sheet resistance. Crosstalk now links q0565 instead of q0490. Tightened.
- **q0483**: Defined linear regulator, switching (buck) regulator and thermal resistance, which the example relies on. The example now covers both heat and noise. Tightened.
- **q0484**: Removed the wrong links (q0001 for reference, q0509 for ground bounce). Defined inductance. Tightened.
- **q0485**: Defined inductance and "microcontroller" (was "MCU"). Removed a weak via link. Tightened from 346.
- **q0486**: Replaced the undefined op-amp/pole/stability example ending with plain words ("slow the circuit and make it ring", which agrees with the page). Defined sheet resistance. Tightened. **Page fix:** the sim caption gave about 10 Ω and called the 12.6 Ω worked example "above" when it is below. The caption and the worked example now both explain that the sim derives about 16 nH (about 10 Ω) from the slot geometry, while the worked example uses the rougher 1 nH/mm rule (20 nH, 12.6 Ω). I checked the sim's model: two 10 mm partial-inductance legs × 98.7% blocked = 16.4 nH, which is 10.3 Ω at 100 MHz.
- **q0487**: Defined wavelength in words instead of an ε_eff formula. Removed the wrong link (q0474). Tightened from 339.
- **q0488**: Removed the weak q0489 link. Tightened.
- **q0489**: Removed the wrong ESD link (q0562 is radiated EMI). Defined inductance and stated $L\,di/dt$ in words. Clarified that the 31 mm is the antenna length. Tightened.
- **q0490**: Defined electric field and aggressor/victim, and replaced "eddy currents" and "skin depth" with plain wording. Removed two wrong links. The ratio is 9.2×, i.e. 19 dB, so "ten times less, 20 dB" became "about nine times less". **Page fix:** the same rounding is corrected in the worked example (line 215).
- **q0491**: The width now names IPC-2141. Defined impedance and replaced "fine-pitch". Tightened.
- **q0492**: Removed two wrong links (q0508 is decoupling symptoms, q0485 is grounding). Defined oscilloscope.
- **q0493**: Removed the wrong ground-loop link (q0492 is probe points). Defined ADC/LSB through "65,536 steps", and spelled out AGND/DGND. Tightened.
- **q0494**: Defined inductance, impedance and ADC/LSB, which the example uses. Tightened.
- **q0495**: Removed the wrong link (q0001 for common-impedance coupling). Explained the 20.8 mV daisy-chain sum in words instead of an unexplained bracket. Tightened.
- **q0496**: **Numeric error.** The primer said "ten times worse", but 0.64 V against 16–40 mV is 16 to 40 times worse. Fixed. Tightened from 358.
- **q0497**: Removed the wrong noise-margin link (q0004 is KCL/KVL). Replaced $R+j\omega L$ with plain words. Defined thresholds and ADC/LSB. Tightened.
- **q0498**: Removed the wrong links (q0001, q0509). Stated $L\,di/dt$ in words.
- **q0499**: Defined inductance, ADC/LSB and "squares". Rewrote the bounce budget in mA/ns. Tightened.
- **q0500**: Replaced the undefined CRC, watchdog, hysteresis, excitation and CMTI. Defined differential signaling, and dB inside CMRR.
- **q0501**: Removed the wrong links (q0030 for path inductance, q0506 for target impedance). Defined capacitor and inductance. Tightened from 356.
- **q0502**: Defined ESL and impedance, and dropped the dielectric-code term. Tightened.
- **q0503**: Made clear that 3 nH is the total loop (which gives 9.2 MHz and 1.9 Ω, as on the page). The plane-pair link now goes to q0480. Tightened.
- **q0504**: Replaced the undefined "0402" with "small". Defined inductance. Tightened.
- **q0505**: Removed the wrong PSRR link (q0142 is about many capacitors). Replaced PSRR, PLL, RMS and op-amp with plain terms. Defined ADC/LSB and RC filter. Tightened.
