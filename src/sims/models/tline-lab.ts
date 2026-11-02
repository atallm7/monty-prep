// Lossless transmission-line transient model (method of characteristics / Bergeron).
// Forward wave a(t) leaves the source, backward wave b(t) leaves the load; each takes td to cross the line.
//   Source end (x=0):  V0 = a + b_in,  I0 = (a − b_in)/Z0,  Vs − Rse·I0 = V0
//       ⇒ a = Vs·Z0/(Rse+Z0) + Γs·b_in,  Γs = (Rse − Z0)/(Rse + Z0)
//   Load end (x=ℓ):    VL + Z0·IL = 2·a_in  — the line looks like a Thevenin source 2·a_in behind Z0
//       (Bergeron; Hall & Heck "Advanced Signal Integrity" ch. 9; Johnson & Graham "High-Speed Digital Design" ch. 4).
// The load network (RL ‖ CL ‖ termination) is solved each step; capacitors use the trapezoidal companion model.
// Resistive loads give the textbook reflection coefficient ΓL = (RL − Z0)/(RL + Z0).

export type LoadKind = 'R' | 'open' | 'short' | 'C';
export type Term = 'none' | 'series' | 'parallel' | 'thevenin' | 'ac';
export type TlIn = { vs: number; rs: number; z0: number; td: number; tr: number; load: LoadKind; rl: number; cl: number; term: Term; cac: number; tEnd?: number };

export const gamma = (r: number, z0: number) => (!isFinite(r) ? 1 : (r - z0) / (r + z0));
const par = (a: number, b: number) => (!isFinite(a) ? b : !isFinite(b) ? a : (a * b) / (a + b));

/** Effective element values after applying the termination scheme. */
export function network(p: TlIn) {
  const rser = p.term === 'series' ? Math.max(0, p.z0 - p.rs) : 0;
  const rse = p.rs + rser;
  const rlR = p.load === 'open' || p.load === 'C' ? Infinity : p.load === 'short' ? 0 : Math.max(0, p.rl);
  const rt = p.term === 'parallel' || p.term === 'thevenin' ? p.z0 : Infinity; // Thevenin: 2Z0 to Vs and 2Z0 to gnd ≡ Z0 to Vs/2
  const vtt = p.term === 'thevenin' ? p.vs / 2 : 0;
  const rac = p.term === 'ac' ? p.z0 : Infinity;
  // High-frequency (edge) load seen by the line: caps are shorts at the edge
  const rHF = p.load === 'C' ? 0 : par(rlR, p.term === 'ac' ? p.z0 : rt);
  // DC load (caps open)
  const rDC = par(rlR, rt);
  return { rser, rse, rlR, rt, vtt, rac, rHF, rDC, gs: gamma(rse, p.z0), gl: gamma(rHF, p.z0), glDC: gamma(rDC, p.z0) };
}

/** Steady state (DC) node voltage, line is just a wire at DC. */
export function dcVoltage(p: TlIn, vsrc: number) {
  const n = network(p);
  const G = 1 / n.rse + (n.rlR === 0 ? 1e12 : 1 / n.rlR) + (isFinite(n.rt) ? 1 / n.rt : 0);
  const J = vsrc / n.rse + (isFinite(n.rt) ? n.vtt / n.rt : 0);
  return J / G;
}

export function simulate(p: TlIn) {
  const n = network(p);
  const Z0 = p.z0;
  const dt0 = Math.min(p.td / 200, Math.max(p.tr, 1e-15) / 12);
  const N = Math.max(20, Math.min(4000, Math.round(p.td / dt0)));
  const dt = p.td / N;
  const tauC = Math.max(p.load === 'C' ? par(Z0, n.rDC) * p.cl * 2 : 0, p.term === 'ac' ? (n.rac + par(n.rse, n.rlR)) * p.cac : 0);
  const tEnd = p.tEnd ?? Math.min(80 * p.td, Math.max(14 * p.td, p.tr * 4 + 6 * p.td, 6 * tauC + 2 * p.td));
  const steps = Math.min(400000, Math.ceil(tEnd / dt));
  // Initial DC state (source at 0 V); only Thevenin termination makes it non-zero
  const v0 = dcVoltage(p, 0); const i0 = (0 - v0) / n.rse;
  const aInit = (v0 + Z0 * i0) / 2, bInit = (v0 - Z0 * i0) / 2;
  const a = new Float64Array(steps + 1), b = new Float64Array(steps + 1);
  const GL = n.rlR === 0 ? 1e12 : isFinite(n.rlR) ? 1 / n.rlR : 0;
  const Gt = isFinite(n.rt) ? 1 / n.rt : 0;
  const Gc = p.load === 'C' ? 2 * p.cl / dt : 0;
  const Gac = p.term === 'ac' ? 2 * p.cac / dt : 0;
  let vLp = v0, iCp = 0, vcp = v0, icp = 0;
  const vsrc = (t: number) => (t <= 0 ? 0 : t >= p.tr ? p.vs : p.vs * t / Math.max(p.tr, 1e-18));
  const stride = Math.max(1, Math.floor(steps / 1500));
  const T: number[] = [], VS: number[] = [], VL: number[] = [], VIN: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const bin = i - N >= 0 ? b[i - N] : bInit;
    const ain = i - N >= 0 ? a[i - N] : aInit;
    a[i] = vsrc(t) * Z0 / (n.rse + Z0) + n.gs * bin;
    // Load: (2ain − VL)/Z0 = GL·VL + iC + Gt(VL − Vtt) + iAC
    let gac = 0, jac = 0, D = 0;
    if (p.term === 'ac') { D = 1 / n.rac + Gac; gac = (1 - 1 / (n.rac * D)) / n.rac; jac = (Gac * vcp + icp) / (n.rac * D); }
    const G = 1 / Z0 + GL + Gc + Gt + gac;
    const J = 2 * ain / Z0 + (Gc * vLp + iCp) + Gt * n.vtt + jac;
    const vL = J / G;
    b[i] = vL - ain;
    if (Gc) { iCp = Gc * (vL - vLp) - iCp; }
    if (p.term === 'ac') { const vc = (vL / n.rac + Gac * vcp + icp) / D; icp = Gac * (vc - vcp) - icp; vcp = vc; }
    vLp = vL;
    if (i % stride === 0 || i === steps) { T.push(t); VS.push(a[i] + bin); VL.push(vL); VIN.push(vsrc(t)); }
  }
  const vFinal = dcVoltage(p, p.vs); // caps are open at DC (AC termination draws no DC current)
  let peak = -Infinity, low = Infinity; for (const v of VL) { peak = Math.max(peak, v); low = Math.min(low, v); }
  const band = 0.05 * Math.max(Math.abs(vFinal), 0.05 * p.vs);
  let settle = 0; for (let i = 0; i < T.length; i++) if (Math.abs(VL[i] - vFinal) > band) settle = T[i];
  return { t: T, vSrc: VS, vLoad: VL, vIn: VIN, net: n, vFinal, v0, peak, low, settle, dt, tEnd: steps * dt, launched: p.vs * Z0 / (n.rse + Z0) };
}

/** Bounce (lattice) diagram for the edge, using the high-frequency reflection coefficients. */
export function lattice(p: TlIn, maxBounces = 8) {
  const n = network(p);
  const v1 = p.vs * p.z0 / (n.rse + p.z0);
  const segs: { from: 'S' | 'L'; t0: number; t1: number; amp: number; vAfter: number }[] = [];
  let w = v1, vS = v1, vL = 0, t = 0;
  for (let k = 0; k < maxBounces * 2; k++) {
    if (Math.abs(w) < 0.005 * Math.abs(p.vs) && k > 0) break;
    if (k % 2 === 0) { // forward wave reaches the load
      const r = w * n.gl; vL += w + r; segs.push({ from: 'S', t0: t, t1: t + p.td, amp: w, vAfter: vL }); w = r;
    } else { const r = w * n.gs; vS += w + r; segs.push({ from: 'L', t0: t, t1: t + p.td, amp: w, vAfter: vS }); w = r; }
    t += p.td;
  }
  return { v1, segs, gs: n.gs, gl: n.gl };
}
