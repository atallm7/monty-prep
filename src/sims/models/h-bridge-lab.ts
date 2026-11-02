// H-bridge / half-bridge with a brushed DC motor (R, L, back-EMF), including body-diode freewheeling and shoot-through.
//
// Switches: Q1 = left high side, Q2 = left low side, Q3 = right high side, Q4 = right low side. Motor current i is positive
// from the left node A through the motor to the right node B. For a leg with output current `io` flowing OUT of the leg node:
//     high side on only : v = Vbat − io·Ron      low side on only : v = −io·Ron
//     both off          : io > 0 → low-side body diode conducts (v = −Vf);  io < 0 → high-side diode (v = Vbat + Vf)
//     both on           : shoot-through, I = Vbat/(Ron_hs + Ron_ls + Rbus), node ≈ midpoint
// Motor:  L·di/dt = (vA − vB) − R·i − E,   E = Ke·ω;   J·dω/dt = Kt·i − B·ω − Tload   (Kt = Ke in SI)
// Current cannot reverse through diodes alone: if neither sign of i can be driven at i = 0 the current is clamped to 0 (coast).
export type HBIn = {
  vbat: number; q1: boolean; q2: boolean; q3: boolean; q4: boolean;
  half?: boolean; r?: number; l?: number; ke?: number; j?: number; b?: number; tload?: number; ron?: number; vf?: number; rbus?: number;
};
export const HB_DEFAULTS = { r: 1, l: 1e-3, ke: 0.02, j: 1e-5, b: 1e-6, tload: 0, ron: 0.05, vf: 0.7, rbus: 0.02 };
type Q = Required<HBIn>;
export const cfgH = (p: HBIn): Q => ({ ...HB_DEFAULTS, half: false, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as Q);

export type LegKind = 'hs' | 'ls' | 'shoot' | 'diodeLow' | 'diodeHigh' | 'float';
export function leg(hs: boolean, ls: boolean, io: number, q: Q): { v: number; kind: LegKind } {
  if (hs && ls) return { v: q.vbat / 2, kind: 'shoot' };
  if (hs) return { v: q.vbat - io * q.ron, kind: 'hs' };
  if (ls) return { v: -io * q.ron, kind: 'ls' };
  if (io > 0) return { v: -q.vf, kind: 'diodeLow' };
  if (io < 0) return { v: q.vbat + q.vf, kind: 'diodeHigh' };
  return { v: NaN, kind: 'float' };
}
/** Motor drive voltage for a given motor current (A − B). */
function drive(q: Q, i: number) {
  const A = leg(q.q1, q.q2, i, q);
  // half-bridge: the load returns to ground, so only leg A exists
  const B = q.half ? { v: 0, kind: 'ls' as LegKind } : leg(q.q3, q.q4, -i, q);
  return { vm: (isNaN(A.v) ? 0 : A.v) - (isNaN(B.v) ? 0 : B.v), A, B };
}
export function shootThrough(q: Q) {
  const legs: boolean[] = [q.q1 && q.q2, !q.half && q.q3 && q.q4];
  const n = legs.filter(Boolean).length;
  return { n, i: n ? q.vbat / (2 * q.ron + q.rbus) : 0, p: n ? (q.vbat * q.vbat) / (2 * q.ron + q.rbus) * n : 0 };
}
/** Classify the commanded state. */
export function describe(p: HBIn) {
  const q = cfgH(p), st = shootThrough(q);
  if (st.n) return { name: 'Shoot-through', tone: 'bad' as const };
  const aH = q.q1, aL = q.q2, bH = q.q3, bL = q.q4;
  if (q.half) {
    if (aH) return { name: 'High side on (load to Vbat)', tone: 'ok' as const };
    if (aL) return { name: 'Low side on (load to GND)', tone: 'info' as const };
    return { name: 'Both off: diode freewheel / high-Z', tone: 'warn' as const };
  }
  if (aH && bL) return { name: 'Forward (A→B)', tone: 'ok' as const };
  if (bH && aL) return { name: 'Reverse (B→A)', tone: 'ok' as const };
  if (aL && bL) return { name: 'Brake (low sides on)', tone: 'warn' as const };
  if (aH && bH) return { name: 'Brake (high sides on)', tone: 'warn' as const };
  if (!aH && !aL && !bH && !bL) return { name: 'Coast (all off)', tone: 'info' as const };
  return { name: 'Partial / coast with one switch on', tone: 'info' as const };
}

export type HBOut = { t: number[]; i: number[]; w: number[]; vm: number[]; vA: number[]; vB: number[]; kindA: LegKind; kindB: LegKind; tEnd: number };
export function simulate(p: HBIn, tEnd = 0.3, i0 = 0, w0 = 0, nOut = 600): HBOut & { iEnd: number; wEnd: number } {
  const q = cfgH(p), dt = Math.min(q.l / q.r / 100, tEnd / 3000, 20e-6), n = Math.ceil(tEnd / dt);
  let i = i0, w = w0;
  const T: number[] = [], I: number[] = [], W: number[] = [], VM: number[] = [], VA: number[] = [], VB: number[] = [];
  const every = Math.max(1, Math.floor(n / nOut));
  let last = drive(q, i);
  const step = (i: number, w: number) => { // di/dt by evaluating the leg voltages at the current value
    const d = drive(q, i); return { d, di: (d.vm - q.r * i - q.ke * w) / q.l, dw: (q.ke * i - q.b * w - q.tload) / q.j };
  };
  for (let k = 0; k <= n; k++) {
    if (k % every === 0) {
      const d = drive(q, i);
      T.push(k * dt); I.push(i); W.push(w);
      const stuck = i === 0 && isNaN(d.A.v) && isNaN(d.B.v);
      VM.push(stuck ? q.ke * w : d.vm); VA.push(isNaN(d.A.v) ? NaN : d.A.v); VB.push(isNaN(d.B.v) ? NaN : d.B.v);
    }
    // midpoint (RK2) step
    const s1 = step(i, w);
    const i2 = i + 0.5 * dt * s1.di, w2 = w + 0.5 * dt * s1.dw;
    const s2 = step(i2, w2);
    let iN = i + dt * s2.di, wN = w + dt * s2.dw;
    if (i === 0 || iN * i < 0 || Math.abs(iN) < 1e-9) { // can i leave zero in either direction?
      const up = step(1e-9, wN).di, dn = step(-1e-9, wN).di;
      if (up <= 0 && dn >= 0) iN = 0;           // pinned at zero by the diodes
    }
    if (iN === 0 && i === 0) { wN = w + dt * (-q.b * w - q.tload) / q.j; }
    // no regeneration of the load torque: a stalled rotor with a holding load does not reverse
    if (q.tload > 0 && wN < 0 && w >= 0 && q.ke * iN < q.tload) wN = 0;
    i = iN; w = wN; last = drive(q, i);
  }
  return { t: T, i: I, w: W, vm: VM, vA: VA, vB: VB, kindA: last.A.kind, kindB: last.B.kind, tEnd, iEnd: i, wEnd: w };
}

/** Closed-form steady state for hs/ls drive (both FETs conducting): i = (Vm − Ke·ω)/(R + 2Ron). */
export function steady(p: HBIn) {
  const q = cfgH(p);
  const rt = q.r + (q.half ? 1 : 2) * q.ron;
  const vm = (q.q1 ? q.vbat : 0) - (q.half ? 0 : (q.q3 ? q.vbat : 0));
  // ω = Kt·Vm / (Ke² + b·Rt) when Tload = 0 ; with load: ω = (Kt·Vm − Rt·Tload)/(Ke² + b·Rt)
  const w = (q.ke * vm - rt * q.tload) / (q.ke * q.ke + q.b * rt);
  const i = (vm - q.ke * w) / rt;
  return { vm, rt, w, i };
}

/** Half-bridge switching with dead time. Gate commands are complementary: HS on [0, D·T), LS on [D·T + td, T − td);
 *  td > 0 inserts dead time at both edges, td < 0 makes both switches conduct together for |td| (shoot-through).
 *  During dead time the load current `iload` (out of the switch node) freewheels: iload > 0 → low-side body diode (Vsw = −Vf),
 *  iload < 0 → high-side body diode (Vsw = Vbat + Vf). Diode loss = Vf·|I|·2·td·fsw. */
export function deadTime(o: { vbat: number; fsw: number; duty: number; td: number; iload: number; vf?: number; ron?: number; rbus?: number }) {
  const vf = o.vf ?? 0.7, ron = o.ron ?? 0.05, rbus = o.rbus ?? 0.02, T = 1 / o.fsw, ton = o.duty * T;
  const hsOn = (t: number) => t >= 0 && t < ton;
  const lsOn = (t: number) => (t >= ton + o.td && t < T - o.td) || (o.td < 0 && t >= 0 && t < -o.td);
  const vsw = (t: number) => {
    const h = hsOn(t), l = lsOn(t);
    if (h && l) return o.vbat / 2;
    if (h) return o.vbat - o.iload * ron;
    if (l) return -o.iload * ron;
    return o.iload >= 0 ? -vf : o.vbat + vf;
  };
  const e = T * 1e-7, ts: number[] = [], H: number[] = [], L: number[] = [], V: number[] = [];
  const edges = Array.from(new Set([0, ton, ton + o.td, T - o.td, T, Math.abs(o.td)].map(x => Math.min(T, Math.max(0, x))))).sort((a, b) => a - b);
  for (let k = 0; k < 2; k++) {
    for (let a = 0; a < edges.length - 1; a++) {
      if (edges[a + 1] - edges[a] < 2 * e) continue;
      for (const t of [edges[a] + e, edges[a + 1] - e]) { ts.push(k * T + t); H.push(hsOn(t) ? 1 : 0); L.push(lsOn(t) ? 1 : 0); V.push(vsw(t)); }
    }
  }
  const overlap = o.td < 0 ? -o.td : 0, shoot = overlap > 0 ? o.vbat / (2 * ron + rbus) : 0;
  const tDiode = o.td > 0 ? o.td : 0;
  return {
    t: ts, hs: H, ls: L, vsw: V, tDiode, overlap, shoot,
    pDiode: vf * Math.abs(o.iload) * 2 * tDiode * o.fsw,       // two dead-time intervals per period
    pShoot: o.vbat * shoot * 2 * overlap * o.fsw * 0.5,        // upper bound: triangular current spike of height Vbat/(2Ron+Rbus)
    deadFrac: (2 * tDiode) / T,
  };
}
