import assert from 'node:assert/strict';
import { vout, vm, vmAnalytic, noiseMargins, gain, iscPeak, iscIntegral, power, transient, currents } from '../../src/sims/models/cmos-inverter.ts';
const close = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const rel = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} vs ${b}`);

// Matched (symmetric) inverter, λ = 0: VM = VDD/2, VIL = (3VDD + 2Vt)/8, VIH = (5VDD − 2Vt)/8
const sym = { vdd: 3.3, kn: 2e-3, ratio: 1, vtn: 0.5, vtp: 0.5, lambda: 0 };
close(vm(sym), 1.65, 1e-9, 'VM = VDD/2');
const nm = noiseMargins(sym);
close(nm.vil, (3 * 3.3 + 2 * 0.5) / 8, 1e-6, 'VIL'); close(nm.vih, (5 * 3.3 - 2 * 0.5) / 8, 1e-6, 'VIH');
close(nm.voh, 3.3, 1e-9, 'VOH'); close(nm.vol, 0, 1e-9, 'VOL');
close(nm.nml, nm.nmh, 1e-6, 'symmetric noise margins');
close(gain(sym, nm.vil), -1, 1e-6, 'unity gain at VIL');
// Output at VIL from the long-channel analysis: Vout = VIL + VDD/2 − ... ; for matched devices Vout(VIL) = (7VDD + 2Vt)/8
close(nm.voutAtVil, (7 * 3.3 + 2 * 0.5) / 8, 1e-6, 'Vout at VIL');
// Rails and monotonic VTC
close(vout(sym, 0), 3.3, 1e-12, 'Vin=0'); close(vout(sym, 3.3), 0, 1e-12, 'Vin=VDD');
for (let v = 0, prev = 4; v <= 3.3; v += 0.01) { const o = vout(sym, v); assert.ok(o <= prev + 1e-9, 'monotonic'); prev = o; }

// Ratioed: kp/kn = 0.36 (equal widths, µn/µp = 2.8) at VDD = 1.8, Vt = 0.5 → VM = (0.5 + 0.6·1.3)/1.6 = 0.80 V
const weakP = { vdd: 1.8, kn: 2e-3, ratio: 0.36, vtn: 0.5, vtp: 0.5, lambda: 0 };
close(vm(weakP), 0.8, 1e-6, 'VM ratioed'); close(vmAnalytic(weakP), 0.8, 1e-12, 'VM analytic');
const nmw = noiseMargins(weakP); assert.ok(nmw.nml < nmw.nmh, 'weak PMOS lowers NML');
close(gain(weakP, nmw.vil), -1, 1e-6, 'unity gain VIL ratioed'); close(gain(weakP, nmw.vih), -1, 1e-6, 'unity gain VIH ratioed');
// Kang & Leblebici closed form for VIL (λ=0), kR = kn/kp: VIL = (2Vout + Vtp − VDD + kR·Vtn)/(1 + kR) with Vtp = −0.5
const kR = 1 / 0.36;
close(nmw.vil, (2 * nmw.voutAtVil - 0.5 - 1.8 + kR * 0.5) / (1 + kR), 1e-6, 'Kang VIL');
// VIH: VIH = (VDD + Vtp + kR(2Vout + Vtn))/(1 + kR)
close(nmw.vih, (1.8 - 0.5 + kR * (2 * nmw.voutAtVih + 0.5)) / (1 + kR), 1e-6, 'Kang VIH');
// Stronger PMOS shifts VM up
assert.ok(vm({ ...sym, ratio: 2.5 }) > 1.65);
// With λ > 0 the gain at VM is finite: Av = −(gmn + gmp)/(gdsn + gdsp)
const lam = { ...sym, lambda: 0.05 }; const m = vm(lam); const g = gain(lam, m);
const id = currents(lam, m, vout(lam, m)).in; const gmn = 2e-3 * (m - 0.5); const gds = id * 0.05 / (1 + 0.05 * m);
rel(g, -(2 * gmn * (1 + 0.05 * m)) / (2 * gds), 1e-3, 'finite gain with λ'); close(m, 1.65, 1e-6, 'VM still VDD/2 with λ');

// Shoot-through peak at VM: ½kn(VM − Vt)² = ½·2m·1.15² = 1.3225 mA
rel(iscPeak(sym), 0.5 * 2e-3 * 1.15 ** 2, 1e-9, 'Isc peak');
// ∫Isc dVin = kn(VDD − 2Vt)³/24, so short-circuit power = Veendrick (β/12)(VDD − 2Vt)³·tr·f
rel(iscIntegral(sym), 2e-3 * 2.3 ** 3 / 24, 1e-6, 'Isc integral');
const pw = power(sym, { cl: 10e-12, f: 10e6, alpha: 1, tr: 1e-9, ileak: 1e-9 });
rel(pw.dyn, 10e-12 * 3.3 ** 2 * 10e6, 1e-12, 'P = αCV²f = 1.089 mW');
rel(pw.sc, 2e-3 / 12 * 2.3 ** 3 * 1e-9 * 10e6, 1e-6, 'Veendrick'); rel(pw.leak, 3.3e-9, 1e-12, 'leakage');
// Voltage scaling: 1.8 V → 3.3 V raises dynamic power by (3.3/1.8)²
rel(power({ ...sym, vdd: 3.3 }, { cl: 1e-12, f: 1e6, alpha: 0.2, tr: 0, ileak: 0 }).dyn / power({ ...sym, vdd: 1.8 }, { cl: 1e-12, f: 1e6, alpha: 0.2, tr: 0, ileak: 0 }).dyn, (3.3 / 1.8) ** 2, 1e-12, 'V² scaling');

// Transient 1: step input, no series R, λ = 0 → Kang's exact square-law delay
//   tpHL = C/(kn(VDD−Vt))·[2Vt/(VDD−Vt) + ln(4(VDD−Vt)/VDD − 1)]
let t0 = performance.now();
const tr1 = transient(sym, { cl: 10e-12, rs: 0, f: 10e6, tr: 1e-13, dense: 1500 });
console.log('transient ms', (performance.now() - t0).toFixed(1));
const tpK = 10e-12 / (2e-3 * 2.8) * (2 * 0.5 / 2.8 + Math.log(4 * 2.8 / 3.3 - 1));
rel(tr1.tpHL, tpK, 0.01, 'tpHL (Kang)'); rel(tr1.tpLH, tpK, 0.01, 'tpLH symmetric');
// Energy from VDD per cycle ≈ C·VDD² when the input edge is fast (no shoot-through)
rel(tr1.eSupply, 10e-12 * 3.3 ** 2, 0.01, 'E = CV² per cycle');
// Transient 2: series R dominates (strong FETs) → RC: tp = ln2·RC, 10–90% = ln9·RC
const strong = { ...sym, kn: 0.2 };
const tr2 = transient(strong, { cl: 10e-12, rs: 10e3, f: 100e3, tr: 1e-12 });
const ron = 1 / (0.2 * 2.8); const tau = (10e3 + ron) * 10e-12;
rel(tr2.tpLH, Math.LN2 * tau, 0.02, 'tp = 0.69RC'); rel(tr2.trise1090, Math.log(9) * tau, 0.02, 'tr = 2.2RC');
rel(tr2.tfall1090, Math.log(9) * tau, 0.02, 'tf = 2.2RC');
// Weak PMOS: rising edge slower by ~ kn/kp
const tr3 = transient({ ...sym, ratio: 0.4 }, { cl: 10e-12, rs: 0, f: 10e6, tr: 1e-13 });
assert.ok(tr3.tpLH > 2 * tr3.tpHL, 'weak PMOS → slow rising edge');
// Rising output: PMOS conducts; falling output: NMOS conducts
const iRise = tr1.t.findIndex(t => t > tr1.tRise + 0.2 * tpK), iFall = tr1.t.findIndex(t => t > tr1.tFall + 0.2 * tpK);
assert.ok(tr1.ip[iRise] > 100 * tr1.in[iRise] && tr1.in[iFall] > 100 * tr1.ip[iFall], 'which FET conducts');
for (const a of [tr1.vc, tr2.vc, tr3.vc]) assert.ok(a.every(Number.isFinite), 'finite waveform');
console.log('cmos-inverter: all tests passed');
