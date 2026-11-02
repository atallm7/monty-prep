import assert from 'node:assert/strict';
import { P, DT, findTrigger, acquire, initAcq, clean, instability, recordLen } from '../../src/sims/models/scope-trigger.ts';
import type { TrigCfg, AcqCfg } from '../../src/sims/models/scope-trigger.ts';
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b}`);
const edge = (level: number, slope: 'rising' | 'falling', hyst = 0): TrigCfg => ({ type: 'edge', level, slope, hyst, width: 50e-6, runtLo: 0.2, runtHi: 0.7 });
const phase = (k: number) => ((k * DT) % P + P) % P;

// Clean sine, level 0.5: rising crossing at asin(0.5)/2π = 1/12 period, falling at 5/12
const kr = findTrigger('sine', 0, edge(0.5, 'rising'), 10, 5000);
near(phase(kr), P / 12, DT, 'rising phase');
const kf = findTrigger('sine', 0, edge(0.5, 'falling'), 10, 5000);
near(phase(kf), 5 * P / 12, DT, 'falling phase');
// Level outside the signal range → no trigger at all
assert.equal(findTrigger('sine', 0, edge(1.5, 'rising'), 0, 20000), -1);

// Normal mode with no valid trigger keeps waiting (no new records); auto mode free-runs
const base: AcqCfg = { kind: 'sine', noise: 0, trig: edge(1.5, 'rising'), enabled: true, mode: 'normal', holdoff: 0, tdiv: 0.2e-3 };
let st = initAcq(); for (let i = 0; i < 5; i++) st = acquire(st, base);
assert.equal(st.records.length, 0); assert.equal(st.status, 'Ready');
st = initAcq(); for (let i = 0; i < 5; i++) st = acquire(st, { ...base, mode: 'auto' });
assert.equal(st.records.length, 5); assert.equal(st.status, 'Auto');

// Triggered sine: every sweep starts at the same phase → stable (instability ≈ 0); untriggered rolls
const n = recordLen(0.2e-3);
st = initAcq(); for (let i = 0; i < 8; i++) st = acquire(st, { ...base, trig: edge(0.5, 'rising') });
for (const r of st.records) near(phase(r.trigAt), P / 12, DT);
assert.ok(instability('sine', st.records, n) < 0.02);
let fr = initAcq(); for (let i = 0; i < 8; i++) fr = acquire(fr, { ...base, enabled: false });
assert.ok(instability('sine', fr.records, n) > 0.3, 'free-run should roll');

// Burst of 3 pulses: without holdoff the trigger walks through the pulses; holdoff > burst length locks to pulse 1
const bcfg: AcqCfg = { kind: 'burst', noise: 0, trig: edge(0.5, 'rising'), enabled: true, mode: 'normal', holdoff: 0, tdiv: 0.2e-3 };
let b0 = initAcq(); for (let i = 0; i < 9; i++) b0 = acquire(b0, bcfg);
const ph0 = new Set(b0.records.map(r => Math.round(phase(r.trigAt) / 1e-4)));
assert.ok(ph0.size > 1, 'no holdoff: triggers on different pulses');
let b1 = initAcq(); for (let i = 0; i < 9; i++) b1 = acquire(b1, { ...bcfg, holdoff: 1.5e-3 });
const ph1 = b1.records.slice(1).map(r => phase(r.trigAt));
for (const p of ph1) near(p, 2.5e-6, 4e-6, 'holdoff locks to first pulse');

// Runt trigger fires only on the runt pulse (every 5th period, height 0.45)
const rt: TrigCfg = { type: 'runt', level: 0.5, slope: 'rising', hyst: 0, width: 0, runtLo: 0.2, runtHi: 0.7 };
let k = 0; const hits: number[] = [];
for (let i = 0; i < 4; i++) { k = findTrigger('runt', 0, rt, k + 1, k + 20000); hits.push(Math.floor(k * DT / P)); }
for (const h of hits) assert.equal(((h % 5) + 5) % 5, 2);
assert.ok(clean('runt', 2 * P + 1e-4) < 0.5 && clean('runt', 1 * P + 1e-4) === 1);
// Glitch trigger (< 50 µs) ignores the 500 µs square half-cycles and finds the 20 µs glitch (every 7th period)
const gl: TrigCfg = { type: 'glitch', level: 0.5, slope: 'rising', hyst: 0, width: 50e-6, runtLo: 0.2, runtHi: 0.7 };
const kg = findTrigger('glitch', 0, gl, 0, 40000);
assert.equal(Math.floor(kg * DT / P) % 7, 3); near(phase(kg), 0.75e-3 + 18e-6, 6e-6);

// Noise: with no hysteresis a noisy sine also fires on the wrong (falling) slope; hysteresis rejects it
const wrongSlope = (h: number) => { let c = 0, kk = 0; for (let i = 0; i < 200; i++) { kk = findTrigger('sine', 0.1, edge(0, 'rising', h), kk + 1, kk + 50000); if (Math.cos(2 * Math.PI * phase(kk) / P) < 0) c++; } return c; };
assert.ok(wrongSlope(0) > 5, `expected false triggers without hysteresis: ${wrongSlope(0)}`);
assert.equal(wrongSlope(0.6), 0);
console.log('scope-trigger model: all tests passed', { falseNoHyst: wrongSlope(0) });
