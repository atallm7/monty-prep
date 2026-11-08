// Manufacturing test funnel.
// Williams-Brown defect level:  DL = 1 − Y^(1−T),  T = total fault coverage, Y = process yield.
// Independent stages with coverages c_i: T = 1 − Π(1 − c_i).
// After stage i the defective fraction of the lot is DL_i = 1 − Y^(1−T_i) (T_0 = 0 → DL_0 = 1−Y), so the boards
// caught at stage i are N·(DL_{i−1} − DL_i). All caught boards are repaired and shipped (repair cost, rule of ten).
// Rule of ten: fixing a defect costs ~10× more at each later stage; the field failure cost is the anchor (fieldCost),
// the last enabled stage costs fieldCost/10 per repair, the previous one /100, etc.
export type StageKey = 'aoi' | 'ict' | 'fct' | 'burnin';
export const STAGES: { key: StageKey; name: string; cost: number; fixedCov?: number }[] = [
  { key: 'aoi', name: 'AOI', cost: 0.4 },
  { key: 'ict', name: 'ICT / flying probe', cost: 1.5 },
  { key: 'fct', name: 'Functional (FCT)', cost: 3 },
  { key: 'burnin', name: 'Burn-in', cost: 10, fixedCov: 0.7 },
];
export const BURNIN_COV = 0.7;

export const williamsBrown = (Y: number, T: number) => (Y <= 0 ? 1 : 1 - Math.pow(Y, 1 - Math.min(1, Math.max(0, T))));
export const totalCoverage = (covs: number[]) => 1 - covs.reduce((a, c) => a * (1 - Math.min(1, Math.max(0, c))), 1);

export type YIn = { Y: number; aoi: number; ict: number; fct: number; burnin: boolean; fieldCost: number; N?: number };
export function yieldModel(p: YIn) {
  const N = p.N ?? 10000;
  const Y = Math.min(1, Math.max(0.001, p.Y));
  const covs: Record<StageKey, number> = { aoi: p.aoi, ict: p.ict, fct: p.fct, burnin: p.burnin ? BURNIN_COV : 0 };
  const active = STAGES.filter(s => covs[s.key] > 0);
  const nAct = active.length;
  let T = 0, remaining = N * (1 - Y);
  const startDefective = remaining;
  const rows = STAGES.map(s => {
    const c = covs[s.key];
    const on = c > 0;
    const before = remaining;
    let caught = 0;
    if (on) { T = 1 - (1 - T) * (1 - c); const after = N * williamsBrown(Y, T); caught = before - after; remaining = after; }
    const idx = active.findIndex(a => a.key === s.key);
    const repairCost = on ? p.fieldCost / Math.pow(10, nAct - idx) : 0; // last stage /10, previous /100 ...
    return { ...s, cov: c, on, tested: on ? N : 0, before, caught, after: remaining, testCost: on ? N * s.cost : 0, repairCostEach: repairCost, repairCost: caught * repairCost, cumT: T };
  });
  const DL = williamsBrown(Y, T);
  const escapes = N * DL;
  const testCost = rows.reduce((a, r) => a + r.testCost, 0);
  const repairCost = rows.reduce((a, r) => a + r.repairCost, 0);
  const fieldCostTotal = escapes * p.fieldCost;
  const noTestField = startDefective * p.fieldCost; // every defect escapes
  return { N, Y, T, DL, dppm: DL * 1e6, escapes, startDefective, rows, testCost, repairCost, fieldCostTotal, total: testCost + repairCost + fieldCostTotal, noTestField, perBoard: (testCost + repairCost + fieldCostTotal) / N };
}
