# Basics review: p03 (q0128–q0169)

42 pages reviewed: 5 OK unchanged (q0129, q0133, q0136, q0154, q0163), 37 fixed. All example numbers recomputed with node; no arithmetic errors found. Changes are inside `::: basics` only.

- q0128: defined op-amp and feedback before use; replaced misleading "analogy breaks: only inverting can have gain < 1" with the real limit (weak vs stiff source); example now says the source resistance halves the gain rather than "only 0.5 V reaches the amplifier"; trimmed to length.
- q0130: defined inductor; capacitor link q0024 -> q0022; buffer no longer uses undefined "op-amp".
- q0131: "poles" explained in bridge.
- q0132: -3 dB given as 70.7% where first used; scope edge "about 3.5 ns".
- q0134: "whole number" -> "a number you choose, usually a whole number" (fractional-N exists).
- q0135: "phase" and "second-order" jargon replaced with plain wording.
- q0137: muddled roundabout/exit picture made a one-way track with stations.
- q0138: "settles in microseconds" -> "a 100 kHz loop settles in tens of microseconds".
- q0139: flip-flop was used but undefined; replaced unused "duty cycle" term with it; "clock-to-output" explained.
- q0140: defined current sink; removed αCV²f with undefined α; explained inductance in bridge.
- q0141: plain wording for complex-conjugate match.
- q0142: ESL bullet now explains inductance.
- q0143: example rewritten to the page's own case (2 A step, 100 kHz loop ≈ 1.6 µs response, 100 mV -> 32 µF) so ΔV = I·t/C visibly becomes the page's ΔI/(2π f_c ΔV); added loop-bandwidth term; ESL explained.
- q0144: clamp wording fixed: the diode holds the coil's reverse voltage at ~0.7 V, the transistor sees ~12.7 V (supply + diode drop), matching the page; bridge now mentions the slow relay release trade-off; diode, relay and Zener defined.
- q0145: "harmonics" explained.
- q0146: dam picture's confusing "thin wall easier to get through" fixed; eV and electric field explained; jargon-heavy bridge simplified.
- q0147: inductor defined.
- q0148: R1∥R2 notation replaced with words; efficiency link q0141 -> q0162.
- q0149: formula/notation in bullets replaced with words; Thevenin value given.
- q0150: protection bullet explains soft start and UVLO in words.
- q0151: "gates" and "dynamic power" defined; 1.05² shown.
- q0152, q0153: efficiency link -> q0162 (efficiency page); "ambient" in plain words (q0153).
- q0155: idea stated in words before the formula.
- q0156: "pass transistor" explained.
- q0157: buck link -> q0173; regenerative braking analogy made concrete.
- q0158: LDO-better region qualified by dropout.
- q0159: currency analogy clarified; inverter/bridge jargon simplified.
- q0160: dropped off-topic ripple link (q0159).
- q0161: wrong link (CMOS power -> q0147) changed to q0140; "CMOS" replaced with plain term.
- q0162: "four times" -> "nearly four times" (4.3/1.1 = 3.9).
- q0164: "traces" defined.
- q0165: example aligned with page's numbers (50 µA Iq + 2 µA MCU = 52 µA -> 176 days; 1 µA part -> 3 µA -> ~8.4 years; 10 µA load -> <17%, page's 15% with voltages); internal-circuit jargon explained; Iq link moved to light-load efficiency.
- q0166: example marked as three rails from the page's spec.
- q0167: isolation defined.
- q0168: PSRR expanded and explained; inductor defined.
- q0169: "tracking pre-regulator" explained.

Open: none. Validator: 0 errors.
