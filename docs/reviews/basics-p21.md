# Basics review: p21 (q0884–q0925)

42 pages reviewed. Each has exactly one `::: basics` block (q0888–q0890 confirmed). All example numbers recomputed; all correct. 19 OK, 23 fixed. Only basics blocks were edited.

- q0885: replaced vague "conditions shift the line" with what actually moves the failure point (heat, lower supply voltage).
- q0887: added the missing **Flip-flop** term; corrected the synchronizer bullet (the *first* flop gets the full period to settle, not the second); the example used a button press but the MTBF numbers assume 100 MHz data toggling, so the input is now a signal changing ~100 million times a second; "MTBF" in the bridge replaced with plain words; trimmed to 329 words.
- q0889: XNOR was named but never defined; added it to the bubble bullet.
- q0890: removed [[q0105]] from the supply/ground bullet (q0105 is about CMOS/buffers, not supply and ground).
- q0894: removed [[q0891]] from "Combinational logic" (q0891 is gate truth tables); explained the AB + AC + BC notation.
- q0898: "first-level caches" was undefined jargon; now "two small, fast memories (caches)...".
- q0899: defined dynamic power; the example is voltage/frequency scaling, not a small core, so "on a small core" became "at low voltage".
- q0903: fixed garbled sentence about reading the PC on a stuck device.
- q0905: explained the 0x hex notation used in the example.
- q0907: "baud" and "cycles" explained (115,200 bits per second, 10 bits per byte; clock cycles).
- q0908: dropped undefined "ALU" from the example.
- q0910: "pipeline" was used undefined; added a one-clause explanation.
- q0911: "baud" replaced with bits per second.
- q0913: defined "assembler".
- q0914: defined "program counter" in the architectural-state bullet.
- q0916: pipeline / out-of-order / cache were used in plain words undefined; added a bullet; explained "binary"; trimmed to 327 words.
- q0918: spelled out IPC.
- q0919: defined "lanes" and "vertex"; "floating-point operations" made "arithmetic operations".
- q0920: defined "lanes".
- q0922: "serial, branchy code" put in plain words; "floating-point" made plain.
- q0923: "instruction front end serves 32 lanes" rewritten in plain words; "warp" removed from the divergence bullet; defined pJ and "scalar machine".
- q0924: defined lanes, fused multiply-add, FPS.
- q0925: [[q0924]] on the Offload bullet replaced by [[q0907]] (Offloading work from the CPU), which actually explains offload and its overhead; defined "matrix"; "FP32" made plain.
