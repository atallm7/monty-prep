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
const cache = new Map<string, (...a: number[]) => number>();


type Node = (env: Record<string, unknown>) => number;
/**
 * Small Pratt parser that compiles an expression to closures. No eval/new Function, so it works under a
 * strict Content-Security-Policy (claude.ai artifacts). Precedence, lowest first:
 * ?: , || , && , == != , < <= > >= , + - , * / % , unary - + ! , ^ / ** (right-assoc), call/atom.
 * Unary minus binds looser than power, so -x^2 = -(x^2), the standard math reading.
 */
function parse(src: string): Node {
  const toks: string[] = [];
  const re = /\s*(\d*\.?\d+(?:[eE][-+]?\d+)?|[A-Za-z_]\w*|\*\*|<=|>=|==|!=|&&|\|\||[-+*/%^()?:,<>!])/y;
  let m: RegExpExecArray | null; re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    const before = re.lastIndex; m = re.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(before))) break; throw new Error(`Unexpected "${src.slice(before).trim()[0]}" in expression: ${src}`); }
    toks.push(m[1]);
  }
  let i = 0;
  const peek = () => toks[i]; const next = () => toks[i++];
  const expect = (t: string) => { if (toks[i] !== t) throw new Error(`Expected "${t}" in expression: ${src}`); i++; };
  const BIN: Record<string, [number, (a: number, b: number) => number]> = {
    '||': [1, (a, b) => (a || b)], '&&': [2, (a, b) => (a && b)], '==': [3, (a, b) => +(a === b)], '!=': [3, (a, b) => +(a !== b)],
    '<': [4, (a, b) => +(a < b)], '<=': [4, (a, b) => +(a <= b)], '>': [4, (a, b) => +(a > b)], '>=': [4, (a, b) => +(a >= b)],
    '+': [5, (a, b) => a + b], '-': [5, (a, b) => a - b], '*': [6, (a, b) => a * b], '/': [6, (a, b) => a / b], '%': [6, (a, b) => a % b],
  };
  const atom = (): Node => {
    const t = next();
    if (t === undefined) throw new Error(`Unexpected end of expression: ${src}`);
    if (t === '(') { const e = ternary(); expect(')'); return e; }
    if (/^[\d.]/.test(t)) { const v = parseFloat(t); return () => v; }
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() === '(') {
        next(); const args: Node[] = [];
        if (peek() !== ')') { args.push(ternary()); while (peek() === ',') { next(); args.push(ternary()); } }
        expect(')');
        return env => { const f = env[t]; if (typeof f !== 'function') throw new Error(`Unknown function ${t}`); return (f as (...a: number[]) => number)(...args.map(a => a(env))); };
      }
      return env => { const v = env[t]; if (v === undefined) throw new Error(`Unknown name ${t}`); return v as number; };
    }
    throw new Error(`Unexpected "${t}" in expression: ${src}`);
  };
  const power = (): Node => { // right-associative; exponent may carry its own unary sign
    const base = atom();
    if (peek() === '^' || peek() === '**') { next(); const ex = unary(); return env => Math.pow(base(env), ex(env)); }
    return base;
  };
  const unary = (): Node => {
    const t = peek();
    if (t === '-') { next(); const e = unary(); return env => -e(env); }
    if (t === '+') { next(); return unary(); }
    if (t === '!') { next(); const e = unary(); return env => +!e(env); }
    return power();
  };
  const binary = (minPrec: number): Node => {
    let left = unary();
    for (;;) {
      const op = BIN[peek()]; if (!op || op[0] < minPrec) return left;
      next(); const right = binary(op[0] + 1); const l = left, fn = op[1];
      left = env => fn(l(env), right(env));
    }
  };
  const ternary = (): Node => {
    const c = binary(1);
    if (peek() !== '?') return c;
    next(); const a = ternary(); expect(':'); const b = ternary();
    return env => (c(env) ? a(env) : b(env));
  };
  const root = ternary();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i]}" in expression: ${src}`);
  return root;
}

export function compile(expr: string, args: string[] = ['x'], vars: Record<string, number> = {}): (...a: number[]) => number {
  const key = expr + '|' + args.join(',') + '|' + JSON.stringify(vars);
  const hit = cache.get(key); if (hit) return hit;
  const node = parse(expr);
  const base: Record<string, unknown> = { ...HELPERS, ...vars };
  const f = (...a: number[]) => { const env = args.length ? { ...base } : base; args.forEach((n, k) => { env[n] = a[k]; }); return Number(node(env)); };
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
