import assert from 'node:assert/strict';
import { ohm, powerForms, ratingFor } from '../../src/sims/models/ohms-law.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// 5 V across 1 kΩ -> 5 mA, 25 mW
let o = ohm({ solve: 'I', v: 5, i: 0, r: 1000 });
close(o.i, 5e-3); close(o.p, 25e-3); close(o.g, 1e-3);
// 2 mA through 4.7 kΩ -> 9.4 V
o = ohm({ solve: 'V', v: 0, i: 2e-3, r: 4700 });
close(o.v, 9.4); close(o.p, 18.8e-3);
// 12 V, 0.5 A -> 24 Ω, 6 W
o = ohm({ solve: 'R', v: 12, i: 0.5, r: 0 });
close(o.r, 24); close(o.p, 6);
// all three power forms agree
const pf = powerForms(9, 9 / 330, 330);
close(pf.vi, pf.i2r); close(pf.vi, pf.v2r); close(pf.vi, 81 / 330);
// edge cases: no NaN
o = ohm({ solve: 'I', v: 5, i: 0, r: 0 }); assert.equal(o.i, Infinity); assert.equal(o.ok, false);
o = ohm({ solve: 'R', v: 5, i: 0, r: 0 }); assert.equal(o.r, Infinity); assert.ok(!Number.isNaN(o.p));
// rating: 0.1 W with 2x margin -> 0.25 W part; 25 mW -> 1/8 W
assert.equal(ratingFor(0.1), 0.25); assert.equal(ratingFor(0.025), 0.125); assert.equal(ratingFor(20), null);
console.log('ohms-law model: all tests passed');
