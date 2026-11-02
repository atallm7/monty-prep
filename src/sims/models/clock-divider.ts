// Counter-based clock divider. Time is sampled at HALF clock periods: sample 2k = clk rising edge k (clk high), 2k+1 = falling edge (clk low).
// f_out = f_in / N. Modes:
//  'single'    one rising-edge counter 0..N-1; out high while count < ceil(N/2). Even N -> 50 %; odd N -> duty (N+1)/(2N) (e.g. 2/3 for N=3).
//  'symmetric' even N: toggle every N/2 rising edges (50 %). Odd N: A = posedge signal high for (N+1)/2 cycles, B = A re-sampled on the FALLING
//              edge (A delayed by half a period); out = A AND B is high for (N+1)/2 - 1/2 = N/2 cycles -> exactly 50 % using both edges.
//  'pulse'     terminal-count strobe: high for ONE clock cycle every N cycles, duty 1/N (used as a clock-enable).
//  'ripple'    chain of k toggle flip-flops, each divides by 2 (clocked by the previous stage): Q_i = f_in / 2^(i+1), always 50 %. N = 2^k.
export type Mode = 'single' | 'symmetric' | 'pulse' | 'ripple';
export type Sim = {
  n: number; mode: Mode; cycles: number; samples: number;
  clk: number[]; count: number[];       // count = counter value visible after each rising edge (held for the cycle)
  out: number[]; a?: number[]; b?: number[];
  stages: number[][];                   // ripple: Q0..Qk-1
};

export function simulate(nIn: number, mode: Mode, cycles: number): Sim {
  const n = Math.max(1, Math.round(nIn)); const S = cycles * 2;
  const clk: number[] = [], count: number[] = [], out: number[] = [], a: number[] = [], b: number[] = [];
  const stages: number[][] = [];
  const hi = Math.ceil(n / 2);
  for (let i = 0; i < S; i++) {
    const k = i >> 1, c = k % n; clk.push(i % 2 === 0 ? 1 : 0); count.push(c);
    if (mode === 'single') out.push(c < hi ? 1 : 0);
    else if (mode === 'pulse') out.push(c === n - 1 ? 1 : 0);
    else if (mode === 'symmetric') {
      if (n % 2 === 0) out.push(c < n / 2 ? 1 : 0);
      else {
        const A = c < hi ? 1 : 0;                       // posedge-launched, high (N+1)/2 cycles
        // B re-samples A on the falling edge: B at sample i equals A at sample i-1 (half a period late); at start-up B = 0
        const Aprev = i === 0 ? 0 : (((i - 1) >> 1) % n < hi ? 1 : 0);
        a.push(A); b.push(Aprev); out.push(A & Aprev);
      }
    }
  }
  if (mode === 'ripple') {
    const kst = Math.max(1, Math.round(Math.log2(n)));
    for (let s = 0; s < kst; s++) { const p = 2 ** (s + 1) * 2; stages.push(Array.from({ length: S }, (_, i) => (i % p) < p / 2 ? 1 : 0)); }
    // note: Q0 toggles on each rising edge: starting at 1 here for display symmetry
    out.push(...stages[kst - 1]);
  }
  return { n, mode, cycles, samples: S, clk, count, out, a: a.length ? a : undefined, b: b.length ? b : undefined, stages };
}

/** Duty cycle of one steady-state output period (fraction of half-cycle samples that are high). */
export function duty(nIn: number, mode: Mode): number {
  const n = Math.max(1, Math.round(nIn));
  const eff = mode === 'ripple' ? 2 ** Math.max(1, Math.round(Math.log2(n))) : n;
  const s = simulate(eff, mode, eff * 3); const per = 2 * eff, from = per; // skip first period (start-up)
  let hi = 0; for (let i = from; i < from + per; i++) hi += s.out[i]; return hi / per;
}
export const effectiveN = (n: number, mode: Mode) => mode === 'ripple' ? 2 ** Math.max(1, Math.round(Math.log2(Math.max(1, n)))) : Math.max(1, Math.round(n));
/** Output period in input clock cycles measured from rising edges of the output. */
export function measuredPeriod(nIn: number, mode: Mode): number {
  const eff = effectiveN(nIn, mode); const s = simulate(eff, mode, eff * 4); const r: number[] = [];
  for (let i = 1; i < s.samples; i++) if (s.out[i] && !s.out[i - 1]) r.push(i);
  return r.length >= 2 ? (r[r.length - 1] - r[0]) / (r.length - 1) / 2 : NaN;
}
export const fout = (fin: number, n: number) => fin / n;
