// Inductive kick & flyback protection model.
//
// Circuit: +Vs → coil (L in series with its winding resistance Rc) → switch node X → low-side switch → GND.
// Before t = 0 the switch is on: vX = 0, iL = i0 (Rc = Vs/i0 so the steady current is exactly i0).
// At t = 0 the switch opens. The coil keeps its current (v = L di/dt) and dumps it into whatever is at X:
//   • parasitic capacitance Cp (switch Coss + wiring)        always present, X → GND
//   • switch body diode (vX < −Vf)                            always present (MOSFET)
//   • switch avalanche at BVdss (optional)                     X → GND
//   • protection:
//       'diode' : freewheel diode X → Vs (anode at X)          clamps vX = Vs + Vf, slow decay τ = L/Rc
//       'zener' : diode + Zener in series X → Vs               clamps vX = Vs + Vf + Vz, fast decay
//       'rc'    : series RC snubber across the coil X → Vs     second-order RLC response
//       'tvs'   : TVS across the switch X → GND                clamps vX = V_BR (draws extra energy from Vs!)
// Diodes / TVS / avalanche are piecewise-linear: i = (v − E)/R_on above the knee, 0 below.
//
// Equations (state iL, vX, vCs):
//   L·diL/dt  = Vs − Rc·iL − vX
//   Cp·dvX/dt = iL − i_prot − i_tvs − i_sw
//   Csn·dvCs/dt = i_rc, i_rc = (vX − Vs − vCs)/Rsn
// Stiff (Cp·R_on ~ ps vs ms decay) → BDF2 (Gear-2, A-stable, damps stiff modes, little damping of the LC ring),
// first step backward Euler. The PWL active set is resolved by iteration each step; with all other unknowns
// eliminated the step reduces to one scalar linear equation in vX.
//
// Closed forms used in the tests (ignoring Cp):
//   no clamp     : peak vX ≈ Vs + i0·√(L/Cp), ring f = 1/(2π√(L·Cp))
//   diode        : L di/dt = −(Vf + Rc·i) → t_zero = (L/Rc)·ln(1 + Rc·i0/Vf)
//   zener        : t_zero = (L/Rc)·ln(1 + Rc·i0/(Vf+Vz)),  clamp Vs + Vf + Vz
//   TVS / aval.  : L di/dt = Vs − Vc − Rc·i → t_zero = (L/Rc)·ln(1 + Rc·i0/(Vc−Vs)); with Rc → 0 the clamp
//                  absorbs E = ½·L·i0²·Vc/(Vc − Vs) (the supply keeps pushing energy in during the decay).
export type Protection = 'none' | 'diode' | 'zener' | 'rc' | 'tvs';
export type FlyIn = {
  protection: Protection; l: number; i0: number; vs: number;
  cp: number; vf: number; vz: number; rsn: number; csn: number; vtvs: number;
  aval: boolean; bv: number;
};
export type Energy = { coilR: number; diode: number; zener: number; snubR: number; tvs: number; aval: number; body: number; supply: number; stored0: number; storedEnd: number };
export type FlyOut = {
  t: number[]; vx: number[]; il: number[];
  vPeak: number; vMin: number; tPeak: number; tDecay: number; tZero: number; tEnd: number; ringF: number; z0: number;
  e: Energy; balanceErr: number; h: number; steps: number;
};

const R_ON = 0.05, R_TVS = 0.2, R_AV = 0.1, VF_BODY = 0.7;

export function rcOf(p: FlyIn) { return p.vs / Math.max(1e-9, p.i0); }

export function simulate(p: FlyIn, opts: { maxSteps?: number; nOut?: number } = {}): FlyOut {
  const L = Math.max(1e-9, p.l), Cp = Math.max(1e-15, p.cp), Vs = p.vs, i0 = Math.max(0, p.i0);
  const Rc = rcOf(p);
  const tau = L / Rc;
  const z0 = Math.sqrt(L / Cp), wRing = 1 / Math.sqrt(L * Cp);
  const isRC = p.protection === 'rc';
  const Csn = Math.max(1e-12, p.csn), Rsn = Math.max(1e-3, p.rsn);
  const wSn = isRC ? 1 / Math.sqrt(L * Csn) : 0;
  const tMax = 12 * tau + (isRC ? 12 * Math.max(Rsn * Csn, 2 * L / Math.max(Rsn, 1e-3)) : 0);
  // Variable step. hFast resolves the free L–Cp ring (100 steps/period); hSlow resolves the slow L/R and
  // snubber dynamics and is used while a clamp conducts (vX pinned → the Cp mode is stiff and over-damped).
  const hFast = Math.min((2 * Math.PI / wRing) / 100, tau / 400);
  let hSlow = Math.min(tau / 1500, isRC ? (2 * Math.PI / wSn) / 300 : Infinity, tMax / 4000);
  // an RC snubber that heavily damps the Cp mode (parallel-RLC Q = Rsn·√(Cp/L) < 0.5) also allows slow steps
  const rcDampsCp = isRC && Rsn * Math.sqrt(Cp / L) < 0.5;
  hSlow = Math.max(hSlow, hFast);
  const maxSteps = opts.maxSteps ?? 200000;

  // PWL elements at node X: current leaving X = g·(vX − E) when dir·(vX − E) > 0
  const elG: number[] = [], elE: number[] = [], elDir: number[] = [], elKind: number[] = [];
  const add = (g: number, E: number, dir: number, kind: number) => { elG.push(g); elE.push(E); elDir.push(dir); elKind.push(kind); };
  // kinds: 0 body, 1 aval, 2 diode, 3 diode+zener string, 4 tvs
  add(1 / R_ON, -VF_BODY, -1, 0);                                                   // switch body diode
  if (p.aval) add(1 / R_AV, p.bv, 1, 1);
  if (p.protection === 'diode') add(1 / R_ON, Vs + p.vf, 1, 2);
  if (p.protection === 'zener') add(1 / R_ON, Vs + p.vf + p.vz, 1, 3);
  if (p.protection === 'tvs') { add(1 / R_TVS, p.vtvs, 1, 4); add(1 / R_ON, -VF_BODY, -1, 4); }
  const nEl = elG.length;
  const isOn = (k: number, v: number) => elDir[k] * (v - elE[k]) > 0;
  const active = new Array(nEl).fill(false);

  // energy accumulators: 0 coilR, 1 diode, 2 zener, 3 snubR, 4 tvs, 5 aval, 6 body, 7 supply
  const acc = new Float64Array(8);
  const cur = new Float64Array(5);
  let pw = new Float64Array(8), pn = new Float64Array(8);
  const power = (v: number, il: number, vc: number, out: Float64Array) => {
    cur[0] = cur[1] = cur[2] = cur[3] = cur[4] = 0;
    for (let k = 0; k < nEl; k++) if (isOn(k, v)) cur[elKind[k]] += elG[k] * (v - elE[k]);
    const irc = isRC ? (v - Vs - vc) / Rsn : 0;
    out[0] = Rc * il * il;
    out[1] = cur[2] * (v - Vs) + cur[3] * (v - Vs - p.vz);   // diode (incl. the diode of the diode+Zener string)
    out[2] = cur[3] * p.vz;                                  // Zener
    out[3] = irc * irc * Rsn;
    out[4] = cur[4] * v; out[5] = cur[1] * v; out[6] = cur[0] * v;
    out[7] = Vs * (il - cur[2] - cur[3] - irc);              // supply delivers iL and gets the clamp-branch current back
  };

  let iL = i0, vX = 0, vC = -Vs;      // snubber cap (X side minus Vs side) was charged to −Vs while X sat at 0 V
  let iLp = iL, vXp = vX, vCp = vC, hPrev = 0;
  const stored0 = 0.5 * L * i0 * i0 + (isRC ? 0.5 * Csn * Vs * Vs : 0);
  const T: number[] = [0], VX: number[] = [0], IL: number[] = [i0];
  let t = 0, vPeak = 0, vMin = 0, tPeak = 0, tZero = NaN, steps = 0, lastAbove = 0, h = hFast, calm = 0;
  power(vX, iL, vC, pw);
  while (steps < maxSteps && t < tMax) {
    // variable-step BDF2:  y' ≈ a0·y_{n+1} − b,  ω = h/h_prev   (first step: backward Euler)
    let a0: number, cI: number, cV: number, cC: number;
    if (steps === 0) { a0 = 1 / h; cI = iL / h; cV = vX / h; cC = vC / h; }
    else {
      const w = h / hPrev, k1 = (1 + w) / h, k2 = (w * w) / ((1 + w) * h);
      a0 = (1 + 2 * w) / ((1 + w) * h);
      cI = k1 * iL - k2 * iLp; cV = k1 * vX - k2 * vXp; cC = k1 * vC - k2 * vCp;
    }
    const beta = 1 / (L * a0 + Rc), alpha = (Vs + L * cI) * beta;
    const gam = isRC ? 1 / (Rsn + 1 / (Csn * a0)) : 0;
    let v = vX;
    for (let k = 0; k < nEl; k++) active[k] = isOn(k, vX);
    for (let it = 0; it < 12; it++) {
      let G = 0, J = 0;
      for (let k = 0; k < nEl; k++) if (active[k]) { G += elG[k]; J += elG[k] * elE[k]; }
      v = (Cp * cV + alpha + J + gam * (Vs + cC / a0)) / (Cp * a0 + beta + G + gam);
      let changed = false;
      for (let k = 0; k < nEl; k++) { const on = isOn(k, v); if (on !== active[k]) { active[k] = on; changed = true; } }
      if (!changed) break;
    }
    const iNew = alpha - beta * v;
    const iS = isRC ? (v - Vs - cC / a0) * gam : 0;
    const vcNew = isRC ? (iS / Csn + cC) / a0 : 0;
    let clamped = false, switched = false;
    for (let k = 0; k < nEl; k++) { if (active[k]) clamped = true; if (active[k] !== isOn(k, vX)) switched = true; }
    iLp = iL; vXp = vX; vCp = vC; hPrev = h;
    iL = iNew; vX = v; vC = vcNew; t += h; steps++;
    power(vX, iL, vC, pn);
    for (let k = 0; k < 8; k++) acc[k] += 0.5 * (pw[k] + pn[k]) * h;
    { const tmp = pw; pw = pn; pn = tmp; }
    if (vX > vPeak) { vPeak = vX; tPeak = t; }
    if (vX < vMin) vMin = vX;
    if (Math.abs(iL) > 0.1 * i0) lastAbove = t;
    if (isNaN(tZero) && iL <= 1e-3 * i0) tZero = t - h * ((iL - 1e-3 * i0) / (iL - iLp || -1));   // current gone (<0.1% i0)
    T.push(t); VX.push(vX); IL.push(iL);
    const eNow = 0.5 * L * iL * iL + 0.5 * Cp * (vX - Vs) ** 2 + (isRC ? 0.5 * Csn * vC * vC : 0);
    if (steps > 50 && eNow < 1e-5 * stored0 && Math.abs(iL) < 1e-3 * i0 + 1e-12) break;
    // next step size: fast while the L–Cp tank rings freely or right after a clamp turns on/off
    const slowOK = (clamped || rcDampsCp) && !switched;
    calm = slowOK ? calm + 1 : 0;
    const target = calm > 20 ? hSlow : hFast;
    h = target > h ? Math.min(target, h * 1.5) : target;
  }
  const e: Energy = {
    coilR: acc[0], diode: acc[1], zener: acc[2], snubR: acc[3], tvs: acc[4], aval: acc[5], body: acc[6], supply: acc[7],
    stored0, storedEnd: 0.5 * L * iL * iL + 0.5 * Cp * vX * vX + (isRC ? 0.5 * Csn * vC * vC : 0),
  };
  const losses = e.coilR + e.diode + e.zener + e.snubR + e.tvs + e.aval + e.body;
  const balanceErr = (stored0 + e.supply - losses - e.storedEnd) / Math.max(1e-30, stored0);
  // min/max decimation for plotting (keeps ring peaks visible)
  const nOut = opts.nOut ?? 2500;
  const ts: number[] = [], vxs: number[] = [], ils: number[] = [];
  const n = T.length;
  // decimate on a uniform time grid so that fast and slow phases get fair resolution
  const buckets = Math.min(nOut, n);
  let j = 0;
  for (let q = 0; q < buckets && j < n; q++) {
    const tEndB = (t * (q + 1)) / buckets;
    let kMin = j, kMax = j;
    const j0 = j;
    while (j < n && (T[j] <= tEndB || j === j0)) { if (VX[j] < VX[kMin]) kMin = j; if (VX[j] > VX[kMax]) kMax = j; j++; }
    const a = Math.min(kMin, kMax), b = Math.max(kMin, kMax);
    ts.push(T[a]); vxs.push(VX[a]); ils.push(IL[a]);
    if (b !== a) { ts.push(T[b]); vxs.push(VX[b]); ils.push(IL[b]); }
  }
  return { t: ts, vx: vxs, il: ils, vPeak, vMin, tPeak, tDecay: lastAbove, tZero, tEnd: t, ringF: wRing / (2 * Math.PI), z0, e, balanceErr, h: hFast, steps };
}

/** High-resolution view of the first `tWin` seconds (for the spike zoom). */
export function zoom(p: FlyIn, tWin: number, nOut = 1500) {
  const r = simulate(p, { nOut: 1e9 });
  const ts: number[] = [], vx: number[] = [], il: number[] = [];
  void nOut;
  for (let k = 0; k < r.t.length && r.t[k] <= tWin; k++) { ts.push(r.t[k]); vx.push(r.vx[k]); il.push(r.il[k]); }
  return { t: ts, vx, il };
}

/** Closed-form predictions (Cp neglected) for the UI. */
export function predict(p: FlyIn) {
  const Rc = rcOf(p), tau = p.l / Rc, E = 0.5 * p.l * p.i0 * p.i0;
  const clampT = (vc: number) => (vc > p.vs ? tau * Math.log(1 + (Rc * p.i0) / (vc - p.vs)) : Infinity);
  switch (p.protection) {
    case 'diode': return { vClamp: p.vs + p.vf, tZero: tau * Math.log(1 + (Rc * p.i0) / p.vf), eClamp: NaN };
    case 'zener': return { vClamp: p.vs + p.vf + p.vz, tZero: tau * Math.log(1 + (Rc * p.i0) / (p.vf + p.vz)), eClamp: NaN };
    case 'tvs': return { vClamp: p.vtvs, tZero: clampT(p.vtvs), eClamp: E * p.vtvs / (p.vtvs - p.vs) };
    case 'rc': return { vClamp: p.vs + p.i0 * p.rsn, tZero: NaN, eClamp: NaN };
    default: return p.aval && p.vs + p.i0 * Math.sqrt(p.l / p.cp) > p.bv
      ? { vClamp: p.bv, tZero: clampT(p.bv), eClamp: E * p.bv / (p.bv - p.vs) }
      : { vClamp: p.vs + p.i0 * Math.sqrt(p.l / p.cp), tZero: NaN, eClamp: NaN };
  }
}
