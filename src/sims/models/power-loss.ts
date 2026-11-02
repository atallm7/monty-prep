// Transmission loss model. A load must receive power P; wiring has total (go + return) resistance Rw.
// Current is set by the load: I = P / V_load. Loss in the wire is Joule heating P_loss = I²·Rw (the current
// flows THROUGH the wire). The voltage ACROSS the wire is only ΔV = I·Rw, so P_loss = ΔV²/Rw as well.
// The classic mistake: plugging the transmission voltage V into V²/R as if V were across the wire.
//
// Two conventions for "transmission voltage":
//  - 'load':   V is the voltage at the load. I = P/V, Vs = V + I·Rw.
//  - 'source': V is the sending-end voltage. KVL + load power:  V·I − I²·Rw = P  →
//              I = (V − √(V² − 4·P·Rw)) / (2·Rw)   (the low-current, high-efficiency root).
//              No real solution if V² < 4·P·Rw: P exceeds the maximum power transfer V²/(4·Rw).
export type Mode = 'load' | 'source';
export type LossIn = { p: number; rw: number; v: number; mode?: Mode };
export type LossOut = {
  feasible: boolean; i: number; vLoad: number; vSource: number; dv: number;
  pLoss: number; pIn: number; eff: number; rLoad: number; wrongLoss: number; pMax: number;
};

export function transmit({ p, rw, v, mode = 'load' }: LossIn): LossOut {
  const pMax = rw > 0 ? (v * v) / (4 * rw) : Infinity; // max deliverable power for a fixed source voltage
  const wrongLoss = rw > 0 ? (v * v) / rw : Infinity; // the WRONG "V²/R" using transmission voltage
  let i: number, vLoad: number, vSource: number, feasible = true;
  if (p <= 0 || v <= 0) {
    i = 0; vLoad = Math.max(v, 0); vSource = Math.max(v, 0);
    if (v <= 0 && p > 0) feasible = false;
  } else if (mode === 'load') {
    i = p / v; vLoad = v; vSource = v + i * rw;
  } else {
    const disc = v * v - 4 * p * rw;
    if (disc < 0) { feasible = false; i = rw > 0 ? v / (2 * rw) : 0; vSource = v; vLoad = v - i * rw; }
    else {
      // numerically stable small root: I = 2P / (V + √disc)
      i = rw > 0 ? (2 * p) / (v + Math.sqrt(disc)) : p / v;
      vSource = v; vLoad = v - i * rw;
    }
  }
  const dv = i * rw;
  const pLoss = i * i * rw;
  const pDel = feasible ? p : vLoad * i;
  const pIn = pDel + pLoss;
  const eff = pIn > 0 ? pDel / pIn : 1;
  const rLoad = i > 0 ? vLoad / i : Infinity;
  return { feasible, i, vLoad, vSource, dv, pLoss, pIn, eff, rLoad, wrongLoss, pMax };
}

/** Ratio of losses when transmission voltage is scaled by k at fixed P (load convention): 1/k². */
export function lossScale(k: number) { return 1 / (k * k); }
