# Basics review: group p08 (q0338–q0379, motors)

Method: I read every basics block against the page's answer, short answer and the relevant technical lines. I recomputed every number in "The simplest example" with node/python, and checked every `[[qNNNN]]` link against the target page's title. Result: 42 pages: 3 OK (q0339, q0360, q0362), 39 fixed. Validator: 0 errors.

Brush drop consistency (q0357, q0358, q0359, q0366): the pages themselves already agree. q0357 gives 0.5–1 V per carbon brush, q0358 gives about 1 V per brush, and q0366 uses a pair total of 0.5–2 V, with 1 V as its worked value. The primers now say the same thing: roughly 0.5–1 V per brush, about 1–2 V for the pair. q0357 and q0358 use 1 V per brush (2 V total) as the top of that range. q0366 says its 1 V is the pair total, at the low end. I changed no page text.

Changes:
- q0338: Defined "winding" and Ω. The Inductor bullet now ties to steady state. Cut a filler sentence to stay under 330 words.
- q0340: Replaced the $v = L\,di/dt$ and ½LI² bullets, which used undefined symbols, with plain-word versions. Added a Diode bullet (the diode was used but never defined). The flyback-diode link pointed to q0339 (motors as loads). It now points to q0144 (Inductive flyback and protection).
- q0341: Explained $K_e$ (used but undefined) and radians.
- q0342: Replaced the bathtub analogy, which was wrong: a tub's inflow does not ramp. It is now a long heavy pipe, where inertia sets the ramp and friction sets the final flow. Defined inductance and henries.
- q0343: Replaced the empty "physical cause, not just a crowd" gap with the real difference (missing back-EMF). Removed "PWM duty" (undefined) from Soft start. Defined winding resistance. "Rotor" is now "shaft".
- q0344: Defined "polarity", "bridge leg" and "driver" in the Plugging and Shoot-through bullets.
- q0345: Defined "rotor".
- q0346: Removed the confusing hand-pump/air-motor pair. Explained $K_e\omega$ in words.
- q0347: "Energized" is now "when current flows".
- q0348: Defined "torque".
- q0349: Defined DC, brushes, rotor and mains.
- q0350: Defined torque. Replaced "stator/rotor/encoder" in the analogy with plain words. Explained B, T and L in $F = BIL$.
- q0351: Defined rpm. Replaced the unused PWM bullet with Frequency (Hz).
- q0352: Defined N·m and rad/s.
- q0353: Cut the formula load from three equations to two. The voltage equation is now in words. Defined N·m, rad/s and PWM duty.
- q0354: Defined driver, N·m, newtons and rad/s. The 400 rad/s motor speed is now labeled "suppose".
- q0355: The invented 50 µH / 0.5 A / 1 µs example is now labeled illustrative and tied to a 6 V supply (25 V is about 4× supply). "Thousands of times" is now "hundreds to thousands". Defined inductance, capacitor, µH and nF. Trimmed to 330 words.
- q0356: Removed "electric field" and defined DC. Defined diode. Snubber is now "small circuit".
- q0357: Contact drop is now 0.5–1 V per brush, matching the page. The 4 W example now says it uses the top of the range (1 V per brush, 2 V total).
- q0358: Added the 0.5–1 V per brush range to the bullet. The 1 V example is now framed as an example.
- q0359: Added the per-brush range. Added a Commutator bullet (the word was used but never defined). The 2,000 h example was already labeled "suppose" and is plausible against the page's "thousands of hours".
- q0361: Defined "play".
- q0363: Explained "electrical degrees".
- q0364: Defined rotor, phases and duty, and added a PWM link to q0145. Replaced "bus", "3-bit code" and "PI loop" with plain words. Trimmed.
- q0365: The 20 mA pin figure is now labeled typical. Plain-worded half-bridge and dead-time (they used "high-side" and "leg"). Defined MOSFET and added a PWM bullet. The shunt link went to q0001 (Ohm's law). It now goes to q0443 (How a sense resistor works).
- q0366: The brush drop is now "the two brushes together drop about 1 V, the low end of the usual range", and the bullet gives about 1–2 V for the pair. "Three-phase bridge" is now plain words. Defined rotor. The brush-wear link pointed to q0359. It now points to q0360 (Why brushes wear out).
- q0367: Rewrote the gear analogy. It said the shaft "turns slowly" and then that poles "do not reduce the real shaft speed". The gap is now that poles don't multiply torque like a real gear. Defined rpm, stator and iron loss. Replaced the unused Hall bullet with Electrical cycle.
- q0368: The resistive drop was "about 1 V → 20 V → 84%", but 20/24 is 83%. It now uses the page's 1.25 V → 20.1 V → 84%. Defined rpm, radians, N·m and duty.
- q0369: Defined MOSFETs, phases, microcontroller, rotor and duty.
- q0370: The invented 0.2 Ω / 30 A example is now labeled illustrative ("small brushless motor"). "Burns" is now "soon overheats". Defined rotor and DC.
- q0371: Defined PWM duty and firmware. "Power legs" is now "pairs of switches". Defined rotor.
- q0372: Defined MOSFET, microcontroller, comparator, PWM and dividers. The bootstrap and DC-link bullets are now plain words.
- q0373: Defined bits, telemetry and ground. "kbit/s" is now spelled out.
- q0374: Defined 4S LiPo, buck and linear regulators, and $R_{ds(on)}$. Removed "leg" and "high-side gate drive".
- q0375: "Electrical rpm" is now plain words. Defined rpm and pole pairs, and spelled out 4 kHz.
- q0376: Defined driver and phase. "Energized" is now "powered". Clarified holding torque.
- q0377: Defined rotor and hybrid/tooth pitch. Phase and microstepping are now plain words.
- q0378: Defined CNC. The belt "pitch" is now "teeth spaced 2 mm apart". "Phases" is now "the motor's two coils".
- q0379: Defined BLDC and lead screw. Replaced the unused Direct drive bullet with Control loop.

Open: none. Every number checks out. No errors found outside the basics blocks.
