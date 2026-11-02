// DMM measurement artifacts.
// loading: source Vs with Thevenin resistance Rs measured by a meter with input resistance Rin (10 MOhm typical):
//          Vread = Vs * Rin/(Rs + Rin);  error = -Rs/(Rs + Rin).
// burden:  in current mode the meter inserts a shunt Rsh (+ fuse) in series: Imeas = Vs/(Rload + Rsrc + Rsh);
//          true current (meter removed) I0 = Vs/(Rload + Rsrc);  error = -Rsh/(Rload + Rsrc + Rsh);  burden voltage Vb = Imeas*Rsh.
// 4wire:   2-wire: Rread = Rdut + 2 Rlead + 2 Rcontact (the test current also flows in the leads).
//          4-wire (Kelvin): force current through the outer leads, sense Vdut with separate leads into the high-Z voltmeter (Rin);
//          the sense leads form a divider with Rin: Vsense = Vdut * Rin/(Rin + 2 Rsense), so Rread = Rdut * Rin/(Rin + 2 Rsense) ~ Rdut.
//          Lead and contact resistance in the force path drop no voltage inside the sense loop, so they do not matter.
export const par = (a: number, b: number) => (a * b) / (a + b);

export function loading(vs: number, rs: number, rin: number) {
  const vread = vs * rin / (rs + rin);
  return { vread, err: vread / vs - 1, errAbs: vread - vs, i: vs / (rs + rin), rth: rs, ratio: rin / (rs + rin) };
}
/** Source resistance at which the reading is off by fraction e (e.g. 0.01): Rs = Rin * e/(1-e). */
export const rsForError = (rin: number, e: number) => rin * e / (1 - e);

export type Range = { id: string; label: string; full: number; rsh: number };
export const RANGES: Range[] = [
  { id: '200u', label: '200 µA', full: 200e-6, rsh: 1000 },
  { id: '20m', label: '20 mA', full: 20e-3, rsh: 10 },
  { id: '200m', label: '200 mA', full: 200e-3, rsh: 1.0 },
  { id: '10a', label: '10 A', full: 10, rsh: 0.03 },
];
export function burden(vs: number, rload: number, rsrc: number, rsh: number, full: number) {
  const i0 = vs / (rload + rsrc), im = vs / (rload + rsrc + rsh), vb = im * rsh;
  return { i0, im, err: im / i0 - 1, vb, over: im > full * 1.0, pshunt: im * im * rsh, rsrcTotal: rload + rsrc, rshMax: (e: number) => (rload + rsrc) * e / (1 - e) };
}

export function fourWire(rdut: number, rlead: number, rcontact: number, itest: number, rin: number, rsense: number) {
  const r2 = rdut + 2 * rlead + 2 * rcontact;
  const v2 = itest * r2;
  // Kelvin: force current I through the DUT; voltmeter across the DUT through the sense leads (divider with Rin)
  const vdut = itest * rdut;
  const vsense = vdut * rin / (rin + 2 * rsense);
  const r4 = vsense / itest;
  return { r2, v2, e2: r2 / rdut - 1, r4, v4: vsense, e4: r4 / rdut - 1, vdut, vleads: itest * (2 * rlead + 2 * rcontact), pdut: itest * itest * rdut };
}
