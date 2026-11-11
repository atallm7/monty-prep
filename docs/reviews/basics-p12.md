# Basics review: p12 (PCB design, signal integrity, termination, EMI)

42 pages reviewed. 16 OK, 26 changed. All numbers in "The simplest example" were recomputed with node.

- q0507: removed the [[q0503]] link from "Power and ground planes". That page is about placing decoupling caps, not planes.
- q0509: "give it 3 nH of long traces" now reads "raise the total to 3 nH", which matches the 9 MHz / 1.9 Ω / 6x figures (adding 3 nH on top of 0.5 nH would give 8.5 MHz).
- q0510: removed the [[q0503]] link from "Via" (wrong target).
- q0512: same 3 nH total-versus-added fix (the page's 9.2 MHz is for 3 nH total). Replaced the muddled trampoline/pole analogy, which contradicted itself, with a mass-on-spring picture: spring = C, inertia = L, friction = ESR.
- q0513: tightened. Removed the wrong [[q0505]] link on "ESR window", replaced the low-pass-filter term (not used) with "Stability".
- q0514: tightened; defined impedance in plain words.
- q0515: tightened; defined inductance; dropped the unused anti-pad term.
- q0516: "depends on its width above the plane" now reads "width and height above the plane". "Mitred" changed to "mitered" (American spelling).
- q0519: "fibre" changed to "fiber". The Z_diff link now points to q0523 (common impedance values), not q0524.
- q0520: the example jumped from 17.7 ps to 25 ps with no explanation. It now says "for a larger 25 ps skew".
- q0524: replaced the trampoline analogy, which did not model capacitance, with the two-facing-plates picture (more C means lower Z0).
- q0525: dropped "leaky" from "leaky resistor-capacitor chain", because the low-frequency region is an RC line and not leakage.
- q0529: the series-termination analogy ("talk softly so the listener at your end absorbs the echo") was confusing. Now: a pillow behind you absorbs the one returning echo.
- q0530: removed the complex-number notation (50 + j11) and the undefined "Thevenin rail". Defined V_TT plainly. The 11 % reflection is unchanged and correct.
- q0531: tightened; added a definition of the reflection coefficient, which the example used undefined.
- q0532: the primer said a parallel 50 Ω draws 66 mA right after using the 20 Ω driver divider. With that driver it is 3.3/70 = 47 mA, so this is now fixed. Tightened, and replaced the undefined "bias" wording. **Page fix:** the technical section had the same error ("costs 66 mA at 3.3 V" for the 20 Ω driver), now 47 mA.
- q0533: tightened to ≤330 words and dropped the launch-amplitude term. **Page fix:** the rubric line "66 mA / 2.36 V for parallel" now reads 47 mA, consistent with the page's own 20 Ω driver. The Thevenin column (about 28 mA in R2, about 4.7 mA through R1, about 80 mW) checks out: the far end sits at 2.83 V, which matches q0532's 100/100 table, and the driver supplies about 23.6 mA. Left unchanged.
- q0534: tightened. Removed the wrong [[q0001]] link and defined "squares".
- q0537: rephrased "area costs you capacitance and antenna".
- q0538: tightened. Replaced the cup-in-bathtub analogy, defined thermal resistance, and replaced "through-hole" with plain words.
- q0539: tightened. Removed the weak [[q0486]] link on return via, and explained "plane resonance" and the symbol s.
- q0540: removed the wrong [[q0332]] link (a LiPo heat page) on θJA.
- q0541: tightened. Dropped the unused derating and forced-air terms, added "junction" and the K = °C note.
- q0544: fixed the analogy. It had "the tap at the far end reads full pressure", but the regulator is at the near (source) end.
- q0545: "very high dV/dt" now has a plain-words gloss.
- q0546: tightened. Removed "bootstrap capacitor / high-side gate drive", which was undefined jargon not used in the primer, and replaced the concert analogy (too close to q0547's drummer) with workshop/nursery.

Checked and left as is: q0522's flagged sentences ("...not from the dielectric constant alone." and "...to about 0.45 GHz; either way...") are complete in the file, and their numbers are right: crossover at (0.076/0.082)² = 0.86 GHz and (0.055/0.082)² = 0.45 GHz.
