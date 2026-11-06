const PREFIXES: [number, string][] = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];

/** 4700, 'Ω' -> "4.7 kΩ" */
export function si(v: number, unit = '', digits = 3): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—';
  if (!isFinite(v)) return (v > 0 ? '∞' : '−∞') + (unit ? ' ' + unit : '');
  if (v === 0) return '0' + (unit ? ' ' + unit : '');
  const a = Math.abs(v);
  let [mult, p] = PREFIXES[PREFIXES.length - 1];
  for (const [m, pp] of PREFIXES) { if (a >= m * 0.9995) { mult = m; p = pp; break; } }
  const x = v / mult;
  let str = Number(x.toPrecision(digits)).toString();
  if (str.includes('e')) str = x.toFixed(2);
  return `${str.replace('-', '−')}${unit || p ? ' ' : ''}${p}${unit}`;
}

/** Plain number with sensible precision */
export function num(v: number, digits = 4): string {
  if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    const [m, e] = v.toExponential(Math.min(digits, 3) - 1).split('e');
    const sup = String(Number(e)).replace(/[-0-9]/g, c => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
    const mant = Number(m);
    return (Math.abs(mant) === 1 ? (mant < 0 ? '−' : '') + '10' : String(mant).replace('-', '−') + '×10') + sup;
  }
  return Number(v.toPrecision(digits)).toString().replace('-', '−');
}

export function pct(v: number, digits = 1) { return isFinite(v) ? (v * 100).toFixed(digits) + '%' : '—'; }

/** "4.7k" -> 4700; "10u" -> 1e-5; supports µ/u, k, M, m, n, p, G */
export function parseSI(s: string): number {
  const m = String(s).trim().replace(/,/g, '').match(/^(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*([TGMkmuµnpf]?)/i);
  if (!m) return NaN;
  const map: Record<string, number> = { T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, '': 1 };
  return parseFloat(m[1]) * (map[m[2]] ?? 1);
}

export function dB(x: number) { return 20 * Math.log10(Math.abs(x)); }
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function logspace(a: number, b: number, n: number) { const la = Math.log10(a), lb = Math.log10(b); return Array.from({ length: n }, (_, i) => 10 ** (la + (lb - la) * i / (n - 1))); }
export function linspace(a: number, b: number, n: number) { return Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)); }

/** E-series values */
export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
export function nearestE(v: number, series = E24) {
  const dec = 10 ** Math.floor(Math.log10(v)); let best = series[0] * dec;
  for (const d of [dec / 10, dec, dec * 10]) for (const e of series) { const c = e * d; if (Math.abs(Math.log(c / v)) < Math.abs(Math.log(best / v))) best = c; }
  return best;
}
