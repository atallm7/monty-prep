# Basics review: group p17 (q0716–q0757, signal-integrity end and embedded systems: MCUs, logic levels, I2C, SPI, UART)

Method: I read each basics block against the page's short answer, long answer and key numbers. I recomputed every worked-example number with `node -e`. All were right, apart from rounding noted below. I checked every `[[qNNNN]]` link against the linked page's title, and every link was correct. The main fault was undefined jargon: units (ns, ps, µA, mAh, KB, pF, dB), hex notation (0x48), "LED", "firmware", "datasheet", "edge", "return path". Several blocks also went over 330 words once those terms were defined, so I trimmed them. `validate-content.mjs`: 0 errors.

OK as written (1): q0717. Fixed (41): listed below.

- **q0716**: Explained why the wave launches at half voltage (the 50 Ω source and the 50 Ω wire split it evenly). Trimmed.
- **q0718**: Defined "return path". Trimmed.
- **q0719**: The loose phrase "loop inductance also changes in the same direction" is now a plain sentence: a closer plane lowers inductance, which also lowers impedance. "Plates" became "trace and plane". Trimmed.
- **q0720**: "Scope" became "oscilloscope (a measuring instrument)".
- **q0721**: Defined ps and coax. Trimmed to fit.
- **q0722**: "10 Gb/s switching 1010 changes at 5 GHz" became "repeats 5 billion times a second". Spelled out decibels. Trimmed.
- **q0723**: Defined electric field and dB. Before this, dB was used with no definition.
- **q0724**: Replaced the unused "Wavelength" term with "Delay", which the example uses. Added why the swing repeats every 0.83 GHz (1/1.2 ns round trip). Removed "stub" from the bridge sentence.
- **q0725**: Defined DC and cross-section. The 14 MHz claim is now stated correctly: the skin becomes thinner than half the 35 µm trace.
- **q0726**: Replaced "swing" and "driver". Defined dB (6 dB = twice the height).
- **q0727**: Said what 6 dB of de-emphasis means in plain terms (repeats drop to half height).
- **q0728**: Defined ms, mA, µA and mAh (this is the first embedded page). Explained watchdog. Folded firmware into the flash bullet. Trimmed.
- **q0729**: Defined rpm, ms and µs. "Hardware timers" became "dedicated timer circuits". Dropped an analogy sentence that added nothing.
- **q0730**: Defined operating system, bits, KB, MHz and GHz. "Millions of times more memory" became "working memory": the comparison only holds for RAM.
- **q0731**: Defined ns and MHz. Removed "peripherals" (undefined). Named Cortex-M as "a typical small MCU".
- **q0732**: Defined analog-to-digital converter and buffer. The analogy now includes the peripherals (departments).
- **q0733**: Defined LED, firmware, and the LED's 2 V drop. "Turn on the clock to the pin's port" is now in plain words.
- **q0734**: Defined filter and samples. Removed "firmware" from the MCU bullet.
- **q0735**: Defined datasheet and KB. Rewrote the confusing bootloader/second-copy sentence.
- **q0736**: Replaced "registers and peripherals" in the Reset bullet. Defined supervisor chip.
- **q0737**: Defined byte and the acknowledge bit.
- **q0738**: Defined controller and register. "Rising edges" now in plain words. Gave the thin bridge sentence some content. Trimmed.
- **q0739**: Defined ns. "SPI driver" became "SPI output".
- **q0740**: Explained hex "0x" notation and datasheet. Trimmed.
- **q0741**: Replaced "edges", "bit-times" and "crystals" with plain words.
- **q0742**: Defined noise and chip family. The bridge now matches the page. Trimmed.
- **q0743**: Replaced the "Differential signaling" bullet, which the block never used, with "Supply voltage", which it does.
- **q0744**: Rewrote the muddled street/gate analogy (gate that can be pulled down, spring lifts it). Defined bus and hex.
- **q0745**: Explained hex. Tightened the analogy.
- **q0746**: "Bring-up" became plain words.
- **q0747**: Defined capacitance and pF. Replaced the jargon "pull-up window closes near 366 pF" with what it means. Fixed a ",so" typo. Trimmed.
- **q0748**: Explained hex. Explained STOP in the "Bus free" bullet.
- **q0749**: Explained MSB, hex and "shifted left". Trimmed.
- **q0750**: "Power cycle" and "binary address pins" now in plain words.
- **q0751**: Explained what the pull-up resistor does.
- **q0752**: Replaced the "Bit-banging" bullet (never used) with "Controller and target", which the block does use.
- **q0753**: Explained the SPI pin count (3 + 5) and capacitance. Removed "edges".
- **q0754**: Explained the "no crossing as for UART" remark, and hex.
- **q0755**: The bridge "covers a closed window" became plain words.
- **q0756**: Defined pF. "Transistor" became "chip".
- **q0757**: Defined pF. Clarified the "two plates" (of a capacitor).

Note: the rise-time examples (q0754–q0757) write the factor as 0.85 but quote the page's results, which use 0.8473 (186 ns, 223 ns, 621 ns, 149 ns). With 0.85 exactly you get 187, 224, 623 and 150 ns. I kept the page's values so the block agrees with the page text and quizzes, and the "≈" covers the gap.
