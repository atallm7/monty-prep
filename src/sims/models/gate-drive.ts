// MOSFET gate drive with Miller plateau, gate-loop inductance and clamped-inductive load.
//
// Circuit: driver (step 0 → Vdrive, output resistance Rsrc) → Rg → gate-loop inductance Lg → gate of a low-side NFET.
// Optional gate pull-down Rpd (gate–source). Drain: clamped inductive load = constant current IL into the drain node with a
// free-wheel diode to Vdd (the textbook switching-loss test circuit).
//
// Device: square-law channel  Id = K(Vgs−Vth)²  (saturation, Vds ≥ Vov)
//                             Id = K(2·Vov·Vds − Vds²)  (triode)          → Rds(on) = 1/(2K(Vgs−Vth))
//   Cgs constant; Cgd (= Crss) is the nonlinear depletion capacitance Cgd = Cgd0/√(1 + Vdg/Vj) for Vdg > 0 (= Cgd0 below):
//   it is small at high Vds and large once Vds < Vgs, which creates the Miller plateau. Cds = Coss − Crss.
//   Capacitances are scaled so the datasheet-style total gate charge Qg (Vgs: 0 → 10 V, Vds: 15 V → ~0) equals the given qg.
//
// Equations (KVL gate loop, KCL gate and drain nodes):
//   Lg·diG/dt = Vs(t) − (Rsrc+Rg)·iG − Vgs
//   iG − Vgs/Rpd = Cgs·dVgs/dt + Cgd·d(Vgs−Vds)/dt
//   Cgd·d(Vds−Vgs)/dt + Cds·dVds/dt = IL − Id(Vgs,Vds)          (Vds ≤ Vdd; above that the diode clamps Vds = Vdd)
// Integrated with backward Euler + Newton (stiff when Lg/R ≪ dt), dt ≪ gate-loop resonance period so numerical damping
// of the LC ringing is negligible. Gate loop: series RLC with ζ = (R/2)·√(Ciss/Lg).
// Plateau voltage: Vpl = Vth + √(IL/K). Switching energy E = ∫ Vds·Id dt over each transition.

export type Device = { cgs: number; cgd0: number; vj: number; cds: number; vth: number; K: number };
export type GateIn = {
  vdrive: number; rg: number; rsrc: number; lg: number; qg: number; vth: number;
  vdd: number; il: number; rpd: number; K?: number; device?: Device;
};

const BASE = { cgs: 1e-9, cgd0: 0.6e-9, vj: 0.8, cds: 0.35e-9 };
export const QG_TEST = { vgs: 10, vds: 15 };

/** Total gate charge for a device: Vgs 0→Vg, Vds Vd→0 (closed form for the √ Cgd law). */
export function gateCharge(d: { cgs: number; cgd0: number; vj: number }, vg = QG_TEST.vgs, vd = QG_TEST.vds) {
  return d.cgs * vg + d.cgd0 * vg + 2 * d.cgd0 * d.vj * (Math.sqrt(1 + vd / d.vj) - 1);
}
export function deviceFromQg(qg: number, vth: number, K = 20): Device {
  const s = Math.max(qg, 1e-12) / gateCharge(BASE);
  return { cgs: BASE.cgs * s, cgd0: BASE.cgd0 * s, vj: BASE.vj, cds: BASE.cds * s, vth, K };
}
export const cgdOf = (d: Device, vdg: number) => d.cgd0 / Math.sqrt(1 + Math.max(0, vdg) / d.vj);

export function idOf(d: Device, vgs: number, vds: number) {
  const vov = vgs - d.vth;
  if (vov <= 0) return { id: 0, gm: 0, gds: 0 };
  if (vds >= vov) return { id: d.K * vov * vov, gm: 2 * d.K * vov, gds: 0 };
  return { id: d.K * (2 * vov * vds - vds * vds), gm: 2 * d.K * vds, gds: 2 * d.K * (vov - vds) };
}

export type GateSim = ReturnType<typeof simulateGate>;

export function simulateGate(p: GateIn, opts: { points?: number; tHalf?: number } = {}) {
  const d = p.device ?? deviceFromQg(p.qg, p.vth, p.K ?? 20);
  const R = Math.max(1e-3, p.rsrc + p.rg), L = Math.max(1e-12, p.lg);
  const gpd = isFinite(p.rpd) && p.rpd > 0 ? 1 / p.rpd : 0;
  const vpl = d.vth + Math.sqrt(Math.max(0, p.il) / d.K);
  const cissOn = d.cgs + d.cgd0, cissOff = d.cgs + cgdOf(d, p.vdd);
  const qgd = d.cgd0 * 2 * d.vj * (Math.sqrt(1 + Math.max(0, p.vdd - vpl) / d.vj) - 1) + d.cgd0 * vpl;
  const iOn = (p.vdrive - vpl) / R, iOff = vpl / R;
  const period = 2 * Math.PI * Math.sqrt(L * cissOff);
  const plat = iOn > 0 ? qgd / Math.min(iOn, iOff) : 10 * R * cissOn;
  const tHalf = opts.tHalf ?? Math.max(20e-9, 1.3 * (5 * R * cissOn + plat) + 8 * period);
  const tOn = 0.08 * tHalf, tOff = tHalf, tEnd = 2 * tHalf;
  const zeta0 = (R / 2) * Math.sqrt(cissOff / L);
  // resolve the gate-loop ringing only when it exists (ζ < 1.5); BE at ≥ 250 steps/period adds < 8 %/period damping
  let h = zeta0 < 1.5 ? Math.min(tHalf / 2000, period / 250) : tHalf / 2000;
  h = Math.max(h, tEnd / 40000);
  // θ-method: trapezoidal (θ = ½, no numerical damping) when ringing is resolved and the loop is not stiff; else backward Euler
  const th = zeta0 < 1.5 ? 0.5 : 1;
  const N = Math.ceil(tEnd / h); h = tEnd / N;
  const keep = Math.max(1, Math.floor(N / (opts.points ?? 1500)));

  let iG = 0, vgs = 0, vds = p.vdd, clamped = true;
  const T: number[] = [], VGS: number[] = [], VDS: number[] = [], ID: number[] = [], IG: number[] = [], PW: number[] = [], VS: number[] = [];
  let eOn = 0, eOff = 0, vgsMax = 0, vgsMinOff = Infinity, vgsMaxAfterOff = -Infinity, qIn = 0;
  let tPl: number | null = null; let vplSim = NaN;
  let tVdsFall90 = NaN, tVdsFall10 = NaN, tVdsRise10 = NaN, tVdsRise90 = NaN, tIdRise10 = NaN, tIdRise90 = NaN, tIdFall90 = NaN, tIdFall10 = NaN;

  for (let n = 0; n <= N; n++) {
    const t = n * h;
    const vs = t >= tOn && t < tOff ? p.vdrive : 0;
    const tp = (n - 1) * h; const vsPrev = tp >= tOn && tp < tOff ? p.vdrive : 0;
    if (n > 0) {
      const iG0 = iG, vgs0 = vgs, vds0 = vds; const id0 = idOf(d, vgs0, vds0).id;
      const cgd = cgdOf(d, vds0 - vgs0);
      // Newton iterations on the BE equations
      let x: number[] = [iG0, vgs0, vds0]; let useClamp: boolean = clamped;
      for (let attempt = 0; attempt < 2; attempt++) {
        x = [iG0, vgs0, useClamp ? p.vdd : vds0];
        for (let it = 0; it < 6; it++) {
          const [ig, vg, vd] = x;
          const { id, gm, gds } = idOf(d, vg, vd);
          const f1 = L * (ig - iG0) / h - (th * (vs - R * ig - vg) + (1 - th) * (vsPrev - R * iG0 - vgs0));
          const f2 = th * (ig - vg * gpd) + (1 - th) * (iG0 - vgs0 * gpd) - d.cgs * (vg - vgs0) / h - cgd * ((vg - vd) - (vgs0 - vds0)) / h;
          // Jacobian rows: [a,1,0], [1,b,c], [0,e,f]; solve J·dx = −F by elimination (no allocations)
          const A = L / h + th * R, B = -th * gpd - (d.cgs + cgd) / h;
          const r0 = -f1, r1 = -f2;
          let dx1: number, dx2: number;
          if (useClamp) { dx2 = p.vdd - vd; dx1 = (r1 - th * r0 / A) / (B - th * th / A); }
          else {
            const f3 = cgd * ((vd - vg) - (vds0 - vgs0)) / h + d.cds * (vd - vds0) / h - th * (p.il - id) - (1 - th) * (p.il - id0);
            const C = cgd / h, E = -cgd / h + th * gm, Fq = (cgd + d.cds) / h + th * gds, r2 = -f3;
            const b2 = B - th * th / A, rr = r1 - th * r0 / A, det = b2 * Fq - C * E;
            dx1 = (rr * Fq - C * r2) / det; dx2 = (b2 * r2 - E * rr) / det;
          }
          const dx0 = (r0 - th * dx1) / A;
          const dx = [dx0, dx1, dx2];
          x = [x[0] + dx0, x[1] + dx1, x[2] + dx2];
          if (Math.abs(dx[1]) < 1e-9 && Math.abs(dx[2]) < 1e-9 && Math.abs(dx[0]) < 1e-9) break;
        }
        if (useClamp) {
          // diode current = IL − Id − (Cgd + Cds) dVds/dt + Cgd dVgs/dt  (dVds = 0)
          const idiode = p.il - idOf(d, x[1], p.vdd).id + cgd * (x[1] - vgs0) / h - (cgd + d.cds) * (p.vdd - vds0) / h;
          if (idiode >= 0) break;
          useClamp = false; // diode turns off: drain node free
        } else {
          if (x[2] > p.vdd) { useClamp = true; continue; } // overshoot above Vdd → diode clamps
          break;
        }
      }
      clamped = useClamp;
      [iG, vgs, vds] = x;
    }
    const id = idOf(d, vgs, vds).id;
    const pw = vds * id;
    if (n > 0) {
      if (vds > 0.05 * p.vdd) { if (t < tOff) eOn += pw * h; else eOff += pw * h; }
      if (t >= tOn && t < tOff) qIn += iG * h;
    }
    if (t < tOff) vgsMax = Math.max(vgsMax, vgs); else { vgsMinOff = Math.min(vgsMinOff, vgs); }
    if (t >= tOff + 0.0 && vgs < d.vth - 0.05 && vgsMaxAfterOff === -Infinity) vgsMaxAfterOff = vgs; // first drop below Vth
    else if (vgsMaxAfterOff !== -Infinity) vgsMaxAfterOff = Math.max(vgsMaxAfterOff, vgs);
    // edge timings
    if (t < tOff) {
      if (isNaN(tIdRise10) && id >= 0.1 * p.il) tIdRise10 = t;
      if (isNaN(tIdRise90) && id >= 0.9 * p.il) tIdRise90 = t;
      if (isNaN(tVdsFall90) && vds <= 0.9 * p.vdd) tVdsFall90 = t;
      if (isNaN(tVdsFall10) && vds <= 0.1 * p.vdd) tVdsFall10 = t;
      if (tPl === null && vds <= 0.5 * p.vdd) { tPl = t; vplSim = vgs; }
    } else {
      if (isNaN(tVdsRise10) && vds >= 0.1 * p.vdd) tVdsRise10 = t;
      if (isNaN(tVdsRise90) && vds >= 0.9 * p.vdd) tVdsRise90 = t;
      if (isNaN(tIdFall90) && id <= 0.9 * p.il) tIdFall90 = t;
      if (isNaN(tIdFall10) && id <= 0.1 * p.il) tIdFall10 = t;
    }
    if (n % keep === 0 || n === N) { T.push(t); VGS.push(vgs); VDS.push(vds); ID.push(id); IG.push(iG); PW.push(pw); VS.push(vs); }
  }
  const zeta = (R / 2) * Math.sqrt(cissOff / L);
  const fullyOn = !isNaN(tVdsFall10);
  return {
    t: T, vgs: VGS, vds: VDS, id: ID, ig: IG, pw: PW, vs: VS, tOn, tOff, tEnd, dt: h, device: d,
    vplTheory: vpl, vplSim, cissOn, cissOff, qgd, zeta, ringHz: 1 / period, R,
    eOn, eOff, vgsMax, overshoot: vgsMax - p.vdrive, vgsMinOff, reTurnOn: vgsMaxAfterOff > d.vth,
    vgsReboundMax: vgsMaxAfterOff, qIn, fullyOn,
    tri: tIdRise90 - tIdRise10, tfv: tVdsFall10 - tVdsFall90, trv: tVdsRise90 - tVdsRise10, tfi: tIdFall10 - tIdFall90,
    tdOn: tIdRise10 - tOn, rdsOn: p.vdrive > d.vth ? 1 / (2 * d.K * (p.vdrive - d.vth)) : Infinity,
    iPeak: Math.max(...IG.map(Math.abs)),
  };
}

/** Gate left floating (driver Hi-Z) while the drain rail ramps 0 → Vdd in tr: Cgd injects charge into Cgs ∥ Rpd. */
export function floatingGate(d: Device, vdd: number, tr: number, rpd: number, n = 600) {
  const gpd = isFinite(rpd) && rpd > 0 ? 1 / rpd : 0;
  const tEnd = tr * 3; const h = tEnd / (n * 20);
  const t: number[] = [], v: number[] = [];
  let vg = 0, peak = 0;
  for (let k = 0; k <= n * 20; k++) {
    const tt = k * h; const vdNow = Math.min(vdd, vdd * tt / tr); const slope = tt < tr ? vdd / tr : 0;
    const cgd = cgdOf(d, vdNow - vg);
    // (Cgs + Cgd) dVg/dt = Cgd dVd/dt − Vg/Rpd  → backward Euler
    vg = (vg * (d.cgs + cgd) / h + cgd * slope) / ((d.cgs + cgd) / h + gpd);
    peak = Math.max(peak, vg);
    if (k % 20 === 0) { t.push(tt); v.push(vg); }
  }
  return { t, v, peak };
}
