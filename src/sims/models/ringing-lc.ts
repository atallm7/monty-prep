// Series R-L-C ringing: a ramped edge Vs drives series R and L (parasitic loop) into a capacitor C; vC is the node that rings.
//   L C vC'' + R C vC' + vC = Vs(t)
//   w0 = 1/sqrt(LC),  f0 = 1/(2 pi sqrt(LC)),  zeta = (R/2) sqrt(C/L),  Q = 1/(2 zeta) = sqrt(L/C)/R,  Rcrit = 2 sqrt(L/C)
//   Step overshoot (zeta<1): exp(-pi zeta / sqrt(1-zeta^2));  damped ring wd = w0 sqrt(1-zeta^2);  envelope exp(-zeta w0 t).
//   Undamped response to a linear ramp of duration Tr: ringing amplitude = sin(w0 Tr/2)/(w0 Tr/2) of the step (Tr = n*T0 -> nulled).
// Solved numerically with RK4 on the actual finite-rise edge.
export type RingIn = { l: number; c: number; r: number; tr: number; v?: number };
export type RingContext = 'probe' | 'trace' | 'gate';
export const CONTEXTS: Record<RingContext, { name: string; l: number; c: number; r: number; tr: number; v: number; lLabel: string; cLabel: string; rLabel: string; fix: string }> = {
  probe: { name: 'Scope probe ground lead', l: 20e-9, c: 10e-12, r: 10, tr: 1e-9, v: 1, lLabel: 'ground lead', cLabel: 'probe tip C', rLabel: 'source R', fix: 'a spring ground clip shortens the lead to ~3 nH' },
  trace: { name: 'Trace stub / via', l: 5e-9, c: 5e-12, r: 5, tr: 500e-12, v: 3.3, lLabel: 'stub / via L', cLabel: 'input pin C', rLabel: 'driver R', fix: 'a series source resistor near the driver damps the ring' },
  gate: { name: 'MOSFET gate loop', l: 10e-9, c: 2e-9, r: 1, tr: 5e-9, v: 12, lLabel: 'loop L', cLabel: 'Ciss', rLabel: 'gate R', fix: 'raise the gate resistor above 2*sqrt(L/Ciss) to critically damp' },
};

export const f0 = (l: number, c: number) => 1 / (2 * Math.PI * Math.sqrt(l * c));
export const zeta = (l: number, c: number, r: number) => (r / 2) * Math.sqrt(c / l);
export const rCrit = (l: number, c: number) => 2 * Math.sqrt(l / c);
export const stepOvershoot = (z: number) => (z >= 1 ? 0 : z <= 0 ? 1 : Math.exp(-Math.PI * z / Math.sqrt(1 - z * z)));

function run(p: RingIn, store: boolean, dtDiv: number, spanT0: number) {
  const { l, c, r } = p, V = p.v ?? 1;
  const w0 = 1 / Math.sqrt(l * c), T0 = 2 * Math.PI / w0, z = zeta(l, c, r);
  const tfull = Math.max(p.tr / 0.8, 1e-4 * T0);
  const alpha = z < 1 ? Math.max(z, 1e-3) * w0 : w0 * (z - Math.sqrt(z * z - 1));
  const tEnd = tfull + Math.min(spanT0 * T0, Math.max(6 * T0, 6 / alpha));
  const dt = Math.min(T0 / dtDiv, tfull / 60);
  const steps = Math.ceil(tEnd / dt), h = tEnd / steps;
  const vs = (t: number) => V * Math.min(1, Math.max(0, t / tfull));
  const f = (t: number, vc: number, i: number): [number, number] => [i / c, (vs(t) - r * i - vc) / l];
  let vc = 0, i = 0, t = 0, peak = 0, tpk = 0; const every = Math.max(1, Math.floor(steps / 900));
  const T: number[] = [], VC: number[] = [], VS: number[] = [], I: number[] = [];
  let lastOut = 0;
  for (let k = 0; k <= steps; k++) {
    if (store && k % every === 0) { T.push(t); VC.push(vc); VS.push(vs(t)); I.push(i); }
    if (vc > peak) { peak = vc; tpk = t; }
    if (Math.abs(vc - V) > 0.02 * V) lastOut = t;
    const a = f(t, vc, i), b = f(t + h / 2, vc + h / 2 * a[0], i + h / 2 * a[1]), cc = f(t + h / 2, vc + h / 2 * b[0], i + h / 2 * b[1]), d = f(t + h, vc + h * cc[0], i + h * cc[1]);
    vc += h / 6 * (a[0] + 2 * b[0] + 2 * cc[0] + d[0]); i += h / 6 * (a[1] + 2 * b[1] + 2 * cc[1] + d[1]); t += h;
  }
  return { T, VC, VS, I, overshoot: Math.max(0, peak / V - 1), peak, tpk, settle: lastOut, V, tEnd, tfull };
}

export function analyze(p: RingIn) {
  const z = zeta(p.l, p.c, p.r), F0 = f0(p.l, p.c), T0 = 1 / F0;
  const sim = run(p, true, 200, 40);
  return {
    f0: F0, T0, zeta: z, q: z > 0 ? 1 / (2 * z) : Infinity, rcrit: rCrit(p.l, p.c), z0: Math.sqrt(p.l / p.c),
    fd: z < 1 ? F0 * Math.sqrt(1 - z * z) : 0, stepOS: stepOvershoot(z), overshoot: sim.overshoot, peak: sim.peak, tpk: sim.tpk, settle: sim.settle,
    t: sim.T, vc: sim.VC, vs: sim.VS, i: sim.I, V: sim.V, trRatio: p.tr / T0,
    regime: z < 0.999 ? 'underdamped' : z <= 1.001 ? 'critically damped' : 'overdamped',
  };
}
/** Overshoot (fraction of V) for the actual edge; lightweight, for sweeps. */
export function overshootOf(p: RingIn) { return run(p, false, 60, 12).overshoot; }
