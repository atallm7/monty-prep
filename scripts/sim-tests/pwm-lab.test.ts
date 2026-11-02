import assert from 'node:assert/strict';
import { pwmStats, harmonic, rcSteady, rcResponse, rcGain, cieLightness } from '../../src/sims/models/pwm-lab.ts';
const close = (a: number, b: number, tol = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${m} ${a} != ${b}`);
const s = pwmStats(0.25, 5);
close(s.avg, 1.25); close(s.rms, 2.5); close(s.acRms, 5 * Math.sqrt(0.1875));
close(s.rms ** 2, s.avg ** 2 + s.acRms ** 2, 1e-12, 'rms decomposition');
// 50% square wave: fundamental 4A/π · ½ = 2A/π, no even harmonics
close(harmonic(1, 0.5, 1), 2 / Math.PI); close(harmonic(2, 0.5, 1), 0); close(harmonic(3, 0.5, 1), 2 / (3 * Math.PI));
// D = 0.25: 4th harmonic vanishes
close(harmonic(4, 0.25, 1), 0);
// Parseval
let sum = 0.3 ** 2 * 25; for (let n = 1; n < 200000; n++) sum += harmonic(n, 0.3, 5) ** 2 / 2;
close(sum, pwmStats(0.3, 5).rms ** 2, 1e-4, 'Parseval');
// RC: τ ≫ T ripple ≈ A·D(1−D)T/τ; steady state average equals D·A
const r = rcSteady(0.3, 5, 1000, 0.1);
close(r.ripple, r.approx, 2e-3, 'ripple approx');
const resp = rcResponse(0.3, 5, 1000, 1e-3, 40, 400);
const last = resp.v.slice(-402); const mx = Math.max(...last), mn = Math.min(...last);
const ss = rcSteady(0.3, 5, 1000, 1e-3);
close(mx, ss.vmax, 1e-6, 'vmax'); close(mn, ss.vmin, 1e-6, 'vmin');
// average of steady state output = D·A (capacitor has no DC current)
let area = 0; const tt = resp.t.slice(-402);
for (let i = 1; i < tt.length; i++) area += 0.5 * (last[i] + last[i - 1]) * (tt[i] - tt[i - 1]);
close(area / 1e-3, 1.5, 1e-3, 'average');
// 1 - e^-1 at t = τ for D = 1
const one = rcResponse(1, 1, 1000, 1e-3, 1, 1000);
close(one.v[one.v.length - 1], 1 - Math.exp(-1), 1e-9, '63.2%');
close(rcGain(1 / (2 * Math.PI * 1e-3), 1e-3), Math.SQRT1_2);
close(cieLightness(0.18), 49.5, 2e-3, '18% grey ≈ L*50'); close(cieLightness(1), 100);
console.log('pwm-lab model: all tests passed');
