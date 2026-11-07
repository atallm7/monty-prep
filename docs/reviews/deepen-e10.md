# QA review: deepen pass e10

Scope: the 19 ids in docs/deepen/e10.txt, mainly the newly expanded `::: deep` sections (`git diff 65d169b`). I recomputed every new equation and number with node. For q0615 (first-order pad model), q0601 (40-point tour, NN + 2-opt, time model) and q0630 (series-RLC rise time) I wrote small simulations to check them. No new figures or sims were added in this pass, so I had no diagrams to re-render. `validate-content.mjs` reports 0 errors and 0 warnings.

| id | Result |
|---|---|
| q0598 | Numbers OK (7.26 nH lead, 0.5 V / 3.65 V, 14.3 / 1.96 MHz, 15.9 MHz SRF). Fixed the bench step "notch shifts down by about the extra inductance": the frequency moves as 1/√L, so you back out L from each notch and subtract. |
| q0599 | Numbers OK (0.0465 g/mm², 19%, 8×, 64 mm², 0.2 g). Rewrote the head-in-pillow description, which was garbled ("paste has gone paste-like"). Replaced "a higher setpoint on a power-limited iron fixes it without damaging the pad" with the correct remedies: bigger tip, higher-power iron, preheat. |
| q0601 | Re-simulated with several random 40-point sets: random about 4.6 s, optimized about 2.3–2.5 s, true-cost gain under 2%, so the table is plausible. Relabelled the 357 mm Chebyshev entry, which sat in a "Euclidean length" column. Fixed "4.8 s of pure motion": that is pick-and-place dwell, and travel is about a third of the 7.1 s total. Added 6/78 = 7.7%. |
| q0602 | OK (lag rτ, 28/60 °C, 3τ = 95%, belt speed 0.8 m/min, 67.5/45 s, √t intermetallic growth). |
| q0603 | Numbers OK (0.8 m/min, 107 vs 192 °C). Replaced the vague "rotate packages 90 degrees" with the standard wave-side orientation rules (chip terminations meet the wave together, SOIC long axis along travel, solder thieves). Removed the "wetting-balance check gives contact time" claim: a wetting balance is a solderability test. The tool is a wave-parameter plate. |
| q0609 | Guard error, Kelvin and stray-C numbers OK. **Break-even error:** the saving used 86 s (90 − 4) while the text said the ICT cycle is 10–15 s. Corrected to (90 − 12) s gives USD 1.30 per board and break-even at about 6,200 boards. Rewrote the confused "large electrolytic / ESR" paragraph (the example was a 100 nF part) to explain why a direct 10 Ω parallel path hides a 159 Ω capacitor. |
| q0615 | **Caption, table and text contradiction resolved at the source** (details below). Table re-simulated; one cell corrected (41.9 to 41.8 s). Clarified the torque example ("95% of pull before it has melted"). |
| q0617 | Table and bodge-wire numbers OK. "About five decades" changed to "more than four decades (20 µA to 300 mA)". Change-test sentence now says the 3.58 V assumes a 100 kΩ R₃. |
| q0618 | Damping and overshoot table verified (ζ 0.20/0.79/0.02/0.08; 52/1.7/94/78%). The "Ring frequency" column actually gave f₀, so I added the damped ring f₀√(1−ζ²): 308 MHz for the 50 Ω spring-tip row (barely visible), and the others are within 2%. Added the √(1−ζ²) caveat to the back-out-L trick. Removed the wrong reason for pickup overestimate ("the probe attenuates", but the 10× is compensated by the scope) and replaced it with the real ones (1/d field falloff, orientation, nearby return current). |
| q0619 | OK (0.99%, 159 kHz, 5.9%, 8.5 / 4.3 GHz, 1.33 A HBM). |
| q0622 | OK (scoring table, crystal pulling 30.4 ppm, 486 Hz, fixture cost per pad). |
| q0623 | Numbers OK (ρ 33.5%, 0.07 pF, 12.5 ps, 22.5°, 27.6 MHz, 12.7 ns). Named the conversion metric explicitly: mixed-mode \|Scd21\| = sin(φ/2) = 0.195, −14 dB. I checked this against the power-wave definition. |
| q0624 | Numbers OK. Fixed "17 s of a 130 s per-board cycle", because the section itself says the cycle is not the sum. It now ties the 17 s to the programming station. |
| q0629 | OK (5 µV after 60 dB CMRR, 2.4 µV / 0.009 µV magnetic). |
| q0630 | Rise-time paragraph was wrong. It claimed that shrinking L to about 2 nH with f₀ "a few GHz" would fix a 1 ns measurement. With R = 50 Ω and C = 10 pF, a smaller L only drives the rise toward 2.2RC = 1.1 ns (simulated: 0.76 ns at 12.8 nH, 0.88 at 5 nH, 1.01 at 2 nH). Rewrote it: below about 13 nH the limit is the 10 pF loading, so the fix is lower C or coax. Also: "factor of 65" corrected to 64; "origin of the guideline" changed to "consistent with"; "10× larger loop means 10× inductance and pickup" corrected to inductance tracking length and pickup tracking area. The writer's 31% to 30% change is kept (exact value 30.50%). |
| q0793 | OK (1 kHz tick, 0.047%, 11.8/9.5/7.3 bits, 15.3 Hz, 3162 Hz crossover, ppm drift). Softened "timers at a clock far above the CPU's". |
| q0795 | Numbers OK (86.8 µs, 72.2 µs, 21%, 430k/s). Corrected the W1C paragraph: the bug is read-modify-write on W1C, and the fix is a plain store of the mask. Qualified the FIFO deadline (it depends on the trigger level). |
| q0796 | Register walk verified: TIM2 IRQn 28 (STM32F1), table entry 0x0800_00B0, ISER[0] mask 0x1000_0000, IRQ 45 is ISER[1] bit 13, priority 2 with 4 bits gives 0x20, grouping semantics correct. Fixed "handler entry is at 0x...B0": that address is the vector-table word holding the handler address (Thumb bit set). Clarified VTOR versus the flash alias at 0. Noted 8-byte frame-alignment padding. |
| q0797 | AVR count verified (4 + 3 + 12 + 11 + 4 = 34, ATmega328P-style, avr-gcc, two registers), as are 2.1 µs vs 0.33 µs, ×6.4, and 3.3% / 21%. Stated the assumptions: AVR has no flash wait states but 4 cycles is a minimum (+ finishing a multi-cycle instruction, +4 from sleep). ARM 12/12 are zero-wait-state M3/M4 figures, and a 72 MHz flash part typically runs 2 wait states, so real entry is longer. Flagged that exit is quoted as 10–12 cycles. Fixed the late-arrival sentence and the AVR TEMP-register remark. |

## q0615 resolution (physics)

The model is first-order pads (τA = 20 s, τB = 32 s) following oven air. I re-simulated the writer's table with the air ramp uncapped and again capped at 250 °C.

- On a steady linear ramp each pad lags the air by rτ. The pads therefore cross liquidus Δτ = 12 s apart whatever the ramp rate, and the temperature gap between them is rΔτ.
- Starting both pads equal (after a soak) cuts the gap from 23 s to about 5–11 s. **The soak does the shrinking.**
- **Ramp rate is a mixed knob.** A slower ramp lowers the temperature difference (5 °C at 0.5 °C/s, 11 °C at 5 °C/s), but the time gap creeps back toward 12 s. A faster ramp shortens the gap only transiently, and with the air capped at 250 °C the gap stays around 8–9 s from 2 to 5 °C/s.
- Soaking closer to liquidus helps further: from a 200 °C start at 2 °C/s the gap is about 4.8 s.

The caption now credits the soak with shrinking the window and says the ramp mainly reduces the temperature difference. The analysis text explains the rτ / Δτ result. The UNCERTAIN callout no longer carries a contradiction. I also aligned the spoken answer, the long answer and the TIP: soak to equalize, moderate ramp to keep ΔT small.

## Remaining concerns
- q0797 and q0795 use 12 cycles for Cortex-M exit throughout (pre-existing pages and quiz). Some sources quote 10. It is flagged in UNCERTAIN, and I did not change the quiz.
- The q0601 table comes from one random point set that can't be reproduced. My own runs agree to within about 10%.
