// Ring buffer (circular FIFO) with a producer (ISR) and consumer (main loop), as a discrete-event simulation.
//  Producer: bursts of `burst` items, items spaced 1/prodRate ms apart, then `gap` ms idle, repeating.
//  Consumer: services one item every 1/consRate ms if one is available (otherwise the slot is idle).
//  Ties: producer first. head = next write index, tail = next read index (both free-running counters, index = counter mod size).
//  Full/empty conventions:
//   'slot'  : one slot always empty; empty: head==tail, full: (head+1) mod N == tail  -> usable capacity N-1
//   'count' : separate count variable; empty: count==0, full: count==N                 -> usable capacity N
//  Steady-state backlog growth during a burst: (prodRate - consRate)·burst/prodRate = burst·(1 - cons/prod) items.
export type Conv = 'slot' | 'count';
export type RingIn = { size: number; prodRate: number; consRate: number; burst: number; gap: number; conv: Conv; tEnd?: number };
export type RingEv = { t: number; kind: 'push' | 'pop' | 'drop'; id: number; head: number; tail: number; count: number; dropped: number };

export const isPow2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
export const capacityOf = (size: number, conv: Conv) => (conv === 'slot' ? size - 1 : size);
export const nextPow2 = (n: number) => { let p = 1; while (p < n) p <<= 1; return p; };
/** distinct slots reachable with mask (N-1) when N is not a power of two: 2^popcount(N-1) */
export const maskReach = (size: number) => 2 ** (((size - 1) >>> 0).toString(2).replace(/0/g, '').length);

export function simulate(p: RingIn) {
  const cap = capacityOf(p.size, p.conv);
  const period = p.burst / p.prodRate + p.gap;
  const tEnd = p.tEnd ?? Math.max(40, period * 2 + 4);
  // generate arrivals and service ticks
  type Tk = { t: number; k: 'p' | 'c' };
  const tk: Tk[] = [];
  for (let c = 0; c * period < tEnd; c++) for (let i = 0; i < p.burst; i++) { const t = c * period + i / p.prodRate; if (t <= tEnd) tk.push({ t, k: 'p' }); }
  for (let j = 0; j / p.consRate <= tEnd; j++) tk.push({ t: j / p.consRate, k: 'c' });
  tk.sort((a, b) => a.t - b.t || (a.k === 'p' ? -1 : 1) - (b.k === 'p' ? -1 : 1));
  let pushes = 0, pops = 0, dropped = 0, produced = 0, peak = 0, idle = 0, head = 0, tail = 0;
  const ev: RingEv[] = [];
  for (const e of tk) {
    const count = pushes - pops;
    if (e.k === 'p') {
      const id = ++produced;
      if (count >= cap) { dropped++; ev.push({ t: e.t, kind: 'drop', id, head: pushes, tail: pops, count, dropped }); }
      else { head = pushes % p.size; pushes++; peak = Math.max(peak, pushes - pops); ev.push({ t: e.t, kind: 'push', id, head: pushes, tail: pops, count: pushes - pops, dropped }); }
    } else if (count > 0) { tail = pops % p.size; pops++; ev.push({ t: e.t, kind: 'pop', id: pops, head: pushes, tail: pops, count: pushes - pops, dropped }); }
    else idle++;
  }
  void head; void tail;
  return { events: ev, tEnd, cap, peak, dropped, produced, consumed: pops, idleTicks: idle, period };
}

/** Peak backlog with unlimited storage, and the smallest N that never drops under this traffic */
export function minSizeNeeded(p: Omit<RingIn, 'size'>) {
  const big = simulate({ ...p, size: 1e6 });
  const peak = big.peak; const size = peak + (p.conv === 'slot' ? 1 : 0);
  return { peak, size, pow2: nextPow2(size), formula: Math.max(0, Math.ceil(p.burst * (1 - p.consRate / p.prodRate) - 1e-9)) };
}

/** Ring state at time t: slot contents (item ids) and counters */
export function stateAt(size: number, events: RingEv[], t: number) {
  const slots: (number | null)[] = Array(size).fill(null);
  let pushes = 0, pops = 0, dropped = 0, lastDrop = -Infinity, count = 0;
  for (const e of events) {
    if (e.t > t) break;
    if (e.kind === 'push') { slots[pushes % size] = e.id; pushes++; }
    else if (e.kind === 'pop') { slots[pops % size] = null; pops++; }
    else lastDrop = e.t;
    dropped = e.dropped; count = e.count;
  }
  return { slots, pushes, pops, dropped, lastDrop, count: pushes - pops, headIdx: pushes % size, tailIdx: pops % size, headAbs: pushes, tailAbs: pops, _c: count };
}
