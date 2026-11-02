// PCB trace impedance model. Units: lengths in mm (any consistent unit works, only ratios matter).
// Microstrip: Hammerstad & Jensen, "Accurate models for microstrip computer-aided design", IEEE MTT-S 1980,
//   including their finite-thickness width correction (accuracy ≈ 0.2–1 % for 0.01 ≤ W/H ≤ 100, εr ≤ 128).
// Stripline (trace centred between two planes, plane spacing b = 2h + t): Wheeler 1978 thick-strip formula
//   (Wadell, "Transmission Line Design Handbook" §3.5).
// Edge-coupled differential microstrip: IPC-2141A approximation Zdiff ≈ 2·Z0·(1 − 0.48·e^(−0.96·s/h)).
// Edge-coupled differential stripline: IPC-2141A Zdiff ≈ 2·Z0·(1 − 0.347·e^(−2.9·s/b)).
// Simpler IPC-2141 microstrip estimate shown for comparison: Z0 ≈ 87/√(εr+1.41)·ln(5.98h/(0.8w+t)).
// Line constants: v = c/√εeff, tpd = √εeff/c, L' = Z0·√εeff/c, C' = √εeff/(Z0·c).

export const C0 = 299792458; // m/s
export const ETA0 = 376.730313668;

const coth = (x: number) => 1 / Math.tanh(x);
function z01(u: number) { const f = 6 + (2 * Math.PI - 6) * Math.exp(-Math.pow(30.666 / u, 0.7528)); return (ETA0 / (2 * Math.PI)) * Math.log(f / u + Math.sqrt(1 + (2 / u) ** 2)); }
function eeffHJ(u: number, er: number) {
  const a = 1 + Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49 + Math.log(1 + (u / 18.1) ** 3) / 18.7;
  const b = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
  return (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + 10 / u, -a * b);
}

export function microstrip(w: number, h: number, t: number, er: number) {
  const u = w / h, tn = t / h;
  let du1 = 0, dur = 0;
  if (tn > 1e-9) {
    du1 = (tn / Math.PI) * Math.log(1 + (4 * Math.E) / (tn * coth(Math.sqrt(6.517 * u)) ** 2));
    dur = 0.5 * (1 + 1 / Math.cosh(Math.sqrt(Math.max(0, er - 1)))) * du1;
  }
  const u1 = u + du1, ur = u + dur;
  const ee_r = eeffHJ(ur, er);
  const z0 = z01(ur) / Math.sqrt(ee_r);
  const eeff = ee_r * (z01(u1) / z01(ur)) ** 2;
  return { z0, eeff };
}

/** Symmetric stripline: h = dielectric between the trace and EACH plane, so b = 2h + t. */
export function stripline(w: number, h: number, t: number, er: number) {
  const b = 2 * h + t; const x = t / b;
  let dw = 0;
  if (x > 1e-9) {
    const mm = 2 / (1 + (2 / 3) * x / (1 - x));
    dw = (x / (Math.PI * (1 - x))) * (1 - 0.5 * Math.log((x / (2 - x)) ** 2 + Math.pow(0.0796 * x / (w / b + 1.1 * x), mm)));
  }
  const m = w / (b - t) + dw;
  const k = 8 / (Math.PI * m);
  const z0 = (ETA0 / (4 * Math.PI * Math.sqrt(er))) * Math.log(1 + (4 / (Math.PI * m)) * (k + Math.sqrt(k * k + 6.27)));
  return { z0, eeff: er, b };
}

export function ipcMicrostrip(w: number, h: number, t: number, er: number) { return (87 / Math.sqrt(er + 1.41)) * Math.log(5.98 * h / (0.8 * w + t)); }

export type Kind = 'microstrip' | 'stripline' | 'diff-microstrip' | 'diff-stripline';
export type TraceIn = { type: Kind; w: number; h: number; t: number; er: number; s: number };

export function solve(p: TraceIn) {
  const strip = p.type === 'stripline' || p.type === 'diff-stripline';
  const se = strip ? stripline(p.w, p.h, p.t, p.er) : microstrip(p.w, p.h, p.t, p.er);
  const b = 2 * p.h + p.t;
  let zdiff = NaN;
  if (p.type === 'diff-microstrip') zdiff = 2 * se.z0 * (1 - 0.48 * Math.exp(-0.96 * p.s / p.h));
  if (p.type === 'diff-stripline') zdiff = 2 * se.z0 * (1 - 0.347 * Math.exp(-2.9 * p.s / b));
  const tpd = Math.sqrt(se.eeff) / C0;             // s/m
  return {
    z0: se.z0, eeff: se.eeff, zdiff, zodd: zdiff / 2,
    tpd_ps_mm: tpd * 1e12 / 1000, tpd_ps_in: tpd * 1e12 * 0.0254,
    vFrac: 1 / Math.sqrt(se.eeff),
    L_nH_mm: se.z0 * tpd * 1e9 / 1000, C_pF_mm: tpd / se.z0 * 1e12 / 1000,
    ipc: strip ? NaN : ipcMicrostrip(p.w, p.h, p.t, p.er),
  };
}

/** The impedance used for design: Zdiff for differential pairs, Z0 otherwise. */
export const designZ = (p: TraceIn) => { const r = solve(p); return p.type.startsWith('diff') ? r.zdiff : r.z0; };

/** Width giving the target impedance (Z falls monotonically with w); bisection in log(w). */
export function widthFor(target: number, p: TraceIn) {
  let lo = Math.log(p.h * 0.002), hi = Math.log(p.h * 60);
  const f = (lw: number) => designZ({ ...p, w: Math.exp(lw) }) - target;
  if (f(lo) < 0 || f(hi) > 0) return NaN;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  return Math.exp((lo + hi) / 2);
}
