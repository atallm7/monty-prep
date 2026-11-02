// High-side NFET bootstrap supply (half bridge with bootstrap diode Db, series R and capacitor Cboot from VB to SW).
//
// Low side on (SW ≈ 0): Cboot charges from Vdrv through Db and Rb toward Vc = Vdrv − Vf:
//     Cb·dV/dt = (Vc − V)/Rb − Iq        → V∞ = Vc − Iq·Rb, τc = Rb·Cb     (diode conducts while V < Vc)
// High-side turn-on: gate charge comes from Cboot (charge sharing, Cg = Qg/10 V):
//     V⁺ = V⁻ · Cb/(Cb + Cg)            → ΔV ≈ Qg/Cb for Cb ≫ Cg
// High side on (SW = Vin, VB = Vin + V): diode reverse biased by Vin + V − Vdrv; Cboot ∥ gate is drained by the driver's
// floating-side quiescent current Iq and the gate–source resistor Rgs:
//     (Cb + Cg)·dV/dt = −Iq − V/Rgs     → V(t) = −Iq·Rgs + (V0 + Iq·Rgs)·e^{−t/(Rgs(Cb+Cg))}
// Undervoltage lockout: if V falls below UVLO the driver turns the high side off; it re-enables on the next PWM edge only
// when V ≥ UVLO + hysteresis. HS gate charge is dumped to SW at turn-off (not returned to Cboot).
// Max duty: the low-side on-time (1−D)/fsw must be long enough to refill the charge used per cycle.

export type BootIn = {
  vin: number; vdrv: number; cboot: number; d: number; fsw: number;
  qg?: number; iq?: number; rgs?: number; rb?: number; vf?: number; uvlo?: number; hyst?: number;
};
export const BOOT_DEFAULTS = { qg: 30e-9, iq: 150e-6, rgs: 100e3, rb: 2, vf: 0.7, uvlo: 8, hyst: 0.5 };

function cfg(p: BootIn) {
  const q = { ...BOOT_DEFAULTS, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as Required<BootIn>;
  const Cg = q.qg / 10;
  const T = 1 / q.fsw, ton = Math.min(1, Math.max(0, q.d)) * T, toff = T - ton;
  const Vc = q.vdrv - q.vf;
  return { ...q, Cg, T, ton, toff, Vc };
}
type Cfg = ReturnType<typeof cfg>;

/** Cboot voltage after charging for time t from V0 (SW low). */
export function chargeFrom(c: Cfg, V0: number, t: number) {
  if (t <= 0) return V0;
  const Vinf = c.Vc - c.iq * c.rb, tau = c.rb * c.cboot;
  if (V0 < c.Vc) return Vinf + (V0 - Vinf) * Math.exp(-t / tau);
  return V0 - c.iq * t / c.cboot; // diode blocked (only if V0 ≥ Vc)
}
/** Cboot ∥ gate voltage after time t of high-side conduction starting at Vs (already charge-shared). */
export function dischargeFrom(c: Cfg, Vs: number, t: number) {
  const C = c.cboot + c.Cg;
  if (!isFinite(c.rgs) || c.rgs <= 0) return Vs - c.iq * t / C;
  const tau = c.rgs * C, a = c.iq * c.rgs;
  return -a + (Vs + a) * Math.exp(-t / tau);
}
/** Time for the on-state voltage to fall from Vs to Vtrip (Infinity if never within the phase). */
function timeTo(c: Cfg, Vs: number, Vtrip: number) {
  if (Vs <= Vtrip) return 0;
  const C = c.cboot + c.Cg;
  if (!isFinite(c.rgs) || c.rgs <= 0) return c.iq > 0 ? (Vs - Vtrip) * C / c.iq : Infinity;
  const tau = c.rgs * C, a = c.iq * c.rgs;
  return (Vtrip + a) > 0 ? tau * Math.log((Vs + a) / (Vtrip + a)) : Infinity;
}

/** One PWM cycle starting at the high-side turn-on edge with Cboot voltage V0. */
export function cycle(c: Cfg, V0: number) {
  const enabled = V0 >= c.uvlo + c.hyst;
  if (!enabled) return { enabled, Vs: V0, Vend: V0, tTrip: 0, tripped: false, Vnext: chargeFrom(c, V0, c.T), Vmin: V0 };
  const Vs = V0 * c.cboot / (c.cboot + c.Cg);
  const tt = timeTo(c, Vs, c.uvlo);
  const tripped = tt < c.ton;
  const tOnActual = tripped ? tt : c.ton;
  const Vend = dischargeFrom(c, Vs, tOnActual);
  const Vnext = chargeFrom(c, Vend, c.T - tOnActual);
  return { enabled, Vs, Vend, tTrip: tOnActual, tripped, Vnext, Vmin: Math.min(Vs, Vend) };
}

/** Run from cold start (Cboot = 0) until steady state. */
export function run(p: BootIn, maxCycles = 50000) {
  const c = cfg(p);
  const env: { t: number; vmax: number; vmin: number }[] = [];
  let V = 0, k = 0, ss = false, cyclesToCharge = -1, lastCyc = cycle(c, 0);
  const every = 1;
  for (; k < maxCycles; k++) {
    const cy = cycle(c, V); lastCyc = cy;
    if (k % every === 0) env.push({ t: k * c.T, vmax: Math.max(V, cy.Vnext), vmin: cy.enabled ? cy.Vend : Math.min(V, cy.Vnext) });
    if (cyclesToCharge < 0 && cy.enabled) cyclesToCharge = k;
    if (Math.abs(cy.Vnext - V) < 1e-7 && k > 2) { V = cy.Vnext; ss = true; break; }
    // limit cycle (UVLO trip/enable alternation) → stop after a long run
    V = cy.Vnext;
  }
  return { c, Vss: V, steady: ss, cycles: k, env, cyclesToCharge, last: lastCyc };
}

/** Sampled waveforms for `n` cycles starting at the steady-state (or final) Cboot voltage. */
export function waveforms(p: BootIn, V0: number, n = 3, pts = 120) {
  const c = cfg(p);
  const t: number[] = [], sw: number[] = [], vb: number[] = [], vbs: number[] = [], vgs: number[] = [];
  let V = V0;
  for (let k = 0; k < n; k++) {
    const cy = cycle(c, V); const t0 = k * c.T;
    const push = (tt: number, s: number, v: number, g: number) => { t.push(tt); sw.push(s); vbs.push(v); vb.push(s + v); vgs.push(g); };
    if (cy.enabled) {
      push(t0, 0, V, 0);
      for (let i = 0; i <= pts; i++) { const tt = cy.tTrip * i / pts; const v = dischargeFrom(c, cy.Vs, tt); push(t0 + tt, c.vin, v, v); }
      push(t0 + cy.tTrip, 0, cy.Vend, 0);
      const rest = c.T - cy.tTrip;
      for (let i = 1; i <= pts; i++) { const tt = rest * i / pts; push(t0 + cy.tTrip + tt, 0, chargeFrom(c, cy.Vend, tt), 0); }
    } else {
      for (let i = 0; i <= pts * 2; i++) { const tt = c.T * i / (pts * 2); push(t0 + tt, 0, chargeFrom(c, V, tt), 0); }
    }
    V = cy.Vnext;
  }
  return { t, sw, vb, vbs, vgs };
}

/** Steady-state metrics, incl. maximum duty cycle by bisection on "no UVLO trip in steady state". */
export function metrics(p: BootIn) {
  const r = run(p);
  const c = r.c;
  const cy = cycle(c, r.Vss);
  const share = r.Vss - cy.Vs;                                  // drop from gate charge sharing
  const droopOn = cy.Vs - cy.Vend;                              // drop during on-time (Iq + Rgs)
  const ok = (D: number) => { const rr = run({ ...p, d: D }, 20000); const k = cycle(rr.c, rr.Vss); return rr.steady && k.enabled && !k.tripped; };
  let lo = 0, hi = 1;
  if (!ok(0)) { lo = 0; hi = 0; } else if (ok(0.99999)) { lo = hi = 1; }
  else for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
  // hold time at 100 % duty starting from a full cap
  const Vfull = c.Vc - c.iq * c.rb; const Vs100 = Vfull * c.cboot / (c.cboot + c.Cg);
  const tHold = timeTo(c, Vs100, c.uvlo);
  const qTot = c.qg + c.iq * c.ton + (isFinite(c.rgs) ? (r.Vss / c.rgs) * c.ton : 0);
  const dVmax = c.vdrv - c.vf - (c.uvlo + c.hyst);
  const cMin = dVmax > 0 ? qTot / dVmax : Infinity;
  return {
    ...r, cy, share, droopOn, dMax: lo, tHold, qTot, dVmax, cMin,
    vgsMin: cy.enabled ? Math.min(cy.Vs, cy.Vend) : 0, vgsMax: cy.enabled ? cy.Vs : 0,
    vDiodeRev: c.vin + r.Vss - c.vdrv, iDiodePk: Math.max(0, (c.Vc - cy.Vend) / c.rb), tauC: c.rb * c.cboot,
  };
}
