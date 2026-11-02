// Multiphase (interleaved) buck: N identical phases, each with inductor L at fsw, shifted by T/N.
//
// Per-phase ripple (CCM): ΔI_ph = (Vin − Vout)·D/(L·fsw), D = Vout/Vin, per-phase DC = Iout/N.
// Summed ripple cancellation (e.g. TI SLVA882, Intersil AN1332):
//   ΔI_sum / ΔI_ph = K(N,D) = N·(D − m/N)·((m+1)/N − D) / (D·(1 − D)),  m = floor(N·D)
//   → zero when N·D is an integer; ripple frequency of the sum and of Vout is N·fsw.
// Output ripple (triangle of p-p ΔI_sum at N·fsw into C): ΔV ≈ ΔI_sum/(8·C·N·fsw) + ESR·ΔI_sum.
// Conduction loss: each phase I_rms² = (Iout/N)² + ΔI_ph²/12 ⇒ P_cond = Iout²·R/N + N·ΔI_ph²·R/12.
// Switching + gate loss grow with N: P_sw = N·[½·Vin·(Iout/N)·(tr+tf)·fsw + ½·Coss·Vin²·fsw + 2·Qg·Vdrv·fsw]
//   (the V·I overlap term is independent of N; the fixed per-phase terms scale with N).
// Load-step transient (ideal max-slew controller): after a reaction delay t_d all phases go to D = 1, so the summed
// current slews at N·(Vin − Vout)/L (effective inductance L/N). Charge balance on C gives the undershoot
//   ΔV ≈ ESR·ΔI + ΔI·t_d/C + (L/N)·ΔI² / (2·C·(Vin − Vout)).

export type MPIn = { phases: number; vin: number; vout: number; iout: number; l: number; fsw: number; c: number; esr: number; r: number; tsw: number; qg: number; vdrv: number; coss: number };

export function mpDefaults(): MPIn {
  return { phases: 2, vin: 12, vout: 1.2, iout: 40, l: 470e-9, fsw: 500e3, c: 470e-6, esr: 0.001, r: 0.004, tsw: 5e-9, qg: 15e-9, vdrv: 5, coss: 1e-9 };
}

export function rippleRatio(N: number, D: number) {
  if (D <= 0 || D >= 1) return 0;
  const m = Math.floor(N * D + 1e-12);
  return Math.max(0, N * (D - m / N) * ((m + 1) / N - D) / (D * (1 - D)));
}

/** Triangle current of one phase at time t (phase shift `shift` in seconds). */
function phaseCurrent(t: number, shift: number, T: number, D: number, idc: number, dI: number) {
  let u = ((t - shift) % T + T) % T;
  if (u < D * T) return idc - dI / 2 + dI * u / (D * T);
  return idc + dI / 2 - dI * (u - D * T) / ((1 - D) * T);
}

export function multiphase(p: MPIn, nPts = 1200, periods = 2) {
  const N = Math.max(1, Math.min(6, Math.round(p.phases)));
  const D = Math.min(0.999, Math.max(0.001, p.vout / p.vin));
  const T = 1 / p.fsw;
  const dIph = (p.vin - p.vout) * D / (p.l * p.fsw);
  const idc = p.iout / N;
  const t: number[] = []; const ph: number[][] = Array.from({ length: N }, () => []); const sum: number[] = [];
  // sample densely including all corners so the numeric peak-to-peak is exact
  const corners = new Set<number>();
  for (let k = 0; k < N; k++) for (let c = -1; c <= periods + 1; c++) { corners.add(k * T / N + c * T); corners.add(k * T / N + c * T + D * T); }
  const ts = [...Array.from({ length: nPts + 1 }, (_, i) => i * periods * T / nPts), ...[...corners].filter(x => x >= 0 && x <= periods * T)].sort((a, b) => a - b);
  let mn = Infinity, mx = -Infinity;
  for (const tt of ts) {
    t.push(tt); let s = 0;
    for (let k = 0; k < N; k++) { const i = phaseCurrent(tt, k * T / N, T, D, idc, dIph); ph[k].push(i); s += i; }
    sum.push(s); mn = Math.min(mn, s); mx = Math.max(mx, s);
  }
  const dIsum = mx - mn;
  const fEff = N * p.fsw;
  const dVcap = dIsum / (8 * p.c * fEff), dVesr = dIsum * p.esr;
  return { N, D, T, dIph, idc, t, ph, sum, dIsum, K: rippleRatio(N, D), fEff, dVcap, dVesr, dV: dVcap + dVesr, ...losses(p, N) };
}

export function losses(p: MPIn, N: number) {
  const D = Math.min(0.999, Math.max(0.001, p.vout / p.vin));
  const dIph = (p.vin - p.vout) * D / (p.l * p.fsw);
  const irms2 = (p.iout / N) ** 2 + dIph * dIph / 12;
  const cond = N * irms2 * p.r;
  const swOverlap = 0.5 * p.vin * p.iout * 2 * p.tsw * p.fsw;
  const fixed = N * (0.5 * p.coss * p.vin * p.vin + 2 * p.qg * p.vdrv) * p.fsw;
  const pout = p.vout * p.iout;
  const total = cond + swOverlap + fixed;
  return { cond, swOverlap, fixed, total, eff: pout / (pout + total), irmsPh: Math.sqrt(irms2), condDcOnly: p.iout * p.iout * p.r / N };
}

/** Load-step transient with an ideal time-optimal (charge-balance) controller.
 *  Phase 1: wait t_d. Phase 2: all phases at D = 1, Σi_L rises at s_up = N(Vin−Vout)/L until it reaches ΔI.
 *  Phase 3 (recovery): keep rising by h, then fall at s_dn = N·Vout/L back to ΔI, where the extra triangle charge
 *  h²/2·(1/s_up + 1/s_dn) equals the charge q lost from C, so Vout returns exactly to its set point. */
export function transient(p: MPIn, N: number, dI: number, tdBase = 0.5, tEndIn?: number) {
  const vl = Math.max(1e-6, p.vin - p.vout);
  const td = tdBase / (N * p.fsw);             // wait for the next phase slot (average half a slot)
  const slew = N * vl / p.l, sdn = N * p.vout / p.l;
  const tr = dI / slew;
  const qdef = dI * td + 0.5 * dI * tr;        // charge removed from C by the time Σi_L = ΔI
  const h = Math.sqrt(2 * qdef / (1 / slew + 1 / sdn));
  const t2 = td + tr + h / slew, t3 = t2 + h / sdn;
  const tEnd = tEndIn ?? Math.max(1.3 * t3, 2e-6);
  const t: number[] = [], v: number[] = [], i: number[] = [];
  const n = 700;
  for (let k = 0; k <= n; k++) {
    const tt = -0.08 * tEnd + k * 1.08 * tEnd / n;
    let iL: number, q: number; // q = net charge removed from C since the step
    if (tt < 0) { iL = 0; q = 0; }
    else if (tt < td) { iL = 0; q = dI * tt; }
    else if (tt < td + tr) { const u = tt - td; iL = slew * u; q = dI * td + dI * u - 0.5 * slew * u * u; }
    else if (tt < t2) { const u = tt - td - tr; iL = dI + slew * u; q = qdef - 0.5 * slew * u * u; }
    else if (tt < t3) { const u = tt - t2; iL = dI + h - sdn * u; q = qdef - 0.5 * h * h / slew - (h * u - 0.5 * sdn * u * u); }
    else { iL = dI; q = 0; }
    const vout = p.vout - q / p.c - (tt >= 0 ? p.esr * (dI - iL) : 0);
    t.push(tt); v.push(vout); i.push(iL);
  }
  const under = p.esr * dI + dI * td / p.c + p.l / N * dI * dI / (2 * p.c * vl);
  const vmin = Math.min(...v);
  return { t, v, i, td, tr, slew, under, vmin, undershoot: p.vout - vmin, tRecover: t3, tEnd };
}
