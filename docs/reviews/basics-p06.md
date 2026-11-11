# Basics review: group p06 (q0254–q0295)

I recomputed every number in "The simplest example" with node. The validator reports 0 errors in these pages. Its one error is in q0195, which is outside this group. Pages not listed are OK: q0271, q0278, q0279, q0282, q0292 and q0294.

- **q0254**: Explained the duty cycle in words before the $D/(1-D)$ factor. Replaced "high-side switch" with "main switch". Linked subharmonic oscillation to q0253.
- **q0255**: Added a "Peak current mode" term linked to q0252, because the block used it without defining it. Made the too-steep-ramp sentence clearer.
- **q0256**: Removed the undefined "compensation network" and "high-side switch". Defined "reference" in the example.
- **q0257**: Replaced "ringing on a hot-plugged line" with plain words.
- **q0258**: Replaced "transient response" and "derated" with plain words. Defined ripple.
- **q0259**: Defined "core" and "ripple" in the opening.
- **q0260**: Defined "control loop". Fixed the analogy: a huge tub "taking forever to fill" suggested slow start-up. The page's limit is inrush current (filling a big C in a fixed soft-start time), so the tub now "needs a fire hose".
- **q0261**: Rewrote the opening and the terms list. The old text used phase lag, loop gain and "zero" undefined. The Compensation link pointed to q0260, which is about L/C limits. The links now go to q0246 (LC filter) and q0244 (stability).
- **q0262**: Replaced "a mirror of the switch" with a plain description.
- **q0263**: Replaced "after derating" with plain words.
- **q0264**: Defined "reference" and "ramp".
- **q0265**: Replaced "ring or sag" with plain words.
- **q0266**: Fixed the example. It said the switch node was "switching at full duty", but at full duty the node sits at the input voltage and does not switch. Added a "Switch node" term and dropped a redundant one.
- **q0267**: Replaced "transient response" and defined "feedback loop".
- **q0268**: Replaced "transient response" and "bond wires".
- **q0269**: Defined DCR in the example.
- **q0270**: Defined DC.
- **q0272**: Defined gate, anode and cathode. Removed the "inductor is a gate" analogy, which misleads about what an inductor does.
- **q0273**: Defined "mains"/power factor correction in plain words. Replaced a seesaw description that did not describe a seesaw balance.
- **q0274**: **Numeric error.** The block said the sync FET loses "at most $1^2\times0.05=0.05$ W". In a boost the FET carries pulses larger than the output current, so its loss is above that figure. The page computes 1.16 A RMS and 67 mW, and the block now uses those numbers.
- **q0275**: Replaced "forward drop".
- **q0276**: Replaced "FET".
- **q0277**: Explained "transistor" as a voltage-controlled valve.
- **q0280**: Replaced "analog" and expanded EMI.
- **q0281**: Defined "feedback loop".
- **q0283**: Replaced the undefined $R_{DS(on)}$ in the dropout definition with words.
- **q0284**: Removed the "Doubler" link to q0270, a boost converter page that does not cover doublers.
- **q0285**: Defined "plate". Replaced "clock swing" in the Dickson definition.
- **q0286**: Replaced "netlist".
- **q0287**: Explained RS-232.
- **q0288**: Corrected the efficiency to $6.44/6.6\approx97.6\%$. The block said 97%, and the page says 97.5%.
- **q0289**: Replaced ESR, DC bias, charge sharing and RMS with plain words.
- **q0290**: Defined amp-hours.
- **q0291**: Defined cutoff voltage.
- **q0293**: Defined depth of discharge.
- **q0295**: Defined PTC. Moved the link off "Protection circuit", where it pointed to the measurement page q0294, and onto "Cell balancing", now linked to q0314.
