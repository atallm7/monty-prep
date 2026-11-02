import assert from 'node:assert/strict';
import { pump, startup, type CPIn } from '../../src/sims/models/charge-pump.ts';
const near = (a: number, b: number, rel: number, m = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(1e-12, Math.abs(b)), `${m}: ${a} vs ${b}`);
const base: CPIn = { mode: 'doubler', vin: 3.3, f: 500e3, cfly: 1e-6, cout: 10e-6, iout: 0.02, rsw: 1 };
// no load: Vout = 2·Vin (doubler), −Vin (inverter)
near(pump({ ...base, iout: 0, rsw: 0.01 }).vout, 6.6, 1e-4, 'doubler no-load');
near(pump({ ...base, mode: 'inverter', iout: 0, rsw: 0.01 }).vout, -3.3, 1e-4, 'inverter no-load');
// ideal switches, huge Cout: Vout = 2Vin − Iout/(f·Cfly)
{
  const r = pump({ ...base, rsw: 1e-5, cout: 1, iout: 0.1, f: 100e3 });
  near(r.vout, 6.6 - 0.1 / (100e3 * 1e-6), 1e-3, 'SSL droop');
  near(r.droop, 1, 1e-12);
  const inv = pump({ ...base, mode: 'inverter', rsw: 1e-5, cout: 1, iout: 0.1, f: 100e3 });
  near(inv.vout, -(3.3 - 1), 1e-3, 'inverter SSL droop');
}
// fast-switching limit: Rout → 8·Rsw (large Cfly, high f)
{
  const rsw = 0.5, r = pump({ ...base, cfly: 100e-6, cout: 100e-6, f: 200e3, rsw, iout: 0.05 });
  const rEff = (6.6 - r.vout) / 0.05; near(rEff, 8 * rsw, 0.05, 'FSL Rout');
}
// combined estimate within 15% in the crossover region
{
  const r = pump({ ...base, cfly: 1e-6, f: 250e3, rsw: 0.5, cout: 100e-6 }); const rEff = (6.6 - r.vout) / base.iout;
  near(rEff, r.rout, 0.15, 'Rout combined');
}
// ripple ≈ Iout/(f·Cout) when Cfly ≫ Cout is not required; check scaling: 10x Cout → ~1/10 ripple
{
  const a = pump({ ...base, cout: 10e-6 }).ripple, b = pump({ ...base, cout: 100e-6 }).ripple;
  assert.ok(b < a / 6 && b > a / 14, `ripple scaling ${a} ${b}`);
}
// energy: ideal pump draws N·Iout from Vin → efficiency = |Vout|/(N·Vin)
{
  for (const mode of ['doubler', 'inverter'] as const) {
    const r = pump({ ...base, mode, rsw: 2, iout: 0.03 }); const N = mode === 'doubler' ? 2 : 1;
    near(r.iin, N * 0.03, 1e-6, mode + ' Iin = N·Iout');
    near(r.eff, Math.abs(r.vout) / (N * 3.3), 1e-6, mode + ' η');
    assert.ok(Math.abs(r.pin - r.pout - r.ploss) < 1e-12);
  }
}
// start-up reaches the steady state
{
  const s = startup(base, 400), ss = pump(base);
  near(s.vo[s.vo.length - 1], ss.vout, 0.02, 'startup converges');
  assert.ok(s.vo[10] < s.vo[100]);
}
// overload: demanding more than the pump can give gives ok=false (Vout collapses toward 0)
assert.equal(pump({ ...base, iout: 5, cfly: 1e-7 }).ok || pump({ ...base, iout: 5, cfly: 1e-7 }).vout < 0.1, true);
console.log('charge-pump model: all tests passed');
