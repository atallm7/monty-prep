// Four-resistor difference amplifier with resistor mismatch (ideal op-amp).
// R1: V1 → v−, R2: v− → vo, R3: V2 → v+, R4: v+ → gnd.
//   vo = V2·R4/(R3+R4)·(1 + R2/R1) − V1·R2/R1                         (superposition)
// With V1 = Vcm − Vd/2, V2 = Vcm + Vd/2:
//   Acm = R4/(R3+R4)·(1 + R2/R1) − R2/R1
//   Ad  = ½[R4/(R3+R4)·(1 + R2/R1) + R2/R1]
//   CMRR = |Ad/Acm|.  For one resistor off by ε: CMRR ≈ (1+G)/ε;
//   worst case with all four at ±ε tolerance: CMRR ≈ (1+G)/(4ε)   (e.g. Analog Devices MT-068 / Kitchin & Counts).
export type Mode = 'single' | 'worst';
export type DiffIn = { gain: number; mismatch: number; mode: Mode; r1?: number };

export function resistors({ gain, mismatch, mode, r1 = 10e3 }: DiffIn) {
  const e = mismatch;
  if (mode === 'single') return { R1: r1, R2: gain * r1, R3: r1, R4: gain * r1 * (1 + e) };
  // worst case: the ratio R4/R3 high and R2/R1 low (or vice versa)
  return { R1: r1 * (1 + e), R2: gain * r1 * (1 - e), R3: r1 * (1 - e), R4: gain * r1 * (1 + e) };
}

export function gains(p: DiffIn) {
  const { R1, R2, R3, R4 } = resistors(p);
  const kp = R4 / (R3 + R4) * (1 + R2 / R1), kn = R2 / R1; // vo = kp·V2 − kn·V1
  const acm = kp - kn, ad = (kp + kn) / 2;
  const cmrr = Math.abs(acm) < 1e-15 ? Infinity : Math.abs(ad / acm);
  return { kp, kn, acm, ad, cmrr, cmrrDb: 20 * Math.log10(cmrr), approx: p.mode === 'single' ? (1 + p.gain) / Math.max(1e-15, Math.abs(p.mismatch)) : (1 + p.gain) / (4 * Math.max(1e-15, Math.abs(p.mismatch))) };
}

/** Time waveforms: differential sine at fd plus common-mode noise sine at fcm (mains hum). */
export function waveforms(p: DiffIn & { vd: number; vcm: number; vdc?: number; fd?: number; fcm?: number; tEnd?: number }, n = 800) {
  const { kp, kn, ad, acm } = gains(p);
  const fd = p.fd ?? 1e3, fcm = p.fcm ?? 60, tEnd = p.tEnd ?? 2 / fcm, vdc = p.vdc ?? 0;
  const t: number[] = [], v1: number[] = [], v2: number[] = [], vo: number[] = [], ideal: number[] = [], cmPart: number[] = [];
  for (let i = 0; i < n; i++) {
    const tt = tEnd * i / (n - 1);
    const d = p.vd * Math.sin(2 * Math.PI * fd * tt), cm = vdc + p.vcm * Math.sin(2 * Math.PI * fcm * tt);
    const a = cm - d / 2, b = cm + d / 2;
    t.push(tt); v1.push(a); v2.push(b);
    vo.push(kp * b - kn * a); ideal.push(p.gain * d); cmPart.push(acm * cm);
  }
  return { t, v1, v2, vo, ideal, cmPart, ad, acm };
}
