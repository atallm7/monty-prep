// Doping, carrier statistics and conductivity (non-degenerate, full ionization).
//
//  Intrinsic density, anchored to the measured value at 300 K:
//    ni(T) = ni(300)·(T/300)^{3/2}·exp( −Eg(T)/(2kT) + Eg(300)/(2k·300) )      [ni ∝ sqrt(NcNv)·exp(−Eg/2kT), Nc,Nv ∝ T^{3/2}]
//    Eg(T) = Eg0 − αT²/(T + β)                                                 [Varshni]
//  Carriers with net doping N = Nd − Na (charge neutrality n + Na = p + Nd and mass action n·p = ni²):
//    N > 0:  n = N/2 + sqrt((N/2)² + ni²),  p = ni²/n
//    N < 0:  p = |N|/2 + sqrt((N/2)² + ni²), n = ni²/p
//  Mobility (Caughey–Thomas, lattice term scaled with T):
//    µ(Ntot, T) = µmin + (µmax·(T/300)^{−γ} − µmin) / (1 + (Ntot/Nref)^α),   Ntot = Nd + Na (ionized-impurity scattering)
//  Conductivity σ = q(n·µn + p·µp),  resistivity ρ = 1/σ.
// Parameters: Si (Masetti 1983 / Sze), Ge (Sze), GaAs (Sotoodeh 2000), 4H-SiC (Roschke & Schwierz 2001), GaN (Mnatsakanov 2003),
// representative values. SiC/GaN dopants are deep and not fully ionized at 300 K (we assume full ionization; see note in UI).

export const Q = 1.602176634e-19;
export const KB_EV = 8.617333262e-5; // eV/K

export type MaterialId = 'si' | 'ge' | 'gaas' | 'sic' | 'gan';
type Mob = { max: number; min: number; nref: number; alpha: number; gamma: number };
export type Material = { id: MaterialId; name: string; ni300: number; eg0: number; a: number; b: number; mn: Mob; mp: Mob; note: string };

export const MATERIALS: Record<MaterialId, Material> = {
  si: { id: 'si', name: 'Silicon', ni300: 1.0e10, eg0: 1.170, a: 4.73e-4, b: 636, mn: { max: 1414, min: 68.5, nref: 9.2e16, alpha: 0.711, gamma: 2.5 }, mp: { max: 470.5, min: 44.9, nref: 2.23e17, alpha: 0.719, gamma: 2.2 }, note: 'Workhorse of ICs: µn ≈ 3× µp' },
  ge: { id: 'ge', name: 'Germanium', ni300: 2.0e13, eg0: 0.7437, a: 4.774e-4, b: 235, mn: { max: 3900, min: 150, nref: 1e17, alpha: 0.55, gamma: 1.66 }, mp: { max: 1900, min: 50, nref: 1e17, alpha: 0.55, gamma: 2.33 }, note: 'Narrow gap: ni is 2000× silicon, so it goes intrinsic at much lower T' },
  gaas: { id: 'gaas', name: 'GaAs', ni300: 2.1e6, eg0: 1.519, a: 5.405e-4, b: 204, mn: { max: 9400, min: 500, nref: 6e16, alpha: 0.394, gamma: 2.1 }, mp: { max: 491.5, min: 20, nref: 1.48e17, alpha: 0.38, gamma: 2.2 }, note: 'Very light electrons: µn ≈ 20× µp (RF HEMTs, HBTs)' },
  sic: { id: 'sic', name: '4H-SiC', ni300: 5e-9, eg0: 3.265, a: 6.5e-4, b: 1300, mn: { max: 950, min: 40, nref: 1.94e17, alpha: 0.61, gamma: 2.4 }, mp: { max: 124, min: 15.9, nref: 1.76e19, alpha: 0.34, gamma: 2.15 }, note: 'Wide gap: ni is astronomically small, works hot and at kV (power MOSFETs)' },
  gan: { id: 'gan', name: 'GaN', ni300: 1.9e-10, eg0: 3.47, a: 7.7e-4, b: 600, mn: { max: 1000, min: 55, nref: 2e17, alpha: 1.0, gamma: 1.5 }, mp: { max: 170, min: 3, nref: 3e17, alpha: 2.0, gamma: 5.0 }, note: 'Wide gap + high electron mobility (HEMTs, fast chargers); p-type is hard' },
};

export const egAt = (m: Material, T: number) => m.eg0 - (m.a * T * T) / (T + m.b);

export function niAt(m: Material, T: number) {
  const t = Math.max(T, 1);
  return m.ni300 * Math.pow(t / 300, 1.5) * Math.exp(-egAt(m, t) / (2 * KB_EV * t) + egAt(m, 300) / (2 * KB_EV * 300));
}

export function mobility(mb: Mob, ntot: number, T: number) {
  const max = mb.max * Math.pow(T / 300, -mb.gamma);
  const min = Math.min(mb.min, max);
  return min + (max - min) / (1 + Math.pow(Math.max(ntot, 0) / mb.nref, mb.alpha));
}

/** n, p from net doping and ni, numerically stable for any sign/magnitude. */
export function carriers(nd: number, na: number, ni: number) {
  const N = nd - na; const h = Math.abs(N) / 2;
  const maj = h + Math.sqrt(h * h + ni * ni); // avoids cancellation
  const min = (ni * ni) / maj;
  return N >= 0 ? { n: maj, p: min } : { n: min, p: maj };
}

export type DopIn = { material: MaterialId; nd: number; na: number; t: number };
export function doping({ material, nd, na, t }: DopIn) {
  const m = MATERIALS[material];
  const ND = Math.max(0, nd), NA = Math.max(0, na);
  const ni = niAt(m, t);
  const { n, p } = carriers(ND, NA, ni);
  const ntot = ND + NA;
  const un = mobility(m.mn, ntot, t), up = mobility(m.mp, ntot, t);
  const sigN = Q * n * un, sigP = Q * p * up;
  const sigma = sigN + sigP;
  const type = n > 1.01 * p ? 'n' : p > 1.01 * n ? 'p' : 'i';
  // Fermi level relative to intrinsic level: EF − Ei = kT·ln(n/ni)
  const efi = KB_EV * t * Math.log(n / ni);
  return { m, ni, n, p, un, up, sigma, rho: 1 / sigma, sigN, sigP, type, eg: egAt(m, t), efi, intrinsicish: ni > 0.1 * Math.abs(ND - NA) };
}

/** Same doping N as pure n-type vs pure p-type: why NMOS/n-type is lower resistance. */
export function nVsP(material: MaterialId, N: number, t: number) {
  const a = doping({ material, nd: N, na: 0, t }), b = doping({ material, nd: 0, na: N, t });
  return { rhoN: a.rho, rhoP: b.rho, ratio: b.rho / a.rho, un: a.un, up: b.up };
}

/** Temperature at which ni equals |Nd − Na| (onset of intrinsic behaviour), by bisection on log ni. */
export function intrinsicTemp(material: MaterialId, Nnet: number) {
  const m = MATERIALS[material];
  let lo = 50, hi = 3000;
  if (niAt(m, hi) < Nnet) return Infinity;
  if (niAt(m, lo) > Nnet) return lo;
  for (let i = 0; i < 80; i++) { const mid = 0.5 * (lo + hi); if (niAt(m, mid) < Nnet) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}
