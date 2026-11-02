import assert from 'node:assert/strict';
import { divider } from '../../src/sims/models/divider.ts';
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
close(divider({ vin: 9, r1: 6000, r2: 3000, rl: 1, load: false }).vout, 3);
const r = divider({ vin: 12, r1: 10000, r2: 10000, rl: 10000, load: true });
close(r.vout, 4); close(r.rth, 5000);
// Thevenin loading error = Rth/(Rth+RL)
const t = divider({ vin: 10, r1: 1000, r2: 1000, rl: 5000, load: true });
close(-t.err, 500 / (500 + 5000));
console.log('divider model: all tests passed');
