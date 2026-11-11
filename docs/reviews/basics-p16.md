# Basics review: p16 (signal integrity: edges, differential pairs, SI/PI, jitter, eyes, supplies, transmission lines)

42 pages reviewed (q0674–q0715). 20 OK, 22 changed. I checked each primer against the page's short answer, full deep section, follow-ups and quiz, and recomputed every number in "The simplest example" with node. All `[[...]]` links were checked against the target page titles. Validator: 0 errors.

- q0674: defined pF in passing; trimmed to 330 words.
- q0675: defined "sine wave" in passing.
- q0677: the example used "knee" and "spectrum" without defining them. It now says "above a certain frequency (the knee, set by the edge speed)" and explains 20 dB.
- q0679: "same signal in opposite directions" (which reads as current flow) now reads "one as the mirror image of the other". The Termination link pointed to q0710 (characteristic impedance); it now points to q0532 (termination networks).
- q0684: the Termination link pointed to q0679 (differential pair page); it now points to q0532.
- q0685: the picture said the supply sag "can change when the chip's outputs switch" (garbled); it now says the sag "can shift the moment the chip's outputs switch". The 3 mΩ example called the supply path a "resistance" and then jumped to "needs many decoupling capacitors" with no link between them. It now says the path, capacitors included, acts like a small resistance (its impedance) and that no single capacitor is that good, which matches the page's target-impedance argument.
- q0693: the extra 0.5 ns was described as clock skew only. The page splits it into 0.3 ns skew plus 0.2 ns jitter, so the text now names both.
- q0694: the analogy gap said "sound leaks only while something is changing", which is muddled. It now says sound is always a vibration, but on a wire only the edges leak. Removed "noise margin", which was undefined.
- q0696: "parasitic inductance and capacitance" were never defined, and the link went to the general inductor page q0041. The bullet now defines inductance and capacitance through the car/spring analogy, with no link. Trimmed.
- q0697: "Differential impedance: the impedance the pair presents" was circular; it now gives a plain definition.
- q0698: "ISI closes the eye by 200 mV from the top and bottom" was ambiguous (it could mean 400 mV in total). It now says 200 mV in total, consistent with 800 → 600 mV and with the page's quiz. The 800 mV example is already labeled "suppose".
- q0699: "ISI" was used in the example without definition; it is now explained in passing.
- q0700: the invented 40% / 50% mask is now labeled "made-up numbers for illustration" (the page stresses that real masks come from the standard).
- q0701: "impedance change" and "controlled impedance" were undefined; both are now explained in plain words.
- q0705: removed undefined "AC". "The ESR adds a few millivolts more" contradicted the page: the two ripple parts peak at different times, so the total is 12.3 mV, not 16.7 mV. It now says the total stays near 12 mV. Trimmed.
- q0706: defined "diode" in passing (one-way valve); trimmed.
- q0708: "travelling" changed to "traveling".
- q0709: "impedance change" in Reflection replaced with plain words.
- q0710: inductance and capacitance per meter are now defined via the hose analogy. Removed the unused "Controlled impedance" bullet. "travelling" changed to "traveling".
- q0712: the bouncing-ball picture never goes below the floor, so it contradicted the point that the voltage swings below its final value. Replaced it with a weight on a spring.
- q0713: defined impedance and "open circuit" in passing.
- q0715: defined "leakage"; trimmed.

OK with no change: q0676, q0678, q0680, q0681, q0682, q0683, q0686, q0687, q0688, q0689, q0690, q0691, q0692, q0695, q0702, q0703, q0704, q0707, q0711, q0714.

Open: q0702's 50 ps jitter budget adds the items linearly, which is acceptable as a simple illustration. The page itself explains that random terms add as root-sum-square. No factual errors found outside the basics blocks.
