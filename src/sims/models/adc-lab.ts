// ADC models. N bits, reference Vref: 2^N codes, LSB = Vref / 2^N (the ideal "FSR/2^N" convention).
// Quantizer (truncating, ideal):  code = floor(Vin / LSB) clipped to [0, 2^N - 1];  e_q = Vin - code*LSB in [0, LSB).
// Mid-tread (rounding) quantizer: code = round(Vin / LSB) -> e_q in [-LSB/2, +LSB/2].  Max full-scale-range input = Vref - 1 LSB.
// SQNR of a full-scale sine = 6.02 N + 1.76 dB (e_q uniform, rms = LSB/sqrt(12)).
// SAR: binary search, MSB first: trial = code | 2^i; keep bit if Vin >= DAC(trial) = trial*LSB. N clock cycles per conversion.
// Flash: 2^N - 1 comparators with thresholds k*LSB, k = 1..2^N-1 on an equal 2^N-resistor ladder; thermometer code, encoder = popcount.
// Conversion: V = code*Vref/2^N (code range 0..2^N-1, top code reads Vref-LSB); some parts specify V = code*Vref/(2^N-1) so that the top code reads Vref exactly.

export const levels = (bits: number) => 2 ** bits;
export const lsb = (bits: number, vref: number) => vref / 2 ** bits;

export function quantize(bits: number, vref: number, vin: number, round = false) {
  const L = lsb(bits, vref), max = 2 ** bits - 1;
  const raw = round ? Math.round(vin / L) : Math.floor(vin / L);
  const code = Math.min(max, Math.max(0, raw));
  const clipped = raw > max ? 'high' : raw < 0 ? 'low' : null;
  const vq = code * L;
  return { lsb: L, code, vq, err: vin - vq, clipped, max, sqnr: 6.02 * bits + 1.76, rmsErr: L / Math.sqrt(12) };
}

export type SarStep = { bit: number; trial: number; dac: number; keep: boolean; code: number };
export function sar(bits: number, vref: number, vin: number): { steps: SarStep[]; code: number } {
  const L = lsb(bits, vref); let code = 0; const steps: SarStep[] = [];
  for (let i = bits - 1; i >= 0; i--) {
    const trial = code | (2 ** i); const dac = trial * L; const keep = vin >= dac;
    if (keep) code = trial; steps.push({ bit: i, trial, dac, keep, code });
  }
  return { steps, code };
}

export function flash(bits: number, vref: number, vin: number) {
  const n = 2 ** bits - 1, L = lsb(bits, vref);
  const thresholds = Array.from({ length: n }, (_, k) => (k + 1) * L);
  const therm = thresholds.map(t => (vin >= t ? 1 : 0));
  return { thresholds, therm, code: therm.reduce((a: number, b) => a + b, 0), comparators: n, resistors: 2 ** bits };
}

/** code <-> voltage under both conventions. */
export function codeToV(code: number, bits: number, vref: number, conv: 'pow2' | 'pow2m1' = 'pow2') {
  return code * vref / (conv === 'pow2' ? 2 ** bits : 2 ** bits - 1);
}
export function vToCode(v: number, bits: number, vref: number) { return quantize(bits, vref, v).code; }
export const toBin = (code: number, bits: number) => code.toString(2).padStart(bits, '0');
