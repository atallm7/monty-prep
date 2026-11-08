// Trace & via current capacity.
// IPC-2221 (empirical, from the IPC-2221 / 2221A curves):  I = k · ΔT^0.44 · A^0.725
//   I in A, ΔT in °C, A = cross-section in mil² (1 mil = 25.4 µm), k = 0.048 external, 0.024 internal.
// Inverse:  A = ( I / (k · ΔT^0.44) )^(1/0.725)
// Copper thickness: 1 oz/ft² = 1.378 mil = 34.99 µm.
// Resistance: R = ρ(T)·L/(w·t), ρ(T) = ρ20·(1 + α(T − 20)), ρ20 = 1.724e-8 Ω·m, α = 0.00393 /°C.
export type Layer = 'external' | 'internal';
export const MIL_MM = 0.0254;
export const OZ_MIL = 1.378;
export const kLayer = (l: Layer) => (l === 'external' ? 0.048 : 0.024);

export const areaMil2 = (wMm: number, oz: number) => (wMm / MIL_MM) * (oz * OZ_MIL);

export function ipcCurrent(wMm: number, oz: number, layer: Layer, dT: number): number {
  if (!(wMm > 0) || !(oz > 0) || !(dT > 0)) return 0;
  return kLayer(layer) * Math.pow(dT, 0.44) * Math.pow(areaMil2(wMm, oz), 0.725);
}
export function ipcWidthMm(I: number, oz: number, layer: Layer, dT: number): number {
  if (!(I > 0) || !(oz > 0) || !(dT > 0)) return 0;
  const A = Math.pow(I / (kLayer(layer) * Math.pow(dT, 0.44)), 1 / 0.725);
  return (A / (oz * OZ_MIL)) * MIL_MM;
}
/** Copper resistivity (Ω·m) at temperature T (°C). */
export const rhoCu = (tC: number) => 1.724e-8 * (1 + 0.00393 * (tC - 20));

/** Trace DC resistance, voltage drop and loss at current I over lenMm, at ambient + dT. */
export function traceElectrical(wMm: number, oz: number, lenMm: number, I: number, dT: number, ambient = 25) {
  const t = oz * OZ_MIL * MIL_MM * 1e-3; // m
  const w = wMm * 1e-3, L = lenMm * 1e-3;
  const R = w > 0 ? (rhoCu(ambient + dT) * L) / (w * t) : Infinity;
  const R20 = w > 0 ? (rhoCu(20) * L) / (w * t) : Infinity;
  return { R, R20, vdrop: I * R, p: I * I * R, tMm: t * 1e3 };
}

/** Via barrel: plated annulus area A = π·t·(D − t) for finished hole diameter D, plating thickness t. */
export function viaCapacity(drillMm: number, platingUm: number, dT: number, layer: Layer = 'external') {
  const t = platingUm * 1e-3; // mm
  const D = drillMm;
  const aMm2 = D > t ? Math.PI * t * (D - t) : 0;
  const aMil2 = aMm2 / (MIL_MM * MIL_MM);
  const I = aMil2 > 0 ? kLayer(layer) * Math.pow(dT, 0.44) * Math.pow(aMil2, 0.725) : 0;
  return { aMm2, aMil2, I };
}
