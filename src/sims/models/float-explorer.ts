// IEEE-754 binary16 / binary32 encode, decode, exact decimal expansion, ULP, and Q-format fixed point.
//  value = (-1)^s · 2^(e-bias) · (1 + m/2^p)   (normal, 0 < e < emax)
//  value = (-1)^s · 2^(1-bias) · (0 + m/2^p)   (subnormal, e = 0)
//  e = all ones: m = 0 -> ±infinity, m != 0 -> NaN.
export type Fmt = 'f32' | 'f16';
export const SPEC = { f32: { w: 32, eb: 8, mb: 23, bias: 127 }, f16: { w: 16, eb: 5, mb: 10, bias: 15 } } as const;
export type Cls = 'zero' | 'subnormal' | 'normal' | 'inf' | 'nan';

/** Round half to even for a non-negative double */
function rhe(v: number) { const f = Math.floor(v), d = v - f; return d > 0.5 || (d === 0.5 && f % 2 === 1) ? f + 1 : f; }

/** Generic encoder (used for binary16; cross-checked against DataView for binary32). Returns bit pattern as unsigned int. */
export function encodeGeneric(x: number, eb: number, mb: number): number {
  const bias = 2 ** (eb - 1) - 1, emax = 2 ** eb - 1;
  const sign = (x < 0 || Object.is(x, -0)) ? 2 ** (eb + mb) : 0;
  if (Number.isNaN(x)) return emax * 2 ** mb + 2 ** (mb - 1);
  const a = Math.abs(x);
  if (a === Infinity) return sign + emax * 2 ** mb;
  if (a === 0) return sign;
  const emin = 1 - bias;
  let e = Math.floor(Math.log2(a)); while (2 ** e > a) e--; while (2 ** (e + 1) <= a) e++;
  if (e < emin) { // subnormal: units of 2^(emin-mb); mantissa carry into exponent field is automatically correct
    const m = rhe(a / 2 ** (emin - mb)); return sign + m;
  }
  let m = rhe((a / 2 ** e - 1) * 2 ** mb);
  if (m === 2 ** mb) { m = 0; e++; }
  if (e + bias >= emax) return sign + emax * 2 ** mb;
  return sign + (e + bias) * 2 ** mb + m;
}
export function encode(x: number, fmt: Fmt): number {
  if (fmt === 'f16') return encodeGeneric(x, 5, 10);
  const dv = new DataView(new ArrayBuffer(4)); dv.setFloat32(0, x); return dv.getUint32(0);
}
export function decode(bits: number, fmt: Fmt): number {
  if (fmt === 'f32') { const dv = new DataView(new ArrayBuffer(4)); dv.setUint32(0, bits >>> 0); return dv.getFloat32(0); }
  const s = (bits >> 15) & 1, e = (bits >> 10) & 31, m = bits & 1023, sg = s ? -1 : 1;
  if (e === 0) return sg * m * 2 ** -24;
  if (e === 31) return m ? NaN : sg * Infinity;
  return sg * (1 + m / 1024) * 2 ** (e - 15);
}
export function fields(bits: number, fmt: Fmt) {
  const { eb, mb, bias } = SPEC[fmt]; const emax = 2 ** eb - 1;
  const s = Math.floor(bits / 2 ** (eb + mb)) & 1, e = Math.floor(bits / 2 ** mb) % 2 ** eb, m = bits % 2 ** mb;
  const cls: Cls = e === emax ? (m ? 'nan' : 'inf') : e === 0 ? (m ? 'subnormal' : 'zero') : 'normal';
  return { s, e, m, cls, unbiased: e === 0 ? 1 - bias : e - bias };
}
export const toBinary = (bits: number, fmt: Fmt) => (bits >>> 0).toString(2).padStart(SPEC[fmt].w, '0');
export const toHex = (bits: number, fmt: Fmt) => '0x' + (bits >>> 0).toString(16).toUpperCase().padStart(SPEC[fmt].w / 4, '0');

/** Exact decimal expansion of the stored value (finite values only), via BigInt: value = M·2^E */
export function exactDecimal(bits: number, fmt: Fmt): string {
  const { eb, mb, bias } = SPEC[fmt]; const f = fields(bits, fmt);
  if (f.cls === 'nan') return 'NaN'; if (f.cls === 'inf') return f.s ? '−∞' : '+∞';
  const M = BigInt(f.cls === 'normal' ? f.m + 2 ** mb : f.m); const E = (f.cls === 'normal' ? f.e : 1) - bias - mb; void eb;
  const sg = f.s ? '−' : '';
  if (M === 0n) return sg + '0';
  if (E >= 0) return sg + (M << BigInt(E)).toString();
  const k = -E; // M / 2^k = M·5^k / 10^k
  const digits = (M * 5n ** BigInt(k)).toString().padStart(k + 1, '0');
  const int = digits.slice(0, digits.length - k), frac = digits.slice(digits.length - k).replace(/0+$/, '');
  return sg + int + (frac ? '.' + frac : '');
}

/** Exact rational for a typed decimal string (supports 1e-5, .5, -3.25). null if not a plain decimal number. */
export function parseRational(s: string): { n: bigint; d: bigint } | null {
  const m = s.trim().replace(/_|,/g, '').match(/^([+-]?)(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i);
  if (!m || (!m[2] && !m[3])) return null;
  let n = BigInt((m[2] || '0') + (m[3] || '')); let d = 10n ** BigInt((m[3] || '').length);
  const ex = m[4] ? parseInt(m[4], 10) : 0; if (Math.abs(ex) > 400) return null;
  if (ex > 0) n *= 10n ** BigInt(ex); else if (ex < 0) d *= 10n ** BigInt(-ex);
  if (m[1] === '-') n = -n; return { n, d };
}
/** Exact stored value as a rational (finite only) */
export function storedRational(bits: number, fmt: Fmt): { n: bigint; d: bigint } {
  const { mb, bias } = SPEC[fmt]; const f = fields(bits, fmt);
  const M = BigInt(f.cls === 'normal' ? f.m + 2 ** mb : f.m) * (f.s ? -1n : 1n); const E = (f.cls === 'normal' ? f.e : 1) - bias - mb;
  return E >= 0 ? { n: M << BigInt(E), d: 1n } : { n: M, d: 1n << BigInt(-E) };
}
/** stored − typed, computed exactly then converted to a double; also relative error */
export function roundingError(typed: { n: bigint; d: bigint }, bits: number, fmt: Fmt) {
  const s = storedRational(bits, fmt);
  const num = s.n * typed.d - typed.n * s.d, den = s.d * typed.d;
  const SC = 10n ** 90n; const abs = Number((num < 0n ? -num : num) * SC / den) / 1e90 * (num < 0n ? -1 : 1);
  const tv = Number(typed.n < 0n ? -typed.n : typed.n) / Number(typed.d); // magnitude for relative error (double is fine)
  const tvv = Number((typed.n < 0n ? -typed.n : typed.n) * SC / typed.d) / 1e90 || tv;
  return { abs, rel: tvv === 0 ? 0 : abs / (typed.n < 0n ? -tvv : tvv), exact: num === 0n };
}

/** Spacing between adjacent representable numbers at |x| (ULP) */
export function ulpOf(bits: number, fmt: Fmt): number {
  const { mb, bias } = SPEC[fmt]; const f = fields(bits, fmt);
  if (f.cls === 'inf' || f.cls === 'nan') return NaN;
  return 2 ** ((f.cls === 'normal' ? f.e : 1) - bias - mb);
}
/** ULP as a function of magnitude (for the plot) */
export function ulpAt(a: number, fmt: Fmt): number {
  const { mb, bias } = SPEC[fmt]; const emin = 1 - bias;
  return 2 ** (Math.max(Math.floor(Math.log2(a)), emin) - mb);
}
export const maxFinite = (fmt: Fmt) => decode(fmt === 'f32' ? 0x7F7FFFFF : 0x7BFF, fmt);
export const minNormal = (fmt: Fmt) => (fmt === 'f32' ? 2 ** -126 : 2 ** -14);
export const minSubnormal = (fmt: Fmt) => (fmt === 'f32' ? 2 ** -149 : 2 ** -24);

/** Neighbour magnitudes: bit pattern ±1 (same sign) */
export function neighbours(bits: number, fmt: Fmt) {
  const { eb, mb } = SPEC[fmt]; const signBit = 2 ** (eb + mb); const mag = bits % signBit; const sgn = bits - mag;
  const up = mag + 1 < signBit ? decode(sgn + mag + 1, fmt) : NaN; const dn = mag > 0 ? decode(sgn + mag - 1, fmt) : NaN;
  return { larger: up, smaller: dn };
}

/** Signed Qm.n fixed point with w total bits and q fractional bits; round to nearest, saturate. */
export function toFixed(x: number, w: number, q: number) {
  const lo = -(2 ** (w - 1)), hi = 2 ** (w - 1) - 1;
  if (Number.isNaN(x)) return { raw: 0, value: 0, err: NaN, sat: false, step: 2 ** -q, min: lo / 2 ** q, max: hi / 2 ** q, intBits: w - 1 - q };
  let r = x * 2 ** q; r = r < 0 ? -rhe(-r) : rhe(r);
  const sat = r < lo || r > hi; r = Math.max(lo, Math.min(hi, r));
  const value = r / 2 ** q;
  return { raw: r, value, err: value - x, sat, step: 2 ** -q, min: lo / 2 ** q, max: hi / 2 ** q, intBits: w - 1 - q };
}
