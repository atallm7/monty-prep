// Differential vs single-ended signaling model. Time is in unit intervals (UI = 1 bit).
// Each line of the pair swings ±a around Vcm0:  Vp = Vcm0 + a·s(t − skew) + vn(t − skew),  Vn = Vcm0 − a·s(t) + vn(t)
// where s(t) ∈ [−1, 1] is the NRZ data with raised-cosine edges and vn(t) is common-mode noise picked up near the
// transmitter (it travels with the signal, so P-leg skew delays it too). A transmitter/receiver ground offset Vg
// adds to both legs as seen by the receiver.
//   Differential receiver:  Vdiff = Vp − Vn  (+ residual Vcm_err·10^(−CMRR/20)), threshold 0, valid only when the
//   input common mode is inside its range. Single-ended receiver: Vp vs a fixed Vref = Vcm0 referred to RX ground.
// Mode conversion (Hall & Heck, "Advanced Signal Integrity", ch. 7): skew τ turns common-mode noise into
//   differential noise of amplitude 2·Vn·sin(π f τ) and turns the differential edge into a common-mode spike of up
//   to a (one leg's swing) lasting ≈ τ.

export type DiffIn = { noise: number; skew: number; fn: number; kind: 'sine' | 'random'; vgnd: number; cmrr: number; a?: number; vcm?: number; tr?: number; nBits?: number; cmMin?: number; cmMax?: number };

export function dataBits(n: number) { // PRBS7 so patterns are rich but repeatable
  let s = 0x5a; const out: number[] = [];
  for (let i = 0; i < n; i++) { const b = ((s >> 6) ^ (s >> 5)) & 1; s = ((s << 1) | b) & 0x7f; out.push(b); }
  return out;
}

/** NRZ ±1 with raised-cosine transitions of 10–90-ish width tr (UI), transitions centred on bit boundaries. */
export function nrz(bits: number[], t: number, tr: number) {
  const k = Math.floor(t); const prev = (i: number) => (i < 0 ? 2 * bits[0] - 1 : i >= bits.length ? 2 * bits[bits.length - 1] - 1 : 2 * bits[i] - 1);
  const cur = prev(k);
  const dl = t - k; // distance from boundary k
  if (dl < tr / 2) { const p = prev(k - 1); const u = 0.5 + dl / tr; return p + (cur - p) * (0.5 - 0.5 * Math.cos(Math.PI * u)); }
  if (1 - dl < tr / 2) { const nx = prev(k + 1); const u = 0.5 - (1 - dl) / tr; return cur + (nx - cur) * (0.5 - 0.5 * Math.cos(Math.PI * u)); }
  return cur;
}

export function noiseFn(p: DiffIn) {
  if (p.kind === 'sine') return (t: number) => p.noise * Math.sin(2 * Math.PI * p.fn * t);
  // random-looking burst: sum of incommensurate tones, normalised to peak = noise over the window
  const f = [0.37, 0.71, 1.13, 1.61, 2.3].map(x => x * p.fn), ph = [0.3, 2.1, 4.0, 1.2, 5.5], w = [1, 0.8, 0.6, 0.5, 0.35];
  const raw = (t: number) => f.reduce((s, fi, i) => s + w[i] * Math.sin(2 * Math.PI * fi * t + ph[i]), 0);
  let mx = 0; for (let t = 0; t < (p.nBits ?? 32); t += 0.05) mx = Math.max(mx, Math.abs(raw(t)));
  return (t: number) => p.noise * raw(t) / (mx || 1);
}

export function simulate(p: DiffIn) {
  const a = p.a ?? 0.2, vcm = p.vcm ?? 1.2, tr = p.tr ?? 0.25, nB = p.nBits ?? 32;
  const cmMin = p.cmMin ?? 0.1, cmMax = p.cmMax ?? 2.4;
  const bits = dataBits(nB); const vn = noiseFn({ ...p, nBits: nB });
  const leak = 10 ** (-p.cmrr / 20);
  const at = (t: number) => {
    const P = vcm + a * nrz(bits, t - p.skew, tr) + vn(t - p.skew) + p.vgnd;
    const N = vcm - a * nrz(bits, t, tr) + vn(t) + p.vgnd;
    const cm = (P + N) / 2;
    return { P, N, diff: P - N + (cm - vcm) * leak, cm, se: P - vcm };
  };
  const step = 0.02; const t: number[] = [], P: number[] = [], N: number[] = [], D: number[] = [], CM: number[] = [], SE: number[] = [];
  for (let x = 0; x <= nB + 1e-9; x += step) { const v = at(x); t.push(x); P.push(v.P); N.push(v.N); D.push(v.diff); CM.push(v.cm); SE.push(v.se); }
  // decisions at the centre of each bit (shifted by half the skew, the best compromise)
  const dec: { t: number; bit: number; se: number; diff: number; seErr: boolean; dErr: boolean; cmBad: boolean }[] = [];
  let seErr = 0, dErr = 0, minSe = Infinity, minD = Infinity;
  for (let k = 1; k < nB; k++) {
    const tc = k + 0.5 + p.skew / 2; const v = at(tc); const want = bits[k] ? 1 : -1;
    const cmBad = v.cm < cmMin || v.cm > cmMax;
    const se = v.se * want, d = v.diff * want;
    const sE = se <= 0, dE = d <= 0 || cmBad;
    if (sE) seErr++; if (dE) dErr++;
    minSe = Math.min(minSe, se); minD = Math.min(minD, cmBad ? -Infinity : d);
    dec.push({ t: tc, bit: bits[k], se: v.se, diff: v.diff, seErr: sE, dErr: dE, cmBad });
  }
  let cmSpike = 0; for (let i = 0; i < t.length; i++) cmSpike = Math.max(cmSpike, Math.abs(CM[i] - vcm - vn(t[i] - p.skew / 2) - p.vgnd));
  return { t, P, N, D, CM, SE, dec, seErr, dErr, n: dec.length, minSe, minD, a, vcm, cmSpike, cmMin, cmMax, convAmp: p.kind === 'sine' ? 2 * p.noise * Math.abs(Math.sin(Math.PI * p.fn * p.skew)) : NaN };
}
