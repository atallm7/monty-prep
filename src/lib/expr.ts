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
  ite: (c: number | boolean, a: number, b: number) => (c ? a : b), // piecewise: ite(x < 1, f1, f2)
};
const BAD = /\b(window|document|globalThis|Function|constructor|prototype|__proto__|import|fetch|eval|while|for)\b|=>|[;{}`\[\]]/;
const cache = new Map<string, (...a: number[]) => number>();


/** JS forbids `-a**b`; rewrite unary minus applied to a power as `-(a**b)` (standard math precedence). */
function fixUnaryPow(src: string): string {
  const operand = (s: string, i: number): number => { // returns end index (exclusive) of an operand starting at i
    while (s[i] === ' ') i++;
    if (s[i] === '-' || s[i] === '+') i++;
    if (s[i] === '(') { let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) return j + 1; } return s.length; }
    const m = /^[A-Za-z_][\w]*|^\d*\.?\d+(?:e[-+]?\d+)?/i.exec(s.slice(i)); if (!m) return -1;
    let j = i + m[0].length;
    if (s[j] === '(') { let d = 0; for (let k = j; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')' && --d === 0) return k + 1; } }
    return j;
  };
  let out = src;
  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== '-') continue;
      let p = i - 1; while (p >= 0 && out[p] === ' ') p--;
      if (p >= 0 && !'(,+-*/%<>=?:'.includes(out[p])) continue; // binary minus
      const a = operand(out, i + 1); if (a < 0) continue;
      let k = a; while (out[k] === ' ') k++;
      if (out.slice(k, k + 2) !== '**') continue;
      const b = operand(out, k + 2); if (b < 0) continue;
      out = out.slice(0, i + 1) + '(' + out.slice(i + 1, b) + ')' + out.slice(b); changed = true; break;
    }
    if (!changed) break;
  }
  return out;
}

export function compile(expr: string, args: string[] = ['x'], vars: Record<string, number> = {}): (...a: number[]) => number {
  const key = expr + '|' + args.join(',') + '|' + JSON.stringify(vars);
  const hit = cache.get(key); if (hit) return hit;
  if (BAD.test(expr)) throw new Error(`Disallowed token in expression: ${expr}`);
  const names = Object.keys(HELPERS).filter(n => !args.includes(n) && !(n in vars));
  const vnames = Object.keys(vars);
  // eslint-disable-next-line no-new-func
  const src = fixUnaryPow(expr.replace(/\^/g, '**').replace(/--(?=\s*[\d.(a-zA-Z])/g, '+ '));
  const fn = new Function('H', 'V', ...args, `const {${names.join(',')}} = H; ${vnames.length ? `const {${vnames.join(',')}} = V;` : ''} return (${src});`) as (...a: unknown[]) => number;
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
