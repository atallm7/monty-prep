# Basics review: group p22 (q0926–q0967, SoCs, memory, power/thermal/PVT, coding and systems, behavioral)

Method: I read each basics block against the page's answer, technical section and deep-dive headings. I recomputed every worked-example number with `node -e`, and all of them were correct: yield/cost per die, break-even volumes, DVFS powers, AMAT, page translation, Gray codes, mux and arbiter bit tricks, the RISC-V encoding, and the instruction counts. Every `[[qNNNN]]` link points to the right page. The behavioral pages (q0956, q0964, q0965, q0966) use *[placeholders]* and invent no experience. Most fixes define jargon that had slipped through. Word counts are 295–330. `validate-content.mjs`: 0 errors.

OK as written (5): q0929, q0936, q0937, q0938, q0966. Fixed (37): listed below.

- **q0926**: Defined "serial port". Tightened the town analogy to stay within the word limit.
- **q0927**: Said that watt-hours measure stored battery energy.
- **q0928**: Glossed "interconnect" in the bridge sentence.
- **q0930**: Defined "regulator", which the example used with no explanation. PHY no longer relies on "analog". Trimmed the parts list.
- **q0931**: Defined "drivers". The bridge's "memory layout" (which reads like software) became "the tricky memory wiring".
- **q0932**: Defined "package" (the chiplet idea depends on it). Shortened the respin bullet.
- **q0933**: "Capacitance" had never been defined, and the example's gloss was circular. Rewrote the dynamic-power bullet in terms of the charge the wires hold. Glossed "transistors".
- **q0934**: The example jumped from 1 KB of copied variables to "4 KB of variables" with no explanation. It now names the 3 KB of zero-initialized variables, matching the page (.data 1 KB + .bss 3 KB). Tied "RAM" to SRAM in the analogy.
- **q0935**: Defined "clock cycle" in the CPI bullet. Glossed flash and SRAM in the ATmega328P example.
- **q0939**: Defined "caches" and "row". The bucket analogy said a DRAM read "drains it a little", but the page says reads are destructive. It now pours the bucket out, so the bucket must be refilled.
- **q0940**: Replaced the undefined "rpm/head/platter" with plain words, and noted that 4.17 ms is an average.
- **q0941**: Defined "function" and the register in "stack pointer". Removed "array". Trimmed the analogy.
- **q0942**: Removed "runtime" and "embedded". Glossed "stack pointer" in the example. Trimmed for length.
- **q0943**: Defined "frame". The TLB is now "a small, fast memory" instead of an undefined "cache". Page fault no longer says "unmapped".
- **q0944**: "For logic" became "for circuits that compute rather than store".
- **q0945**: Capacitance gloss rewritten. Explained K/W as °C per watt. Tightened the analogy.
- **q0946**: Defined "serial port", "flop" and "FIFO" (the FIFO appeared in the bridge with no definition). Shortened the synchronizer sentence.
- **q0947**: Glossed "transistors" and "droop".
- **q0948**: Defined "regulator", "analog circuits" and "rail" (rail was used in the example but never defined). Replaced "timing critical / meet timing" with plain words. Shortened the analogy's caveat.
- **q0949**: Analogy error: the corner for fast silicon and high leakage is fast process + *high* voltage + hot, but the block said "the fastest, hungriest runner" (low voltage). It now says "fastest, best-fed runner on a hot day".
- **q0950**: Defined "inverter" (the example depends on it) and "leakage". Dropped "CMOS". Compressed the FS/SF sentence.
- **q0951**: Defined "package" and the K/W unit.
- **q0952**: Capacitance gloss in plain words. Explained mAh. Glossed "transistors".
- **q0953**: The example used an unexplained "20 nF". It now scales the 96.8 W figure by $V^2 f$ (result unchanged: about 48 W). "Per cycle" became "per clock tick".
- **q0954**: Explained K/W.
- **q0955**: Defined "logic", "ps" and "register" in the pipelining example.
- **q0956**: Glossed "registers", "logic" and "gates" in the RTL and synthesis bullets. Placeholders unchanged.
- **q0957**: Defined what a clock is, at the start.
- **q0958**: Glossed "bus", "request vector" (now "request bits ... requesters 1 and 3") and "RTL".
- **q0959**: Added a "Gates" bullet (the example uses inverter/AND/OR). Spelled out how to read $\bar S A + S B$, and checked it against the page's convention (S = 0 picks A). Defined "clock". Removed "register". Trimmed for length.
- **q0960**: Defined "half adder", XOR/AND (in words) and "logic". Removed "ripple adder". Shortened the Lego sentence.
- **q0961**: Defined RTL. "FIFO depth" became "buffer size". "Process" became "factory process".
- **q0962**: The analogy's last sentence ("the driver rarely does better than a good navigator") was muddled. It now says you, the assembly writer, rarely beat the compiler. "Pointer" became "address".
- **q0963**: Defined "assembly" (linked [[q0962]]), "stall", "branch" and "pipelined". Trimmed for length.
- **q0964**: Defined "microcontroller". Placeholders unchanged.
- **q0965**: Defined "register". Explained what `1u<<2` ORs in. Rewrote "compiled vs interpreted" without using "machine code". Placeholders unchanged.
- **q0967**: Defined "hex digit" and "parser".

Outside the basics blocks (one clear error):
- **q0959 quiz, item 1 explanation**: the JSON had `$SA + \bar S B$` with a single backslash. In JSON, `\b` is a backspace escape, so it rendered as a garbled expression. The text itself is correct against the page's convention (that expression would pick B when S = 0). Fixed the escape to `\\bar`. This was the only single-backslash escape in the quizzes of this group.
