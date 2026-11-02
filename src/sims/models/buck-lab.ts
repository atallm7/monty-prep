// Buck converter: cycle-by-cycle switched (not averaged) time-domain model.
//
// Circuit: Vin -> high-side FET (Rds_hi) -> switch node -> L (DCR) -> Vout node; C with series ESR to ground;
// constant-current (electronic) load Iout. Low side is either a synchronous FET (Rds_lo) with dead time
// on both edges (body diode, Vf_body, conducts during dead time) or a Schottky diode (Vf).
//
// State equations (exact for the piecewise-linear network):
//   v_out = v_C + ESR·(i_L − I_out)
//   L·di_L/dt = v_sw − i_L·DCR − v_out
//   C·dv_C/dt = i_L − I_out
// with v_sw = Vin − i_L·Rds_hi (HS on), −i_L·Rds_lo (LS on), −Vf (diode, i_L>0), Vin+Vf (HS body diode, i_L<0),
// and v_sw = v_out with i_L ≡ 0 once the rectifier diode current reaches zero (DCM idle, ringing ignored).
//
// Integration: classical RK4 with segment boundaries aligned to switching edges; zero crossings of the diode
// current are located by linear interpolation. The periodic steady state is found directly with a shooting
// method (Newton on x0 = Φ_T(x0)), so the result is the true steady state rather than a slowly-settling start-up.
//
// Reference results (lossless, CCM): D = Vout/Vin; ΔI = (Vin−Vout)·D/(L·fsw);
//   ΔV ≈ ΔI/(8·C·fsw) (capacitive) and ΔI·ESR (ESR part). DCM boundary at I_out = ΔI/2.
// DCM with a constant-current load (async, lossless): charge balance ½·Ipk·(D+D2)·T = Iout gives
//   Vout = Vin / (1 + 2·L·Iout/(D²·T·Vin)).
// Switching loss (hard-switched, linear V/I overlap): P = ½·Vin·(I_on·t_r + I_off·t_f)·fsw + ½·Coss·Vin²·fsw;
// body-diode reverse recovery Qrr·Vin·fsw; gate drive Qg·Vdrv·fsw per FET.

export type BuckIn = {
  vin: number; vout: number; d: number; mode: 'target' | 'duty';
  l: number; c: number; esr: number; dcr: number; fsw: number; iout: number; sync: boolean;
  rdsHi: number; rdsLo: number; vfBody: number; vfDiode: number; td: number;
  tr: number; tf: number; coss: number; qg: number; vdrv: number; qrr: number;
  steps?: number;
};

type Kind = 'hs' | 'ls' | 'dead' | 'diode';
type Seg = { kind: Kind; t0: number; t1: number; n: number };

export type Sample = { t: number; iL: number; vC: number; vout: number; vsw: number; iin: number; ilow: number; ic: number; kind: Kind; idle: boolean };

export type Losses = { hs: number; ls: number; diode: number; dcr: number; esr: number; sw: number; gate: number };

export type BuckResult = {
  D: number; T: number; samples: Sample[];
  voutAvg: number; iLavg: number; iLmin: number; iLmax: number; dI: number; dV: number;
  iinAvg: number; pinWave: number; pout: number; losses: Losses; lossTotal: number; pin: number; eff: number;
  mode: 'CCM' | 'DCM' | 'FCCM' | 'BCM'; dcm: boolean; negCurrent: boolean;
  dIanalytic: number; dVcap: number; dVesr: number; dVanalytic: number; iBoundary: number;
  dropout: boolean; converged: boolean; iOn: number; iOff: number; icRms: number; iLrms: number;
};

export function defaults(): BuckIn {
  return { vin: 12, vout: 3.3, d: 0.3, mode: 'target', l: 4.7e-6, c: 22e-6, esr: 0.005, dcr: 0.02, fsw: 500e3, iout: 2, sync: true,
    rdsHi: 0.02, rdsLo: 0.01, vfBody: 0.7, vfDiode: 0.45, td: 20e-9, tr: 8e-9, tf: 8e-9, coss: 300e-12, qg: 8e-9, vdrv: 5, qrr: 10e-9 };
}

function segments(p: BuckIn, D: number): Seg[] {
  const T = 1 / p.fsw; const N = p.steps ?? 400;
  const n = (dt: number) => Math.max(4, Math.round(N * dt / T));
  if (p.sync) {
    const td = Math.min(p.td, T * 0.2);
    const ton = Math.min(D * T, T - 2 * td);
    const tls = Math.max(0, T - ton - 2 * td);
    const segs: Seg[] = [];
    let t = 0;
    const add = (kind: Kind, dt: number) => { if (dt > 0) { segs.push({ kind, t0: t, t1: t + dt, n: kind === 'dead' ? 6 : n(dt) }); t += dt; } };
    add('hs', ton); add('dead', td); add('ls', tls); add('dead', T - t);
    return segs;
  }
  const ton = D * T;
  const segs: Seg[] = [];
  if (ton > 0) segs.push({ kind: 'hs', t0: 0, t1: ton, n: n(ton) });
  if (T - ton > 0) segs.push({ kind: 'diode', t0: ton, t1: T, n: n(T - ton) });
  return segs;
}

/** Simulate one switching period from state (i0, v0). If rec, record samples and integrate energies. */
function period(p: BuckIn, D: number, i0: number, v0: number, rec: boolean) {
  const { vin, l: L, c: C, esr, dcr, iout } = p;
  const segs = segments(p, D);
  let i = i0, v = v0;
  const samples: Sample[] = [];
  const E = { in: 0, out: 0, hs: 0, ls: 0, diode: 0, dcr: 0, esr: 0 };
  let iOn = i0, iOff = i0, sawIdle = false;
  const vfOf = (k: Kind) => (k === 'dead' ? p.vfBody : p.vfDiode);

  // instantaneous circuit quantities for a given state & conduction mode
  const inst = (k: Kind, i: number, v: number, idle: boolean, sgn: number) => {
    const vo = v + esr * (i - iout);
    let vsw: number;
    if (k === 'hs') vsw = vin - i * p.rdsHi;
    else if (k === 'ls') vsw = -i * p.rdsLo;
    else if (idle) vsw = vo;
    else vsw = sgn > 0 ? -vfOf(k) : vin + vfOf(k);
    const iin = k === 'hs' ? i : (k === 'dead' && !idle && sgn < 0 ? i : 0);
    const ilow = k === 'ls' ? i : ((k === 'dead' || k === 'diode') && !idle && sgn > 0 ? i : 0);
    return { vo, vsw, iin, ilow };
  };
  const der = (k: Kind, i: number, v: number, idle: boolean, sgn: number): [number, number] => {
    if (idle) return [0, -iout / C];
    const { vo, vsw } = inst(k, i, v, idle, sgn);
    return [(vsw - i * dcr - vo) / L, (i - iout) / C];
  };
  const push = (t: number, k: Kind, i: number, v: number, idle: boolean, sgn: number) => {
    const q = inst(k, i, v, idle, sgn);
    samples.push({ t, iL: i, vC: v, vout: q.vo, vsw: q.vsw, iin: q.iin, ilow: q.ilow, ic: i - iout, kind: k, idle });
  };
  // accumulate energy over one step with trapezoid rule, using the conduction mode valid during the step
  const acc = (k: Kind, dt: number, ia: number, va: number, ib: number, vb: number, idle: boolean, sgn: number) => {
    const qa = inst(k, ia, va, idle, sgn), qb = inst(k, ib, vb, idle, sgn);
    const tz = (a: number, b: number) => 0.5 * (a + b) * dt;
    E.in += vin * tz(qa.iin, qb.iin);
    E.out += iout * tz(qa.vo, qb.vo);
    E.dcr += dcr * tz(ia * ia, ib * ib);
    E.esr += esr * tz((ia - iout) ** 2, (ib - iout) ** 2);
    if (k === 'hs') E.hs += p.rdsHi * tz(ia * ia, ib * ib);
    else if (k === 'ls') E.ls += p.rdsLo * tz(ia * ia, ib * ib);
    else if (!idle) E.diode += vfOf(k) * tz(Math.abs(ia), Math.abs(ib));
  };

  for (const s of segs) {
    const dt = (s.t1 - s.t0) / s.n;
    const diodeSeg = s.kind === 'dead' || s.kind === 'diode';
    let idle = diodeSeg && (i === 0 || (s.kind === 'diode' && i < 0));
    if (s.kind === 'diode' && i < 0) i = 0;
    if (s.kind === 'hs') iOn = i;
    if (rec) push(s.t0, s.kind, i, v, idle, Math.sign(i) || 1);
    for (let k = 0; k < s.n; k++) {
      const sgn = i > 0 ? 1 : -1;
      const [a1, b1] = der(s.kind, i, v, idle, sgn);
      const [a2, b2] = der(s.kind, i + 0.5 * dt * a1, v + 0.5 * dt * b1, idle, sgn);
      const [a3, b3] = der(s.kind, i + 0.5 * dt * a2, v + 0.5 * dt * b2, idle, sgn);
      const [a4, b4] = der(s.kind, i + dt * a3, v + dt * b3, idle, sgn);
      let ni = i + dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
      let nv = v + dt / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
      if (idle) ni = 0;
      if (diodeSeg && !idle && (ni === 0 || Math.sign(ni) !== sgn)) {
        // rectifier current reaches zero inside this step: both switches off -> idle (DCM)
        const fr = i / (i - ni);
        const vz = v + (nv - v) * fr;
        if (rec) acc(s.kind, dt * fr, i, v, 0, vz, false, sgn);
        nv = vz - iout / C * dt * (1 - fr);
        if (rec) acc(s.kind, dt * (1 - fr), 0, vz, 0, nv, true, sgn);
        ni = 0; idle = true; sawIdle = true;
      } else if (rec) acc(s.kind, dt, i, v, ni, nv, idle, sgn);
      i = ni; v = nv;
      if (rec) push(s.t0 + (k + 1) * dt, s.kind, i, v, idle, i > 0 ? 1 : -1);
    }
    if (s.kind === 'hs') iOff = i;
  }
  return { i, v, samples, E, iOn, iOff, sawIdle };
}

/** Periodic steady state by shooting (Newton with finite-difference Jacobian on the one-period map). */
function steady(p: BuckIn, D: number, guess?: [number, number]) {
  const T = 1 / p.fsw;
  let x: [number, number] = guess ?? [p.iout, Math.max(0, D * p.vin - p.iout * (p.dcr + p.rdsHi * D + p.rdsLo * (1 - D)))];
  const F = (x: [number, number]) => { const r = period(p, D, x[0], x[1], false); return [r.i - x[0], r.v - x[1]]; };
  let f = F(x); let converged = false;
  const scaleI = Math.max(1e-3, p.vin * T / p.l), scaleV = Math.max(1e-3, p.vin);
  for (let it = 0; it < 30; it++) {
    const err = Math.abs(f[0]) / scaleI + Math.abs(f[1]) / scaleV;
    if (err < 1e-11) { converged = true; break; }
    const hi = 1e-6 * scaleI, hv = 1e-6 * scaleV;
    const fi = F([x[0] + hi, x[1]]), fv = F([x[0], x[1] + hv]);
    const J = [[(fi[0] - f[0]) / hi, (fv[0] - f[0]) / hv], [(fi[1] - f[1]) / hi, (fv[1] - f[1]) / hv]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!isFinite(det) || Math.abs(det) < 1e-300) break;
    const dx0 = -(J[1][1] * f[0] - J[0][1] * f[1]) / det;
    const dx1 = -(-J[1][0] * f[0] + J[0][0] * f[1]) / det;
    let lam = 1, nx: [number, number] = x, nf = f;
    for (let k = 0; k < 12; k++) {
      nx = [x[0] + lam * dx0, x[1] + lam * dx1]; nf = F(nx);
      if (Math.abs(nf[0]) / scaleI + Math.abs(nf[1]) / scaleV < err) break;
      lam *= 0.5;
    }
    x = nx; f = nf;
  }
  if (!converged) {
    // fallback: brute-force time stepping from the best estimate
    let i = x[0], v = x[1];
    for (let k = 0; k < 3000; k++) { const r = period(p, D, i, v, false); i = r.i; v = r.v; }
    x = [i, v];
    const r = F(x); converged = Math.abs(r[0]) / scaleI + Math.abs(r[1]) / scaleV < 1e-6;
  }
  return { x, converged };
}

function avgVout(p: BuckIn, D: number) {
  const ss = steady(p, D);
  const r = period(p, D, ss.x[0], ss.x[1], true);
  return { avg: r.E.out / p.iout / (1 / p.fsw), ss, r };
}

export function maxDuty(p: BuckIn) { return p.sync ? Math.max(0, 1 - 2 * Math.min(p.td, 0.2 / p.fsw) * p.fsw) : 0.999; }

/** Duty cycle that makes the steady-state average Vout equal the target (bracketed secant / Illinois). */
export function solveDuty(p: BuckIn): { D: number; dropout: boolean } {
  const target = p.vout;
  const dmax = maxDuty(p);
  const vavg = (D: number) => {
    const ss = steady(p, D);
    const rr = period(p, D, ss.x[0], ss.x[1], true); // energy integrals give the exact period-average of v_out
    return rr.E.out / p.iout * p.fsw;
  };
  if (!(p.iout > 0)) return { D: Math.min(dmax, target / p.vin), dropout: false };
  let a = 1e-4, b = dmax;
  let fa = vavg(a) - target, fb = vavg(b) - target;
  if (fb < 0) return { D: dmax, dropout: true };
  if (fa > 0) return { D: a, dropout: false };
  let side = 0;
  let D = Math.min(b, Math.max(a, target / p.vin));
  for (let it = 0; it < 50; it++) {
    D = (a * fb - b * fa) / (fb - fa);
    const fd = vavg(D) - target;
    if (Math.abs(fd) < 1e-7 * Math.max(1, target) || b - a < 1e-12) break;
    if (fd * fb > 0) { b = D; fb = fd; if (side === -1) fa /= 2; side = -1; }
    else { a = D; fa = fd; if (side === 1) fb /= 2; side = 1; }
  }
  return { D, dropout: false };
}

export function simulateBuck(pIn: BuckIn): BuckResult {
  const p: BuckIn = { ...pIn, iout: Math.max(1e-6, pIn.iout), dcr: Math.max(1e-6, pIn.dcr), esr: Math.max(0, pIn.esr) };
  const T = 1 / p.fsw;
  let D: number, dropout = false;
  if (p.mode === 'target') { const s = solveDuty(p); D = s.D; dropout = s.dropout; }
  else D = Math.min(maxDuty(p), Math.max(0, p.d));
  const { avg: voutAvg, ss, r } = avgVout(p, D);
  const S = r.samples;
  let iLmin = Infinity, iLmax = -Infinity, vmin = Infinity, vmax = -Infinity, iL2 = 0, ic2 = 0, iLs = 0;
  for (let k = 0; k < S.length; k++) {
    const s = S[k]; iLmin = Math.min(iLmin, s.iL); iLmax = Math.max(iLmax, s.iL); vmin = Math.min(vmin, s.vout); vmax = Math.max(vmax, s.vout);
    if (k > 0 && S[k].t > S[k - 1].t) { const dt = S[k].t - S[k - 1].t; iL2 += 0.5 * (S[k].iL ** 2 + S[k - 1].iL ** 2) * dt; ic2 += 0.5 * (S[k].ic ** 2 + S[k - 1].ic ** 2) * dt; iLs += 0.5 * (S[k].iL + S[k - 1].iL) * dt; }
  }
  const f = p.fsw;
  const iOn = r.iOn, iOff = r.iOff;
  // switching losses (analytic, see header). HS turns on hard if current flows into the switch node from the low side.
  const hardOn = iOn > 0 || r.sawIdle;
  let psw = 0.5 * p.vin * (Math.max(0, iOn) * p.tr + Math.max(0, iOff) * p.tf) * f;
  if (hardOn) psw += 0.5 * p.coss * p.vin * p.vin * f;
  if (p.sync && iOn > 0) psw += p.qrr * p.vin * f; // body diode was conducting before HS turn-on
  const pgate = p.qg * p.vdrv * f * (p.sync ? 2 : 1);
  const losses: Losses = { hs: r.E.hs * f, ls: r.E.ls * f, diode: r.E.diode * f, dcr: r.E.dcr * f, esr: r.E.esr * f, sw: psw, gate: pgate };
  const lossTotal = Object.values(losses).reduce((a, b) => a + b, 0);
  const pout = r.E.out * f;
  const pinWave = r.E.in * f;
  const pin = pinWave + psw + pgate;
  const dI = iLmax - iLmin;
  const dIanalytic = (p.vin - voutAvg) * D / (p.l * f);
  const dVcap = dIanalytic / (8 * p.c * f), dVesr = dIanalytic * p.esr;
  const dcm = r.sawIdle;
  const negCurrent = iLmin < -1e-9 * Math.max(1, p.iout);
  const mode = dcm ? 'DCM' : negCurrent ? (p.sync ? 'FCCM' : 'CCM') : (iLmin < 0.02 * dI ? 'BCM' : 'CCM');
  return {
    D, T, samples: S, voutAvg, iLavg: iLs / T, iLmin, iLmax, dI, dV: vmax - vmin, iinAvg: r.E.in / p.vin * f, pinWave, pout, losses, lossTotal, pin,
    eff: pout / (pout + lossTotal), mode, dcm, negCurrent, dIanalytic, dVcap, dVesr, dVanalytic: dVcap + dVesr, iBoundary: dIanalytic / 2,
    dropout, converged: ss.converged, iOn, iOff, icRms: Math.sqrt(ic2 / T), iLrms: Math.sqrt(iL2 / T),
  };
}

/** Efficiency vs load current, regulated to the same target (coarser time step for speed). */
export function effSweep(p: BuckIn, loads: number[]) {
  return loads.map(io => { const r = simulateBuck({ ...p, iout: io, steps: 160 }); return { iout: io, eff: r.eff, mode: r.mode }; });
}
