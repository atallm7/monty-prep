# Basics QA review: group p18 (q0758–q0799: I2C/SPI/UART debugging, GPIO, timers, interrupts)

Method: I read each primer against the page's answer, technical section and key numbers. I recomputed every number in "The simplest example" (RC rise times, V_OL dividers, byte times, baud divisor error, UART drift tolerance, SPI MISO budget, timer periods, interrupt overhead, battery average current) and found no numeric errors. I checked every `[[link]]` against the target page's title and counted words without headings (all 4-heading blocks, now 180–330 words). `validate-content.mjs`: 0 errors. I found no errors outside the basics blocks.

Primer changes:
- q0758: Rewrote the wording note for a beginner: rise time is a duration, so "increase" taken literally means a slower climb; people usually mean the climb is too slow and want a shorter rise time; say which you mean, answer the usual case, then cover the other. Defined ns. Bridge now says "make the climb slower when you really want that". Trimmed the analogy caveat.
- q0759: Replaced vague "something extra sits in the path" with "an extra part adds charge or resistance"; internal pull-up "too big" now says its resistance is too high.
- q0763: The analogy's "trip time is the limit minus all of that" was muddled; now "real average speed ends up below the limit". Rise-time-limit link moved from q0755 (pull-up sizing) to q0758 (Changing I2C rise time).
- q0764, q0766: Glossed hexadecimal ("0x") in the examples.
- q0767: "GPIO pin" (undefined here) became "spare master pin"; defined "floats".
- q0768: Replaced hex bytes with bytes A, B, C; clarified "nearest the master".
- q0769: Grammar ("without being hurt").
- q0771, q0772: Replaced hex and "least significant bit first" with the binary byte and "rightmost bit first" (bit orders rechecked). q0772: defined "frame", "falling edge" and "oversampling" inline; removed the now-redundant start/stop bullet to stay under 330 words.
- q0774: The RS-232 bullet ("line standard with larger swings of both polarities", "transceiver") is now in plain words; "in series" became "in the wire".
- q0777: The watch analogy never said that watches drift; added that.
- q0778, q0779: Defined "falling edge" and "baud rate" inline.
- q0780: Replaced "floats" with plain words.
- q0781: Removed undefined "PWM"; defined "peripheral"; "clock crystal".
- q0782: "firmware" became "software"; named the I2C/SPI buses.
- q0783: Explained "input buffer"; "non-tolerant" and "magnitudes" became plain words.
- q0784: Added a Capacitance term (the example uses 100 pF); replaced "time constant" with the plain 25 Ω × 100 pF = 2.5 ns.
- q0785: "'Open' means the drain is left open" used "drain" undefined; now explains the drain is the transistor's output end, left unconnected.
- q0786: "stiff", "driver" and an undefined "rise time" are now plain words.
- q0787: Defined "peripheral" and "edge"; "noticeable energy" became "makes noise".
- q0788: "output stages" became "output circuits".
- q0789, q0790, q0792: Defined "flag" and "wraps around"; dropped undefined "register", "compare value", "edge".
- q0791: Replaced "interrupt routine" and "unsigned numbers" with plain descriptions.
- q0793: Defined "embedded product" and "interrupt"; "hung" became "frozen".
- q0794: Defined "clock cycles"; "flag" became "status bit".
- q0795: "register values" and "baud" became plain words.
- q0796: Defined "overflow"; "address" and "pushes" became plain words; trimmed to 329 words.
- q0797: Rewrote the confusing hot-desking analogy so that it matches the page (hardware saves a fixed set; compiler-added code saves any other registers the handler uses). Added a Compiler term; defined C; simplified the AVR sentence.
- q0799: Defined analog-to-digital converter, status register, and overrun; replaced "INT#" with "interrupt wire"; trimmed.

OK unchanged: q0760, q0761, q0762, q0765, q0770, q0773, q0775, q0776, q0798.
