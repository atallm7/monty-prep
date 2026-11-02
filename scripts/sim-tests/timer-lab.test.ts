import assert from 'node:assert/strict';
import { timer, solve, waveforms } from '../../src/sims/models/timer-lab.ts';
const close = (a: number, b: number, t = 1e-9) => assert.ok(Math.abs(a - b) < t * Math.max(1, Math.abs(b)), `${a} != ${b}`);
// 16 MHz, PSC=15, ARR=999 -> 1 MHz counter, 1 kHz update; CCR=250 -> 25 %
const t = timer({ fclk: 16e6, psc: 15, arr: 999, ccr: 250 });
close(t.fcnt, 1e6); close(t.fupd, 1000); close(t.duty, 0.25); close(t.period, 1e-3); close(t.bits, Math.log2(1000)); close(t.tHigh, 250e-6);
// STM32 72 MHz: PSC=71, ARR=999 -> 1 kHz;  PSC=0, ARR=71 -> 1 MHz
close(timer({ fclk: 72e6, psc: 71, arr: 999, ccr: 0 }).fupd, 1000); close(timer({ fclk: 72e6, psc: 0, arr: 71, ccr: 0 }).fupd, 1e6);
// duty clamps
close(timer({ fclk: 1e6, psc: 0, arr: 99, ccr: 0 }).duty, 0); close(timer({ fclk: 1e6, psc: 0, arr: 99, ccr: 500 }).duty, 1); close(timer({ fclk: 1e6, psc: 0, arr: 99, ccr: 100 }).duty, 1);
// solver: exact when possible, picks max ARR (best resolution), respects 16-bit
{ const s = solve(16e6, 1000); close(s.f, 1000); assert.equal(s.err, 0); assert.equal(s.psc, 0); assert.equal(s.arr, 15999); }
{ const s = solve(72e6, 50, 16); assert.ok(Math.abs(s.err) < 1e-12); assert.ok(s.psc <= 65535 && s.arr <= 65535); assert.equal((s.psc + 1) * (s.arr + 1), 1440000); }
{ const s = solve(16e6, 1); assert.ok(s.psc <= 65535 && s.arr <= 65535); close(s.f, 1); }
{ const s = solve(16e6, 7.3); assert.ok(Math.abs(s.err) < 1e-3, 'close to target'); }
{ const s = solve(16e6, 1000, 32); assert.equal((s.psc + 1) * (s.arr + 1), 16000); }
// resolution trade-off: 1 MHz PWM from 72 MHz -> ARR+1 = 72 -> 6.2 bits; 20 kHz -> 3600 -> 11.8 bits
close(timer({ fclk: 72e6, psc: 0, arr: 71, ccr: 36 }).bits, Math.log2(72)); close(timer({ fclk: 72e6, psc: 0, arr: 3599, ccr: 0 }).bits, Math.log2(3600));
// waveform: duty measured from vertices equals CCR/(ARR+1)
{ const c = { fclk: 16e6, psc: 15, arr: 999, ccr: 250 }; const w = waveforms(c, 3); close(w.tEnd, 3e-3); close(w.px[2] - w.px[0], 250e-6); }
console.log('timer-lab model: all tests passed');
