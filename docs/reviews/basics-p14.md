# Review: basics primers, group p14 (PCB assembly, manufacturing test, bring-up, probing)

42 pages reviewed. Every number in "The simplest example" was recomputed with node and checked against the page's technical/deep sections and quiz. 3 OK, 39 fixed. No numeric errors found outside the basics blocks.

**Break-even check.** q0605 and q0611 both compute fixture 9,000 USD + 0.50 USD/board against flying probe 800 USD + 5.33 USD/board (8 min at 40 USD/h), giving 8,200 / 4.83 = 1,698, about 1,700 boards. Their deep sections, quizzes and followups agree. The 6,200-board figure on q0609 comes from a different model in q0609's deep section (90 s vs 12 s at 60 USD/h, 8,000 USD fixture). q0609's primer does not quote a break-even, so nothing there conflicts.

- q0590: defined "rail" in the example; trimmed the analogy to stay under the word limit.
- q0591: OK.
- q0592: "efficiency" was used but not defined, so it replaced the unused "test points" term; explained power = volts x amps; trimmed.
- q0593: defined "traces"; removed a repeated sentence.
- q0594: glossed "routed" and "paste print".
- q0595: glossed "routed boards".
- q0596: defined "pads".
- q0597: pizza analogy said a burnt pizza is fixed "at the sauce station" (changed to a missing topping caught at the topping station); defined "pads".
- q0598: example relies on "decoupling capacitor", which was undefined; added it to Words you need.
- q0599: glossed "oxide" and "surface tension"; trimmed.
- q0600: glossed "surface-mount", "solder paste" and "fine-pitch".
- q0601: "a nozzle swap costs more than dozens of placements" overstated the page (about 1 s vs 0.1-0.2 s per placement); changed to 5 to 10 placements; trimmed.
- q0602: glossed surface-mount, pads, oxide, tombstoning, voids; dropped the unused "cold joint" term to stay under 330 words.
- q0603: OK.
- q0604: glossed opens/shorts; replaced "heuristic" with plain wording.
- q0605: the example gave only "fixture wins above roughly 1,700 boards" with an undefined "fixtureless method". It now shows the page's own numbers (9,000 + 0.50 vs 800 + 5.33 per board, 8,200 / 4.83, about 1,700). Also replaced "process drift" with plain wording.
- q0606: defined firmware; replaced "flash".
- q0607: defined firmware.
- q0608: OK.
- q0609: defined "net".
- q0610: defined "rail" and "false fail"; replaced "spec" and "ICT" with plain words.
- q0611: "in-circuit test" was undefined in the opening, and the example set a 3.3-minute test beside a 1,700-board break-even that assumes an 8-minute test (an apparent contradiction). It now states the cost model's assumptions (800 USD + 5.33/board vs 9,000 USD + 0.50/board). It also mentions "netlist", which is a listed term.
- q0612: "nets" became plain words; removed "again" (the "pin-art toy" is introduced on q0609); removed the [[q0596]] link from "Registration" because the page aligns with tooling holes and q0596 is about fiducials; defined tooling holes.
- q0613: glossed "etch" and "fab".
- q0614: defined firmware, net and in-circuit test.
- q0615: the rubber-band/ice-block analogy did not show the tipping mechanism (an end-face pull pivoting the part), so it became a domino pulled at one end face; glossed 0402 size and the newton.
- q0616: defined via and node; "nets" became plain words.
- q0617: defined traces.
- q0618: defined scope, vias and input capacitance; cut a filler sentence.
- q0619: defined via, capacitance and rail.
- q0620: defined via, solder mask and coaxial connector; replaced "scope".
- q0621: defined solder mask and net.
- q0622: explained "edge" and the 50-ohm line in plain words.
- q0623: defined capacitance; the stub caveat ("a pad's effect depends on its length") became a plain explanation of resonance; replaced "content" with "frequencies".
- q0624: replaced "net", "pitch", "scope" and "flash".
- q0625: defined "crystal".
- q0626: defined "1 oz" copper; replaced "rail" and "net".
- q0627: defined DC, edge and capacitance; replaced "node".
- q0628: defined rail; replaced "net".
- q0629: defined scope and mains; fixed the circular "probe capacitance" definition.
- q0630: removed "again" (cross-page reference); defined capacitance in "Ringing".
- q0631: removed the "hula-hoop" reference (it only makes sense after q0629/q0630); replaced "scope ground", "ground net" and "mains earth".

Validator: 0 errors, 0 warnings.
