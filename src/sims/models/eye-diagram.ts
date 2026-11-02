// Eye-diagram model: PRBS7 NRZ data → TX FIR de-emphasis → band-limited channel → optional CTLE → noise → slicer.
// • PRBS7: x^7 + x^6 + 1 LFSR, period 127 (ITU-T O.150).
// • TX 2-tap FIR (PCIe/USB-style de-emphasis): y_k = c0·b_k + c1·b_{k−1}, c0 + |c1| = 1 (peak swing fixed),
//   de-emphasis dB = −20·log10((c0 − |c1|)/(c0 + |c1|)).
// • Channel: 1-pole RC with −3 dB at bw, or two identical poles each at bw/√(√2 − 1) so the cascade is −3 dB at bw.
//   Each pole is discretised exactly for a piecewise-constant input: y ← y + (1 − e^{−Δt/τ})(x − y), τ = 1/(2πf_p).
// • CTLE: H(s) = A·(1 + s/ωz)/((1 + s/ωp1)(1 + s/ωp2)), ωp1 = 2π·rate/2, ωz = A·ωp1, ωp2 = 2π·2·rate,
//   A = 10^(−boost/20): flat 0 dB near Nyquist, −boost dB at DC (i.e. "boost" dB of peaking).
// • Noise: Gaussian, band-limited to ≈ the bit rate, referred to the slicer input. Random jitter: Gaussian
//   displacement of every TX edge (σ in UI).
// • Metrics: inner eye height at the best phase, eye width (phases with a positive inner opening),
//   Q = (μ1 − μ0)/(σ1 + σ0) and BER ≈ ½·erfc(Q/√2) (Gaussian assumption).

export function prbs7(n: number, seed = 0x7f) {
  let s = seed & 0x7f || 1; const out: number[] = [];
  for (let i = 0; i < n; i++) { const b = ((s >> 6) ^ (s >> 5)) & 1; s = ((s << 1) | b) & 0x7f; out.push(b); }
  return out;
}

export function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function gauss(rnd: () => number) { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); }

/** Complementary error function (Numerical Recipes erfcc, |rel err| < 1.2e−7). */
export function erfc(x: number) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

export function firTaps(deemphDb: number) { const r = 10 ** (-Math.max(0, deemphDb) / 20); return { c0: (1 + r) / 2, c1: -(1 - r) / 2 }; }

export type EyeIn = { rate: number; bw: number; noise: number; jitter: number; preemph: number; ctle: number; poles: 1 | 2; amp?: number; nBits?: number; seed?: number; maskW?: number; maskH?: number };

/** |H(f)| of channel, CTLE and TX FIR (linear magnitude). */
export function response(p: EyeIn, f: number) {
  const fp = p.poles === 2 ? p.bw / Math.sqrt(Math.SQRT2 - 1) : p.bw;
  const ch = Math.pow(1 / Math.sqrt(1 + (f / fp) ** 2), p.poles);
  let ct = 1;
  if (p.ctle > 0) { const A = 10 ** (-p.ctle / 20), fp1 = p.rate / 2, fz = A * fp1, fp2 = 2 * p.rate; ct = A * Math.hypot(1, f / fz) / (Math.hypot(1, f / fp1) * Math.hypot(1, f / fp2)); }
  const { c0, c1 } = firTaps(p.preemph); const w = 2 * Math.PI * f / p.rate;
  const fir = Math.hypot(c0 + c1 * Math.cos(w), c1 * Math.sin(w));
  return { ch, ct, fir, total: ch * ct * fir };
}

export function simulate(p: EyeIn) {
  const OS = 32, A = p.amp ?? 0.5, T = 1 / p.rate, dt = T / OS;
  const nBits = p.nBits ?? 127 * 3 + 8;
  const bits = prbs7(nBits);
  const rnd = mulberry32(p.seed ?? 12345);
  const { c0, c1 } = firTaps(p.preemph);
  const sym = bits.map((b, k) => A * (c0 * (2 * b - 1) + c1 * (k > 0 ? 2 * bits[k - 1] - 1 : -1)));
  // jittered edge times (bit k occupies [e_k, e_{k+1}))
  const sj = Math.max(0, p.jitter);
  const e = new Float64Array(nBits + 1);
  for (let k = 0; k <= nBits; k++) e[k] = (k + Math.max(-0.45, Math.min(0.45, sj * gauss(rnd)))) * T;
  const N = nBits * OS;
  const tx = new Float64Array(N);
  const SUB = 4; let kb = 0;
  for (let i = 0; i < N; i++) {
    let acc = 0;
    for (let q = 0; q < SUB; q++) {
      const t = (i + (q + 0.5) / SUB) * dt;
      while (kb < nBits - 1 && t >= e[kb + 1]) kb++;
      while (kb > 0 && t < e[kb]) kb--;
      acc += t < e[0] ? -A : sym[kb];
    }
    tx[i] = acc / SUB;
  }
  // channel poles
  const fp = p.poles === 2 ? p.bw / Math.sqrt(Math.SQRT2 - 1) : p.bw;
  const al = 1 - Math.exp(-2 * Math.PI * fp * dt);
  const rx = new Float64Array(N); let y1 = -A, y2 = -A;
  for (let i = 0; i < N; i++) { y1 += al * (tx[i] - y1); if (p.poles === 2) { y2 += al * (y1 - y2); rx[i] = y2; } else rx[i] = y1; }
  // CTLE
  const eq = new Float64Array(N);
  if (p.ctle > 0) {
    const Ag = 10 ** (-p.ctle / 20), fp1 = p.rate / 2, fz = Ag * fp1, fp2 = 2 * p.rate;
    const a1 = 1 - Math.exp(-2 * Math.PI * fp1 * dt), a2 = 1 - Math.exp(-2 * Math.PI * fp2 * dt);
    let lp = rx[0], o2 = Ag * rx[0];
    for (let i = 0; i < N; i++) {
      lp += a1 * (rx[i] - lp);
      const ll = (fp1 / fz) * (rx[i] - ((fp1 - fz) / fp1) * lp);
      o2 += a2 * (Ag * ll - o2); eq[i] = o2;
    }
  } else eq.set(rx);
  // band-limited noise at the slicer
  if (p.noise > 0) {
    const an = 1 - Math.exp(-2 * Math.PI * p.rate * dt); const sw = p.noise * Math.sqrt((2 - an) / an);
    let nz = 0; for (let i = 0; i < 200; i++) nz += an * (sw * gauss(rnd) - nz);
    for (let i = 0; i < N; i++) { nz += an * (sw * gauss(rnd) - nz); eq[i] += nz; }
  }
  // choose the decision phase that maximises the inner eye opening
  const k0 = 16, k1 = nBits - 4;
  const openAt = (ph: number) => { // ph = sample offset within the bit (0..OS-1), may exceed OS (channel delay)
    let mn1 = Infinity, mx0 = -Infinity;
    for (let k = k0; k < k1; k++) { const v = eq[k * OS + ph]; if (bits[k]) mn1 = Math.min(mn1, v); else mx0 = Math.max(mx0, v); }
    return mn1 - mx0;
  };
  let best = 0, bestOpen = -Infinity;
  for (let ph = 0; ph < 2 * OS; ph++) { const o = openAt(ph); if (o > bestOpen) { bestOpen = o; best = ph; } }
  // statistics at the best phase
  let s1 = 0, s0 = 0, q1 = 0, q0 = 0, n1 = 0, n0 = 0, errors = 0, innerTop = Infinity, innerBot = -Infinity;
  for (let k = k0; k < k1; k++) { const v = eq[k * OS + best]; if (bits[k]) innerTop = Math.min(innerTop, v); else innerBot = Math.max(innerBot, v); if (bits[k]) { s1 += v; q1 += v * v; n1++; if (v < 0) errors++; } else { s0 += v; q0 += v * v; n0++; if (v > 0) errors++; } }
  const mu1 = s1 / n1, mu0 = s0 / n0;
  const sd1 = Math.sqrt(Math.max(0, q1 / n1 - mu1 * mu1)), sd0 = Math.sqrt(Math.max(0, q0 / n0 - mu0 * mu0));
  const Q = (mu1 - mu0) / Math.max(1e-12, sd1 + sd0);
  const ber = 0.5 * erfc(Q / Math.SQRT2);
  // eye width: contiguous phases around the best with positive opening
  let wl = 0, wr = 0;
  while (wl < OS && openAt(best - wl - 1) > 0) wl++;
  while (wr < OS && openAt(best + wr + 1) > 0) wr++;
  const width = bestOpen > 0 ? (wl + wr + 1) / OS : 0;
  // eye centre for display = middle of the horizontal opening around the best phase
  const cOff = (((Math.round(best + (wr - wl) / 2)) % OS) + OS) % OS;
  let sOff = ((best - cOff) % OS + OS) % OS; if (sOff > OS / 2) sOff -= OS;
  // fold into 2-UI traces centred on the eye centre (x in UI from −1 to +1)
  const traces: { x: number[]; y: number[] }[] = [];
  for (let k = k0; k < k1; k++) {
    const c = k * OS + cOff; const x: number[] = [], y: number[] = [];
    for (let j = -OS; j <= OS; j++) { const i = c + j; if (i < 0 || i >= N) continue; x.push(j / OS); y.push(eq[i]); }
    traces.push({ x, y });
  }
  // hexagonal mask centred on the eye
  const mw = p.maskW ?? 0.4, mh = p.maskH ?? 0.2;
  const mask: [number, number][] = [[-mw / 2, 0], [-mw / 4, mh / 2], [mw / 4, mh / 2], [mw / 2, 0], [mw / 4, -mh / 2], [-mw / 4, -mh / 2]];
  const inMask = (x: number, y: number) => {
    if (Math.abs(y) >= mh / 2 || Math.abs(x) >= mw / 2) return false;
    return Math.abs(x) <= mw / 4 || Math.abs(y) <= (mh / 2) * (mw / 2 - Math.abs(x)) / (mw / 4);
  };
  const hits: { x: number; y: number }[] = []; let hitTraces = 0;
  for (const tr of traces) { let h = false; for (let i = 0; i < tr.x.length; i++) if (inMask(tr.x[i], tr.y[i])) { hits.push({ x: tr.x[i], y: tr.y[i] }); h = true; } if (h) hitTraces++; }
  const tAxis = Array.from({ length: Math.min(N, 40 * OS) }, (_, i) => i * dt);
  return { bits, tx, eq, traces, height: bestOpen, innerTop, innerBot, sample: sOff / OS, wl: wl / OS, wr: wr / OS, width, Q, ber, mu1, mu0, sd1, sd0, errors, decisions: n0 + n1, mask, hits, hitTraces, phase: best / OS, tAxis, OS, dt };
}
