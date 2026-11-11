# Basics review: group p20 (q0842–q0883, sensors, IMUs, cameras, LiDAR, start of digital logic)

Method: I read each basics block against the page's short answer, technical section and key numbers, and recomputed every worked number with `node -e`. All were correct except one example that left out a needed input (q0845). Links were checked against the linked pages' titles. Blocks above about 325 words were tightened. `validate-content.mjs`: 0 errors.

OK as written (9): q0842, q0843, q0844, q0846, q0847, q0851, q0855, q0862, q0865. Fixed (33): listed below.

- **q0845**: The example claimed the false tilt "stays near 0.25 degrees" but never gave the update rate, and that number depends on it. Added "100 times a second", which matches the page (0.98 × 0.5 × 0.01 / 0.02 ≈ 0.25°). Trimmed the analogy.
- **q0848**: The caveat "neither sensor can fix turning about the vertical" was muddled, since the gyro does measure yaw. It now says the accelerometer gives no correction for yaw because gravity looks the same whichever way you face. Removed "described above" and a padding sentence.
- **q0849**: The two-bucket analogy was physically wrong: a bucket draining into another loses level, so it does not model integration. Replaced it with a coin-jar double sum (1, 2, 3, 4 → 1, 3, 6, 10).
- **q0850**: "Match the bus" (undefined) became "the data link to the processor". The example now uses the defined term "free-run". Tightened. **Quiz fix:** the numeric item asks for the transfer time ignoring address overhead (270 µs, correct). Its explanation then quoted "~360 µs with address overhead" without saying where the extra time comes from. It now says 270 µs is the data-byte time asked for, and that the address and register bytes (about 3 bytes, 67.5 µs) plus start and stop conditions are why the page budgets about 360 µs.
- **q0852**: Glossed "photon".
- **q0853**: "Response is also bent" became an explicit statement of nonlinearity. Trimmed.
- **q0854**: The flash-back-friend analogy became a blink-in-a-known-pattern one that matches modulation. Clarified the sunlight caveat.
- **q0856**: Fixed the magnifying-glass picture. Gave a plain reason for the square-root noise. Trimmed.
- **q0857**: "Focal length" was used in the example but never defined; it now is. Merged and then dropped the redundant OIS/EIS bullets, removed "radians", and trimmed to 310 words.
- **q0858**: "Read noise" is now glossed. Trimmed.
- **q0859**: Trimmed.
- **q0860**: "Mains" became "wall power (as in Europe)". Trimmed.
- **q0861**: The dynamic-range example used undefined "full well", "read noise", "stops" and "dB". These are now explained in passing, and dB is dropped.
- **q0863**: Glossed JPEG.
- **q0864**: Tidied the echo sentence.
- **q0866**: Removed a filler link to q0864 from the stopping-distance bullet. Changed "nearly 185 m" to "about 185 m" (the page says 184).
- **q0867**: "Focal length of 1000 pixels" is now explained. Replaced the vague "LiDAR gets only a few hundred beams" caveat with a correct one about sparse points. Dropped the unused calibration bullet.
- **q0868**: Removed a redundant sentence in the analogy.
- **q0869**: Showed the 56-point split (7 × 8). "Packets" became plain words.
- **q0870**: Replaced the cryptic "misses angle errors across the beam" with an explicit pointing-error caveat. Rewrote "3 mrad" in degrees. Glossed rise time and SNR.
- **q0871**: Removed the dangling "A sensor also has drift and noise". "Bow" became "curve (nonlinearity)".
- **q0872**: Replaced "rms" and "tempco" with plain words.
- **q0873**: Explained the ±4 mV (two standard errors).
- **q0874**: Replaced the undefined "logic edge", "gate" and "ADC" with plain words or definitions.
- **q0875**: Glossed hexadecimal and 0x.
- **q0876**: Glossed hexadecimal and ADC. Trimmed.
- **q0877**: Replaced the undefined "TTL", "translator" and "rail". Trimmed.
- **q0878**: Defined the transistor's gate, drain and source, and the word "rail". Explained "inverts" in the example. Replaced "20 MHz SPI" and "latch version" with plain words.
- **q0879**: Rewrote the garbled NMOS definition. Made the open-drain caveat explicit. Added the bridge sentence.
- **q0880**: Defined clock skew and logic gates. Plain-worded the bridge ("inequalities", "board-level").
- **q0881**: Glossed "enable" and "glitch". Replaced the confusing door caveat with the real point: a flip-flop's input counts only at the edge.
- **q0882**: "NOR gate" and "cross-coupled" were used undefined; both are now defined, with a link to q0889. Merged the bistable bullet into positive feedback.
- **q0883**: Glossed "inverter", "fF" and "sense amplifier". Removed "cache" jargon. Trimmed.

Left open: none. The non-standard spellings in question titles were left as they are, as instructed.
