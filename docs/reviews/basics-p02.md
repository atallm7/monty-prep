# Basics QA: p02 (q0086–q0127)

42 pages reviewed: 3 OK as written (q0099, q0121, q0125), 39 edited. All edits are inside the `::: basics` block; no other page content changed. Numbers in every "simplest example" recomputed with node.

- q0086: defined holes and junctions (they were used undefined), linked base/emitter/collector to q0085 (How a BJT works) rather than the symbol page; trimmed to fit length.
- q0087: defined "junction" and "beta" where they first appear.
- q0088: alpha/beta check said "0.99/0.01 = 99 matches" a beta of 100; reworded so the 99 vs 100 gap is explained as rounding.
- q0089: defined P/N and diode in plain terms.
- q0090: defined "channel" before it is used.
- q0091: replaced the muddled swimming-pool analogy with a clearer one (high-jump bar measured from a floor); defined diode; spelled out why the body diode leads to back-to-back FETs (one FET blocks only one way).
- q0092: defined "logic gates".
- q0093: defined BJT and capacitor in the analogy and the word list.
- q0094: defined beta.
- q0095: defined k_n (used undefined in the example).
- q0096: fixed the analogy's limit sentence (it named a non-issue); added P-type/N-type and "free charges"; defined diode.
- q0097: replaced the seesaw analogy (did not actually describe a seesaw) with mirrored scissors.
- q0098: depletion turn-off now says "below −2 V, say −3 V" instead of implying −3 V is required.
- q0100: defined V_DD, R_D and k.
- q0101: defined diode, body, inductor, half-bridge; example no longer says the drain is pushed "slightly" below ground and then sits 0.7 V below (it is clamped there).
- q0102: defined capacitor and Zener; "floats" now explained.
- q0103: defined carriers.
- q0104: defined diode.
- q0105: "never both on" now notes the brief overlap while switching (agrees with q0109 shoot-through).
- q0106: defined gate, capacitance, fF; dynamic-power link now points at q0110 (CMOS power) instead of q0105.
- q0107: defined rail and threshold.
- q0108: 74HC V_IH said "roughly 3.2 V" at 5 V; page uses 70% of VDD = 3.5 V at 5 V (3.15 V at 4.5 V). Now states both consistently. Replaced the single "logic threshold" with V_IH/V_IL plus the undefined zone between, linked q0742.
- q0109: clarified the "thresholds 1 V in size" wording for NMOS and PMOS.
- q0110: defined capacitance (with the bucket width), pF and MHz.
- q0111: defined load capacitance/pF and EMI.
- q0112: fixed mixed metaphor (sluice gate vs spillway); defined diode and diode drop.
- q0113: "flip the supply to the drain" read as a MOSFET drain; reworded to tap/outlet.
- q0114: example used |V_tp| without giving it; both thresholds now stated as 1 V.
- q0115: CMRR example used a 100 dB op-amp figure only, while the page's point is resistor mismatch (49 dB). Added the 1% resistor case (CMRR about 275, 5 V average gives about 180 mV) so it bridges to the page; explained dB; moved the op-amp link off the CMRR bullet.
- q0116: defined op-amp, gain, DC.
- q0117: primer gave 5 V / 0.5 V/µs = 10 µs as the time for a step, while the page uses 10 V and 16 µs (10–90% rise time). Now uses the page's 10 V step: 20 µs full ramp, 16 µs for the middle 8 V (10–90%). Rewrote the pool analogy so the slew vs bandwidth split is clear; explained V/µs, bandwidth and tail current.
- q0118: explained the 10 pF load.
- q0119: introduced BJT/base/collector before the example uses them; "DC" explained.
- q0120: explained thermal voltage and mS.
- q0122: seesaw analogy was physically wrong (pressing an end does not lift the middle); replaced with a tug of war.
- q0123: defined comparator, DC level and rail.
- q0124: defined voltage source and negative feedback.
- q0126: replaced the unclear spring-scale analogy with a steering-with-feedback picture.
- q0127: explained positive feedback and PWM.

Validator: 0 errors in p02 pages (the one remaining error, q0195, belongs to another group).
