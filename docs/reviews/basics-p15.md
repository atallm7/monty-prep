# Basics review: group p15 (q0632–q0673; rework, ECAD, packaging, IC fabrication, signals)

Method: I read each basics block against the page's answer, technical section and key numbers. I recomputed every worked-example number with `node -e`: dies per wafer, Poisson yield, cost per good die, L·di/dt, thermal resistances, Deal-Grove oxide, k1·λ/NA, Fourier coefficients, aliasing and PWM ripple. All were right except one rounding mismatch (q0637). I checked every `[[qNNNN]]` link against the target page's title, and all of them fit. I counted words without headings and kept every block at or under 330. `validate-content.mjs`: 0 errors.

OK as written (7): q0632, q0633, q0635, q0645, q0647, q0652, q0660.
Fixed (35): listed below.

- **q0634**: Dropped "scrape a little coating off" (undefined, and soldering pad to pin doesn't need it).
- **q0636**: Defined "footprint". Replaced "alternate pull-up resistor" (undefined) with "a second resistor".
- **q0637**: The example used 41 K/W, but its results (4.6 W, 2.3 W) only come out with the page's 41.4 K/W (192/41 = 4.68). It now uses 41.4 and states the 97-degree preheat step. Rewrote the thermal resistance definition in plain terms and said that a kelvin step equals a degree Celsius. Trimmed for length.
- **q0638** (behavioral): "At bring-up" became "When I first powered the board". Placeholders kept, no invented experience.
- **q0639** (behavioral): Same bring-up fix. The net-class bullet now explains traces. Trimmed to under 330.
- **q0640** (behavioral): Added a *[placeholder]* skeleton answer ("I wrote *[script]* in *[tool]*…"). Before this, the example had only the LED-ring math. Trimmed to fit.
- **q0641**: Defined "short". Fixed an implied mechanism: DRC checks the nominal ring against a rule that already has the drill and registration margin built in. It does not subtract the wander itself.
- **q0642**: Spelled out IC.
- **q0643**: Glossed capacitor. "Solder fillets" became "small solder joints".
- **q0644**: Defined trace in passing.
- **q0646**: Defined foundry and gate. Replaced "a true 3 nm feature … far too small to build a transistor channel", which conflicts with the page's point that some fin and nanosheet dimensions really are a few nm, with a correct statement. Trimmed.
- **q0648**: Defined ambient.
- **q0649**: HBM bullet no longer uses "bandwidth" undefined.
- **q0650**: Explained the number e. Tidied the confusing last sentence of the example.
- **q0651**: Trimmed from 335 to 329 words.
- **q0653**: "Capacitance", "Gb/s" and "GB/s" are now explained in plain words.
- **q0654**: Defined "lead".
- **q0655**: "Dissipates" became "turns into heat". Glossed mΩ.
- **q0656**: Defined pitch, nH and pH in passing. The underfill bullet no longer says "thermal strain". Trimmed.
- **q0657**: "Drive 10 pF with 2 ns edges" is now explained as charging a small load. The bridge sentence no longer lists jargon (on-die grid, substrate coupling). Trimmed.
- **q0658**: Defined implant and develop.
- **q0659**: "Lattice" became "orderly pattern".
- **q0661**: The worked example now states the resolution rule in words before the formula, and the undefined "CD" symbol is gone. Defined developing and implant.
- **q0662**: Defined lithography, film and oxide. Trimmed.
- **q0663**: Defined film and inert gas. "High-k gate films" became plain words.
- **q0664**: Tightened from about 324 to 312 words. "Features of about 20 nm" became "lines spaced about 20 nm apart": after quadruple patterning the 20 nm is the pitch, not the width. Mask is defined. λ is written out. EUV is no longer duplicated in the bullets.
- **q0665**: "Typically 0.23 mV" (the RMS quantization error) is now explained as the average error over many readings.
- **q0666**: Defined bandwidth. Took the jargon out of the bridge (impulse response, convolution, leakage).
- **q0667**: Tightened from 330 to 318 words. Added an amplitude bullet in place of the duplicate "line spectrum" one. Defined spectrum in passing.
- **q0668**: Defined oscilloscope and RMS. The anti-alias bullet no longer uses "low-pass".
- **q0669**: Removed "baseband". Rewrote the spectrum-copies sentence in plain words.
- **q0670**: Tightened. Switching ripple is now defined without "switching regulator". ADC is glossed.
- **q0671**: "Digital clocks, PWM outputs and switching regulators" became plain words. Took the jargon out of the bridge (4A/π, Gibbs, EMI). Trimmed.
- **q0672**: Tightened to 329 words. RC filter is defined in the bullets. Spelled out RC = 1 ms in the ripple example.
- **q0673**: Tightened. Defined DC. Dropped the dense |sin(nπD)| formula from the primer, since the page derives it.

Nothing left open. I found no factual errors outside the basics blocks.
