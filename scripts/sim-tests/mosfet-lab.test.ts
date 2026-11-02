import assert from 'node:assert/strict';
import { drainCurrent, smallSignal, loadLinePoint, triodeEdgeVgs, outputFamily, satBoundary } from '../../src/sims/models/mosfet-lab.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const rel = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);

// Textbook NMOS: Vt = 1 V, k'W/L = 200 µA/V² × 10 = 2 mA/V², λ = 0
const n0 = { type: 'nmos' as const, vt: 1, k: 200e-6, wl: 10, lambda: 0 };
// Saturation: Id = ½·2m·(3−1)² = 4 mA
let r = drainCurrent(n0, 3, 5);
rel(r.id, 4e-3, 1e-12, 'Id_sat'); assert.equal(r.region, 'saturation');
// Triode at Vds = 1: Id = 2m·(2·1 − ½) = 3 mA
r = drainCurrent(n0, 3, 1);
rel(r.id, 3e-3, 1e-12, 'Id_triode'); assert.equal(r.region, 'triode');
// Boundary exactly at Vds = Vgs − Vt = 2 V: both formulas give 4 mA (continuity)
r = drainCurrent(n0, 3, 2);
rel(r.id, 4e-3, 1e-12, 'boundary'); assert.equal(r.region, 'saturation');
rel(drainCurrent(n0, 3, 2 - 1e-9).id, 4e-3, 1e-6, 'continuity from triode side');
assert.equal(drainCurrent(n0, 3, 1.999).region, 'triode');
// Cut-off
assert.equal(drainCurrent(n0, 0.99, 5).id, 0); assert.equal(drainCurrent(n0, 1, 5).region, 'cutoff');
// Small signal: gm = β·Vov = 4 mS = 2·Id/Vov; Ron (deep triode) = 1/(β·Vov) = 250 Ω
const ss = smallSignal(n0, 3, 5);
rel(ss.gm, 4e-3, 1e-12, 'gm'); rel(ss.ron, 250, 1e-12, 'Ron'); assert.equal(ss.ro, Infinity);
// Symmetric device: reversed Vds gives negative current of the swapped device
rel(drainCurrent(n0, 3, -0.1).id, -drainCurrent(n0, 3.1, 0.1).id, 1e-12, 'source/drain swap');

// Channel-length modulation, λ = 0.02: Id = 4 mA·(1 + 0.02·5) = 4.4 mA; ro = 1/(λ·Id0) = 12.5 kΩ
const n1 = { ...n0, lambda: 0.02 };
rel(drainCurrent(n1, 3, 5).id, 4.4e-3, 1e-12, 'Id with λ');
rel(smallSignal(n1, 3, 5).ro, 12500, 1e-12, 'ro');
rel(smallSignal(n1, 3, 5).gm, Math.sqrt(2 * 2e-3 * 4.4e-3 * 1.1), 1e-9, 'gm = sqrt(2β Id (1+λVds))');
// output slope in saturation = 1/ro (exactly, since linear in Vds)
rel((drainCurrent(n1, 3, 6).id - drainCurrent(n1, 3, 4).id) / 2, 1 / 12500, 1e-9, 'slope = 1/ro');

// PMOS sign convention: |Vtp| = 1, Vgs = −3, Vds = −5 → Id = −4 mA (current flows out of the drain)
const p0 = { ...n0, type: 'pmos' as const };
r = drainCurrent(p0, -3, -5);
rel(r.id, -4e-3, 1e-12, 'PMOS Id'); assert.equal(r.region, 'saturation');
r = drainCurrent(p0, -3, -1);
rel(r.id, -3e-3, 1e-12, 'PMOS triode'); assert.equal(r.region, 'triode');
assert.equal(drainCurrent(p0, 3, -5).id, 0, 'PMOS off with positive Vgs');
assert.equal(drainCurrent(p0, -0.5, -5).region, 'cutoff');
// PMOS family = NMOS family with both axes negated
const fn = outputFamily(n1, [2, 3], 5), fp = outputFamily({ ...n1, type: 'pmos' }, [2, 3], 5);
fn.forEach((c, i) => c.y.forEach((y, j) => close(fp[i].y[j], -y, 1e-15, 'pmos mirror')));
const sb = satBoundary(n1, 4); rel(sb.y.at(-1)!, 0.5 * 2e-3 * 16 * 1.08, 1e-12, 'sat boundary locus');

// Load line (VDD = 10 V, RD = 1 kΩ, Vgs = 3, λ = 0): Id = 4 mA, Vds = 6 V (saturated since 6 > 2)
let op = loadLinePoint(n0, 3, 10, 1000);
rel(op.id, 4e-3, 1e-9, 'loadline Id'); close(op.vds, 6, 1e-8, 'loadline Vds'); assert.equal(op.region, 'saturation');
// Vgs = 5: triode. Solve 10 − 1k·2m(4V − V²/2) = V → V² − 9V + 10 = 0 → V = (9 − √41)/2
op = loadLinePoint(n0, 5, 10, 1000);
close(op.vds, (9 - Math.sqrt(41)) / 2, 1e-9, 'triode Q-point'); assert.equal(op.region, 'triode');
// cut-off: Vds = VDD
op = loadLinePoint(n0, 0.5, 10, 1000); close(op.vds, 10, 1e-12, 'cutoff Vds'); assert.equal(op.id, 0);
// Saturation→triode edge on this load line: Vov² + Vov − 10 = 0 → Vgs = 1 + (−1 + √41)/2 ≈ 3.70 V
close(triodeEdgeVgs(n0, 10, 1000), 1 + (-1 + Math.sqrt(41)) / 2, 1e-9, 'triode edge Vgs');
// PMOS high-side: same numbers with signs flipped
op = loadLinePoint(p0, -3, 10, 1000); rel(op.id, -4e-3, 1e-9, 'pmos loadline Id'); close(op.vds, -6, 1e-8, 'pmos Vds');
// no NaN for degenerate inputs
for (const v of [loadLinePoint(n0, 3, 0, 1000), loadLinePoint(n0, 3, 10, 0), loadLinePoint({ ...n0, wl: 0 }, 3, 10, 1e3)])
  assert.ok(Number.isFinite(v.id) && Number.isFinite(v.vds), 'finite');
console.log('mosfet-lab: all tests passed');
