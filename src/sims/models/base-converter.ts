// Number bases, two's complement and endianness for 8/16/32-bit words.
// - Positional notation: N = Σ d_k · b^k. Converting decimal -> base b uses repeated division:
//   N = q·b + r, the remainders r read bottom-up are the digits (LSD first).
// - Two's complement (n bits): the bit pattern of a negative x is 2^n + x = (~|x|) + 1 (invert, add one).
//   Signed range −2^(n−1) … 2^(n−1)−1, unsigned 0 … 2^n−1. Interpreting pattern u as signed: u − 2^n if MSB set.
// - Endianness: big-endian stores the most-significant byte at the lowest address, little-endian the least.
// All arithmetic stays below 2^53, so plain Numbers are exact (no 32-bit bitwise sign surprises).

export type Parsed = { ok: true; value: number; base: 2 | 8 | 10 | 16; digits: string; neg: boolean } | { ok: false; error: string };

export function parseValue(raw: string): Parsed {
  let s = String(raw ?? '').trim().replace(/[_\s]/g, '');
  if (!s) return { ok: false, error: 'Enter a number' };
  let neg = false; if (s[0] === '-' || s[0] === '−') { neg = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
  let base: 2 | 8 | 10 | 16 = 10; const low = s.toLowerCase();
  if (low.startsWith('0x')) { base = 16; s = s.slice(2); } else if (low.startsWith('0b')) { base = 2; s = s.slice(2); }
  else if (low.startsWith('0o')) { base = 8; s = s.slice(2); } else if (/^[0-9a-f]+h$/i.test(s)) { base = 16; s = s.slice(0, -1); }
  const valid = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-f]+$/i }[base];
  if (!s || !valid.test(s)) return { ok: false, error: `"${raw}" is not a valid base-${base} number` };
  const v = parseInt(s, base);
  if (!Number.isSafeInteger(v) || v > 2 ** 40) return { ok: false, error: 'Number too large (max 32 bits)' };
  return { ok: true, value: neg ? -v : v, base, digits: s.toUpperCase(), neg };
}

export type Encoded = {
  bits: number; value: number; u: number; signed: number; fitsUnsigned: boolean; fitsSigned: boolean; msb: 0 | 1;
  bin: string; oct: string; dec: string; hex: string;
};
const mod = (a: number, m: number) => ((a % m) + m) % m;
export function encode(value: number, bits: number): Encoded {
  const M = 2 ** bits; const u = mod(value, M); const msb = (u >= M / 2 ? 1 : 0) as 0 | 1;
  return {
    bits, value, u, signed: msb ? u - M : u,
    fitsUnsigned: value >= 0 && value < M, fitsSigned: value >= -M / 2 && value < M / 2, msb,
    bin: u.toString(2).padStart(bits, '0'), oct: u.toString(8).padStart(Math.ceil(bits / 3), '0'),
    dec: String(u), hex: u.toString(16).toUpperCase().padStart(bits / 4, '0'),
  };
}

/** Repeated division of n by base: each step n = q·base + r. Digits are the remainders read bottom-up. */
export function divisionSteps(n: number, base: number): { n: number; q: number; r: number }[] {
  const out: { n: number; q: number; r: number }[] = []; let x = Math.floor(Math.abs(n));
  if (x === 0) return [{ n: 0, q: 0, r: 0 }];
  while (x > 0) { const q = Math.floor(x / base), r = x - q * base; out.push({ n: x, q, r }); x = q; }
  return out;
}

/** Positional expansion: digit string in base b -> terms d·b^k (most significant first). */
export function expansion(digits: string, base: number): { d: number; k: number; term: number }[] {
  const ds = digits.toUpperCase().split(''); const n = ds.length;
  return ds.map((c, i) => { const d = parseInt(c, 16); const k = n - 1 - i; return { d, k, term: d * base ** k }; });
}

/** Two's-complement negation steps for a negative value: |x| -> invert -> +1. */
export function twosSteps(value: number, bits: number) {
  const M = 2 ** bits; const mag = Math.abs(value) % M;
  const magBin = mag.toString(2).padStart(bits, '0');
  const inv = magBin.split('').map(b => (b === '1' ? '0' : '1')).join('');
  const result = mod(parseInt(inv, 2) + 1, M);
  return { magBin, inv, plusOne: result.toString(2).padStart(bits, '0'), result };
}

/** Bytes of the word, most-significant first. */
export function bytesBE(u: number, bits: number): number[] {
  const n = bits / 8; const out: number[] = []; let x = u;
  for (let i = 0; i < n; i++) { out.unshift(x % 256); x = Math.floor(x / 256); }
  return out;
}
export function memoryLayout(u: number, bits: number, base: number) {
  const be = bytesBE(u, bits); const le = [...be].reverse();
  return be.map((_, i) => ({ addr: base + i, big: be[i], little: le[i] }));
}
export const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, '0');
