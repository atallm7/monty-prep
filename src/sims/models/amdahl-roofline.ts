// Amdahl, Gustafson and roofline models.
// Amdahl (fixed problem size):   S(N) = 1 / ((1−p) + p/N),   S(∞) = 1/(1−p)
// Gustafson (scaled problem):     S(N) = N − (1−p)(N−1)      (p = parallel fraction of the *parallel run*)
// Roofline (Williams et al.):     P = min(peak, AI·BW),  ridge AI* = peak/BW   [GFLOP/s, GB/s, FLOP/byte]
export const amdahl = (p: number, n: number) => 1 / ((1 - p) + p / Math.max(1, n));
export const gustafson = (p: number, n: number) => n - (1 - p) * (n - 1);
export const amdahlLimit = (p: number) => (p >= 1 ? Infinity : 1 / (1 - p));
export const efficiency = (p: number, n: number) => amdahl(p, n) / n;
/** cores needed to reach fraction f (0..1) of the asymptotic Amdahl speedup: N = p·f / ((1−p)(1−f)) */
export const coresForFraction = (p: number, f: number) => (p >= 1 || f >= 1 ? Infinity : (p * f) / ((1 - p) * (1 - f)));

export const attainable = (peak: number, bw: number, ai: number) => Math.min(peak, ai * bw);
export const ridge = (peak: number, bw: number) => peak / bw;
export const bound = (peak: number, bw: number, ai: number): 'memory' | 'compute' => (ai < ridge(peak, bw) ? 'memory' : 'compute');

/** Typical arithmetic intensities (double precision, FLOP per DRAM byte, ideal caching). */
export const KERNELS = [
  { id: 'vecadd', name: 'Vector add', ai: 1 / 24, note: 'c=a+b: 1 FLOP, 24 B (2 reads + 1 write of 8 B)' },
  { id: 'spmv', name: 'SpMV', ai: 0.25, note: 'sparse matrix-vector: ~2 FLOP per 8 B value + index' },
  { id: 'stencil', name: '7-pt stencil', ai: 0.5, note: 'about 8 FLOP per 16 B with ideal reuse' },
  { id: 'fft', name: 'FFT', ai: 2, note: '≈ 5N log2N FLOP over 16N B, grows slowly with N' },
  { id: 'matmul', name: 'Matmul 1024', ai: 64, note: 'blocked n×n DGEMM: AI ≈ n/12 ≈ 85, reduced by blocking limits' },
];
