// Peak-current-mode control: subharmonic oscillation and slope compensation (iterated inductor-current map).
import { ReactNode, useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Readout, Readouts, EqBox, Note, RegionBadge, si, num } from '../kit';
import Plot from '../../components/Plot';
import { linspace } from '../../lib/units';
import { simulate, alphaOf, cyclesToDecay } from '../models/subharmonic';

const fin = (v: any, d: number) => { const n = Number(v); return isFinite(n) ? n : d; };
const aps = (v: number) => `${num(v * 1e-6, 3)} A/µs`;

export default function Subharmonic({ params }: SimProps) {
  const init = {
    d: Math.min(0.95, Math.max(0.05, fin(params.d ?? 0.6, 0.6))),
    ma: Math.min(2, Math.max(0, fin(params.ma ?? 0, 0))),
    dI: 0.05, cycles: 16, vin: 12, l: 10e-6, fsw: 200e3, iavg: 2,
  };
  const [s, set] = useState(init);
  const upd = (k: keyof typeof s) => (v: number) => set(p => ({ ...p, [k]: v }));
  const r = useMemo(() => simulate(s), [s]);
  const { ss } = r;
  const a = ss.alpha, absA = Math.abs(a);
  const nDecay = cyclesToDecay(a, 0.01);
  const anyClamp = r.cycles.some(c => c.clamped);
  const state = absA < 1 - 1e-9
    ? (absA < 1e-6 ? { l: 'Dead-beat (α = 0)', c: 'ok' as const } : { l: `Stable: error ×${num(a, 3)} per cycle`, c: 'ok' as const })
    : absA <= 1 + 1e-9 ? { l: 'Marginal (|α| = 1)', c: 'warn' as const }
    : { l: 'Subharmonic oscillation (|α| > 1)', c: 'bad' as const };

  // α vs D curves
  const curves = useMemo(() => {
    const ds = linspace(0.02, 0.98, 193);
    return {
      ds,
      none: ds.map(d => Math.abs(alphaOf(d, 0))),
      now: ds.map(d => Math.abs(alphaOf(d, s.ma))),
      half: ds.map(d => Math.abs(alphaOf(d, 0.5))),
    };
  }, [s.ma]);

  const n = r.errs.length;
  const errX = r.errs.map((_, k) => k);
  const errMax = Math.max(Math.abs(s.dI), ...r.errs.map(Math.abs)) * 1.15 || 0.1;
  const pred = r.errs.map((_, k) => { const v = s.dI * a ** k; return Math.abs(v) <= errMax ? v : NaN; });
  const yLim = Math.max(ss.peak * 1.6, ss.ic * 1.15, 0.5);

  const eq = String.raw`\frac{\delta i_{n+1}}{\delta i_n}=-\frac{m_2-m_a}{m_1+m_a}=-\frac{${num(ss.m2 * 1e-6, 3)}-${num(ss.ma * 1e-6, 3)}}{${num(ss.m1 * 1e-6, 3)}+${num(ss.ma * 1e-6, 3)}}=${num(a, 3)}\qquad m_1=\frac{V_{in}-V_o}{L},\;m_2=\frac{V_o}{L}`;

  return (
    <SimShell title="Peak-current-mode: subharmonic oscillation & slope compensation" onReset={() => set(init)}
      tryThis={<>start at D = 0.4 with no compensation: the injected error flips sign and shrinks every cycle (α = −D/(1−D) = −0.67). Drag D past 0.5 and it grows instead, until the current settles into a wide-narrow-wide-narrow pattern at f<sub>sw</sub>/2: that is subharmonic oscillation. Now raise m<sub>a</sub>: it stabilises once m<sub>a</sub> exceeds (m<sub>2</sub>−m<sub>1</sub>)/2, and at m<sub>a</sub> = m<sub>2</sub> (1.0) the error is gone after a single cycle.</>}
      controls={<>
        <Slider label="Duty cycle D" value={s.d} min={0.05} max={0.95} step={0.01} format={v => (v * 100).toFixed(0) + '%'} onChange={upd('d')} />
        <Slider label="Slope comp. ma / m2" value={s.ma} min={0} max={1.5} step={0.01} format={v => v.toFixed(2)} onChange={upd('ma')} />
        <Slider label="Injected perturbation δi₀" value={s.dI} min={-0.5} max={0.5} step={0.005} unit="A" onChange={upd('dI')} />
        <Slider label="Cycles shown" value={s.cycles} min={4} max={60} step={1} format={v => String(Math.round(v))} onChange={upd('cycles')} />
        <Slider label="Vin" value={s.vin} min={3} max={48} step={0.5} unit="V" onChange={upd('vin')} />
        <Slider label="Inductor L" value={s.l} min={1e-6} max={100e-6} log unit="H" onChange={upd('l')} />
        <Slider label="Switching frequency" value={s.fsw} min={20e3} max={2e6} log unit="Hz" onChange={upd('fsw')} />
        <Slider label="Average current (operating point)" value={s.iavg} min={0.2} max={10} step={0.1} unit="A" onChange={upd('iavg')} />
        <Button onClick={() => set(p => ({ ...p, ma: Math.ceil(ss.maCritFrac * 100 + 1) / 100 }))}>Set ma just above critical</Button>
        <Button onClick={() => set(p => ({ ...p, ma: 1 }))}>Dead-beat (ma = m2)</Button>
        <Note>Buck converter, fixed-frequency clock sets the switch, comparator resets it when i<sub>L</sub> + m<sub>a</sub>·t reaches I<sub>c</sub>. I<sub>c</sub> is chosen so the unperturbed duty is exactly D. The full nonlinear map is iterated, including duty clamps (0–100%) and DCM.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <RegionBadge label={state.l} color={state.c} />
        {anyClamp && <RegionBadge label="Duty clamped / DCM: growth limited (nonlinear)" color="warn" />}
      </div>
      <Readouts>
        <Readout k="α = δiₙ₊₁/δiₙ" v={num(a, 3)} hl tone={absA < 1 ? 'ok' : absA === 1 ? 'warn' : 'bad'} />
        <Readout k="m1 (rise) / m2 (fall)" v={`${aps(ss.m1)} / ${aps(ss.m2)}`} />
        <Readout k="ma (compensation)" v={aps(ss.ma)} />
        <Readout k="Critical ma = (m2−m1)/2" v={ss.maCrit > 0 ? `${aps(ss.maCrit)} (${ss.maCritFrac.toFixed(2)}·m2)` : 'not needed (D ≤ 50%)'} />
        <Readout k="Cycles to 1% of δi₀" v={isFinite(nDecay) ? num(nDecay, 3) : 'never (grows)'} tone={isFinite(nDecay) ? 'ok' : 'bad'} />
        <Readout k={`δi after ${n - 1} cycles`} v={si(r.errs[n - 1], 'A')} />
        <Readout k="Vout / ripple ΔI" v={`${si(ss.vout, 'V')} / ${si(ss.ripple, 'A')}`} />
      </Readouts>
      <EqBox>{eq}</EqBox>
      <Plot height={250} xUnit="s" yUnit="A" xLabel="time" yLabel="inductor current"
        yRange={[Math.min(0, ss.valley - 0.2), yLim]}
        series={[
          { x: r.tRef, y: r.iRef, label: 'steady state (no perturbation)', color: 'muted', dashed: true },
          { x: r.tRamp, y: r.ramp, label: s.ma > 0 ? 'threshold Ic − ma·t' : 'threshold Ic', color: 'red' },
          { x: r.t, y: r.i, label: 'i_L (perturbed)', color: 'accent', width: 2 },
        ]} />
      <Plot height={200} xLabel="cycle n: valley-current error δiₙ" yUnit="A"
        series={[
          { x: errX, y: pred, label: 'linear prediction δi₀·αⁿ', color: 'muted', dashed: true },
          { x: errX, y: r.errs, label: 'δiₙ (nonlinear map)', color: 'orange', points: true },
        ]}
        yRange={[-errMax, errMax]}
        hlines={[{ at: 0, color: 'muted' }]} />
      <Plot height={200} xLabel="duty cycle D" yLabel="|α|" yLog yRange={[0.01, 100]} xRange={[0, 1]}
        series={[
          { x: curves.ds, y: curves.none, label: 'ma = 0', color: 'red', dashed: true },
          { x: curves.ds, y: curves.half, label: 'ma = 0.5·m2', color: 'blue', dashed: true },
          { x: curves.ds, y: curves.now, label: `ma = ${s.ma.toFixed(2)}·m2 (now)`, color: 'accent' },
        ]}
        hlines={[{ at: 1, label: '|α| = 1: stability limit', color: 'orange' }]} vlines={[{ at: 0.5, label: 'D = 50%', color: 'muted' }]}
        points={[{ x: s.d, y: Math.max(0.011, Math.min(99, absA)), label: 'now' }]} />
      <Note>With m<sub>a</sub> = 0.5·m<sub>2</sub> the loop is stable for every duty below 100%, which is why many controllers use a fixed ramp sized for the worst-case (highest D, largest m<sub>2</sub>) operating point. Too much ramp makes the loop behave like voltage-mode control and slows the current loop.</Note>
    </SimShell>
  );
}

function Button(p: { onClick: () => void; children: ReactNode }) {
  return <button type="button" className="btn btn-sm" style={{ marginRight: 6, marginBottom: 6 }} onClick={p.onClick}>{p.children}</button>;
}
