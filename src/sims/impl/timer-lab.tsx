// MCU timer / counter & PWM. Model: models/timer-lab.ts
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { logspace } from '../../lib/units';
import { timer, solve, waveforms, maxReg } from '../models/timer-lab';

export default function TimerLab({ params }: SimProps) {
  const init = { fclk: Number(params.fclk ?? 16e6), psc: Math.max(0, Math.round(Number(params.psc ?? 15))), arr: Math.max(1, Math.round(Number(params.arr ?? 999))), ccr: Math.max(0, Math.round(Number(params.ccr ?? 250))), width: 16 as 16 | 32, target: 1000 };
  const [s, setS] = useState(init);
  const mx = maxReg(s.width);
  const arr = Math.min(s.arr, mx), psc = Math.min(s.psc, mx);
  const c = { fclk: s.fclk, psc, arr, ccr: Math.min(s.ccr, arr + 1) };
  const t = useMemo(() => timer(c), [s.fclk, psc, arr, s.ccr]);
  const w = useMemo(() => waveforms(c, 3), [s.fclk, psc, arr, s.ccr]);
  const sol = useMemo(() => solve(s.fclk, s.target, s.width), [s.fclk, s.target, s.width]);
  const tr = useMemo(() => {
    const f = logspace(1, s.fclk / 4, 60);
    return { f, y0: f.map(x => Math.max(0, Math.log2(s.fclk / x))), y1: f.map(x => Math.max(0, Math.log2(s.fclk / (psc + 1) / x))) };
  }, [s.fclk, psc]);
  const set = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => setS(p => ({ ...p, [k]: v }));
  const apply = () => setS(p => ({ ...p, psc: sol.psc, arr: sol.arr, ccr: Math.round((sol.arr + 1) * Math.min(1, p.ccr / (Math.min(p.arr, mx) + 1))) }));
  const overflow = s.arr > mx || s.psc > mx;
  const duty = t.duty;
  const tone = Math.abs(sol.err) < 1e-9 ? 'ok' : Math.abs(sol.err) < 0.01 ? 'warn' : 'bad';
  const ccrLines = [{ at: c.ccr, label: `CCR = ${c.ccr}`, color: 'orange' }, { at: arr, label: `ARR = ${arr}`, color: 'red' }];

  return (
    <SimShell title="MCU timer / counter & PWM" onReset={() => setS(init)}
      tryThis={<>with the defaults (16 MHz, PSC = 15, ARR = 999) the counter ticks at 1 MHz and wraps at 1 kHz; CCR = 250 gives 25 % duty. Now raise <b>ARR</b> and watch the duty step get finer (more resolution bits) while f drops. Type a target of 20 kHz and press <b>Solve</b>: the best PSC/ARR trades error against duty resolution.</>}
      controls={<>
        <Slider label="Timer clock f_clk" value={s.fclk} min={1e5} max={480e6} log unit="Hz" onChange={set('fclk')} />
        <Slider label="Prescaler divide (PSC + 1)" value={psc + 1} min={1} max={65536} log format={v => `${Math.round(v)}  (PSC = ${Math.round(v) - 1})`} onChange={v => set('psc')(Math.round(v) - 1)} />
        <Slider label="Period counts (ARR + 1)" value={arr + 1} min={2} max={65536} log format={v => `${Math.round(v)}  (ARR = ${Math.round(v) - 1})`} onChange={v => setS(p => ({ ...p, arr: Math.round(v) - 1 }))} />
        <Slider label="Compare (CCR)" value={c.ccr} min={0} max={arr + 1} step={1} format={v => `${Math.round(v)}  (${(100 * Math.round(v) / (arr + 1)).toFixed(1)} %)`} onChange={v => set('ccr')(Math.round(v))} />
        <Seg label="Register width" value={String(s.width) as '16' | '32'} onChange={v => setS(p => ({ ...p, width: Number(v) as 16 | 32 }))} options={[{ value: '16', label: '16-bit' }, { value: '32', label: '32-bit' }]} />
        <Slider label="Target frequency" value={s.target} min={1} max={s.fclk / 4} log unit="Hz" onChange={set('target')} />
        <div className="seg"><button type="button" onClick={apply}>Solve PSC / ARR</button></div>
        <Note>Solver: PSC = {sol.psc}, ARR = {sol.arr} gives {si(sol.f, 'Hz', 6)} ({(sol.err * 100).toFixed(4)} % error), {Math.log2(sol.arr + 1).toFixed(1)}-bit duty resolution. It picks the largest ARR among the best matches.</Note>
      </>}>
      <Plot series={[{ x: w.cx, y: w.cy, label: 'counter CNT', color: 'accent' }]} xUnit="s" yLabel="CNT" xLabel="time" height={190} xRange={[0, w.tEnd]} yRange={[0, arr * 1.12 + 1]}
        hlines={ccrLines} vlines={w.upd.slice(1).map(x => ({ at: x, label: 'update', color: 'muted' }))} />
      <Plot series={[{ x: w.px, y: w.py, label: 'PWM output', color: 'green', step: true, fill: true }]} xUnit="s" yLabel="out" xLabel="time" height={130} xRange={[0, w.tEnd]} yRange={[-0.1, 1.2]} yTickFormat={v => (v === 0 || v === 1 ? String(v) : '')} />
      <Readouts>
        <Readout k="Counter clock f_clk/(PSC+1)" v={si(t.fcnt, 'Hz', 4)} />
        <Readout k="Update / PWM frequency" v={si(t.fupd, 'Hz', 5)} hl />
        <Readout k="Period" v={si(t.period, 's', 4)} />
        <Readout k="Duty = CCR/(ARR+1)" v={`${(duty * 100).toFixed(2)} %`} hl />
        <Readout k="Duty step (1 count)" v={`${(100 * t.step).toFixed(4)} %`} />
        <Readout k="Duty resolution" v={`${t.bits.toFixed(2)} bits`} />
        <Readout k="Tick" v={si(t.tick, 's', 4)} />
        <Readout k="Solver error @ target" v={`${(sol.err * 100).toFixed(4)} %`} tone={tone as any} />
      </Readouts>
      <div style={{ marginTop: 6 }}><RegionBadge label={overflow ? `Register overflow: limited to ${s.width}-bit` : duty <= 0 ? '0 % (always low)' : duty >= 1 ? '100 % (always high)' : 'PWM mode 1 (edge-aligned)'} color={overflow ? 'bad' : duty <= 0 || duty >= 1 ? 'warn' : 'ok'} /></div>
      <EqBox>{String.raw`f_{upd}=\frac{f_{clk}}{(PSC+1)(ARR+1)}=\frac{\text{${si(s.fclk, 'Hz')}}}{${psc + 1}\cdot ${arr + 1}}=\text{${si(t.fupd, 'Hz', 5)}},\qquad D=\frac{CCR}{ARR+1}=\frac{${c.ccr}}{${arr + 1}}=${(duty * 100).toFixed(2)}\%`}</EqBox>
      <Plot series={[{ x: tr.f, y: tr.y0, label: 'PSC = 0', color: 'muted', dashed: true }, { x: tr.f, y: tr.y1, label: `PSC = ${psc}`, color: 'purple' }]} xLog xUnit="Hz" yUnit="bits" yLabel="duty resolution" xLabel="PWM frequency" height={190} yRange={[0, Math.max(4, Math.log2(s.fclk))]}
        vlines={[{ at: t.fupd, label: 'now', color: 'accent' }]} points={t.fupd >= 1 && t.fupd <= s.fclk / 4 ? [{ x: t.fupd, y: t.bits, label: `${t.bits.toFixed(1)} bits` }] : []} />
    </SimShell>
  );
}
