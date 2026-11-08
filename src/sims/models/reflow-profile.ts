// Reflow oven thermal model.
// A part with thermal time constant τ sees the oven air temperature T_air(t) set by the zone it is in:
//   dT/dt = (T_air − T)/τ   →  exact step: T ← T_air + (T − T_air)·exp(−Δt/τ)
// The conveyor moves at v cm/min through n zones of length ZONE_LEN, followed by a cooling section.
// Air temperature changes between zones are smoothed with a first-order lag (τ_air) because the zones are not thermally isolated.
export const ZONE_LEN = 60;       // cm per zone
export const COOL_LEN = 50;       // cm of forced-air cooling after the last zone
export const T_AMB = 25, T_COOL = 30, TAU_AIR = 6, DT = 0.25;
export const LIQUIDUS = 217;      // SAC305 melting point, °C
// Typical SAC305 paste window (J-STD-020: tL 60-150 s above 217 C; peak 230-250 C; ramp <= 3 C/s)
export const SPEC = { rampMax: 3, soakMin: 50, soakMax: 120, talMin: 45, talMax: 120, peakMin: 230, peakMax: 250 };

export type ReflowIn = { zones: number[]; speed: number; tauSmall: number; tauLarge: number };
export type Trace = { t: number[]; air: number[]; small: number[]; large: number[]; zoneT: number; zoneEnds: number[]; total: number };

export function simulate({ zones, speed, tauSmall, tauLarge }: ReflowIn): Trace {
  const v = Math.max(speed, 1) / 60; // cm/s
  const zoneT = ZONE_LEN / v, coolT = COOL_LEN / v, n = zones.length;
  const total = n * zoneT + coolT;
  const N = Math.ceil(total / DT);
  const t: number[] = [], air: number[] = [], small: number[] = [], large: number[] = [];
  let ta = T_AMB, ts = T_AMB, tl = T_AMB;
  const ks = 1 - Math.exp(-DT / Math.max(tauSmall, 0.1)), kl = 1 - Math.exp(-DT / Math.max(tauLarge, 0.1)), ka = 1 - Math.exp(-DT / TAU_AIR);
  for (let i = 0; i <= N; i++) {
    const time = i * DT;
    const zi = Math.floor(time / zoneT);
    const target = zi < n ? zones[zi] : T_COOL;
    ta += (target - ta) * ka;
    ts += (ta - ts) * ks; tl += (ta - tl) * kl;
    t.push(time); air.push(ta); small.push(ts); large.push(tl);
  }
  return { t, air, small, large, zoneT, zoneEnds: zones.map((_, k) => (k + 1) * zoneT), total };
}

export type Metrics = { peak: number; tPeak: number; ramp: number; soak: number; tal: number; talStart: number; talEnd: number; coolRate: number };
/** Metrics: ramp = max 10 s-averaged heating rate while 100–200 °C; soak = time 150→200 °C; TAL = time above liquidus;
 * cool = max cooling rate (10 s average) after the peak. */
export function metrics(t: number[], T: number[]): Metrics {
  let peak = -Infinity, ip = 0;
  T.forEach((x, i) => { if (x > peak) { peak = x; ip = i; } });
  const w = Math.round(10 / DT);
  let ramp = 0, coolRate = 0;
  for (let i = w; i < T.length; i++) {
    const r = (T[i] - T[i - w]) / 10;
    const mid = (T[i] + T[i - w]) / 2;
    if (mid >= 100 && mid <= 200 && i <= ip) ramp = Math.max(ramp, r);
    if (i > ip) coolRate = Math.max(coolRate, -r);
  }
  const cross = (level: number, up: boolean) => { // linear-interpolated crossing time
    for (let i = 1; i < T.length; i++) if (up ? (T[i - 1] < level && T[i] >= level) : (T[i - 1] >= level && T[i] < level)) return t[i - 1] + (level - T[i - 1]) / (T[i] - T[i - 1]) * (t[i] - t[i - 1]);
    return NaN;
  };
  const t150 = cross(150, true), t200 = cross(200, true);
  const soak = isFinite(t150) ? (isFinite(t200) ? t200 - t150 : t[t.length - 1] - t150) : 0;
  const talStart = cross(LIQUIDUS, true), talEnd = cross(LIQUIDUS, false);
  const tal = isFinite(talStart) ? (isFinite(talEnd) ? talEnd : t[t.length - 1]) - talStart : 0;
  return { peak, tPeak: t[ip], ramp, soak, tal, talStart, talEnd, coolRate };
}

export type Verdict = { ramp: boolean; soak: boolean; tal: boolean; peak: boolean; all: boolean };
export function judge(m: Metrics): Verdict {
  const ramp = m.ramp <= SPEC.rampMax, soak = m.soak >= SPEC.soakMin && m.soak <= SPEC.soakMax,
    tal = m.tal >= SPEC.talMin && m.tal <= SPEC.talMax, peak = m.peak >= SPEC.peakMin && m.peak <= SPEC.peakMax;
  return { ramp, soak, tal, peak, all: ramp && soak && tal && peak };
}

export const PRESETS: Record<string, ReflowIn> = {
  good: { zones: [150, 180, 200, 230, 250, 200], speed: 70, tauSmall: 20, tauLarge: 60 },
  cold: { zones: [150, 180, 200, 215, 225, 200], speed: 70, tauSmall: 20, tauLarge: 60 },
  'hot-fast': { zones: [220, 235, 245, 250, 250, 200], speed: 90, tauSmall: 20, tauLarge: 60 },
};
