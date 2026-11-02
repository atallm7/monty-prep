// Single-event upsets, Hamming(7,4) / SECDED(8,4) and triple modular redundancy.
// Hamming (1950): code-word positions 1..7 = p1 p2 d1 p4 d2 d3 d4. Parity bit p_k (k = 1,2,4) covers every
// position whose index has bit k set:  p1 = d1⊕d2⊕d4, p2 = d1⊕d3⊕d4, p4 = d2⊕d3⊕d4.
// Syndrome s = s4 s2 s1 (s_k = XOR of covered positions incl. p_k) equals the position of a single flipped bit.
// Minimum distance 3: corrects 1 error, but a double error gives a non-zero syndrome and is MIS-corrected.
// SECDED (Hsiao/extended Hamming, d_min = 4): add p0 = XOR of all 7 bits. Decode with (s, overall parity P):
//   s=0,P=0 no error | s≠0,P=1 single error at s (correct) | s=0,P=1 error in p0 | s≠0,P=0 double error (detect only).
// TMR (von Neumann): majority voter y = ab + bc + ca; with module reliability R = e^{−λt} and a perfect voter
//   R_TMR = R³ + 3R²(1−R) = 3R² − 2R³, better than a single module only while R > 0.5 (λt < ln 2);
//   MTTF_TMR = ∫R_TMR dt = 3/(2λ) − 2/(3λ) = 5/(6λ) < 1/λ.

export type Bits = number[]; // 0/1 values

export function encode74(d: Bits): Bits {
  const [d1, d2, d3, d4] = d;
  return [d1 ^ d2 ^ d4, d1 ^ d3 ^ d4, d1, d2 ^ d3 ^ d4, d2, d3, d4];
}
/** SECDED code word: index 0 = p0 (overall parity), indices 1..7 = Hamming positions 1..7. */
export function encodeSecded(d: Bits): Bits {
  const h = encode74(d); return [h.reduce((a, b) => a ^ b, 0), ...h];
}
export const dataOf = (h7: Bits): Bits => [h7[2], h7[4], h7[5], h7[6]];
export const COVER: Record<1 | 2 | 4, number[]> = { 1: [1, 3, 5, 7], 2: [2, 3, 6, 7], 4: [4, 5, 6, 7] };
export const POS_NAMES = ['p0', 'p1', 'p2', 'd1', 'p4', 'd2', 'd3', 'd4'];

export type Decode = {
  syndrome: number; s: [number, number, number]; overall: number | null;
  status: 'ok' | 'corrected' | 'double' | 'p0';
  flipPos: number | null; // Hamming position (1..7) or 0 for p0 that the decoder flips
  corrected: Bits; data: Bits;
};

/** received: 7 bits (positions 1..7) or 8 bits (p0 + positions 1..7) when secded. */
export function decode(received: Bits, secded: boolean): Decode {
  const h = secded ? received.slice(1) : received.slice(); // h[i-1] = position i
  const bit = (pos: number) => h[pos - 1];
  const s1 = COVER[1].reduce((a, p) => a ^ bit(p), 0), s2 = COVER[2].reduce((a, p) => a ^ bit(p), 0), s4 = COVER[4].reduce((a, p) => a ^ bit(p), 0);
  const syndrome = s4 * 4 + s2 * 2 + s1;
  const overall = secded ? received.reduce((a, b) => a ^ b, 0) : null;
  let status: Decode['status'] = 'ok'; let flipPos: number | null = null; const fixed = h.slice();
  if (!secded) {
    if (syndrome) { status = 'corrected'; flipPos = syndrome; fixed[syndrome - 1] ^= 1; }
  } else {
    if (syndrome && overall) { status = 'corrected'; flipPos = syndrome; fixed[syndrome - 1] ^= 1; }
    else if (!syndrome && overall) { status = 'p0'; flipPos = 0; }
    else if (syndrome && !overall) status = 'double';
  }
  const corrected = secded ? [fixed.reduce((a, b) => a ^ b, 0), ...fixed] : fixed;
  return { syndrome, s: [s4, s2, s1], overall, status, flipPos, corrected, data: dataOf(fixed) };
}

const binom = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
/** P(exactly k of n independent bits flipped), per-bit upset probability p. */
export const pk = (n: number, k: number, p: number) => binom(n, k) * p ** k * (1 - p) ** (n - k);
/** Probability a 4-bit data word is delivered wrong / flagged, per protection scheme. */
export function wordFailure(p: number) {
  const none = 1 - (1 - p) ** 4;                       // any upset corrupts unprotected data
  const ham = 1 - pk(7, 0, p) - pk(7, 1, p);           // ≥2 upsets defeat Hamming(7,4)
  const secUncorr = 1 - pk(8, 0, p) - pk(8, 1, p);     // ≥2 upsets cannot be corrected by SECDED...
  const secSilent = 1 - pk(8, 0, p) - pk(8, 1, p) - pk(8, 2, p); // ...but doubles are detected; ≥3 may be silent
  return { none, ham, secUncorr, secSilent };
}

export const majority = (a: number, b: number, c: number) => (a & b) | (b & c) | (a & c);
export const rTMR = (r: number, rv = 1) => rv * (3 * r * r - 2 * r * r * r);
export const rSimplex = (lt: number) => Math.exp(-lt);
export const TMR_CROSSOVER_LT = Math.LN2; // R = 0.5
export const mttfRatio = 5 / 6; // MTTF_TMR / MTTF_simplex
