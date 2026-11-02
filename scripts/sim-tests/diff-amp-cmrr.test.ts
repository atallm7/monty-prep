import assert from 'node:assert/strict';
import { gains, waveforms } from '../../src/sims/models/diff-amp-cmrr.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} != ${b}`);
// perfectly matched: Ad = G, Acm = 0, CMRR infinite
let g = gains({ gain: 10, mismatch: 0, mode: 'single' });
close(g.ad, 10, 1e-12, 'Ad'); assert.ok(Math.abs(g.acm) < 1e-12); assert.equal(g.cmrr, Infinity);
// 1 % on one resistor, G = 10: Acm ≈ Gε/(1+G) = 0.00909, CMRR ≈ (1+G)/ε = 1100 → 60.8 dB
g = gains({ gain: 10, mismatch: 0.01, mode: 'single' });
close(g.acm, 10 * 0.01 / 11, 0.02, 'Acm'); close(g.cmrr, 1100, 0.02, 'CMRR'); close(g.cmrrDb, 60.8, 0.005, 'CMRR dB');
// worst case 0.1 % tolerance, G = 1: CMRR ≈ 2/(0.004) = 500 → 54 dB (classic textbook number)
g = gains({ gain: 1, mismatch: 0.001, mode: 'worst' });
close(g.cmrr, 500, 0.01, 'worst case'); close(g.cmrrDb, 54, 0.005);
// exact superposition check of vo = R4/(R3+R4)(1+R2/R1)·V2 − R2/R1·V1 with Vd = 0, Vcm = 1 → vo = Acm
const w = waveforms({ gain: 10, mismatch: 0.01, mode: 'single', vd: 0, vcm: 0, vdc: 1 }, 10);
close(w.vo[3], g.acm === 0 ? 0 : gains({ gain: 10, mismatch: 0.01, mode: 'single' }).acm, 1e-12, 'DC CM output');
// differential only, matched: vo = G·vd
const w2 = waveforms({ gain: 5, mismatch: 0, mode: 'single', vd: 0.1, vcm: 1 }, 50);
for (let i = 0; i < 50; i++) close(w2.vo[i] + 1e-30, w2.ideal[i] + 1e-30, 1e-9, 'matched output equals G·vd');
console.log('diff-amp-cmrr model: all tests passed');
