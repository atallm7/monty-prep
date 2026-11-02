// Tiny expression compiler for authored plot specs. Content is first-party (authored in content/),
// but we still reject obviously dangerous tokens.
const mod = (a: number, b: number) => ((a % b) + b) % b;
export const HELPERS: Record<string, unknown> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, abs: Math.abs, pow: Math.pow, min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
  PI: Math.PI, pi: Math.PI, E: Math.E, e: Math.E, Infinity, NaN,
  mod,
  step: (x: number) => (x >= 0 ? 1 : 0),
  clamp: (x: number, a: number, b: number) => Math.min(b, Math.max(a, x)),
  sqw: (t: number, duty = 0.5) => (mod(t, 1) < duty ? 1 : 0),       // period-1 square wave 0/1
  tri: (t: number) => { const u = mod(t, 1); return u < 0.5 ? 2 * u : 2 - 2 * u; }, // period-1 triangle 0..1..0
  saw: (t: number) => mod(t, 1),
  sinc: (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)),
  db: (x: number) => 20 * Math.log10(Math.abs(x)),
  hypot: Math.hypot,
};
const BAD = /\b(window|document|globalThis|Function|constructor|prototype|__proto__|import|fetch|eval|while|for)\b|=>|[;{}`\[\]]/;
const cache = new Map<string, (...a: number[]) => number>();

export function compile(expr: string, args: string[] = ['x'], vars: Record<string, number> = {}): (...a: number[]) => number {
  const key = expr + '|' + args.join(',') + '|' + JSON.stringify(vars);
  const hit = cache.get(key); if (hit) return hit;
  if (BAD.test(expr)) throw new Error(`Disallowed token in expression: ${expr}`);
  const names = Object.keys(HELPERS).filter(n => !args.includes(n) && !(n in vars));
  const vnames = Object.keys(vars);
  // eslint-disable-next-line no-new-func
  const fn = new Function('H', 'V', ...args, `const {${names.join(',')}} = H; ${vnames.length ? `const {${vnames.join(',')}} = V;` : ''} return (${expr.replace(/\^/g, '**')});`) as (...a: unknown[]) => number;
  const f = (...a: number[]) => Number(fn(HELPERS, vars, ...a));
  cache.set(key, f);
  return f;
}

/** Evaluate a scalar that may be a number or an expression string */
export function evalNum(v: number | string, vars: Record<string, number> = {}): number {
  if (typeof v === 'number') return v;
  return compile(String(v), [], vars)();
}

// ---- complex helpers for Bode ----
export type C = [number, number];
export const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cdiv = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
export const cabs = (a: C) => Math.hypot(a[0], a[1]);
export const carg = (a: C) => Math.atan2(a[1], a[0]);
/** Evaluate polynomial (descending powers) at s = jw */
export function polyAtJw(coeffs: number[], w: number): C {
  let acc: C = [0, 0];
  for (const c of coeffs) acc = [acc[0] * 0 - acc[1] * w + c, acc[0] * w + acc[1] * 0];
  return acc;
}
