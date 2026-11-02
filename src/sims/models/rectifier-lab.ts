// Rectifier + capacitor-input filter model (half-wave, center-tap full-wave, bridge full-wave).
//
// Circuit: v_s(t) = Vpk·sin(2πft) behind a source/winding resistance Rs, a diode network, then the
// reservoir capacitor C in parallel with the load RL.
//   half-wave : the diode conducts when v_s − Vf > v_out                      (one drop, one pulse per cycle)
//   center-tap: |v_s| (each half-winding = Vpk) through one diode               (one drop, two pulses per cycle)
//   bridge    : |v_s| through two diodes in series                              (two drops, two pulses per cycle)
// Diodes are modelled as an ideal switch + constant forward drop Vf (piecewise-linear model).
//
// The ODE  C·dv/dt = g(t)·(|v_s|_eff − nVf − v) − v/RL,   g = 1/Rs while the diode conducts, else 0,
// is stiff when Rs·C ≪ T, so it is integrated with backward Euler (implicit, unconditionally stable).
// Within each step the diode state is resolved exactly: assume conducting, solve, and if that gives
// negative diode current the diode is off (the PWL problem is monotone, so this is consistent).
//
// Textbook checks (large C, ripple ≪ Vpk):
//   ripple Vpp ≈ I_load / (f·C)      half-wave       (capacitor supplies the load for ~one full period)
//   ripple Vpp ≈ I_load / (2f·C)     full-wave       (refilled twice per period)
//   V_dc ≈ Vpk − nVf − Vpp/2
//   No capacitor: V_avg = (Vpk−nVf)/π · (shape)  half, 2(Vpk−nVf)/π-ish full (exactly Vpk/π, 2Vpk/π for Vf=0, Rs→0)
//   PIV: half-wave with cap ≈ 2Vpk, center-tap ≈ 2Vpk, bridge ≈ Vpk.
export type RectType = 'half' | 'center' | 'bridge';
export type RectIn = { type: RectType; vpk: number; f: number; c: number; rl: number; vf: number; rs: number };

export type RectOut = {
  t: number[]; vs: number[]; vrect: number[]; vout: number[]; id: number[];   // last `showCycles` cycles, t from 0
  startT: number[]; startV: number[]; startI: number[];                         // first cycles from power-on (C = 0 V)
  vdc: number; vmax: number; vmin: number; ripple: number; rippleEst: number;
  iload: number; idPeak: number; idAvg: number; idRms: number; inrushPeak: number;
  conductFrac: number; conductDeg: number; intervals: { from: number; to: number }[];
  piv: number; pDiode: number; pLoad: number; nDrops: number; pulses: number; cyclesRun: number;
};

export const nDrops = (t: RectType) => (t === 'bridge' ? 2 : 1);
export const pulsesPerCycle = (t: RectType) => (t === 'half' ? 1 : 2);

/** Source voltage presented to the diode/capacitor node (before drops), and its sign-selected magnitude. */
function drive(type: RectType, vs: number) { return type === 'half' ? vs : Math.abs(vs); }

export function rectifier(p: RectIn, opts: { stepsPerCycle?: number; showCycles?: number; maxCycles?: number } = {}): RectOut {
  const N = opts.stepsPerCycle ?? 1500, show = opts.showCycles ?? 3, maxCycles = opts.maxCycles ?? 250;
  const vpk = Math.max(0, p.vpk), f = Math.max(1e-3, p.f), C = Math.max(1e-12, p.c), RL = Math.max(1e-3, p.rl);
  const Rs = Math.max(1e-4, p.rs), vf = Math.max(0, p.vf), nd = nDrops(p.type);
  const T = 1 / f, dt = T / N, w = 2 * Math.PI * f;
  const a = dt / C;
  // One implicit step. Returns [v_next, i_diode]
  const step = (v: number, tn: number): [number, number] => {
    const src = drive(p.type, vpk * Math.sin(w * tn)) - nd * vf;
    // conducting: v' = (v + a·src/Rs) / (1 + a/Rs + a/RL)
    const vOn = (v + a * src / Rs) / (1 + a / Rs + a / RL);
    const iOn = (src - vOn) / Rs;
    if (iOn > 0) return [vOn, iOn];
    return [v / (1 + a / RL), 0];
  };

  // Startup record (from 0 V): first few cycles, for inrush.
  const startCycles = Math.min(4, maxCycles);
  const startT: number[] = [], startV: number[] = [], startI: number[] = [];
  let v = 0, inrushPeak = 0, k = 0;
  const dec = Math.max(1, Math.round(N / 400));
  for (let c = 0; c < startCycles; c++) {
    for (let j = 0; j < N; j++) {
      k++; const tn = k * dt; const [vn, id] = step(v, tn); v = vn; inrushPeak = Math.max(inrushPeak, id);
      if (k % dec === 0) { startT.push(tn); startV.push(v); startI.push(id); }
    }
  }
  // Run to periodic steady state: compare v at the same phase over successive cycles.
  let cyclesRun = startCycles, prev = v;
  while (cyclesRun < maxCycles) {
    for (let j = 0; j < N; j++) { k++; v = step(v, k * dt)[0]; }
    cyclesRun++;
    if (Math.abs(v - prev) < 1e-7 * Math.max(1, vpk)) break;
    prev = v;
  }
  // Record `show` cycles of steady state.
  const t: number[] = [], vsA: number[] = [], vrA: number[] = [], vo: number[] = [], idA: number[] = [];
  let sumV = 0, vmax = -Infinity, vmin = Infinity, idPeak = 0, sumI = 0, sumI2 = 0, onCount = 0, sumP = 0;
  const intervals: { from: number; to: number }[] = [];
  let onStart = -1;
  const total = show * N;
  for (let j = 1; j <= total; j++) {
    k++; const tn = k * dt; const [vn, id] = step(v, tn); v = vn;
    const tl = j * dt;
    sumV += v; vmax = Math.max(vmax, v); vmin = Math.min(vmin, v);
    idPeak = Math.max(idPeak, id); sumI += id; sumI2 += id * id; if (id > 0) onCount++;
    sumP += v * v / RL;
    if (id > 0 && onStart < 0) onStart = tl;
    if (id <= 0 && onStart >= 0) { intervals.push({ from: onStart, to: tl }); onStart = -1; }
    if (j % dec === 0 || j === total) {
      const vsn = vpk * Math.sin(w * tn);
      t.push(tl); vsA.push(vsn); vrA.push(Math.max(0, drive(p.type, vsn) - nd * vf)); vo.push(v); idA.push(id);
    }
  }
  if (onStart >= 0) intervals.push({ from: onStart, to: total * dt });
  const vdc = sumV / total;
  const iload = vdc / RL;
  const pulses = pulsesPerCycle(p.type);
  // Each conducting device carries current only on its own half-cycles.
  //  half: 1 diode carries every pulse. center: each of 2 diodes carries every other pulse. bridge: each of 4 carries every other pulse (2 at a time).
  const devShare = p.type === 'half' ? 1 : 0.5;
  const idAvgTotal = sumI / total;                         // average of conducting-path current (= I_load in steady state)
  const idRmsTotal = Math.sqrt(sumI2 / total);
  const pDiode = vf * idAvgTotal * nd;                     // total diode conduction loss (Vf·Iavg per conducting drop)
  return {
    t, vs: vsA, vrect: vrA, vout: vo, id: idA, startT, startV, startI,
    vdc, vmax, vmin, ripple: vmax - vmin,
    rippleEst: iload / (pulses * f * C),
    iload, idPeak, idAvg: idAvgTotal * devShare, idRms: idRmsTotal * Math.sqrt(devShare), inrushPeak,
    conductFrac: onCount / total, conductDeg: (onCount / total) * 360 / pulses, intervals,
    piv: p.type === 'bridge' ? vmax + vf : vmax + vpk,   // reverse voltage on the idle diode(s)
    pDiode, pLoad: sumP / total, nDrops: nd, pulses, cyclesRun,
  };
}
