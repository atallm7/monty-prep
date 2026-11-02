// Two-phase bipolar hybrid stepper (1.8°/full step → 200 steps/rev → Nr = 50 rotor teeth = 50 electrical cycles per revolution).
//
// Phase currents (normalised to the rated current I = 1) for an electrical field angle φ:
//   microstep  : Ia = cos φ, Ib = sin φ   (|I| = 1 always, constant torque Tm)
//   full step  : two-phase-on, Ia, Ib ∈ {±1}, φ = 45°, 135°, 225°, 315°       (|I| = √2 → torque √2·Tm)
//   half step  : alternates one-phase (|I| = 1) and two-phase (|I| = √2) states every 45°
// One full step = 90 electrical degrees. Torque on the rotor (electrical rotor angle θ = Nr·θm):
//   T = Tm·(−Ia·sin θ + Ib·cos θ) = Tm·|I|·sin(φ − θ)       (restoring; holding torque Th = Tm·|I|max)
// Datasheet "holding torque" Th is quoted with two phases on at rated current, so Tm = Th/√2.
// A static load Tload displaces the rotor by δ = asin(Tload/(Tm|I|)) electrical; pull-in fails beyond 90°.
// Dynamics: J·θm'' = T(θm) − c·θm' − Tload, integrated with RK4 (semi-implicit not needed at these time steps).
export type Mode = 'full' | 'half' | 'micro';
export const NR = 50, STEP_DEG = 1.8, DEFAULT_TH = 0.4, DEFAULT_J = 57e-7;
export const modeStepsPerFull = (mode: Mode, micro: number) => mode === 'full' ? 1 : mode === 'half' ? 2 : Math.max(1, Math.round(micro));

/** Position k (0 … 4·spf − 1) within one electrical cycle. */
export function position(mode: Mode, micro: number, k: number) {
  const spf = modeStepsPerFull(mode, micro), n = 4 * spf, kk = ((k % n) + n) % n;
  if (mode === 'full') {
    const ia = [1, -1, -1, 1][kk], ib = [1, 1, -1, -1][kk];
    return { ia, ib, phi: ((45 + 90 * kk) * Math.PI) / 180, mag: Math.SQRT2, idx: kk };
  }
  if (mode === 'half') {
    const ia = [1, 1, 0, -1, -1, -1, 0, 1][kk], ib = [0, 1, 1, 1, 0, -1, -1, -1][kk];
    return { ia, ib, phi: (45 * kk * Math.PI) / 180, mag: Math.hypot(ia, ib), idx: kk };
  }
  const phi = ((2 * Math.PI) * kk) / n;
  return { ia: Math.cos(phi), ib: Math.sin(phi), phi, mag: 1, idx: kk };
}
export function sequence(mode: Mode, micro: number) {
  const spf = modeStepsPerFull(mode, micro), n = 4 * spf;
  return Array.from({ length: n }, (_, k) => position(mode, micro, k));
}
/** Peak (holding) torque at each position, relative to datasheet Th (two phases on). */
export function holdingTorque(mode: Mode, micro: number, th = DEFAULT_TH) {
  const tm = th / Math.SQRT2;
  return sequence(mode, micro).map(p => tm * p.mag);
}
/** Torque vs rotor displacement (in full steps) from the commanded position. Positive displacement = rotor ahead of the field. */
export function torqueVsDisplacement(mode: Mode, micro: number, k: number, th = DEFAULT_TH, n = 201, spanSteps = 2) {
  const p = position(mode, micro, k), tm = th / Math.SQRT2;
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < n; i++) { const d = -spanSteps + (2 * spanSteps * i) / (n - 1); x.push(d); y.push(-tm * p.mag * Math.sin((d * Math.PI) / 2)); }
  return { x, y, peak: tm * p.mag };
}
/** Static deflection of the rotor from the commanded angle under load (electrical rad, mechanical deg, fraction of a full step). */
export function staticDeflection(mode: Mode, micro: number, k: number, tload: number, th = DEFAULT_TH) {
  const pk = (th / Math.SQRT2) * position(mode, micro, k).mag, r = tload / pk;
  if (r >= 1) return { stalled: true, elec: Math.PI / 2, mechDeg: 90 / NR, fullSteps: 1, peak: pk, ratio: r };
  const elec = Math.asin(Math.max(0, r));
  return { stalled: false, elec, mechDeg: ((elec * 180) / Math.PI) / NR, fullSteps: elec / (Math.PI / 2), peak: pk, ratio: r };
}
/** Microstep position error from the fundamental-only current: the torque-balance position error caused by a given load. */
export function microstepIncrement(mode: Mode, micro: number) { return STEP_DEG / modeStepsPerFull(mode, micro); }

/** Dynamic response to `steps` commanded positions (each full step = 90 electrical degrees; commands arrive at rate·spf per second).
 *  `tload` is a friction-type load torque that opposes motion (stiction holds the rotor while |restoring torque| < tload). */
export function dynamics(o: { mode: Mode; micro: number; rate: number; tload: number; th?: number; j?: number; damping?: number; steps: number }) {
  const th = o.th ?? DEFAULT_TH, tm = th / Math.SQRT2, J = o.j ?? DEFAULT_J, c = o.damping ?? 4e-4;
  const spf = modeStepsPerFull(o.mode, o.micro), cmdRate = Math.max(1, o.rate) * spf;
  const tEnd = o.steps / cmdRate + 0.03;
  const dt = Math.max(Math.min(2e-5, 1 / (cmdRate * 400)), tEnd / 120000);
  const seq = sequence(o.mode, o.micro), N = seq.length;
  const phiAt = (cmd: number) => seq[((cmd % N) + N) % N].phi + Math.floor(cmd / N) * 2 * Math.PI;   // unwrapped field angle
  const magAt = (cmd: number) => seq[((cmd % N) + N) % N].mag;
  const cmdAt = (tt: number) => Math.min(o.steps, Math.floor(tt * cmdRate + 1e-9) + 1);
  const torqueAt = (x: number, tt: number) => { const cc = cmdAt(tt); return tm * magAt(cc) * Math.sin(phiAt(cc) - NR * x); };
  const acc = (x: number, v: number, tt: number) => (torqueAt(x, tt) - c * v - (v > 0 ? o.tload : v < 0 ? -o.tload : 0)) / J;
  // initial state: settled on position 0 (field angle of command 0)
  let x = phiAt(0) / NR, w = 0;
  const n = Math.ceil(tEnd / dt), every = Math.max(1, Math.floor(n / 1500));
  const T: number[] = [], ANG: number[] = [], CMD: number[] = [], TQ: number[] = [], W: number[] = [];
  const unit = 360 / (NR * 4 * spf);   // mechanical degrees per command (1.8°/spf)
  for (let k = 0; k <= n; k++) {
    const t = k * dt;
    if (k % every === 0) { T.push(t); ANG.push(((x - phiAt(0) / NR) * 180) / Math.PI); CMD.push(cmdAt(t) * unit); TQ.push(torqueAt(x, t)); W.push(w); }
    const k1x = w, k1v = acc(x, w, t);
    const k2x = w + 0.5 * dt * k1v, k2v = acc(x + 0.5 * dt * k1x, w + 0.5 * dt * k1v, t + 0.5 * dt);
    const k3x = w + 0.5 * dt * k2v, k3v = acc(x + 0.5 * dt * k2x, w + 0.5 * dt * k2v, t + 0.5 * dt);
    const k4x = w + dt * k3v, k4v = acc(x + dt * k3x, w + dt * k3v, t + dt);
    const xn = x + (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x), wn = w + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    if (o.tload > 0 && (w === 0 || w * wn <= 0) && Math.abs(torqueAt(x, t)) <= o.tload) { w = 0; }   // stiction
    else { x = xn; w = wn; }
  }
  const cmdDeg = (o.steps * 360) / (NR * 4 * spf), actDeg = ((x - phiAt(0) / NR) * 180) / Math.PI;
  const errElecDeg = (cmdDeg - actDeg) * NR;
  return { t: T, angleMech: ANG, cmdMech: CMD, torque: TQ, speed: W, cmdDeg, actDeg, errElecDeg, lostFullSteps: errElecDeg / 90 / 1, tEnd };
}
/** Natural frequency of the rotor on the magnetic spring at a full-step equilibrium (the classic stepper resonance). */
export function resonanceHz(th = DEFAULT_TH, j = DEFAULT_J) {
  return Math.sqrt((th * NR) / j) / (2 * Math.PI);   // k = dT/dθm = Nr·Th at the equilibrium (Th = Tm·√2)
}
