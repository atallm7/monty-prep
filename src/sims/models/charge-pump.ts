// Two-phase switched-capacitor charge pump (voltage doubler / inverter), exact periodic steady state.
//
// Phase 1 (duration T/2): Cfly connects across Vin through 2·Rsw (two switches): vc relaxes to Vin, τ1 = 2·Rsw·Cfly.
//                         Cout is isolated and feeds the load: dvo/dt = −Iout/Cout.
// Phase 2 (duration T/2): Cfly (stacked on Vin for the doubler, on its own for the inverter, referred to |Vout|) dumps charge
//                         into Cout through 2·Rsw:  i = (Vadd + vc − vo)/Rs,  Rs = 2·Rsw
//                         Cfly·dvc/dt = −i,   Cout·dvo/dt = i − Iout.
//     with u = vc − vo and q = Cfly·vc + Cout·vo:  q' = −Iout (exact), u' = −(u + Vadd)/(Rs·Cs) + Iout/Cout, Cs = Cfly‖Cout (series).
//     Doubler: Vadd = Vin, output +vo.  Inverter: Vadd = 0, output −vo (|Vout| node is the mirror of the positive-rail problem).
// Each phase is a closed-form exponential, so the whole period is an affine map x → M·x + c on x = [vc, vo]. The periodic
// steady state is the fixed point (I − M)⁻¹ c (no slow settling loop even for Cout/Cfly = 1000).
//
// Theory (Seeman, slow/fast switching limits):
//   Rout,SSL = 1/(f·Cfly)           (droop ΔV = Iout/(f·Cfly) with ideal switches)
//   Rout,FSL = 8·Rsw                (Cfly carries 2·Iout during each T/2 phase through two switches: 4·Iout²·Rs per phase pair)
//   Rout ≈ √(Rssl² + Rfsl²),  Vout = Videal − Iout·Rout,  η = |Vout|/|Videal|  (ideal pump: Iin = Iout·N)
export type CPIn = { mode: 'doubler' | 'inverter'; vin: number; f: number; cfly: number; cout: number; iout: number; rsw: number };

type St = [number, number];
function phase1(p: CPIn, x: St, t: number): { x: St; q: number } {
  const Rs = 2 * Math.max(p.rsw, 1e-6), k = Math.exp(-t / (Rs * p.cfly));
  const vc = p.vin + (x[0] - p.vin) * k;
  return { x: [vc, x[1] - (p.iout * t) / p.cout], q: p.cfly * (vc - x[0]) }; // q = charge drawn from Vin into Cfly
}
function phase2(p: CPIn, x: St, t: number): { x: St; q: number } {
  const Rs = 2 * Math.max(p.rsw, 1e-6), Cs = (p.cfly * p.cout) / (p.cfly + p.cout);
  const vadd = p.mode === 'doubler' ? p.vin : 0, tau = Rs * Cs;
  const u0 = x[0] - x[1], uinf = -vadd + (p.iout * tau) / p.cout;
  const u = uinf + (u0 - uinf) * Math.exp(-t / tau);
  const q = p.cfly * x[0] + p.cout * x[1] - p.iout * t;
  const vo = (q - p.cfly * u) / (p.cfly + p.cout);
  const vc = vo + u;
  return { x: [vc, vo], q: p.cfly * (x[0] - vc) }; // q = charge leaving Cfly through the series path (also through Vin for the doubler)
}
function period(p: CPIn, x: St) {
  const T2 = 0.5 / p.f, a = phase1(p, x, T2), b = phase2(p, a.x, T2);
  return { x: b.x, qIn1: a.q, qIn2: p.mode === 'doubler' ? b.q : 0 };
}
/** Periodic steady state at the start of phase 1. */
export function steadyState(p: CPIn): St {
  const f0 = period(p, [0, 0]).x, fx = period(p, [1, 0]).x, fy = period(p, [0, 1]).x;
  const m00 = fx[0] - f0[0], m10 = fx[1] - f0[1], m01 = fy[0] - f0[0], m11 = fy[1] - f0[1];
  const a = 1 - m00, b = -m01, c = -m10, d = 1 - m11, det = a * d - b * c;
  if (Math.abs(det) < 1e-18) return [0, 0];
  return [(d * f0[0] - b * f0[1]) / det, (-c * f0[0] + a * f0[1]) / det];
}
export function nSteps(p: CPIn) { return p.mode === 'doubler' ? 2 : 1; }

export function pump(p: CPIn) {
  const x0 = steadyState(p), T = 1 / p.f, T2 = T / 2;
  // sampled steady-state cycle (2 periods for the plot)
  const n = 160, t: number[] = [], vo: number[] = [], vc: number[] = [], vcPh: number[] = [];
  let x = x0, vMin = Infinity, vMax = -Infinity, sumVo = 0;
  for (let k = 0; k < 2; k++) {
    for (let ph = 0; ph < 2; ph++) {
      for (let i = 0; i <= n; i++) {
        const tt = (T2 * i) / n, r = ph === 0 ? phase1(p, x, tt) : phase2(p, x, tt);
        t.push(k * T + ph * T2 + tt); vo.push(r.x[1]); vc.push(r.x[0]);
        if (k === 0) { vMin = Math.min(vMin, r.x[1]); vMax = Math.max(vMax, r.x[1]); sumVo += r.x[1]; }
      }
      x = (ph === 0 ? phase1(p, x, T2) : phase2(p, x, T2)).x;
    }
  }
  const per = period(p, x0);
  const iin = (per.qIn1 + per.qIn2) * p.f;
  const voAvg = sumVo / (2 * (n + 1));
  const sgn = p.mode === 'doubler' ? 1 : -1;
  const vIdeal = nSteps(p) * p.vin;
  const rssl = 1 / (p.f * p.cfly), rfsl = 8 * p.rsw, rout = Math.hypot(rssl, rfsl);
  const pout = voAvg * p.iout, pin = p.vin * iin;
  return {
    x0, t, vo: vo.map(v => sgn * v), vc, vIdeal: sgn * vIdeal, vout: sgn * voAvg, voutAvgIdeal: sgn * (vIdeal - p.iout * rout),
    vMin: sgn * vMin, vMax: sgn * vMax, ripple: vMax - vMin, droop: p.iout / (p.f * p.cfly), rssl, rfsl, rout,
    iin, pin, pout, eff: pin > 0 && voAvg > 0 ? Math.min(1, pout / pin) : 0, ploss: pin - pout,
    sag: vIdeal - voAvg, tau1: 2 * p.rsw * p.cfly, settled: 2 * p.rsw * p.cfly < T2 / 3,
    ok: voAvg > 0,
  };
}

/** Start-up: |Vout| at the end of each cycle from an empty circuit (n cycles). */
export function startup(p: CPIn, cycles: number) {
  let x: St = [0, 0]; const t: number[] = [0], vo: number[] = [0], sgn = p.mode === 'doubler' ? 1 : -1;
  // no load current while the output is still empty (cannot sink below 0 V)
  for (let k = 1; k <= cycles; k++) {
    const q = { ...p, iout: x[1] > 0 ? p.iout : 0 };
    x = period(q, x).x; x[1] = Math.max(0, x[1]);
    t.push(k / p.f); vo.push(sgn * x[1]);
  }
  return { t, vo };
}
