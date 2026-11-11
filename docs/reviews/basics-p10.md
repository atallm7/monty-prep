# Basics QA review: group p10 (q0422–q0463: motor drivers, protection, current sensing, PCB basics)

Method: I read each primer against the page's answer, technical section and key numbers. I recomputed every number in "The simplest example" with `node`/`python`, checked every `[[link]]` against the target page's title, and trimmed primers that ran past about 330 words (I counted words without the headings, with each inline formula counted as one word). `validate-content.mjs`: 0 errors.

Writer-flagged issues:
- **q0429** (the 12.5 V vs 12.7 V flag is on this page, not q0422): Fixed a page error. The diode-only clamp was given as $V_S+V_F=12.5$ V in the design section, the clamp-options list and the spoken answer, but the Zener case (30.7 V, 18.7 V), the plot and the sim caption all use $V_F=0.7$ V, so 12.7 V. I changed all three to 12.7 V. The 12.5 mW conduction-loss figures are a separate number and are correct.
- **q0459**: No error. The quiz answer of 22.8 W subtracts the 0.6 V across the sense resistor and says "about 24 W if you ignore $R_s$". That is consistent with the page's 12 W figure for 1 A.
- **q0463**: No error. 0.29 nH/mm and 0.115 pF/mm over 50 mm give 14.4 nH and 5.8 pF, which matches "about 14 nH" and "5.8 pF". The rounder 0.3 nH/mm and 0.1 pF/mm in the spoken answer are fine as approximations.
- **q0424**: No error. The Interpretations section answers the question as asked ("Which can brake the motor faster?", from the batch list).

Primer changes:
- q0422: The Inductor link pointed to q0144 (flyback). It now points to q0039 (What is inductance?). Replaced "body diode" with plain words. Trimmed.
- q0423: Defined on-resistance in passing, and replaced the undefined "split-rail workaround" with plain words. Removed a filler sentence. Trimmed.
- q0424: The Back-EMF link now points to q0346 (Motor vs generator) instead of q0334. Defined "rotor". Trimmed.
- q0425: Defined "buck converter", which was used but not explained. Replaced "silicon" with "switch size". Trimmed.
- q0426: Defined gate and source, which were used but not explained. Changed "PFET" to "P-channel FET" (it was never introduced as PFET). The 10-steps-above-the-platform analogy now uses meters, to match its own numbers. Moved the q0421 link to a Switch-node bullet. Trimmed.
- q0427: Removed an unused gate-resistor bullet and clarified the charge-pump bullet. Trimmed.
- q0428: "Real FETs saturate" now says they limit their own current ("saturate" was undefined). Rewrote the Miller bullet without "gate-drain capacitance". Trimmed.
- q0429: Defined "gate". Replaced the undefined "relay" in the analogy. The coil's energy ends up in the coil and the diode, not the coil alone. Trimmed.
- q0430: Defined "gate". Trimmed.
- q0431: Defined capacitor and inductor in passing. Removed the q0102 link (that page is about gate overvoltage, not gate capacitance). Removed a duplicate bullet. Trimmed.
- q0433: Replaced undefined "modulator", "transceivers" and "DC-DC converter" with plain descriptions. Trimmed.
- q0434: Removed the Phototransistor link to q0086 (NPN vs PNP). Removed "collector" from the CTR bullet and defined "pull-up". Trimmed.
- q0435: Defined "phototransistor". Trimmed.
- q0436: Removed the q0001 link (Ohm's law is not about conductive paths). Replaced "impedance" with plain words. Trimmed.
- q0437: Replaced the Miller-plateau bullet, which wrongly linked to q0428 and wasn't used, with a Gate oxide bullet (the primer relies on that term). Defined PFET and gate. Trimmed.
- q0438: Defined "Zener diode". Trimmed.
- q0439: Defined "ADC". Trimmed.
- q0440: The torque-constant link pointed to q0439 (Ways to measure current). I removed it and defined torque in plain words.
- q0441: Removed the Faraday bullet ($d\Phi/dt$, flux undefined). Reworded the CT, burden and Rogowski bullets without "primary/secondary/integrator". Defined DC and AC. Trimmed.
- q0442: Replaced "sensing across a MOSFET or inductor" with plain words and defined offset. Trimmed.
- q0444: Explained "linear" and "ppm". Removed a confused analogy sentence. Trimmed.
- q0445: Defined "offset". Trimmed.
- q0446: Defined "ADC".
- q0447: Defined dB (each 20 dB is ten times), which the 114 dB example needs. Trimmed.
- q0448: Defined drain/source. Replaced the unused desaturation bullet with Comparator, which the example uses. Removed "channel". Trimmed.
- q0449: Defined ADC and dB. Trimmed.
- q0450: Replaced "unipolar ADC" and "small differential range" with plain words. Trimmed.
- q0451: The CMRR leakage is 3.76 mV, which is 7.5% of 50 mV, not 7.6%. Defined "op-amp". Trimmed.
- q0452: Rewrote "In plain words" without "common-mode leakage" and "clipping". Trimmed.
- q0454: Replaced "junctions", "supervisor" and "flash" with plain words.
- q0455: The example said "100 kΩ ladder" but then computed with 99 kΩ. It now says the standard resistors total 99 kΩ (86.6 k + 3.57 k + 8.87 k, as on the page). The Voltage-reference link pointed to q0008 (voltage divider), so I moved it to a new Resistor-ladder bullet and dropped the unused Kelvin bullet. Defined "comparator".
- q0456: Defined "linear regulator" (24 W in a short is correct for that case). Trimmed.
- q0457: Defined buck converter, inductor, feedback path, on-time and OVP. Rewrote the analogy's fix sentence so it describes a valley limit. Trimmed.
- q0458: Replaced "legal range", "gates", "oxides and junctions", "ESD", "parasitic" and "sequencing" with plain words, and defined flash. Trimmed.
- q0459: The Sense-resistor link pointed to q0450 (When you need a CSA). It now points to q0443 (How a sense resistor works). Removed "integral" and "pass transistor". Trimmed.
- q0460: "fibreglass" is now "fiberglass" (American spelling). Explained "sheet resistance per square".
- q0461: "catalogue" is now "off-the-shelf", and "dead-bug builds for RF" is now plain words.
- q0462: Removed the Photolithography link to q0064 (Common semiconductor materials), and replaced "passives". Trimmed.
- q0463: Replaced "decoupling", "1 oz" and "50 Ω system" with plain words. Replaced the unused Crosstalk bullet with Ground plane, which the primer relies on. Trimmed.

OK with no change: q0432, q0443, q0453. I verified their numbers: 1 V ground bounce; 50 mV and 0.25 W; G = 64 rounded down to 50, 1.6 mA per LSB, clipping at 3.2 A.
