# Deepen review e11: interrupts, NVIC, ADC front ends, sampling

Scope: the `::: deep` additions since 65d169b on q0798, q0799, q0801, q0803, q0804, q0812, q0813, q0814. I recomputed every new number with node. The new sections add tables only, no figures, so there were no deep figures to screenshot. `validate-content` reports 0 errors.

- **q0798**: Loads (20.7/2.7/0.5%, 23.9% total) and the RTA (17.99 µs, 68.8 µs margin vs an 86.8 µs byte time) check out. Corrections: the example put the tick above the UART, which contradicts the page's own "faster deadline, higher priority" rule. It is now labelled as a pessimistic order, and the deadline-monotonic result (12.7 µs) is added. I also split the 0.33 µs into about 12 cycles in plus about 10-12 out (zero wait states) and quantified tail-chaining (about 6 cycles vs about 22).
- **q0799**: The I2C register read was given as "roughly 30 bit-times, 75 µs". Four 9-bit frames plus start/Sr/stop come to about 39 bit-times, so it is now about 100 µs per device and about 300 µs for three. The RC 70% crossing (1.2τ), the bounce load (1.2%) and the debounce τ are correct.
- **q0801**: The torn-read MTBF (4.9e-7 per read, about 5.7 h) is correct. Corrections: avr-gcc loads the low byte first, so the torn value is now 0x02FF (with the high-first case noted). The lazy-stacking text wrongly said the frame grows when the ISR's first FP instruction runs. It now says the 104-byte frame is reserved whenever the interrupted context had an active FP context, and that the register save is deferred to the ISR's first FP instruction. The latency-jitter text claimed LDM/STM must finish or restart and add "about another dozen cycles". On M3/M4 they are interruptible-continuable, so this was reworded to a few cycles from wait states, bus or divide, with the 12-cycle zero-wait-state figure kept. The 49.7-day wrap is OK.
- **q0803**: The RTA (17.7 µs, 58.0 µs), utilization 14.3%, no-nesting blocking (45.7 µs, 94% to 54% margin) and critical-section timings are correct. Corrections: I removed the double-counted "+0.17 µs entry" for X (C already includes entry and exit). The stack bullet wrongly said a handler runs on the task stack. On Cortex-M only the first frame goes on PSP, and handlers and nested frames go on MSP automatically. I also noted that ARMv6-M has no BASEPRI or grouping.
- **q0804**: The NTC sensitivity is verified: -36.66 mV/K and 0.022 K/count at 25 °C, and 697.5 Ω, -5.71 mV/K and 0.14 K/count at 100 °C. Self-heating of 0.18 K is correct. Corrections:
  - The 16-bit LSB is 50 µV, not 61 µV, so the kick is 3.3 counts, not 2.7.
  - Settling used τ = RfCf = 100 µs, which is inconsistent with the 0.6 ms Thevenin τ stated just before. It is now about 5.4 ms.
  - The tolerance ±0.25 K was replaced by δ·T²/B: 0.23 K per 1%, which gives ±0.3 K RSS to ±0.45 K worst case.
  - The 7.8 kΩ leakage example now says it refers to the case-3 divider.
  - I fixed the I2C "no arbitration" wording.
- **q0812**: The two-point calibration (g = 0.81064 mV/count, b = -8.27 mV, 2.4236 V, about 8.2 LSB), the overflow limits, oversampling and the internal-reference V_DDA (3.000 V, 1.355 V) are all correct. Correction: I fixed the meaningless "20 mV ripple's worth of ratio error" so it now reads 0.6% of the reading, about 25 counts at full scale.
- **q0813**: The Butterworth orders (21.0/6.1/3.9/2.9), the single-pole 19 dB, the alias table, the bandpass under-sampling zone and the ZOH droop (-0.91/-3.92 dB) are correct. Corrections:
  - The usable bandwidth is now 0.4-0.45 fs, since 20/44.1 = 0.45.
  - The op-amp GBW is now stated as 100·Q·fc, which gives about 1.3 MHz.
  - The thermocouple bullet implied no filter was needed, but lead pickup at mains frequencies still aliases.
- **q0814**: kT/C (0.10 pF, 26 pF, 64 µV), acquisition (88 ns, 0.79 µs, 3.4 µs), droop (4.0 µs, 6.4 mV = 8 LSB at 85 °C) and the jitter limits (318/32/3.2 ps, 22 ps RSS) are correct. Corrections:
  - The droop heading said "upper limit", but droop is a second lower limit on C_H.
  - "Timer trigger with a few ns of jitter is almost sufficient" for 318 ps was self-contradictory. It now separates a crystal-clocked hardware trigger from a software trigger.
  - I removed the false claim that capacitive feedthrough grows with frequency (the divider ratio is flat).
  - I replaced the "pipelined ADC holds 5 µs" example.

Remaining concerns: Cortex-M cycle figures (12 entry, about 6 tail-chain, lazy-stack save time) are zero-wait-state M3/M4 values and are flagged as implementation-dependent in the existing UNCERTAIN callouts. The ADC leakage (1 µA), NTC dissipation constant and S/H leakage are illustrative and already flagged.
