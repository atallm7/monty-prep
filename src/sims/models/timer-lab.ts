// MCU timer/counter (STM32-style up-counter) and PWM.
// Counter clock: f_cnt = f_clk / (PSC + 1).  The counter runs 0 .. ARR then reloads: period = (ARR+1) counts.
// Update-event frequency: f_upd = f_clk / ((PSC+1)(ARR+1)).
// PWM mode 1 (edge-aligned): output high while CNT < CCR, so duty = CCR / (ARR+1) (CCR=0 -> 0 %, CCR >= ARR+1 -> 100 %).
// Duty resolution: ARR+1 distinct steps = log2(ARR+1) bits; for fixed f_pwm, resolution bits = log2(f_clk / ((PSC+1) f_pwm)).
// Solver: choose PSC, ARR (<= 16 or 32 bit) minimising |f - f_target|, tie-break on largest ARR (best duty resolution).
export type Cfg = { fclk: number; psc: number; arr: number; ccr: number };
export const maxReg = (width: 16 | 32) => (width === 16 ? 65535 : 4294967295);

export function timer({ fclk, psc, arr, ccr }: Cfg) {
  const div = psc + 1, counts = arr + 1;
  const fcnt = fclk / div, fupd = fcnt / counts;
  const ccrEff = Math.min(Math.max(ccr, 0), counts);
  const duty = ccrEff / counts;
  return { fcnt, tick: div / fclk, fupd, period: counts / fcnt, duty, ccrEff, bits: Math.log2(counts), counts, tHigh: ccrEff / fcnt, step: 1 / counts };
}

export function solve(fclk: number, target: number, width: 16 | 32 = 16) {
  const mx = maxReg(width) + 1; const ideal = fclk / target; // total divide ratio (PSC+1)(ARR+1)
  let best: { psc: number; arr: number; f: number; err: number } | null = null;
  const lim = Math.min(mx, 262144); // search ARR+1 in 1..lim (plenty for resolution trade-off), PSC+1 derived
  for (let a = 1; a <= lim; a++) {
    const p = Math.min(mx, Math.max(1, Math.round(ideal / a)));
    for (const pp of [p, p + 1]) {
      if (pp < 1 || pp > mx) continue;
      const f = fclk / (pp * a), err = (f - target) / target;
      if (!best || Math.abs(err) < Math.abs(best.err) - 1e-15 || (Math.abs(Math.abs(err) - Math.abs(best.err)) <= 1e-15 && a - 1 > best.arr))
        best = { psc: pp - 1, arr: a - 1, f, err };
    }
    if (a > ideal && best && best.err === 0) break;
  }
  return best!;
}

/** Counter sawtooth + PWM waveform over `periods` update periods (piecewise-linear vertices; time in seconds). */
export function waveforms(c: Cfg, periods = 3) {
  const t = timer(c); const cx: number[] = [], cy: number[] = [], px: number[] = [], py: number[] = [], upd: number[] = [];
  for (let k = 0; k < periods; k++) {
    const t0 = k * t.period; upd.push(t0);
    // counter ramps 0..ARR, holds ARR for the last tick, then reloads to 0 (update event)
    cx.push(t0, t0 + c.arr * t.tick, t0 + t.period, t0 + t.period); cy.push(0, c.arr, c.arr, 0);
    const th = t0 + t.tHigh;
    if (t.ccrEff <= 0) { px.push(t0, t0 + t.period); py.push(0, 0); }
    else if (t.ccrEff >= t.counts) { px.push(t0, t0 + t.period); py.push(1, 1); }
    else { px.push(t0, th, th, t0 + t.period); py.push(1, 1, 0, 0); }
  }
  return { cx, cy, px, py, upd, tEnd: periods * t.period };
}
