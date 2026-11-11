# Basics review: p19 (interrupts, ADC/DAC, memory, debugging, RTOS, sensors start)

42 pages reviewed against each page's short answer, deep section and quiz. 16 OK, 26 changed. All numbers in "The simplest example" were recomputed with node. All `[[qNNNN]]` links checked against target titles (all correct). No errors found outside the basics blocks.

- q0800: glossed "peripheral" and "CPU" in the first sentence.
- q0801: "baud" replaced with bits per second; "about 2%" now 2.3% (2/86.8, matches the page); glossed peripheral in "Flag".
- q0802: same baud and 2.3% fixes; defined UART; glossed peripheral.
- q0803: "about 32 bytes of stack" now "at least 32 bytes" (32 is the minimum hardware frame; the page adds registers and locals).
- q0806: removed the undefined "gamma table" from the bridge (now a plain-words correction table); trimmed the analogy to stay within 330 words.
- q0807: "thousands of times more than a pin can supply" was wrong (6 A against a pin's few to 20 mA is hundreds); "roughly half speed" at 50% duty now "a little under half", because the page's speed equation gives 250 vs 550 rad/s; "inductive load" replaced with plain words.
- q0808: quantization error was "up to half a step" while the primer itself rounds down to the tick below (error up to one step); now states both conventions as the page does. Replaced "low-impedance source" in the bridge.
- q0811: "Nyquist rate is more than 20 kS/s" reworded to the rule (sample faster than twice 10 kHz); "low-pass filter" explained.
- q0814: a buffer draws "almost no" current, not none.
- q0815: "10 mV, bigger than several steps" now "about 12 steps".
- q0817: defined "code".
- q0818: anti-alias filter defined without the term "low-pass".
- q0819: the error list now includes the half step of rounding so the "about 11 steps" total matches the page's 11.1 LSB; INL/DNL glossed in the bridge.
- q0820: the analogy's "the smallest cup is never poured twice" explanation was confusing (now: all cups give 7/8 L, one smallest cup short); "low-pass" and "buffer" defined.
- q0821: "low-pass filter" in the PWM bullet replaced with plain words.
- q0823: SRAM after a power cycle holds random junk, not "empty" (the page says contents are random); peripherals glossed.
- q0825: "levelling" changed to "leveling".
- q0828: "serial bus" glossed; trimmed to 331 words.
- q0829: explained what OR does in the example.
- q0830: explained what AND does in "Mask and shift".
- q0832: "halts the core" changed to "halts the processor".
- q0833: defined "interrupt handler" in the example; tightened.
- q0834: the example blamed a missing reset pull-up, but the page notes most MCUs have an internal pull-up and its own worked example finds a reset supervisor with the wrong threshold. The primer now uses the supervisor case. Defined "stack" in the vector-table bullet; dropped the unused brown-out term and one analogy sentence to stay at 327 words.
- q0837: defined RTOS where it first appears.
- q0839: the control job waits "40 ms or more", not "up to 40 ms" (the page's worst case is 55.5 ms); defined RTOS; tightened.
- q0841: the example rounded the thermistor to 9.6 kΩ, which gave 34 mV/°C and 40 counts. That disagrees with the page's 36.6 mV/K. Using 9.57 kΩ (the exact beta-model value) gives 1.614 V, about 36 mV/°C and about 45 counts, which matches the page.

OK without changes: q0804, q0805, q0809, q0810, q0812, q0813, q0816, q0822, q0824, q0826, q0827, q0831, q0835, q0836, q0838, q0840.
