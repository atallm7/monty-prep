import assert from 'node:assert/strict';
import { simulate, metrics, judge, PRESETS, DT, T_AMB, ZONE_LEN } from '../../src/sims/models/reflow-profile.ts';
// First-order step response: single long zone at 200 C, tau = 20 s, T(tau) = Tamb + 0.632 (Tair - Tamb) once air has settled
const flat = simulate({ zones: [200], speed: 1, tauSmall: 20, tauLarge: 60 }); // very slow -> one very long zone
const iAt = (t: number) => Math.round(t / DT);
// at t >> tau_air the part follows exp(); check asymptote and monotonic rise
assert.ok(Math.abs(flat.small[iAt(600)] - 200) < 1, `${flat.small[iAt(600)]}`);
assert.ok(flat.small.slice(0, iAt(600)).every((v, i, a) => i === 0 || v >= a[i - 1] - 1e-9));
assert.ok(Math.abs(flat.small[0] - T_AMB) < 0.5);
// bigger tau lags
assert.ok(flat.large[iAt(60)] < flat.small[iAt(60)]);
// exact exponential check against analytic with ideal air (tau_air small relative to 600s): T(5tau)=Tamb+(1-e^-5)·175 within 3 C of lag effect
const T100 = flat.small[iAt(100)]; assert.ok(Math.abs(T100 - (200 - 175 * Math.exp(-100 / 20))) < 3, `${T100}`);
// slower conveyor => more time in oven => hotter peak
const base = PRESETS.good;
const slow = simulate({ ...base, speed: 50 }), norm = simulate(base);
assert.ok(metrics(slow.t, slow.small).peak > metrics(norm.t, norm.small).peak);
assert.ok(Math.abs(norm.zoneT - ZONE_LEN / (70 / 60)) < 1e-9);
// large part: lower peak and lower TAL than small part
const ms = metrics(norm.t, norm.small), ml = metrics(norm.t, norm.large);
assert.ok(ml.peak < ms.peak && ml.tal < ms.tal);
// presets
assert.ok(judge(ms).all && judge(ml).all, 'good preset passes both parts');
const cold = simulate(PRESETS.cold); assert.ok(!judge(metrics(cold.t, cold.large)).tal && metrics(cold.t, cold.large).peak < 217);
const hot = simulate(PRESETS['hot-fast']); assert.ok(!judge(metrics(hot.t, hot.small)).ramp && metrics(hot.t, hot.small).ramp > 3);
// metrics sanity on synthetic trace: linear 100->200 in 50 s => ramp 2 C/s
const t = Array.from({ length: 400 }, (_, i) => i * DT), T = t.map(x => x < 50 ? 100 + 2 * x : x < 100 ? 200 + 0 * x : 200 - 2 * (x - 100));
assert.ok(Math.abs(metrics(t, T).ramp - 2) < 0.05);
console.log('reflow-profile model: all tests passed');
