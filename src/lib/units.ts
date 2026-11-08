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

// ---- Free-text numeric answers (quiz) ----
const PFX: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 };
const BASE_UNITS = ['Hz', 'Ω', 'V', 'A', 's', 'W', 'F', 'H', 'm', 'g', 'J', 'N', 'S', 'Pa', 'dB', '°C', 'K', 'min', 'h', 'rpm', 'bits', 'x', '×', '%', '°'];
function normUnit(u: string): string {
  return u.replace(/\s+/g, '').replace(/μ/g, 'µ').replace(/[ΩΩ]/g, 'Ω').replace(/ohms?/gi, 'Ω').replace(/hertz/gi, 'Hz').replace(/^×$/, 'x').replace(/^°?C$/i, '°C').replace(/degrees?|deg/gi, '°');
}
const baseKey = (b: string) => normUnit(b).replace(/°/g, '').replace(/×/g, 'x').toLowerCase();
/** Split a unit such as "kΩ" into SI scale and base unit ("Ω"). Compound or unknown units keep scale 1. */
function splitUnit(raw: string): { scale: number; base: string } {
  const u = normUnit(raw);
  if (!u || u.includes('/')) return { scale: 1, base: u };
  if (BASE_UNITS.some(b => baseKey(b) === baseKey(u)) && !(u in PFX && u.length > 1)) return { scale: 1, base: u };
  if (u.length > 1 && PFX[u[0]] && BASE_UNITS.some(b => baseKey(b) === baseKey(u.slice(1)))) return { scale: PFX[u[0]], base: u.slice(1) };
  return { scale: 1, base: u };
}
function parseDecimal(s: string): number {
  const hasDot = s.includes('.'), hasCom = s.includes(',');
  if (hasDot && hasCom) { const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','; const grp = dec === '.' ? ',' : '.'; return Number(s.split(grp).join('').replace(dec, '.')); }
  if (hasCom) {
    const parts = s.split(',');
    if (parts.length > 2) return /^\d{1,3}(,\d{3})+$/.test(s) ? Number(parts.join('')) : NaN; // 1,234,567 only
    return /^\d{1,3},\d{3}$/.test(s) ? Number(parts.join('')) : Number(parts[0] + '.' + parts[1]); // "1,500" thousands, "7,5" decimal
  }
  return Number(s);
}
/**
 * Parse a typed answer into the scale of `unit` (the quiz item's unit). Accepts a Unicode minus, SI prefixes with or without a base unit
 * ("1.59k", "7500 Ω" for a kΩ item -> 7.5), a trailing unit that must match the item's unit, comma decimals and scientific notation.
 * Returns NaN when it cannot be understood or the unit does not match.
 */
export function parseNumericAnswer(input: string, unit = ''): number {
  let s = String(input).trim().replace(/[−–—‒]/g, '-').replace(/ | /g, ' ');
  const m = s.match(/^([+-]?)\s*((?:\d[\d.,]*|[.,]\d+))\s*(?:(?:[eE]\s*([+-]?\d+))|(?:[x×*]\s*10\s*\^?\s*([+-]?\d+)))?\s*(.*)$/);
  if (!m) return NaN;
  const mant = parseDecimal(m[2]);
  if (!isFinite(mant)) return NaN;
  const exp = Number(m[3] ?? m[4] ?? 0);
  let v = (m[1] === '-' ? -1 : 1) * mant * 10 ** exp;
  const rest = normUnit(m[5]);
  const item = splitUnit(unit);
  if (!rest) return v;
  // trailing text: "<prefix>?<item base>" or a bare prefix
  const whole = baseKey(rest) === baseKey(item.base) && item.base !== '';
  if (whole) return v / item.scale;
  if (rest.length > 1 && PFX[rest[0]] && item.base && baseKey(rest.slice(1)) === baseKey(item.base)) return v * PFX[rest[0]] / item.scale;
  if (rest.length === 1 && PFX[rest]) return v * PFX[rest] / item.scale;
  return NaN;
}
