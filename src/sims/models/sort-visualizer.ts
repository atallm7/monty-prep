// Sorting / searching algorithm event generators with exact operation counts.
// Every algorithm emits a stream of primitive events; the UI replays them and the counters are derived
// from the very same events, so the displayed counts equal what the implemented algorithm really did.
//  cmp  = one comparison of two elements (a[i] vs a[j]) or element vs search target (j = -1)
//  swap = exchange of a[i], a[j] (bubble, quick)
//  set  = one array write a[i] = v (insertion shifts, merge copies)
export type Algo = 'bubble' | 'insertion' | 'merge' | 'quick' | 'binary-search' | 'linear-search';
export type InputKind = 'random' | 'sorted' | 'reversed' | 'nearly';
export type Ev =
  | { t: 'cmp'; i: number; j: number }
  | { t: 'swap'; i: number; j: number }
  | { t: 'set'; i: number; v: number }
  | { t: 'range'; lo: number; hi: number }
  | { t: 'found'; i: number };

export const ALGOS: { value: Algo; label: string }[] = [
  { value: 'bubble', label: 'Bubble sort' }, { value: 'insertion', label: 'Insertion sort' },
  { value: 'merge', label: 'Merge sort' }, { value: 'quick', label: 'Quick sort (Lomuto, last pivot)' },
  { value: 'binary-search', label: 'Binary search' }, { value: 'linear-search', label: 'Linear search' },
];
export const isSearch = (a: Algo) => a === 'binary-search' || a === 'linear-search';

/** mulberry32 PRNG */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Permutation-like input of the values 1..n */
export function makeInput(kind: InputKind, n: number, seed = 1): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  const r = rng(seed * 7919 + n);
  if (kind === 'sorted') return a;
  if (kind === 'reversed') return a.reverse();
  if (kind === 'random') { for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // nearly sorted: ~10% of the elements displaced by up to 3 places
  const k = Math.max(1, Math.round(n * 0.1));
  for (let m = 0; m < k; m++) { const i = Math.floor(r() * n); const j = Math.min(n - 1, i + 1 + Math.floor(r() * 3)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function sortEvents(algo: Algo, input: number[]): Ev[] {
  const a = input.slice(); const n = a.length; const ev: Ev[] = [];
  const cmp = (i: number, j: number) => ev.push({ t: 'cmp', i, j });
  const swap = (i: number, j: number) => { [a[i], a[j]] = [a[j], a[i]]; ev.push({ t: 'swap', i, j }); };
  const set = (i: number, v: number) => { a[i] = v; ev.push({ t: 'set', i, v }); };
  if (algo === 'bubble') {
    // n-1 passes worst case; stops early after a pass with no swap (best case n-1 comparisons)
    for (let end = n - 1; end > 0; end--) {
      let sw = false;
      for (let j = 0; j < end; j++) { cmp(j, j + 1); if (a[j] > a[j + 1]) { swap(j, j + 1); sw = true; } }
      if (!sw) break;
    }
  } else if (algo === 'insertion') {
    for (let i = 1; i < n; i++) {
      const key = a[i]; let j = i - 1;
      while (j >= 0) { cmp(j, i); if (a[j] > key) { set(j + 1, a[j]); j--; } else break; }
      if (j + 1 !== i) set(j + 1, key);
    }
  } else if (algo === 'merge') {
    const merge = (lo: number, mid: number, hi: number) => {
      const aux = a.slice(lo, hi + 1); let i = lo, j = mid + 1, k = lo;
      while (i <= mid && j <= hi) { cmp(i, j); if (aux[j - lo] < aux[i - lo]) set(k++, aux[(j++) - lo]); else set(k++, aux[(i++) - lo]); }
      while (i <= mid) set(k++, aux[(i++) - lo]);
      while (j <= hi) set(k++, aux[(j++) - lo]);
    };
    const ms = (lo: number, hi: number) => { if (hi <= lo) return; const mid = (lo + hi) >> 1; ms(lo, mid); ms(mid + 1, hi); merge(lo, mid, hi); };
    ms(0, n - 1);
  } else if (algo === 'quick') {
    const qs = (lo: number, hi: number) => {
      if (lo >= hi) return;
      const p = a[hi]; let i = lo;
      for (let j = lo; j < hi; j++) { cmp(j, hi); if (a[j] < p) { if (i !== j) swap(i, j); i++; } }
      if (i !== hi) swap(i, hi);
      qs(lo, i - 1); qs(i + 1, hi);
    };
    qs(0, n - 1);
  }
  return ev;
}

/** Search events. Binary search needs sorted data. One 3-way comparison per probe. */
export function searchEvents(algo: Algo, arr: number[], target: number): Ev[] {
  const ev: Ev[] = []; const n = arr.length;
  if (algo === 'linear-search') {
    for (let i = 0; i < n; i++) { ev.push({ t: 'cmp', i, j: -1 }); if (arr[i] === target) { ev.push({ t: 'found', i }); return ev; } }
    return ev;
  }
  let lo = 0, hi = n - 1;
  while (lo <= hi) {
    ev.push({ t: 'range', lo, hi });
    const mid = (lo + hi) >> 1; ev.push({ t: 'cmp', i: mid, j: -1 });
    if (arr[mid] === target) { ev.push({ t: 'found', i: mid }); return ev; }
    if (arr[mid] < target) lo = mid + 1; else hi = mid - 1;
  }
  ev.push({ t: 'range', lo: 0, hi: -1 });
  return ev;
}

export type State = { arr: number[]; cmp: number; swaps: number; writes: number; last: Ev | null; lo: number; hi: number; found: number };
/** Apply the first k events to the initial array. */
export function replay(init: number[], evs: Ev[], k: number): State {
  const arr = init.slice(); let cmp = 0, swaps = 0, writes = 0, lo = 0, hi = init.length - 1, found = -1, last: Ev | null = null;
  for (let q = 0; q < k && q < evs.length; q++) {
    const e = evs[q]; last = e;
    if (e.t === 'cmp') cmp++;
    else if (e.t === 'swap') { swaps++; [arr[e.i], arr[e.j]] = [arr[e.j], arr[e.i]]; }
    else if (e.t === 'set') { writes++; arr[e.i] = e.v; }
    else if (e.t === 'range') { lo = e.lo; hi = e.hi; }
    else found = e.i;
  }
  return { arr, cmp, swaps, writes, last, lo, hi, found };
}

export const isSorted = (a: number[]) => a.every((v, i) => i === 0 || a[i - 1] <= v);

/** Measured counts for a full sort run */
export function measureSort(algo: Algo, kind: InputKind, n: number, seed = 1) {
  const init = makeInput(kind, n, seed); const s = replay(init, sortEvents(algo, init), Infinity);
  return { cmp: s.cmp, moves: s.swaps + s.writes, total: s.cmp + s.swaps + s.writes, sorted: isSorted(s.arr) };
}
/** Average comparisons over every present target 1..n (and worst case) */
export function measureSearch(algo: Algo, n: number) {
  const arr = Array.from({ length: n }, (_, i) => i + 1); let sum = 0, worst = 0;
  for (let t = 1; t <= n; t++) { const c = searchEvents(algo, arr, t).filter(e => e.t === 'cmp').length; sum += c; worst = Math.max(worst, c); }
  return { avg: sum / n, worst };
}
