// Package thermal network. All resistances/capacitances are TYPICAL illustrative values, not datasheet numbers.
// Steady state (thermal Ohm's law): ΔT = P·θ.  Two parallel paths from junction to ambient:
//   top path   : θJC + (θTIM + θSA)   [with heatsink]   or  θJC + θCA (bare case, natural/forced convection)
//   board path : θJB + θBA
//   θJA = (θtop ∥ θboard),  Tj = Ta + P·θJA,  heat split Q_top = (Tj−Ta)/θtop, Q_board = (Tj−Ta)/θboard.
// Forced convection: h ∝ √v (laminar flat-plate), so θ(v) = θ(0) / (1 + k·√v).
// Transient: 3-node lumped RC (junction, case+sink, board) integrated with backward Euler (unconditionally stable).
export type Pkg = 'qfn' | 'bga' | 'to220';
export type Overrides = {
  thetaJA?: number; // lumped junction-to-ambient (K/W): replaces the whole network (single resistor, no split)
  thetaJC?: number; thetaCS?: number; thetaSA?: number; thetaJB?: number; thetaBA?: number; // K/W, replace the typical values
  noBoard?: boolean; // open the board path (datasheet-style Tj = Ta + P(θJC+θCS+θSA))
};
export type ThermalIn = { P: number; Ta: number; pkg: Pkg; heatsink: boolean; airflow: number } & Overrides;

const num = (v: unknown): number | undefined => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return v != null && isFinite(n) && n >= 0 ? n : undefined; };
/** Read optional θ override params. A top-path override (thetaJC/CS/SA) without thetaJB/thetaBA opens the board path. */
export function overridesFromParams(p: Record<string, any>): Overrides {
  const o: Overrides = { thetaJA: num(p.thetaJA), thetaJC: num(p.thetaJC), thetaCS: num(p.thetaCS), thetaSA: num(p.thetaSA), thetaJB: num(p.thetaJB), thetaBA: num(p.thetaBA) };
  const top = o.thetaJC !== undefined || o.thetaCS !== undefined || o.thetaSA !== undefined;
  o.noBoard = top && o.thetaJB === undefined && o.thetaBA === undefined;
  return o;
}
const OPEN = 1e9, SHORT = 1e-6;

type PkgData = { name: string; jc: number; jb: number; ba: number; ca: number; tim: number; sa: number; cj: number; cc: number; csink: number; cb: number; note: string };
// θ in K/W, C in J/K (typical)
export const PKGS: Record<Pkg, PkgData> = {
  qfn: { name: 'QFN (exposed pad)', jc: 18, jb: 6, ba: 28, ca: 55, tim: 1.0, sa: 14, cj: 0.01, cc: 0.15, csink: 12, cb: 8, note: 'exposed pad soldered to board copper: most heat leaves through the board' },
  bga: { name: 'BGA (flip-chip)', jc: 7, jb: 11, ba: 26, ca: 38, tim: 0.8, sa: 9, cj: 0.02, cc: 0.4, csink: 20, cb: 10, note: 'balls and substrate carry heat to the board; lid to heatsink on top' },
  to220: { name: 'TO-220 (tab)', jc: 1.8, jb: 45, ba: 60, ca: 50, tim: 0.6, sa: 6, cj: 0.03, cc: 1.2, csink: 30, cb: 3, note: 'junction-to-tab is tiny; leads are a poor path, so the heatsink dominates' },
};

export const K_AIR = 0.9; // forced-convection factor, typical
const airDiv = (v: number, k = K_AIR) => 1 + k * Math.sqrt(Math.max(0, v));

export function resistances(i: Pick<ThermalIn, 'pkg' | 'heatsink' | 'airflow'> & Overrides) {
  const d = PKGS[i.pkg];
  if (i.thetaJA !== undefined) { // lumped single resistor: junction node and case node merged, no board path
    const ja = Math.max(SHORT, i.thetaJA);
    return { lumped: true, jc: SHORT, tim: 0, sa: 0, ca: 0, rest: ja, jb: OPEN, ba: 0, top: ja, board: OPEN, ja };
  }
  const jc = i.thetaJC ?? d.jc;
  const tim = i.heatsink ? (i.thetaCS ?? d.tim) : 0;
  const sa = i.heatsink ? (i.thetaSA ?? d.sa / airDiv(i.airflow)) : 0;
  const ca = i.heatsink ? 0 : d.ca / airDiv(i.airflow, 0.7); // bare case-to-ambient
  const rest = i.heatsink ? tim + sa : ca; // case → ambient
  const jb = i.noBoard ? OPEN : (i.thetaJB ?? d.jb), ba = i.noBoard ? 0 : (i.thetaBA ?? d.ba / airDiv(i.airflow, 0.35));
  const top = jc + rest, board = jb + ba;
  const ja = (top * board) / (top + board);
  return { lumped: false, jc, tim, sa, ca, rest, jb, ba, top, board, ja };
}

export function steady(i: ThermalIn) {
  const R = resistances(i);
  const P = Math.max(0, i.P);
  const Tj = i.Ta + P * R.ja;
  const dT = Tj - i.Ta;
  const Qtop = dT / R.top, Qb = R.board >= OPEN ? 0 : dT / R.board;
  const Tcase = Tj - Qtop * R.jc;
  const Tsink = i.heatsink ? i.Ta + Qtop * R.sa : Tcase - Qtop * 0; // sink base (or case if bare)
  const Tboard = Tj - Qb * R.jb;
  return { R, P, Tj, Qtop, Qb, Tcase, Tsink, Tboard, fracTop: P > 0 ? Qtop / P : (R.board >= OPEN ? 1 : 0.5) };
}

/** Max power for a given Tjmax: P = (Tjmax − Ta)/θJA */
export const maxPower = (i: ThermalIn, Tjmax: number) => Math.max(0, (Tjmax - i.Ta) / resistances(i).ja);

/** Transient junction temperature for a power step at t=0 (all nodes start at Ta). Returns log-spaced time grid. */
export function transient(i: ThermalIn, tEndOverride?: number) {
  const R = resistances(i), d = PKGS[i.pkg];
  const Cj = d.cj, Ct = d.cc + (i.heatsink ? d.csink : 0), Cb = d.cb;
  // node conductances
  const gJT = 1 / R.jc, gT = 1 / R.rest, gJB = 1 / R.jb, gB = 1 / Math.max(R.ba, SHORT);
  // slowest time constant estimate: total C × θJA (upper-ish bound)
  const tauSlow = (Ct + (R.board >= OPEN ? 0 : Cb)) * R.ja * 1.2 + Cj * R.jc;
  const tEnd = tEndOverride ?? Math.max(1, tauSlow * 5);
  const t: number[] = [0], Tj: number[] = [i.Ta];
  let x = [0, 0, 0]; // temperature rise of J, T, B above ambient
  let time = 0, dt = 1e-4;
  const P = Math.max(0, i.P);
  while (time < tEnd) {
    dt = Math.min(Math.max(dt * 1.04, 1e-4), tEnd - time);
    // (C/dt + G) x_new = C/dt x_old + b
    const A = [
      [Cj / dt + gJT + gJB, -gJT, -gJB],
      [-gJT, Ct / dt + gJT + gT, 0],
      [-gJB, 0, Cb / dt + gJB + gB],
    ];
    const b = [Cj / dt * x[0] + P, Ct / dt * x[1], Cb / dt * x[2]];
    x = solve3(A, b); time += dt; t.push(time); Tj.push(i.Ta + x[0]);
  }
  return { t, Tj, tauSlow, tEnd };
}

function solve3(A: number[][], b: number[]): number[] {
  const M = A.map((r, k) => [...r, b[k]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < 3; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r--) { let s = M[r][3]; for (let k = r + 1; k < 3; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}
