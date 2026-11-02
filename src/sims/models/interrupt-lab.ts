// Interrupt scheduling model (Cortex-M-like NVIC), discrete 1 us ticks.
// Each source fires periodically (phase + k*period) and sets a 1-bit PENDING flag. The flag is cleared when its ISR starts.
// An event arriving while the flag is still set is merged with the earlier one => a MISSED event (lost interrupt).
// Lower priority number = more urgent. Entry overhead (stacking + vector fetch + unstacking) is added to each ISR run.
//  non-nested: a running ISR always finishes; then the most urgent pending ISR starts (main loop runs only when nothing is pending).
//  nested:     a pending IRQ whose priority number is strictly smaller than the running ISR preempts it; the preempted ISR resumes afterwards.
// Latency = time from event arrival until its ISR starts executing (waiting for the CPU) + the entry overhead.
// CPU load of interrupts (utilisation) U = sum_i (t_isr_i + t_entry) / T_i ; schedulable-ish when U < 1 and worst-case latency < period.
export type Src = { name: string; period: number; phase: number; dur: number; prio: number; enabled: boolean };
export type Seg = { src: number; t0: number; t1: number };       // src = -1 is the main loop
export type Ev = { src: number; t: number; start: number | null; end: number | null; missed: boolean };

export function simulate(srcs: Src[], opts: { nesting: boolean; entry: number; T: number }) {
  const { nesting, entry, T } = opts;
  const n = srcs.length; const pending = new Array(n).fill(false); const pendEv: (Ev | null)[] = new Array(n).fill(null);
  const remaining = new Array(n).fill(0); const stack: number[] = [];
  const evs: Ev[] = []; const segs: Seg[] = [];
  const best = () => { let b = -1; for (let i = 0; i < n; i++) if (pending[i] && (b < 0 || srcs[i].prio < srcs[b].prio)) b = i; return b; };
  for (let t = 0; t < T; t++) {
    // arrivals at the start of this tick
    srcs.forEach((s, i) => {
      if (!s.enabled || s.period <= 0 || t < s.phase || (t - s.phase) % s.period !== 0) return;
      if (pending[i]) { evs.push({ src: i, t, start: null, end: null, missed: true }); return; }
      const e: Ev = { src: i, t, start: null, end: null, missed: false }; evs.push(e); pending[i] = true; pendEv[i] = e;
    });
    // scheduling decision
    const top = stack.length ? stack[stack.length - 1] : -1;
    const cand = best();
    if (cand >= 0 && (top < 0 || (nesting && srcs[cand].prio < srcs[top].prio))) {
      pending[cand] = false; const e = pendEv[cand]!; e.start = t; pendEv[cand] = null; remaining[cand] = srcs[cand].dur + entry; stack.push(cand);
    }
    const run = stack.length ? stack[stack.length - 1] : -1;
    if (segs.length && segs[segs.length - 1].src === run && segs[segs.length - 1].t1 === t) segs[segs.length - 1].t1 = t + 1; else segs.push({ src: run, t0: t, t1: t + 1 });
    if (run >= 0) {
      remaining[run]--;
      if (remaining[run] <= 0) { stack.pop(); const ev = [...evs].reverse().find(e => e.src === run && e.start !== null && e.end === null && !e.missed); if (ev) ev.end = t + 1; }
    }
  }
  // per-source statistics
  const stats = srcs.map((s, i) => {
    const mine = evs.filter(e => e.src === i && !e.missed);
    const started = mine.filter(e => e.start !== null);
    const lat = started.map(e => e.start! - e.t + entry);
    return { fired: evs.filter(e => e.src === i).length, missed: evs.filter(e => e.src === i && e.missed).length, served: started.length,
      worstLatency: lat.length ? Math.max(...lat) : 0, avgLatency: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0 };
  });
  const busy = segs.filter(s => s.src >= 0).reduce((a, s) => a + (s.t1 - s.t0), 0);
  const util = srcs.reduce((a, s) => a + (s.enabled && s.period > 0 ? (s.dur + entry) / s.period : 0), 0);
  return { segs, evs, stats, isrLoad: busy / T, mainLoad: 1 - busy / T, util };
}
