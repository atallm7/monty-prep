// Voltage divider model. Vout = Vin·(R2‖RL)/(R1 + R2‖RL); Thevenin: Vth = Vin·R2/(R1+R2), Rth = R1‖R2.
export type DividerIn = { vin: number; r1: number; r2: number; rl: number; load: boolean };
export const par = (a: number, b: number) => (a * b) / (a + b);
export function divider({ vin, r1, r2, rl, load }: DividerIn) {
  const r2eff = load ? par(r2, rl) : r2;
  const vout = (vin * r2eff) / (r1 + r2eff);
  const vUnloaded = (vin * r2) / (r1 + r2);
  const i1 = vin / (r1 + r2eff);
  const rth = par(r1, r2);
  return { vout, vUnloaded, i1, rth, p1: i1 * i1 * r1, p2: (vout * vout) / r2, pl: load ? (vout * vout) / rl : 0, err: (vout - vUnloaded) / vUnloaded };
}
