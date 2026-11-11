# Basics review: group p07 (q0296–q0337)

Method: I read every basics block against the page's answer, short answer and the relevant technical lines. I recomputed every number in "The simplest example" with node/python, and checked every `[[qNNNN]]` link against the target page's title. Result: 42 pages: 17 OK, 25 fixed. Validator: 0 errors.

Near-duplicate pairs:
- q0313 (airbag) and q0325 (pressure cooker): both analogies are correct and agree (1% of 4.2 V = 42 mV, tested part that works without firmware).
- q0314 (roped hikers) and q0326 (restaurant bill): both are correct and consistent. q0314's example assumes a charger that stops at the first cell's 4.2 V, and q0326's assumes one that watches only the total. These are different chargers, so the pages don't contradict each other.

Changes:
- q0298: Defined "electrodes" and "ions" inside the Electrolyte bullet. They were used but never explained.
- q0300: "Named by the positive electrode" now says "usually", because LTO is named by its anode. Added an Electrode bullet that defines cathode/anode, and clarified the LTO bullet.
- q0301: The Internal resistance link pointed to q0297 (Li-ion chemistry). It now points to q0303 (Battery internal resistance).
- q0305: The analogy said a rubber band's damage isn't permanent but "gives a warning", which was illogical. It now says plainly that a cell gives no visible warning.
- q0306: Fixed the garbled "charging cold honey-like cells" sentence. It now states where the honey picture breaks.
- q0308: 0.1 V / 6 mV per % is about 17%, not 16%.
- q0309: 3.75 kWh is "more than 20 km" of range (as the page says), not "several kilometers".
- q0310: 10 mV / 6 mV per % is 1.7% (was 1.6%), and 100 mV is 17% (was 16%).
- q0311: Removed the misleading "thicker, leakier bottom" bucket analogy. It now explains that the cutoff is reached sooner at high current or in the cold, so conditions must be stated.
- q0313: "That extra margin" changed to "that extra error". The extra 42 mV is an error, not a margin.
- q0314: The analogy ("give tired hikers a rest", "cells cannot talk") didn't match how balancing works and skipped the safety point. Rewrote it: balancing is shifting load, and the analogy now notes that the real danger is a cell overcharged past its safe voltage.
- q0317: The Internal resistance link pointed to q0306. It now points to q0303.
- q0318: Removed a redundant analogy sentence. Added an Anode bullet, because the word was used but not defined.
- q0321, q0325: "Plain 4.2 V (bench) supply" now says "with no current limit". The q0325 page itself notes that bench supplies do have current limits. q0325 also wrongly said the charger would precharge a cell at 3.0 V; precharge applies only below about 3 V.
- q0322: The red-flag rate was "several degrees per minute", but the page says about 1 °C/min during a gentle charge is already a red flag. Fixed. Also removed the unsupported "hundreds of times a second".
- q0323: Explained LDO (step-down only) versus buck-boost.
- q0324: "A full cell is safe from running flat" changed to "has more charge to lose before it runs flat".
- q0326: Explained where the 110 mAh excess comes from (5% of 2200 mAh, as on the page).
- q0331: Rewrote the pipe analogy so the tiny internal resistance maps clearly onto the pipe, and noted where it breaks (the current becomes heat inside the cell).
- q0332: For 80 W, "several degrees per second" changed to "about 2 degrees per second for a 40 g cell" (80 W / 40 J/K). I made the same numeric fix in the page's Heat removal paragraph.
- q0333: The Inductive load link pointed to q0022 (capacitance). It now points to q0039 (What is inductance?). Also defined "commutator".
- q0335: The Inductance link pointed to q0022 (capacitance). It now points to q0039. Added "for the same amount of copper" to the claim that copper heating stays the same.
- q0336: The time-constant link pointed to q0010 (filters). It now points to q0044 (Inductor at t = 0⁺ and DC steady state).
- q0337: Explained why the 20% PWM hold power is 0.48 W rather than 2.4 W: the coil smooths the current, so P = I²R.

OK with no change: q0296, q0297, q0299, q0302, q0303, q0304, q0307, q0312, q0315, q0316, q0319, q0320, q0327, q0328, q0329, q0330, q0334 (I verified the solenoid force, about 1 N and 4 N).
