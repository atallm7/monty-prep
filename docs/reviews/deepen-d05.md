# Review: deepen batch d05 (expanded `::: deep` sections)

Scope: q0592, q0600, q0604, q0605, q0606, q0607, q0608, q0610, q0611, q0612. Every new equation and number in the expanded deep sections was recomputed with node. New figures were rendered and checked: q0592 plots, the q0607 guarded-ICT circuit (preview-circuit plus page shot) and floor plan, and the q0608 score-distribution plot. There are 0 KaTeX errors on any page, and `validate-content` reports 0 errors and no warnings for these ids.

- **q0592**: OK. The constant-power knee (3.67 W / 0.5 A = 7.33 V), the 9 V corner (0.41 A), the soft-start current (0.165 A out, 0.05 A in), input-cap charging (0.53 ms), the ground-lead reactance (28 Ω), the efficiency burden error (91.5 % reads as 90.0 %) and the guard band all check. Both plots render and match their equations. The deep text agrees with the 1.5–2× limit rule elsewhere on the page.
- **q0600**:
  - The 0402 weight was wrong (1 mg is about 10 µN, not 12 µN). Fixed.
  - The Cpk example used the machine's own σ (16.7 µm) right after deriving a total σ of 21 µm. It now uses 21 µm: Cpk 1.6 at ±100 µm and 0.95 at ±60 µm (0.43 % out), with a note on the trap.
  - The self-alignment claim was overstated ("fine-pitch ICs get no such help"). BGAs self-centre well. It now says the help is weaker for fine-pitch QFP/QFN and uses a 0.4 mm-pitch QFP as the example.
  - The feeder mispick text wrongly turned a 0.5 % rate on one feeder into 2 missing parts per 400-part board. It now says this is about 2 retries per board across all placements, and only the ones that escape vision become missing parts.
  - Kinematics (t = 2√(d/a), 9,000 and 20,000 CPH), vacuum force (7.5 mN, 1.7 N, 85 m/s²), the RSS error budget (63 µm) and thermal growth (22.5 µm) are all OK.
- **q0604**: OK. DPMO/Poisson (296 boards), the layered-cost chain (USD 3.45 vs 6.44, and 3.40 vs 3.20 at a USD 40 escape), Williams-Brown DL = 1 − Y^(1−T) (0.30 %, 0.15 %, 0.030 %, with the derivation correct) and combined coverage (99.55 %) all check.
- **q0605**: Clarified where the "60/6 = 10 s" panel figure comes from (a 60 s panel test). Everything else checks: availability sizing (2.63, so 3 stations at 87.5 % utilization, or 65.6 % with 4), contact drop (20 mV and 200 mV against a ±99 mV window), %GRR = 6σ/tol = 15.2 % (3.3 mV needed for 10 %), best-of-three escape (87.5 %) and breakeven (1,698 boards).
- **q0606**:
  - The capacitor-charge example charged the 47 µF on the 3.3 V rail to 5 V. It now gives 100 µF·5 V + 47 µF·3.3 V = 655 µC, which is 4.4 ms at 150 mA, and the board is tied explicitly to the technical section's 85 mA example.
  - "Step four / step seven" referred to the wrong table. It now says power-up check / radio self-test.
  - The 120 mA "high Iq" example sat exactly on the 120 mA fail window. It is now 130 mA.
  - The time budget (82 UPH; 45.5 s at 115.2 kbaud and 5.7 s at 921.6 kbaud for 512 KiB; abort saving 1.36 s) and the hipot Y-cap current (1.24 mA) are OK.
- **q0607**:
  - The circuit caption referred to an unlabeled "node B". It now names the right-hand node of R_x (the op-amp inverting input).
  - "Thermal-pad void limits are often tighter" is doubtful, since thermal-pad limits are usually looser. Reworded to a neutral statement.
  - The guarded-ICT schematic is electrically correct (sneak 5 kΩ unguarded, midpoint guard to ground, transimpedance amp). The area ratio (0.88), SPI window (0.0075–0.0225 mm³), void area fractions (9 % and 25 %), buffer fill (2 h, 89 %) and bottleneck (60 to 80 UPH) are OK.
- **q0608**: The resolution example used (15/5)² = 9× = 144 images. With the ceilings that the page itself uses, a 20 × 15 mm FOV gives 10 × 10 = 100 images, so 25 s capture and 27 s per board (still above takt). Fixed. Also verified: reflection φ = 2θ, the false-call/escape table (2.3 %, 0.62 %/6.7 %, 0.135 %/15.9 %/74 %, 0.023 %/30.9 %/21 %), d' ≈ 6.2, the Wilson interval for 196/200 (95.0–99.2 %) and the rule of three (3 %). The plot renders correctly (peak 0.040).
- **q0610**: OK. The two-point calibration (0.8101 mV/code, −7.13 mV, +0.55 % gain error, 1243 vs 1241 codes, −9.4 mV at 3 V), reference propagation (0.04 %), averaging, load-step drops (1.2 mV, 36 mV) and Cpk 2.29 all check.
- **q0611**:
  - The step-time sentence mislabelled the 113 ms step as the "long hop". It is the 20 mm hop: 50 mm gives 150 ms and 5 mm gives 82 ms. Fixed, and the ~27 % saving is now tied to replacing 20 mm hops with 5 mm hops.
  - Probe-life hours assumed 8 min per board, which contradicts the page's 2,000 steps × 0.1 s = 3.3 min. Now 55 h.
  - RC settling (46 and 69 ms), Holm contact (150 MPa, a = 30 µm, 2.5 mΩ) and the capacitor ramp are OK.
- **q0612**:
  - The board-sag model's "net 20 kPa" is not supported by the page's own forces (80 kPa vacuum minus 1,500 probes at 100–200 g over 0.06 m² leaves about 30–55 kPa). Kept 20 kPa as a stated gentle case and added the comparison. Also flagged that the 100 mm (4.5 mm sag) figure is outside small-deflection theory.
  - The probe-stub di/dt example implied the net's switching current flows through a probe stub. It now applies to the tester driving a node through the probe.
  - The "passes through the fixture at low speed" sentence was unclear. Reworded.
  - The δ ∝ L⁴ table (0.036, 0.58 and 4.5 mm; EI = 5.8e-3 N·m²), contact statistics (0.15 %, 1.5 % and 13.9 %), RSS alignment (0.087 mm), stub resonance (712 MHz, 45 Ω) and 10 nH for a 15 mm, 1 mm-diameter wire are OK.

Remaining concerns (not changed):
- Many new figures are labelled as assumptions (vacuum level, probe contact resistance, FR-4 modulus, AOI score distributions). They are reasonable, and UNCERTAIN callouts are present.
- q0606 still uses two different example boards: the technical section's 85 mA, 3.3 V board and the deep table's 20–60 mA sensor node. The deep text now says which one it uses.
