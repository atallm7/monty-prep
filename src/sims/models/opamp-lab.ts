// Op-amp configurations lab: time-domain model of the op-amp + its feedback network.
//
// Op-amp macro-model (single-pole, Gray & Meyer / Franco "Design with Op Amps" ch. 6):
//   dx/dt = ωp·(A0·(v+ − v−) − x),  ωp = 2π·GBW/A0   (internal dominant-pole node)
//   |dx/dt| ≤ SR                                     (slew limit: finite tail current into Cc)
//   vo = clamp(x, V− + hr, V+ − hr)                   (output swing limited by the rails)
// The feedback network adds algebraic (resistive) or dynamic (capacitive) relations between
// vo, the inputs and v−. Everything is written as a 2-state linear ODE  s' = M·s + g(inputs)
// with s = [x, vc] and integrated with backward Euler (L-stable, so the very stiff loop with
// A0 → ∞ is handled without tiny steps). After each linear step the nonlinearities (slew, rails)
// are applied to x and the capacitor state is re-solved with x fixed.
//
// Ideal closed-loop results (Sedra & Smith ch. 2):
//   inverting      vo = −(R2/R1)·vin                  noise gain 1/β = 1 + R2/R1
//   non-inverting  vo = (1 + R2/R1)·vin
//   buffer         vo = vin
//   difference     vo = (R2/R1)·(v2 − v1)             (matched R1/R2 pairs)
//   summing        vo = −(R2/R1)·(v1 + v2)
//   integrator     vo = −1/(R1·C)·∫vin dt              (R2 ∥ C bleeds DC: |H(0)| = R2/R1)
//   differentiator vo = −R2·C·dvin/dt                 (R1 in series with C limits HF gain)
//   comparator     vo = ±Vsat by sign(vin − vref)
//   Schmitt (inv.) thresholds ±Vsat·R1/(R1+R2)
// Finite gain: G = Gideal / (1 + 1/(A0·β)); closed-loop bandwidth ≈ GBW·β.

export type Config = 'inverting' | 'noninverting' | 'buffer' | 'difference' | 'summing' | 'integrator' | 'differentiator' | 'comparator' | 'schmitt';
export type Wave = 'dc' | 'sine' | 'square' | 'triangle';

export type OpampIn = {
  config: Config; r1: number; r2: number; c: number;
  vin: number; wave: Wave; f: number; vpos: number; vneg: number;
  real: boolean; a0: number; gbw: number; sr: number; headroom: number;
  v2: number;   // second input (DC): V1 of the difference amp / 2nd summing input / comparator Vref
};

export const CONFIGS: Config[] = ['inverting', 'noninverting', 'buffer', 'difference', 'summing', 'integrator', 'differentiator', 'comparator', 'schmitt'];

export function waveAt(wave: Wave, A: number, f: number, t: number): number {
  if (wave === 'dc') return A;
  const ph = ((t * f) % 1 + 1) % 1;
  if (wave === 'sine') return A * Math.sin(2 * Math.PI * ph);
  if (wave === 'square') return ph < 0.5 ? A : -A;
  // triangle: 0 at t=0 rising, peak +A at 1/4, −A at 3/4
  return A * (ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4);
}

/** Feedback factor β = fraction of vo fed back to the inverting input (resistive configs). */
export function beta(cfg: Config, r1: number, r2: number): number {
  switch (cfg) {
    case 'inverting': case 'noninverting': case 'difference': return r1 / (r1 + r2);
    case 'buffer': return 1;
    case 'summing': return (1 / r2) / (2 / r1 + 1 / r2);
    case 'schmitt': return r1 / (r1 + r2); // positive feedback fraction to v+
    default: return 1; // integrator/differentiator: frequency dependent; comparator: open loop
  }
}

/** Ideal small-signal gain (complex magnitude & phase for the dynamic configs, at frequency f). */
export function idealGain(p: Pick<OpampIn, 'config' | 'r1' | 'r2' | 'c' | 'f'>): { mag: number; phaseDeg: number; text: string } {
  const { config: cfg, r1, r2, c, f } = p; const w = 2 * Math.PI * f;
  switch (cfg) {
    case 'inverting': return { mag: r2 / r1, phaseDeg: 180, text: `-R2/R1` };
    case 'noninverting': return { mag: 1 + r2 / r1, phaseDeg: 0, text: `1+R2/R1` };
    case 'buffer': return { mag: 1, phaseDeg: 0, text: '1' };
    case 'difference': return { mag: r2 / r1, phaseDeg: 0, text: 'R2/R1' };
    case 'summing': return { mag: r2 / r1, phaseDeg: 180, text: '-R2/R1' };
    case 'integrator': {
      // H = −(R2/R1) / (1 + jωR2C)
      const m = (r2 / r1) / Math.hypot(1, w * r2 * c);
      return { mag: m, phaseDeg: 180 - Math.atan(w * r2 * c) * 180 / Math.PI, text: '-1/(jωR1C)' };
    }
    case 'differentiator': {
      // H = −jωR2C / (1 + jωR1C)
      const m = w * r2 * c / Math.hypot(1, w * r1 * c);
      return { mag: m, phaseDeg: -90 - Math.atan(w * r1 * c) * 180 / Math.PI + 360, text: '-jωR2C' };
    }
    default: return { mag: Infinity, phaseDeg: 0, text: '∞ (open loop)' };
  }
}

/** Closed-loop gain with finite open-loop gain A0 (resistive configs): G/(1 + 1/(A0β)). */
export function finiteGain(gIdeal: number, a0: number, b: number) { return gIdeal / (1 + 1 / (a0 * b)); }

type Sys = { M: [number, number, number, number]; g: (vin: number, v2: number) => [number, number]; vminus: (x: number, vc: number, vin: number, v2: number) => number; vplus: (x: number, vc: number, vin: number, v2: number) => number };

/** Build the linear 2-state system s' = M s + g for a config. s = [x (op-amp internal ≈ vo), vc (capacitor voltage)]. */
function system(cfg: Config, r1: number, r2: number, c: number, a0: number, wp: number): Sys {
  const K = wp * a0; // = 2π·GBW
  const vcDecay: [number, number] = [0, -1]; // unused capacitor state just decays
  switch (cfg) {
    case 'inverting': {
      // v− = (vin·R2 + vo·R1)/(R1+R2), v+ = 0
      const b = r1 / (r1 + r2), a = r2 / (r1 + r2);
      return { M: [-wp - K * b, 0, ...vcDecay], g: vin => [-K * a * vin, 0], vminus: (x, _c, vin) => a * vin + b * x, vplus: () => 0 };
    }
    case 'noninverting': {
      const b = r1 / (r1 + r2);
      return { M: [-wp - K * b, 0, ...vcDecay], g: vin => [K * vin, 0], vminus: x => b * x, vplus: (_x, _c, vin) => vin };
    }
    case 'buffer':
      return { M: [-wp - K, 0, ...vcDecay], g: vin => [K * vin, 0], vminus: x => x, vplus: (_x, _c, vin) => vin };
    case 'difference': {
      // V2 (the waveform) → R1 → v+ → R2 → gnd ; V1 (DC, "v2" field) → R1 → v− → R2 → vo
      const b = r1 / (r1 + r2), a = r2 / (r1 + r2);
      return { M: [-wp - K * b, 0, ...vcDecay], g: (vin, v1) => [K * (a * vin - a * v1), 0], vminus: (x, _c, _vin, v1) => a * v1 + b * x, vplus: (_x, _c, vin) => a * vin };
    }
    case 'summing': {
      // two inputs through R1 each into v−, R2 feedback: v− = (vin/R1 + v2/R1 + vo/R2)/(2/R1 + 1/R2)
      const D = 2 / r1 + 1 / r2, b = (1 / r2) / D, a = (1 / r1) / D;
      return { M: [-wp - K * b, 0, ...vcDecay], g: (vin, v2) => [-K * a * (vin + v2), 0], vminus: (x, _c, vin, v2) => a * (vin + v2) + b * x, vplus: () => 0 };
    }
    case 'integrator': {
      // C between v− and vo, R2 ∥ C, R1 from vin. vc = v− − vo  ⇒ v− = x + vc.
      // KCL at v−: (vin − v−)/R1 + (vo − v−)/R2 + C·d(vo − v−)/dt = 0  ⇒  C·vc' = (vin − x − vc)/R1 − vc/R2
      // op-amp: x' = wp(A0(0 − v−) − x) = −(wp + K)x − K·vc
      return {
        M: [-wp - K, -K, -1 / (r1 * c), -(1 / r1 + 1 / r2) / c],
        g: vin => [0, vin / (r1 * c)], vminus: (x, vc) => x + vc, vplus: () => 0,
      };
    }
    case 'differentiator': {
      // vin → R1 → C → v−, R2 from v− to vo. vc = voltage across C (input side minus v− side).
      // v− = (R2(vin − vc) + R1·vo)/(R1+R2);  C·vc' = (vin − vc − v−)/R1 = (vin − vc − vo)/(R1+R2)
      const S = r1 + r2;
      return {
        M: [-wp - K * r1 / S, K * r2 / S, -1 / (S * c), -1 / (S * c)],
        g: vin => [-K * r2 / S * vin, vin / (S * c)], vminus: (x, vc, vin) => (r2 * (vin - vc) + r1 * x) / S, vplus: () => 0,
      };
    }
    default: throw new Error('not linear: ' + cfg);
  }
}

export type OpampOut = {
  t: number[]; vin: number[]; vout: number[]; vminus: number[]; vplus: number[];
  clipped: boolean; slewLimited: boolean; vdPeak: number; voutPk: number; voutMin: number; voutMax: number;
  railHi: number; railLo: number; thresholds?: [number, number];
};

/** Simulate the circuit and return 2 displayed periods (after settling to periodic steady state). */
export function simulate(p: OpampIn, nPts = 1200): OpampOut {
  const ideal = !p.real;
  const a0 = ideal ? 1e8 : Math.max(1, p.a0);
  const gbw = ideal ? 1e13 : Math.max(1, p.gbw);
  const wp = 2 * Math.PI * gbw / a0;
  const sr = ideal ? Infinity : Math.max(1, p.sr);
  const hr = ideal ? 0 : Math.max(0, p.headroom);
  const railHi = Math.max(p.vpos - hr, p.vneg + hr + 1e-3), railLo = Math.min(p.vneg + hr, railHi - 1e-3);
  const f = Math.max(1e-3, p.f);
  const T = 1 / f; const tWin = 2 * T;
  const h = tWin / (nPts - 1);
  const settleCycles = p.wave === 'dc' ? 0 : ideal ? 1 : 24; // slew-limited waveforms converge to periodic steady state over several cycles
  const nSettle = settleCycles * Math.round(T / h);
  const out: OpampOut = { t: [], vin: [], vout: [], vminus: [], vplus: [], clipped: false, slewLimited: false, vdPeak: 0, voutPk: 0, voutMin: Infinity, voutMax: -Infinity, railHi, railLo };
  const clampR = (v: number) => Math.min(railHi, Math.max(railLo, v));

  // ---- comparator & Schmitt: open loop / positive feedback ----
  if (p.config === 'comparator' || p.config === 'schmitt') {
    const b = beta('schmitt', p.r1, p.r2);
    if (p.config === 'schmitt') out.thresholds = [b * railLo, b * railHi];
    let x = railHi; // start high (arbitrary but deterministic)
    // Start the Schmitt on the correct branch for the initial input
    const vin0 = waveAt(p.wave, p.vin, f, 0);
    if (p.config === 'comparator') x = clampR(a0 * (vin0 - p.v2)); else x = vin0 > b * railHi ? railLo : railHi;
    // sub-steps so explicit Euler of the op-amp pole is stable (h·wp ≪ 1) and the rail-to-rail transition is resolved
    const sub = 8;
    for (let n = -nSettle; n < nPts; n++) {
      const t = n * h; const vin = waveAt(p.wave, p.vin, f, t);
      let vp = 0, vm = 0;
      for (let k = 0; k < sub; k++) {
        const vo = clampR(x);
        if (p.config === 'comparator') { vp = vin; vm = p.v2; } else { vp = b * vo; vm = vin; }
        const target = a0 * (vp - vm);
        if (ideal) { x = clampR(target); continue; }
        // single-pole response toward A0·vd, rate limited by SR; exact exponential step for the pole
        const hs = h / sub;
        let nx = target + (x - target) * Math.exp(-wp * hs);
        const dmax = sr * hs; if (Math.abs(nx - x) > dmax) { nx = x + Math.sign(nx - x) * dmax; if (n >= 0) out.slewLimited = true; }
        x = clampR(nx);
      }
      if (n < 0) continue;
      const vo = clampR(x);
      if (p.config === 'schmitt') { vp = b * vo; vm = vin; } else { vp = vin; vm = p.v2; }
      out.t.push(t); out.vin.push(vin); out.vout.push(vo); out.vminus.push(vm); out.vplus.push(vp);
    }
    finish(out, true);
    return out;
  }

  // ---- linear configs: backward Euler on s' = M s + g ----
  const sys = system(p.config, p.r1, p.r2, p.c, a0, wp);
  const [m11, m12, m21, m22] = sys.M;
  const a11 = 1 - h * m11, a12 = -h * m12, a21 = -h * m21, a22 = 1 - h * m22; const det = a11 * a22 - a12 * a21;
  const lin = (x: number, vc: number, t: number): [number, number] => {
    const [g1, g2] = sys.g(waveAt(p.wave, p.vin, f, t), p.v2);
    const r1 = x + h * g1, r2 = vc + h * g2;
    return [(r1 * a22 - a12 * r2) / det, (a11 * r2 - a21 * r1) / det];
  };
  let x = 0, vc = 0;
  if (p.wave !== 'dc') {
    // periodic steady state of the linear part by shooting: s(T) = Φ s0 + b  ⇒  s* = (I − Φ)⁻¹ b
    const nT = Math.round(T / h);
    const run = (x0: number, c0: number, withInput: boolean): [number, number] => {
      let xx = x0, cc = c0;
      for (let n = 1; n <= nT; n++) {
        if (withInput) [xx, cc] = lin(xx, cc, n * h);
        else { const r1 = xx, r2 = cc; xx = (r1 * a22 - a12 * r2) / det; cc = (a11 * r2 - a21 * r1) / det; }
      }
      return [xx, cc];
    };
    const b = run(0, 0, true), p1 = run(1, 0, false), p2 = run(0, 1, false);
    const i11 = 1 - p1[0], i12 = -p2[0], i21 = -p1[1], i22 = 1 - p2[1]; const d = i11 * i22 - i12 * i21;
    if (Math.abs(d) > 1e-12) { x = (b[0] * i22 - i12 * b[1]) / d; vc = (i11 * b[1] - i21 * b[0]) / d; }
    // if the steady state would sit beyond the rails, start clamped and let the nonlinear sim settle
    x = clampR(x);
  } else if (p.config !== 'integrator') {
    // DC input: start at the DC operating point M·s + g = 0 (an integrator instead starts discharged and ramps)
    const [g1, g2] = sys.g(p.vin, p.v2); const d = m11 * m22 - m12 * m21;
    if (Math.abs(d) > 0) { x = clampR((-g1 * m22 + m12 * g2) / d); vc = (-m11 * g2 + m21 * g1) / d; }
  }
  for (let n = -nSettle; n < nPts; n++) {
    const t = n * h;
    if (n > -nSettle || p.wave !== 'dc') {
      let [nx, nc] = lin(x, vc, t);
      let modified = false;
      const dmax = sr * h;
      if (Math.abs(nx - x) > dmax) { nx = x + Math.sign(nx - x) * dmax; modified = true; if (n >= 0) out.slewLimited = true; }
      const cx = clampR(nx); if (cx !== nx) { nx = cx; modified = true; if (n >= 0) out.clipped = true; }
      if (modified) {
        // re-solve the capacitor state with x fixed:  (1 − h m22) vc' = vc + h(m21 x' + g2)
        const [, g2] = sys.g(waveAt(p.wave, p.vin, f, t), p.v2);
        nc = (vc + h * (m21 * nx + g2)) / (1 - h * m22);
      }
      x = nx; vc = nc;
    }
    if (n < 0) continue;
    const vin = waveAt(p.wave, p.vin, f, t);
    const vo = clampR(x);
    out.t.push(t); out.vin.push(vin); out.vout.push(vo);
    out.vminus.push(sys.vminus(vo, vc, vin, p.v2)); out.vplus.push(sys.vplus(vo, vc, vin, p.v2));
  }
  finish(out, false);
  return out;
}

function finish(o: OpampOut, openLoop: boolean) {
  let vd = 0;
  for (let i = 0; i < o.t.length; i++) {
    vd = Math.max(vd, Math.abs(o.vplus[i] - o.vminus[i]));
    o.voutMin = Math.min(o.voutMin, o.vout[i]); o.voutMax = Math.max(o.voutMax, o.vout[i]);
    if (!openLoop && (o.vout[i] >= o.railHi - 1e-9 || o.vout[i] <= o.railLo + 1e-9)) o.clipped = true;
  }
  o.vdPeak = vd; o.voutPk = Math.max(Math.abs(o.voutMin), Math.abs(o.voutMax));
}

/** Measured gain: ratio of output to input peak-to-peak over the window (AC); DC: ratio of values. */
export function measuredGain(o: OpampOut): number {
  let a = Infinity, b = -Infinity; for (const v of o.vin) { a = Math.min(a, v); b = Math.max(b, v); }
  if (b - a < 1e-12) { const vi = o.vin[o.vin.length - 1]; return vi === 0 ? 0 : o.vout[o.vout.length - 1] / vi; }
  // sign from the correlation of input and output (inverting configs give a negative gain)
  let corr = 0; for (let i = 0; i < o.vin.length; i++) corr += o.vin[i] * o.vout[i];
  return (corr < 0 ? -1 : 1) * (o.voutMax - o.voutMin) / (b - a);
}
