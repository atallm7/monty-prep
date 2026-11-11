# Basics review: group p00 (q0001–q0043, fundamentals)

Method: I read each basics block against the page's short answer and key numbers. I recomputed every worked-example number with `node -e`, and all of them were correct. I also checked that each page builds only on earlier pages (in id order) and that the analogies agree. Voltage is always pressure, height or water level. Current is always flow. For inductors, current is motion or inertia and voltage is the push. `validate-content.mjs`: 0 errors.

OK as written (8): q0002, q0018, q0019, q0030, q0036, q0040, q0043, plus q0035 apart from one word (listed below).

- **q0001**: Defined "charge" (carried by electrons) and "diode" (a one-way valve), since both appeared with no explanation on the very first page.
- **q0003**: KCL/KVL bullets now say "in equals out" and "rises and drops add to zero" instead of "sum to zero". Spelled out the Kirchhoff names. "Voltage drop" and "source" are glossed. The trail analogy now says outright that height stands for voltage.
- **q0004**: Tied "voltage works like height" back to the water pressure from q0001. KCL bullet explains the sign convention ("in equals out").
- **q0005**: "Steady state" became "once the levels settle". Added a sentence on why each current is voltage difference over resistance before the KCL equation.
- **q0006**: Defined AC where it first appears.
- **q0007**: Defined "trace".
- **q0009**: This page comes before the capacitor and inductor pages but used both, plus AC and frequency, with no definitions. Added a capacitor/inductor bullet and a frequency/AC bullet, merged reactance and impedance into one bullet, and dropped the duplicate resonance bullet. Replaced "the swing has no direct match for L and C" with the correct energy picture: the capacitor is like height at the top of the arc, the inductor like speed at the bottom. Trimmed for length (335 words, slightly long).
- **q0010**: Capacitor and DC are defined, with a link to q0022. Took out "log scale for gain" (jargon): dB is now explained as how much a signal shrinks (−3 dB ≈ 0.707, −20 dB = 1/10). Linked the voltage divider page (q0008).
- **q0011**: Gave quick definitions of capacitor, inductor and leads. "Bypasses noise" became "soaks up fast noise". DCR is defined without assuming the reader knows "DC".
- **q0012**: Defined op-amp and the plus/minus (inverting) inputs. The example now names the virtual ground it relies on.
- **q0013**: "IEC (European)" became "international, common in Europe" (IEC is an international standard).
- **q0014**: Explained "cross-section" (it was used before q0015 defines it).
- **q0015**: "Per kelvin" became "per degree Celsius (same step)". "Strain" is glossed as stretching.
- **q0016**: Gave plain glosses of inductance and capacitance (both come before their own pages). Impedance is now defined without the bare word "AC". Removed the analogy's claim that it "shows why high-value resistors fail first", because it does not show that.
- **q0017**: Removed "logarithmic scale". It now says each step is about 21% bigger in E12, which I checked: 10^(1/12) = 1.21. Reworded the 13 kΩ tolerance example, which implied a 12 k part "fits" 13 k.
- **q0020**: Defined microcontroller. Trimmed for length.
- **q0021**: Says what a capacitor is before describing its symbol. Defined "ceramic". Replaced the meaningless "the wires are the handles".
- **q0022**: Defined the coulomb (about 6×10^18 electrons) and explained dv/dt in words.
- **q0023**: Explained ε0, A and d in the formula. Shortened the analogy caveat.
- **q0024**: AC and DC were never defined, and this is where the capacitor sequence first relies on them; both are now defined. Removed the unexplained j-form from "In plain words" (j is introduced in q0026). Phase is now "a quarter cycle (90°)".
- **q0025**: **Analogy inconsistency fixed.** The shopping-cart picture made current the "push" and voltage the "speed". That is the opposite of q0001 (voltage = push) and q0022 (voltage = bucket level), and it matches the inductor analogy used on q0027 and q0039–q0043, which would teach students to mix the two parts up. Replaced it with the q0022 bucket: level = voltage, hose flow = current. "Exponential" is glossed.
- **q0026**: Rewrote "In plain words" without "imaginary part" or "1/j". Reactance is now the energy-storing part of the opposition, and the sign records timing. j is defined as a quarter-cycle marker, keeping the page's 1/j = −j reason. Inductor is glossed and q0040 linked.
- **q0027**: Defined inductor, relay, transistor and diode, which were all unexplained here. Fixed the analogy line "a capacitor works the same way, with voltage playing the role of speed", which clashed with the bucket picture; it now uses the bucket level. Trimmed.
- **q0028**: "Exponentially" is explained. Replaced the muddled sponge caveat: a capacitor stops filling when its voltage matches the source. "Complex networks" became "bigger circuits".
- **q0029**: Defined inductor (this page comes before q0039) and glossed j.
- **q0031**: "Negative and shrinking" became "shrinks in size" (the value is negative and its size is what shrinks).
- **q0032**: "Shunts" became "sends". "Droop" became "dip". IC is glossed. Target impedance no longer relies on the undefined "ripple/transient". Trimmed.
- **q0033**: "Attenuated" became "weakened".
- **q0034**: "Time domain" and "in shunt" are glossed. dB is explained without "log scale".
- **q0035**: "Cascading" is glossed.
- **q0037**: "Transient" is glossed. Replaced a garbled analogy caveat with a clear one: the rule assumes some resistance in the path.
- **q0038**: Says what an inductor is first. **Fixed a contradiction with the page**: the primer said a ferrite bead is "drawn like an inductor", but the page says it usually gets its own rectangle symbol.
- **q0039**: Explained di/dt and "induces".
- **q0041**: Glossed "buck converter".
- **q0042**: Replaced "imaginary part of impedance" with wording that matches q0026. Glossed admittance.

Left open: the numbering puts q0009–q0012 (RLC, filters, op-amps) and q0016 before the capacitor and inductor pages. Those primers now define the terms inline, but a beginner reading strictly in id order still meets resonance and filters before capacitors. A reading-order or prerequisite link can fix that; the basics blocks cannot. Several blocks are at the top of the length range (q0009 is about 335 words by raw count).
