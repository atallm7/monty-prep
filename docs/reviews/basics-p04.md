# Basics review: group p04 (q0170–q0211)

42 pages reviewed: 20 OK, 22 fixed. I recomputed every simplest-example number with node and checked every [[link]] title. Validator: 0 errors.

- **q0170**: 5mOhm page numbers; defined converter
- **q0171**: ESD defined
- **q0172**: RC delay link (q0004 KCL wrong) removed; open-drain->q0020; R wording
- **q0173**: defined DC
- **q0177**: expanded SIMO acronym; corrected part count (SIMO still has high/low-side switches) and slot description (output switch on during charge too)
- **q0179**: lamp analogy only averages if flicked faster than the eye sees
- **q0181**: bootstrap definition de-jargoned
- **q0183**: removed 'previous page' reference (now links q0182); fixed misleading analogy break; drop size per page (55 mV sync / ~0.4 V diode)
- **q0184**: virtual resistance explained; 'halves' -> 'roughly halves' per page
- **q0185**: running-total analogy corrected (each waveform integrates the previous one minus its average: SW-Vout, iL-Iout)
- **q0187**: qualified 'always one direction' to continuous conduction (page notes forced-CCM negative current)
- **q0191**: replaced invented unit 'volt-fractions' with volt-microseconds on a 1 us cycle
- **q0192**: example rebuilt on page numbers (4.7 uH, 1.49-2.51 A, ~9.6 uJ in/out); removed unsupported claim that the per-cycle slice is small vs stored energy (on the page it is about equal to the average)
- **q0193**: defined EMI/brownout in plain words
- **q0195**: rewrote confused road/gradient analogy (L as 'gentle gradient' mixed up slope and length)
- **q0199**: fixed self-contradictory net-sag analogy (Schottky 'very high up' vs transistor)
- **q0200**: input-capacitor definition said it supplies pulses because the source is idle off-state (pulses are on-state); fixed
- **q0202**: example rebuilt on page numbers (4.7 uH, 2.5 A, ~15 uJ, ~7 W) instead of 10 uH/20 uJ/10 W; plain avalanche definition
- **q0203**: Schottky numbers aligned with page (0.45 V, 0.65 W); clarified garbled 'two gates' analogy; diode emulation definition
- **q0206**: defined high-side NFET
- **q0209**: basics rewritten: dead time explained before use; example states two 25 ns dead times = 50 ns total per cycle and uses page's 0.75 V (37.5 mW ~ 0.04 W); added recovery figure. Page: answer, long and technical said '50 ns of dead time' ambiguously; clarified as 50 ns total (2 x 25 ns), matching deep/assumptions. Page's 37.5 mW is correct for both edges.
- **q0210**: example aligned with page (0.75 V, 37.5 -> 11 mW) and states 50/15 ns are totals of both dead times

Unchanged (OK): q0174, q0175, q0176, q0178, q0180, q0182, q0186, q0188, q0189, q0190, q0194, q0196, q0197, q0198, q0201, q0204, q0205, q0207, q0208, q0211.
