// Boost converter: switched time-domain model with a diode rectifier and constant-current (electronic) load.
//
// Circuit: Vin -> L (DCR) -> switch node SW; low-side FET (Rds) from SW to ground; diode (Vf) from SW to Vout;
// C with series ESR from Vout to ground; load draws Iout.
//   FET on:   L·di/dt = Vin − i·(DCR+Rds);            C·dvC/dt = −Iout;      v_out = vC − ESR·Iout
//   diode on: L·di/dt = Vin − i·DCR − Vf − v_out;     C·dvC/dt = i − Iout;   v_out = vC + ESR·(i − Iout)
//   idle (DCM, diode current reached 0): i ≡ 0, v_SW = Vin;  C·dvC/dt = −Iout
// RK4 with switching edges as segment boundaries; periodic steady state by shooting (Newton on the period map).
//
// Textbook references (lossless CCM): Vout = Vin/(1−D); I_L,avg = Iout/(1−D); ΔI = Vin·D/(L·fsw);
//   ΔV_C = Iout·D/(C·fsw) (cap supplies the whole load while the switch is on), ESR step ≈ ESR·I_peak.
// DCM (lossless, CC load): diode charge per cycle = ½·Ipk·t2 with Ipk = Vin·D·T/L, t2 = L·Ipk/(Vout−Vin)
//   ⇒ Vout = Vin + Vin²·D²·T/(2·L·Iout). CCM/DCM boundary: Iout,crit = (1−D)·ΔI/2.
// With losses (averaged, CC load): Vin − I_L·R_series − (1−D)(Vout+Vf) = 0 ⇒ the "ideal 1/(1−D)" gain collapses at high D.
// Switching loss: ½·V_SW·(I_on·tr + I_off·tf)·fsw + ½·Coss·V_SW²·fsw; gate drive Qg·Vdrv·fsw.

export type BoostIn = {
  vin: number; d: number; l: number; c: number; esr: number; dcr: number; rds: number; vf: number; iout: number; fsw: number;
  tr: number; tf: number; coss: number; qg: number; vdrv: number; steps?: number;
};
type Kind = 'on' | 'off';
export type BSample = { t: number; iL: number; vC: number; vout: number; vsw: number; id: number; isw: number; ic: number; idle: boolean };
export type BLosses = { fet: number; diode: number; dcr: number; esr: number; sw: number; gate: number };

export function boostDefaults(): BoostIn {
  return { vin: 3.7, d: 0.3, l: 2.2e-6, c: 22e-6, esr: 0.01, dcr: 0.03, rds: 0.03, vf: 0.35, iout: 0.5, fsw: 1e6, tr: 5e-9, tf: 5e-9, coss: 150e-12, qg: 3e-9, vdrv: 3.7 };
}

function period(p: BoostIn, D: number, i0: number, v0: number, rec: boolean) {
  const T = 1 / p.fsw, N = p.steps ?? 400;
  const { vin, l: L, c: C, esr, dcr, rds, vf, iout } = p;
  const segs: { kind: Kind; t0: number; t1: number; n: number }[] = [];
  if (D > 0) segs.push({ kind: 'on', t0: 0, t1: D * T, n: Math.max(6, Math.round(N * D)) });
  if (D < 1) segs.push({ kind: 'off', t0: D * T, t1: T, n: Math.max(6, Math.round(N * (1 - D))) });
  const inst = (k: Kind, i: number, v: number, idle: boolean) => {
    if (k === 'on') return { vo: v - esr * iout, vsw: i * rds, id: 0, isw: i };
    if (idle) return { vo: v - esr * iout, vsw: vin, id: 0, isw: 0 };
    const vo = v + esr * (i - iout);
    return { vo, vsw: vo + vf, id: i, isw: 0 };
  };
  const der = (k: Kind, i: number, v: number, idle: boolean): [number, number] => {
    if (k === 'on') return [(vin - i * (dcr + rds)) / L, -iout / C];
    if (idle) return [0, -iout / C];
    const vo = v + esr * (i - iout);
    return [(vin - i * dcr - vf - vo) / L, (i - iout) / C];
  };
  const S: BSample[] = [];
  const E = { in: 0, out: 0, fet: 0, diode: 0, dcr: 0, esr: 0 };
  const push = (t: number, k: Kind, i: number, v: number, idle: boolean) => { const q = inst(k, i, v, idle); const ic = k === 'on' || idle ? -iout : i - iout; S.push({ t, iL: i, vC: v, vout: q.vo, vsw: q.vsw, id: q.id, isw: q.isw, ic, idle }); };
  const acc = (k: Kind, dt: number, ia: number, va: number, ib: number, vb: number, idle: boolean) => {
    const qa = inst(k, ia, va, idle), qb = inst(k, ib, vb, idle); const tz = (a: number, b: number) => 0.5 * (a + b) * dt;
    const ica = k === 'on' || idle ? -iout : ia - iout, icb = k === 'on' || idle ? -iout : ib - iout;
    E.in += vin * tz(ia, ib); E.out += iout * tz(qa.vo, qb.vo); E.dcr += dcr * tz(ia * ia, ib * ib); E.esr += esr * tz(ica * ica, icb * icb);
    if (k === 'on') E.fet += rds * tz(ia * ia, ib * ib); else if (!idle) E.diode += vf * tz(ia, ib);
  };
  let i = i0, v = v0, sawIdle = false, iOn = i0, iOff = i0;
  for (const s of segs) {
    const dt = (s.t1 - s.t0) / s.n;
    let idle = s.kind === 'off' && i <= 0; if (idle) i = 0;
    if (s.kind === 'on') iOn = i;
    if (rec) push(s.t0, s.kind, i, v, idle);
    for (let k = 0; k < s.n; k++) {
      const [a1, b1] = der(s.kind, i, v, idle), [a2, b2] = der(s.kind, i + 0.5 * dt * a1, v + 0.5 * dt * b1, idle);
      const [a3, b3] = der(s.kind, i + 0.5 * dt * a2, v + 0.5 * dt * b2, idle), [a4, b4] = der(s.kind, i + dt * a3, v + dt * b3, idle);
      let ni = idle ? 0 : i + dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
      let nv = v + dt / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
      if (s.kind === 'on' && ni < 0) ni = 0; // FET body diode is not modelled for reverse; i cannot go below 0 with Vin>0 anyway
      if (s.kind === 'off' && !idle && ni <= 0) {
        const fr = i / (i - ni); const vz = v + (nv - v) * fr;
        if (rec) acc('off', dt * fr, i, v, 0, vz, false);
        nv = vz - iout / C * dt * (1 - fr);
        if (rec) acc('off', dt * (1 - fr), 0, vz, 0, nv, true);
        ni = 0; idle = true; sawIdle = true;
      } else if (rec) acc(s.kind, dt, i, v, ni, nv, idle);
      i = ni; v = nv;
      if (rec) push(s.t0 + (k + 1) * dt, s.kind, i, v, idle);
    }
    if (s.kind === 'on') iOff = i;
  }
  return { i, v, S, E, sawIdle, iOn, iOff };
}

function steady(p: BoostIn, D: number) {
  const T = 1 / p.fsw;
  const vIdeal = p.vin / Math.max(0.02, 1 - D);
  let x: [number, number] = [p.iout / Math.max(0.02, 1 - D), vIdeal];
  const F = (x: [number, number]) => { const r = period(p, D, x[0], x[1], false); return [r.i - x[0], r.v - x[1]]; };
  const sI = Math.max(1e-3, p.vin * T / p.l), sV = Math.max(1e-3, p.vin);
  const nrm = (f: number[]) => Math.abs(f[0]) / sI + Math.abs(f[1]) / sV;
  let f = F(x), converged = false;
  for (let it = 0; it < 40; it++) {
    const err = nrm(f); if (err < 1e-11) { converged = true; break; }
    const hi = 1e-6 * sI, hv = 1e-6 * sV;
    const fi = F([x[0] + hi, x[1]]), fv = F([x[0], x[1] + hv]);
    const J = [[(fi[0] - f[0]) / hi, (fv[0] - f[0]) / hv], [(fi[1] - f[1]) / hi, (fv[1] - f[1]) / hv]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!isFinite(det) || det === 0) break;
    const d0 = -(J[1][1] * f[0] - J[0][1] * f[1]) / det, d1 = -(-J[1][0] * f[0] + J[0][0] * f[1]) / det;
    let lam = 1, nx = x, nf = f;
    for (let k = 0; k < 14; k++) { nx = [Math.max(0, x[0] + lam * d0), x[1] + lam * d1]; nf = F(nx); if (nrm(nf) < err) break; lam *= 0.5; }
    x = nx; f = nf;
  }
  return { x, converged };
}

export type BoostResult = {
  D: number; T: number; S: BSample[]; voutAvg: number; vIdeal: number; iLavg: number; iLmin: number; iLmax: number; dI: number; dV: number;
  iin: number; idAvg: number; idPk: number; pout: number; pin: number; losses: BLosses; lossTotal: number; eff: number;
  mode: 'CCM' | 'DCM' | 'BCM'; dIanalytic: number; dVcap: number; dVesr: number; iCrit: number; vDcm: number;
  collapsed: boolean; converged: boolean; vAvgModel: number;
};

export function simulateBoost(pIn: BoostIn): BoostResult {
  const p: BoostIn = { ...pIn, iout: Math.max(1e-6, pIn.iout), dcr: Math.max(0, pIn.dcr), d: Math.min(0.95, Math.max(0, pIn.d)) };
  const D = p.d, T = 1 / p.fsw, f = p.fsw;
  const ss = steady(p, D);
  const r = period(p, D, ss.x[0], ss.x[1], true);
  const S = r.S;
  let mn = Infinity, mx = -Infinity, vmn = Infinity, vmx = -Infinity, iLs = 0, idPk = 0;
  for (let k = 0; k < S.length; k++) {
    const s = S[k]; mn = Math.min(mn, s.iL); mx = Math.max(mx, s.iL); vmn = Math.min(vmn, s.vout); vmx = Math.max(vmx, s.vout); idPk = Math.max(idPk, s.id);
    if (k > 0) iLs += 0.5 * (S[k].iL + S[k - 1].iL) * (S[k].t - S[k - 1].t);
  }
  const voutAvg = r.E.out / p.iout * f;
  const vsw = voutAvg + p.vf;
  const psw = 0.5 * vsw * (Math.max(0, r.iOn) * p.tr + Math.max(0, r.iOff) * p.tf) * f + 0.5 * p.coss * vsw * vsw * f;
  const losses: BLosses = { fet: r.E.fet * f, diode: r.E.diode * f, dcr: r.E.dcr * f, esr: r.E.esr * f, sw: psw, gate: p.qg * p.vdrv * f };
  const lossTotal = Object.values(losses).reduce((a, b) => a + b, 0);
  const pout = voutAvg * p.iout;
  const dI = mx - mn;
  const dIanalytic = p.vin * D / (p.l * f);
  // averaged CCM model with losses: Vin − I_L(DCR + D·Rds) − (1−D)(Vout + Vf) = 0, I_L = Iout/(1−D)
  const IL = p.iout / (1 - D);
  const vAvgModel = (p.vin - IL * (p.dcr + D * p.rds)) / (1 - D) - p.vf;
  const vIdeal = p.vin / (1 - D);
  const collapsed = !ss.converged || !(voutAvg > p.vin - p.vf - 1e-6) || !isFinite(voutAvg);
  return {
    D, T, S, voutAvg, vIdeal, iLavg: iLs / T, iLmin: mn, iLmax: mx, dI, dV: vmx - vmn,
    iin: r.E.in / p.vin * f, idAvg: p.iout, idPk, pout, pin: r.E.in * f + psw + losses.gate, losses, lossTotal, eff: pout > 0 ? pout / (pout + lossTotal) : 0,
    mode: r.sawIdle ? 'DCM' : mn < 0.02 * dI ? 'BCM' : 'CCM', dIanalytic, dVcap: p.iout * D / (p.c * f), dVesr: p.esr * mx,
    iCrit: (1 - D) * dIanalytic / 2, vDcm: p.vin + p.vin * p.vin * D * D * T / (2 * p.l * p.iout), collapsed, converged: ss.converged, vAvgModel,
  };
}

/** Averaged CCM conversion ratio with losses (for the Vout-vs-D curve): includes DCR, Rds, Vf. */
export function voutVsD(p: BoostIn, D: number) {
  const IL = p.iout / (1 - D);
  return (p.vin - IL * (p.dcr + D * p.rds)) / (1 - D) - p.vf;
}
