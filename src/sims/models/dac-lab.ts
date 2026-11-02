// DAC models with resistor mismatch.
// Ideal: Vout = Vref * code / 2^N, LSB = Vref / 2^N.
// R-2R (voltage mode): node i (i=0 LSB .. N-1 MSB, output at node N-1). Each node has a 2R leg to its bit source (Vref if bit=1 else 0),
//   series R between node i and i+1, and a 2R termination from node 0 to ground. KCL at each node gives a tridiagonal system G v = I (Thomas algorithm).
//   With ideal resistors this reproduces Vref*code/2^N exactly (checked in the test).
// Binary-weighted (inverting summer): R_i = R*2^(N-1-i), Rf = R/2:  Vout = Vref * Rf * sum(b_i / R_i) = Vref*code/2^N  (magnitude).
// Mismatch: every resistor gets a fixed pseudo-random error e in [-m, +m] (uniform, seeded) -> R(1+e).
// DNL_k = (V_k - V_{k-1}) / LSB - 1, INL_k = (V_k - k*LSB) / LSB (offset-free, gain-ideal reference line). DNL < -1 => non-monotonic.
export type Type = 'r2r' | 'weighted';

export function rng(seed: number) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
/** Resistor error factors (1+e): ladder uses 3N values (legs 2R x N, series R x (N-1), termination), weighted uses N+1 (bits + Rf). */
export function errors(type: Type, bits: number, mismatch: number, seed: number): number[] {
  const r = rng(seed * 7919 + bits * 104729); const n = type === 'r2r' ? 3 * bits : bits + 1;
  return Array.from({ length: n }, () => 1 + mismatch * (2 * r() - 1));
}

export function vout(type: Type, bits: number, vref: number, code: number, e: number[]): number {
  if (type === 'weighted') {
    const R = 1; let g = 0; // conductance sum from bits that are 1
    for (let i = 0; i < bits; i++) if ((code >> i) & 1) g += 1 / (R * 2 ** (bits - 1 - i) * e[i]);
    return vref * (R / 2) * e[bits] * g;
  }
  // R-2R: unknowns v[0..N-1]
  const R = 1, n = bits;
  const legG = (i: number) => 1 / (2 * R * e[i]);
  const serG = (i: number) => 1 / (R * e[bits + i]); // between node i and i+1
  const gT = 1 / (2 * R * e[3 * bits - 1]);
  const a = new Array(n).fill(0), b = new Array(n).fill(0), c = new Array(n).fill(0), d = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let diag = legG(i); d[i] = ((code >> i) & 1) * vref * legG(i);
    if (i === 0) diag += gT;
    if (i > 0) { diag += serG(i - 1); a[i] = -serG(i - 1); }
    if (i < n - 1) { diag += serG(i); c[i] = -serG(i); }
    b[i] = diag;
  }
  for (let i = 1; i < n; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
  const v = new Array(n).fill(0); v[n - 1] = d[n - 1] / b[n - 1];
  for (let i = n - 2; i >= 0; i--) v[i] = (d[i] - c[i] * v[i + 1]) / b[i];
  return v[n - 1];
}

export function transfer(type: Type, bits: number, vref: number, mismatch: number, seed: number) {
  const e = errors(type, bits, mismatch, seed); const N = 2 ** bits, L = vref / N;
  const v: number[] = [], dnl: number[] = [], inl: number[] = [];
  for (let k = 0; k < N; k++) {
    v.push(vout(type, bits, vref, k, e));
    inl.push((v[k] - k * L) / L); dnl.push(k === 0 ? 0 : (v[k] - v[k - 1]) / L - 1);
  }
  const mx = (a: number[]) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  const worst = dnl.reduce((bi, x, i) => (Math.abs(x) > Math.abs(dnl[bi]) ? i : bi), 0);
  return { e, v, dnl, inl, lsb: L, maxDnl: mx(dnl), maxInl: mx(inl), worstCode: worst, monotonic: dnl.every(x => x > -1 + 1e-12) };
}
