import assert from 'node:assert/strict';
import { returnShape, returnDensity, fractionWithin, widthForFraction, returnPath, lPerMm, wEff, partialL, slotImpedance } from '../../src/sims/models/return-path.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-12, Math.abs(b)), `${a} != ${b}`);
// density: 1/(1+(x/h)^2): half peak at x = h
close(returnShape(0.2, 0.2), 0.5); close(returnShape(0, 0.2), 1);
close(returnDensity(0, 0.2, 1), 1 / (Math.PI * 0.2));
// integrates to I: numeric trapezoid over ±200h
let sum = 0; const h = 0.2, dx = 0.002; for (let x = -40; x < 40; x += dx) sum += returnDensity(x, h) * dx; assert.ok(Math.abs(sum - 1) < 0.01, String(sum));
// 50% within ±h; 90% within ±6.31h
close(fractionWithin(h, h), 0.5); close(widthForFraction(0.5, h), h); close(widthForFraction(0.9, h) / h, 6.3138, 1e-3);
// spreads linearly with h
close(widthForFraction(0.9, 0.4) / widthForFraction(0.9, 0.2), 2);
// solid-plane inductance: 0.3 mm trace, 0.2 mm height -> ~0.35 nH/mm
assert.ok(Math.abs(lPerMm(0.3, 0.2) * 1e9 - 0.348) < 0.02, String(lPerMm(0.3, 0.2) * 1e9)); assert.ok(wEff(0.3, 0.2) > 0.3);
// closer to plane -> lower inductance
assert.ok(lPerMm(0.3, 0.1) < lPerMm(0.3, 0.2));
// partial inductance of a 10 mm wire r=0.15 mm ~ 8.3 nH
assert.ok(Math.abs(partialL(10, 0.15) * 1e9 - 8.29) < 0.05);
const base = { h: 0.2, slot: false, slotLen: 20, fix: 'none' as const, fMHz: 100 };
const solid = returnPath(base); close(solid.emiPenaltyDb, 0); close(solid.loopAreaRel, 1); close(solid.noiseV, 0);
const slot = returnPath({ ...base, slot: true });
assert.ok(slot.blocked > 0.98); assert.ok(slot.Ltot > solid.Ltot); assert.ok(slot.emiPenaltyDb > 3); assert.ok(slot.noiseV > 0);
// longer slot -> more inductance; tiny slot (<< h) barely matters
assert.ok(returnPath({ ...base, slot: true, slotLen: 40 }).dLeff > slot.dLeff);
assert.ok(returnPath({ ...base, slot: true, slotLen: 0.05 }).dLeff < 0.1 * slot.dLeff);
// fixes reduce the penalty at 100 MHz
const cap = returnPath({ ...base, slot: true, fix: 'stitch-cap' }), via = returnPath({ ...base, slot: true, fix: 'via-bridge' });
assert.ok(cap.dLeff < slot.dLeff && via.dLeff < slot.dLeff); assert.ok(cap.emiPenaltyDb < slot.emiPenaltyDb);
// stitch cap is useless at DC-ish low frequencies (high impedance) and effective near 100 MHz
const lo = returnPath({ ...base, slot: true, fix: 'stitch-cap', fMHz: 0.1 });
assert.ok(lo.dLeff > 0.9 * returnPath({ ...base, slot: true, fMHz: 0.1 }).dLeff);
assert.ok(Number.isFinite(slotImpedance({ ...base, slot: true, fix: 'stitch-cap' }, 1e9)));
// radiation grows as slot length grows; no NaN with edge values
assert.ok(Number.isFinite(returnPath({ h: 0.05, slot: true, slotLen: 1, fix: 'none', fMHz: 1000 }).Ltot));
console.log('return-path model: all tests passed');
