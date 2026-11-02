// Power, performance & thermals across PVT: αCV²f + leakage, alpha-power f_max, electrothermal fixed point, DVFS, throttling loop.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { linspace } from '../../lib/units';
import { fmax, power, leakage, steadyTj, dvfsTable, throttle, vt, Corner, CORNERS } from '../models/pvt-power';

const tx = (v: number, u: string) => String.raw`\text{${si(v, u)}}`;

export default function PvtPower({ params }: SimProps) {
  const c0 = String(params.corner ?? 'tt').toLowerCase();
  const init = {
    v: Number(params.v ?? 0.9), f: Number(params.f ?? 2e9), ta: Number(params.t ?? 25),
    corner: (['tt', 'ff', 'ss'].includes(c0) ? c0 : 'tt') as Corner,
    alpha: 0.15, c: 15e-9, theta: 10, cth: 0.5, throttle: true, tLimit: 95, hyst: 5,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(q => ({ ...q, [k]: v }));
  const op = { v: s.v, f: s.f, alpha: s.alpha, c: s.c, corner: s.corner };

  const tj = useMemo(() => steadyTj(op, s.ta, s.theta), [s.v, s.f, s.alpha, s.c, s.corner, s.ta, s.theta]);
  const tEval = tj ?? 150; // for readouts when running away, show hot values
  const P = power(op, tEval);
  const P0 = power(op, s.ta);
  const fm = fmax(s.v, tEval, s.corner);
  const slack = fm > 0 ? 1 - s.f / fm : -1;
  const leak = leakage(s.v, tEval, s.corner);
  const energy = s.f > 0 ? P.total / s.f : 0;

  const sim = useMemo(() => throttle({ op, ta: s.ta, theta: s.theta, cth: s.cth, tLimit: s.tLimit, hyst: s.hyst, enabled: s.throttle, tEnd: Math.max(10, 8 * s.theta * s.cth), dt: Math.max(10, 8 * s.theta * s.cth) / 8000 }),
    [s.v, s.f, s.alpha, s.c, s.corner, s.ta, s.theta, s.cth, s.tLimit, s.hyst, s.throttle]);
  const table = useMemo(() => dvfsTable(s.corner, s.tLimit, s.alpha, s.c), [s.corner, s.tLimit, s.alpha, s.c]);

  const fCurves = useMemo(() => {
    const vs = linspace(0.45, 1.2, 120);
    return [-40, 25, 125].map((T, k) => ({ x: vs, y: vs.map(v => fmax(v, T, s.corner) / 1e9), label: `f_max @ ${T} °C`, color: ['blue', 'green', 'red'][k] }));
  }, [s.corner]);
  const pCurves = useMemo(() => {
    const ts = linspace(s.ta, Math.max(s.ta + 20, 160), 160);
    const pt = ts.map(t => power(op, t));
    return [
      { x: ts, y: pt.map(p => p.total), label: 'P_total(Tj)', color: 'accent' },
      { x: ts, y: pt.map(p => p.dyn), label: 'P_dyn', color: 'orange', dashed: true },
      { x: ts, y: pt.map(p => p.leak), label: 'P_leak', color: 'purple', dashed: true },
      { x: ts, y: ts.map(t => (t - s.ta) / s.theta), label: 'cooling (Tj−Ta)/θ', color: 'muted' },
    ];
  }, [s.v, s.f, s.alpha, s.c, s.corner, s.ta, s.theta]);
  const pMax = Math.max(P0.total * 3, ...pCurves[0].y.slice(0, 80)) ;

  const state = tj === null ? { l: 'Thermal runaway (no steady state)', c: 'bad' as const }
    : slack < 0 ? { l: 'Timing violation: f > f_max', c: 'bad' as const }
    : tj > s.tLimit ? { l: 'Over thermal limit', c: 'warn' as const }
    : slack < 0.05 ? { l: 'Tight timing margin', c: 'warn' as const } : { l: 'Meets timing & thermal', c: 'ok' as const };

  const snap = () => set(q => ({ ...q, f: Math.max(1e8, Math.round(0.9 * fmax(q.v, q.tLimit, q.corner) / 1e7) * 1e7) }));

  return (
    <SimShell title="Power, performance & thermals (PVT)" layout="stacked" onReset={() => set(init)}
      tryThis={<>raise θ<sub>JA</sub> (a worse heatsink) until the steady-state Tj disappears: leakage grows exponentially with temperature, so the power curve never crosses the cooling line (thermal runaway). Turn on throttling and watch the governor drop P-states to hold Tj at the limit. Then drop V to 0.55 V and compare the f<sub>max</sub> curves: at low voltage the hot chip is <i>faster</i> (temperature inversion).</>}
      controls={<>
        <Slider label="Supply V_DD" value={s.v} min={0.5} max={1.2} step={0.01} unit="V" onChange={upd('v')} />
        <Slider label="Clock f" value={s.f} min={1e8} max={4e9} log unit="Hz" onChange={upd('f')} />
        <button className="btn btn-sm" onClick={snap}>Set f = 0.9·f_max(V, T_limit)</button>
        <Slider label="Ambient Ta" value={s.ta} min={-40} max={100} step={1} format={v => `${v.toFixed(0)} °C`} onChange={upd('ta')} />
        <Seg label="Process corner" value={s.corner} options={(['ss', 'tt', 'ff'] as Corner[]).map(c => ({ value: c, label: c.toUpperCase() }))} onChange={upd('corner')} />
        <Slider label="Activity factor α" value={s.alpha} min={0.02} max={0.5} step={0.01} format={v => v.toFixed(2)} onChange={upd('alpha')} />
        <Slider label="Switched capacitance C" value={s.c} min={1e-9} max={50e-9} log unit="F" onChange={upd('c')} />
        <Slider label="θ_JA (junction-ambient)" value={s.theta} min={0.5} max={30} step={0.5} format={v => `${v.toFixed(1)} °C/W`} onChange={upd('theta')} />
        <Slider label="Thermal capacitance C_th" value={s.cth} min={0.05} max={5} log format={v => `${v.toFixed(2)} J/°C`} onChange={upd('cth')} />
        <Toggle label="Thermal throttling (DVFS governor)" checked={s.throttle} onChange={upd('throttle')} />
        <Slider label="Throttle limit T_limit" value={s.tLimit} min={60} max={125} step={1} format={v => `${v} °C`} onChange={upd('tLimit')} />
        <Note>{CORNERS[s.corner].label}: ΔVt = {(CORNERS[s.corner].dVt * 1000).toFixed(0)} mV. Vt0 = 0.35 V at 25 °C, −0.8 mV/°C. Calibrated so TT, 0.9 V, 25 °C gives f_max = 2.6 GHz and 0.27 W subthreshold leakage.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <RegionBadge label={state.l} color={state.c} />
        <RegionBadge label={`Corner ${s.corner.toUpperCase()}`} color="info" />
        {s.v < 0.62 && fmax(s.v, 125, s.corner) > fmax(s.v, -40, s.corner) && <RegionBadge label="Temperature inversion region" color="accent" />}
        {sim.runaway && <RegionBadge label="Transient: runaway" color="bad" />}
      </div>
      <Readouts>
        <Readout k="P_dyn = αCV²f" v={si(P.dyn, 'W')} />
        <Readout k={`P_leak @ ${tj === null ? '150' : tj.toFixed(0)} °C`} v={si(P.leak, 'W')} tone={P.leak > P.dyn ? 'bad' : P.leak > 0.3 * P.dyn ? 'warn' : undefined} />
        <Readout k="P_total" v={si(P.total, 'W')} hl />
        <Readout k="Steady Tj" v={tj === null ? 'runaway' : `${tj.toFixed(1)} °C`} hl tone={tj === null ? 'bad' : tj > s.tLimit ? 'warn' : 'ok'} />
        <Readout k="f_max(V, Tj)" v={si(fm, 'Hz')} />
        <Readout k="Timing slack" v={(slack * 100).toFixed(1) + '%'} tone={slack < 0 ? 'bad' : slack < 0.05 ? 'warn' : 'ok'} />
        <Readout k="Vt @ Tj" v={si(vt(tEval, s.corner), 'V')} />
        <Readout k="Energy / cycle" v={si(energy, 'J')} />
        <Readout k={s.throttle ? 'Throttled avg f / peak Tj' : 'Transient peak Tj'} v={s.throttle ? `${si(sim.avgF, 'Hz')} / ${sim.peakTj.toFixed(0)} °C` : sim.runaway ? '> 250 °C' : `${sim.peakTj.toFixed(0)} °C`} tone={sim.runaway ? 'bad' : sim.peakTj > s.tLimit + 2 ? 'warn' : 'ok'} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}P = \alpha C V^2 f + V I_{leak}(T_j) \\ = ${s.alpha.toFixed(2)}\cdot ${tx(s.c, 'F')}\cdot ${s.v.toFixed(2)}^2\cdot ${tx(s.f, 'Hz')} + ${s.v.toFixed(2)}\cdot ${tx(leak.iSub + leak.iGate, 'A')} = ${tx(P.total, 'W')} \\ T_j = T_a + \theta_{JA} P(T_j) = ${s.ta} + ${s.theta.toFixed(1)}\cdot ${tx(P.total, 'W')} ${tj === null ? String.raw`\ \text{(no solution: runaway)}` : String.raw`= ${tj.toFixed(1)}\ {}^\circ\text{C}`} \\ f_{max} \propto \frac{\mu(T)\,(V-V_t(T))^{1.3}}{V},\quad \mu \propto T^{-1.2},\quad V_t(T_j) = ${tx(vt(tEval, s.corner), 'V')}\end{gathered}`}</EqBox>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 12 }}>
        <div>
          <div className="ctl-label" style={{ fontSize: 13 }}>Max frequency vs voltage (alpha-power law)</div>
          <Plot height={230} xLabel="V_DD" xUnit="V" yLabel="f_max (GHz)" series={fCurves} xRange={[0.45, 1.2]}
            points={[{ x: s.v, y: s.f / 1e9, label: slack < 0 ? 'fails' : 'op point', color: slack < 0 ? 'red' : 'accent' }]} vlines={[{ at: s.v, color: 'muted' }]} />
        </div>
        <div>
          <div className="ctl-label" style={{ fontSize: 13 }}>Electrothermal operating point: heating vs cooling</div>
          <Plot height={230} xLabel="Junction temperature Tj" xUnit="°C" yLabel="Power" yUnit="W" series={pCurves} yRange={[0, pMax]}
            vlines={[...(tj !== null ? [{ at: tj, label: 'Tj', color: 'accent' }] : []), { at: s.tLimit, label: 'T_limit', color: 'red' }]}
            points={tj !== null ? [{ x: tj, y: power(op, tj).total, label: 'stable point' }] : []} />
        </div>
        <div>
          <div className="ctl-label" style={{ fontSize: 13 }}>Thermal transient {s.throttle ? '(throttling on)' : '(no throttling)'}, τ = θ·C_th = {sim.tau.toFixed(1)} s</div>
          <Plot height={200} xLabel="time" xUnit="s" yLabel="Tj" yUnit="°C" series={[{ x: sim.t, y: sim.tj, label: 'Tj(t)', color: 'red' }]}
            hlines={[{ at: s.tLimit, label: 'T_limit', color: 'orange' }]} yRange={[Math.min(s.ta, 0) - 5, Math.min(260, Math.max(s.tLimit + 20, sim.peakTj + 10))]} />
        </div>
        <div>
          <div className="ctl-label" style={{ fontSize: 13 }}>Clock chosen by the governor</div>
          <Plot height={200} xLabel="time" xUnit="s" yLabel="f (GHz)" series={[{ x: sim.t, y: sim.f.map(v => v / 1e9), label: 'f(t)', color: 'accent', step: true }]} yRange={[0, s.f * 1.1e-9]} />
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="cat-table" style={{ marginTop: 0, fontSize: 13 }}>
          <thead><tr><th>DVFS point</th><th className="num">V</th><th className="num">f = 0.9·f_max @ {s.tLimit} °C</th><th className="num">P @ {s.tLimit} °C</th><th className="num">Energy / cycle</th></tr></thead>
          <tbody>{table.map((r, k) => (
            <tr key={k} style={{ cursor: 'pointer' }} role="button" tabIndex={0} onClick={() => set(q => ({ ...q, v: r.v, f: Math.round(r.f / 1e7) * 1e7 }))}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(q => ({ ...q, v: r.v, f: Math.round(r.f / 1e7) * 1e7 })); } }}>
              <td>P{table.length - 1 - k}{Math.abs(r.v - s.v) < 0.005 ? ' ◀' : ''}</td><td className="num">{r.v.toFixed(2)} V</td><td className="num">{si(r.f, 'Hz')}</td><td className="num">{si(r.p, 'W')}</td><td className="num">{si(r.energy, 'J')}</td>
            </tr>))}</tbody>
        </table>
        <Note>Click a row to jump to that operating point. Lower V cuts energy per operation roughly as V², which is why DVFS lowers V together with f.</Note>
      </div>
    </SimShell>
  );
}
