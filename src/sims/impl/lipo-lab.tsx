// LiPo / Li-ion single cell: discharge curves vs C-rate & temperature, and the CC/CV charge profile.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { clamp } from '../../lib/units';
import { discharge, charge, ocv, arrhenius, r0, r1, TAU1 } from '../models/lipo-lab';

type View = 'discharge' | 'charge';
const COMPARE_RATES = [0.2, 0.5, 1, 2, 3];
const COMPARE_TEMPS = [-20, 0, 25, 45];
const COLORS = ['blue', 'green', 'orange', 'purple', 'red'];

function nearestIdx(xs: number[], x: number) { let lo = 0, hi = xs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m; else hi = m; } return Math.abs(xs[lo] - x) < Math.abs(xs[hi] - x) ? lo : hi; }
const fmtMin = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${(s / 60).toFixed(1)} min`;

export default function LipoLab({ params }: SimProps) {
  const init = {
    view: (params.view === 'charge' ? 'charge' : 'discharge') as View,
    capacity: clamp(Number(params.capacity ?? 2) || 2, 0.1, 20),
    crate: clamp(Number(params.crate ?? 1) || 1, 0.05, 5),
    temp: clamp(Number(params.temp ?? 25), -20, 60),
    rint: clamp(Number(params.rint ?? 0.05) || 0.05, 0.002, 0.5),
    vcut: 3.0, vmax: '4.2', iterm: 0.05, compare: 'rate' as 'rate' | 'temp', cursor: 0.5,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const cell = { capacity: s.capacity, rint: s.rint, temp: s.temp };
  const vmax = Number(s.vmax);

  const dis = useMemo(() => discharge(cell, s.crate, s.vcut), [s.capacity, s.rint, s.temp, s.crate, s.vcut]);
  const cmp = useMemo(() => s.view !== 'discharge' ? [] : s.compare === 'rate'
    ? COMPARE_RATES.filter(c => Math.abs(c - s.crate) > 1e-3).map(c => ({ lab: `${c}C`, d: discharge(cell, c, s.vcut) }))
    : COMPARE_TEMPS.filter(t => Math.abs(t - s.temp) > 0.5).map(t => ({ lab: `${t} °C`, d: discharge({ ...cell, temp: t }, s.crate, s.vcut) })),
  [s.view, s.compare, s.capacity, s.rint, s.temp, s.crate, s.vcut]);
  const chg = useMemo(() => charge(cell, s.crate, vmax, s.iterm), [s.capacity, s.rint, s.temp, s.crate, vmax, s.iterm]);

  // Cursor: inspect the instantaneous state at a point along the run
  const isDis = s.view === 'discharge';
  const cur = useMemo(() => {
    if (isDis) {
      const k = nearestIdx(dis.ah, s.cursor * dis.ahOut);
      const soc = dis.soc[k], I = dis.i, R0 = r0(cell, soc), vt = dis.v[k], o = ocv(soc);
      return { k, soc, I, R0, o, vt, v1: o - I * R0 - vt, t: dis.t[k], pHeat: I * I * R0 + (o - I * R0 - vt) ** 2 / r1(cell, soc) };
    }
    const k = nearestIdx(chg.t, s.cursor * chg.tTotal);
    const soc = chg.soc[k], I = -chg.i[k], R0 = r0(cell, soc), vt = chg.v[k], o = ocv(soc);
    return { k, soc, I, R0, o, vt, v1: o - I * R0 - vt, t: chg.t[k], pHeat: I * I * R0 + (o - I * R0 - vt) ** 2 / r1(cell, soc) };
  }, [isDis, dis, chg, s.cursor, s.rint, s.temp]);

  const schematic = useMemo(() => {
    const R0 = cur.R0, R1 = r1(cell, cur.soc), C1 = TAU1 / R1;
    const iabs = Math.abs(cur.I);
    return renderCircuit({ elements: [
      { t: 'V', a: [0, 2], b: [0, 7], label: 'OCV', value: si(cur.o, 'V') },
      { t: 'wire', pts: [[0, 2], [0, 0], [1, 0]], flow: iabs > 0 ? (isDis ? true : 'reverse') : undefined },
      { t: 'R', a: [1, 0], b: [5, 0], label: 'R_0', value: si(R0, 'Ω'), color: 'orange' },
      { t: 'wire', pts: [[5, 0], [7, 0]], flow: iabs > 0 ? (isDis ? true : 'reverse') : undefined },
      { t: 'R', a: [7, 0], b: [11, 0], label: 'R_1', value: si(R1, 'Ω') },
      { t: 'wire', pts: [[7, 0], [7, 2.5]] }, { t: 'wire', pts: [[11, 0], [11, 2.5]] },
      { t: 'C', a: [7, 2.5], b: [11, 2.5], label: 'C_1', value: si(C1, 'F'), labelSide: 'other' },
      { t: 'dot', at: [7, 0] }, { t: 'dot', at: [11, 0] },
      { t: 'wire', pts: [[11, 0], [17, 0], [17, 1.5]], flow: iabs > 0 ? (isDis ? true : 'reverse') : undefined },
      isDis ? { t: 'I', a: [17, 1.5], b: [17, 5.5], label: 'Load', value: si(iabs, 'A'), color: 'accent' }
            : { t: 'I', a: [17, 5.5], b: [17, 1.5], label: 'Charger', value: si(iabs, 'A'), color: 'accent' },
      { t: 'wire', pts: [[17, 5.5], [17, 8], [0, 8], [0, 7]], flow: iabs > 0 ? (isDis ? true : 'reverse') : undefined },
      { t: 'gnd', at: [7, 8] },
      { t: 'dot', at: [14, 0] }, { t: 'dot', at: [14, 8] },
      { t: 'vmark', a: [14, 1], b: [14, 7], label: 'V_t' },
      { t: 'text', at: [14, -1.2], text: `V_t = ${si(cur.vt, 'V')}`, color: 'accent' },
      { t: 'text', at: [9, 5.6], text: `V_1 = ${si(cur.v1, 'V')}`, muted: true },
    ] }).svg;
  }, [cur, isDis, s.rint, s.temp]);

  const ocvCurve = useMemo(() => {
    const xs: number[] = [], ys: number[] = [];
    for (let k = 0; k <= 200; k++) { const soc = 1 - k / 200; xs.push((1 - soc) * dis.qEff); ys.push(ocv(soc)); }
    return { x: xs, y: ys };
  }, [dis.qEff]);

  const hot = s.temp > 45, cold = s.temp < 0, coldChg = s.temp < 0 && !isDis, hiRate = isDis ? s.crate > 2 : s.crate > 1;
  const region = isDis
    ? (hot ? { l: 'Hot: accelerated ageing', c: 'bad' as const } : cold ? { l: 'Cold: high R, low capacity', c: 'warn' as const } : hiRate ? { l: 'High rate: big IR loss', c: 'warn' as const } : { l: 'Normal discharge', c: 'ok' as const })
    : (coldChg ? { l: 'Charging below 0 °C: Li plating!', c: 'bad' as const } : hot ? { l: 'Hot charge: ageing', c: 'bad' as const } : (cur.t < chg.tCC ? { l: 'CC phase (current limited)', c: 'info' as const } : { l: 'CV phase (voltage limited)', c: 'accent' as const }));

  const tmin = (xs: number[]) => xs.map(t => t / 60);
  const cvFracQ = 1 - chg.socAtCV, cvFracT = chg.tTotal > 0 ? (chg.tTotal - chg.tCC) / chg.tTotal : 0;
  const nominalWh = useMemo(() => { let m = 0; for (let k = 0; k < 400; k++) m += ocv((k + 0.5) / 400) / 400; return m * s.capacity; }, [s.capacity]);

  return (
    <SimShell title="LiPo cell: charge & discharge" onReset={() => set(init)}
      tryThis={isDis
        ? <>set temperature to 0 °C and then −20 °C at 1C. R grows by the Arrhenius factor (×{arrhenius(0).toFixed(1)} at 0 °C), so the curve shifts down by I·R and hits the 3.0 V cutoff long before the cell is empty: the charge is still there, you just can't get it out at that rate. Then try 3C at 25 °C and compare the I²R heat readout with 0.5C (heat scales with I², energy delivered falls).</>
        : <>watch where the CC phase ends: at 1C the cell reaches {vmax} V with only ~{(chg.socAtCV * 100).toFixed(0)}% SoC because the I·R drop makes Vt read high. Now drag C-rate to 0.2C (CV starts later, higher SoC) and to 2C (CV starts earlier). Then raise R<sub>int</sub>: the CV tail stretches, because in CV the current decays as (V<sub>max</sub> − OCV)/R.</>}
      controls={<>
        <Seg label="View" value={s.view} onChange={upd('view')} options={[{ value: 'discharge', label: 'Discharge' }, { value: 'charge', label: 'Charge (CC/CV)' }]} />
        <Slider label="Capacity (nominal)" value={s.capacity} min={0.1} max={20} log unit="Ah" format={v => si(v, 'Ah')} onChange={upd('capacity')} />
        <Slider label={isDis ? 'Discharge C-rate' : 'Charge C-rate (I_CC)'} value={s.crate} min={0.05} max={5} step={0.05} format={v => `${v.toFixed(2)}C = ${si(v * s.capacity, 'A')}`} onChange={upd('crate')} />
        <Slider label="Temperature" value={s.temp} min={-20} max={60} step={1} format={v => `${v.toFixed(0)} °C`} onChange={upd('temp')} />
        <Slider label="Internal resistance R_int @25 °C" value={s.rint} min={0.002} max={0.5} log unit="Ω" onChange={upd('rint')} />
        {isDis ? <>
          <Slider label="Cutoff voltage" value={s.vcut} min={2.5} max={3.4} step={0.05} unit="V" format={v => v.toFixed(2) + ' V'} onChange={upd('vcut')} />
          <Seg label="Compare against" value={s.compare} onChange={upd('compare')} options={[{ value: 'rate', label: 'C-rates' }, { value: 'temp', label: 'Temperatures' }]} />
        </> : <>
          <Select label="Charge voltage V_max" value={s.vmax} onChange={upd('vmax')} options={[{ value: '4.1', label: '4.10 V (longer life)' }, { value: '4.2', label: '4.20 V (standard)' }, { value: '4.35', label: '4.35 V (HV cell)' }]} />
          <Slider label="Termination current" value={s.iterm} min={0.01} max={0.3} step={0.01} format={v => `C/${(1 / v).toFixed(0)} = ${si(v * s.capacity, 'A')}`} onChange={upd('iterm')} />
        </>}
        <Slider label={isDis ? 'Inspect point (Ah delivered)' : 'Inspect point (time)'} value={s.cursor} min={0} max={1} step={0.005} format={v => isDis ? si(v * dis.ahOut, 'Ah') : fmtMin(v * chg.tTotal)} onChange={upd('cursor')} />
        <Note>1-RC Thevenin cell model: R<sub>0</sub> = R<sub>int</sub>·Arrhenius(T)·(rises below 20% SoC), R<sub>1</sub> = 0.6·R<sub>0</sub>, τ<sub>1</sub> = {TAU1} s. Isothermal (self-heating is reported, not fed back). OCV curve: typical NMC/graphite.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegionBadge label={region.l} color={region.c} />
        <span className="sim-note">SoC at cursor: {(cur.soc * 100).toFixed(1)}% · R<sub>0</sub> = {si(cur.R0, 'Ω')} (×{arrhenius(s.temp).toFixed(2)} for {s.temp} °C)</span>
      </div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <EqBox>{String.raw`\begin{gathered}V_t = \mathrm{OCV}(\text{SoC}) - I R_0 - V_1 \\ ${cur.o.toFixed(3)} ${cur.I >= 0 ? '-' : '+'} \text{${si(Math.abs(cur.I), 'A')}}\cdot ${(cur.R0 * 1000).toFixed(1)}\,\text{m}\Omega ${cur.v1 >= 0 ? '-' : '+'} ${Math.abs(cur.v1).toFixed(3)} = ${cur.vt.toFixed(3)}\ \text{V}\end{gathered}`}</EqBox>

      {isDis ? <>
        <Readouts>
          <Readout k="Capacity delivered" v={`${si(dis.ahOut, 'Ah')} (${(dis.ahOut / s.capacity * 100).toFixed(0)}%)`} hl tone={dis.ahOut / s.capacity < 0.8 ? 'warn' : undefined} />
          <Readout k="Energy delivered" v={`${si(dis.whOut, 'Wh')} (${(dis.whOut / nominalWh * 100).toFixed(0)}%)`} />
          <Readout k="Average voltage" v={si(dis.vAvg, 'V')} />
          <Readout k="Run time" v={fmtMin(dis.tEnd)} />
          <Readout k="IR step at t = 0" v={si(dis.drop0, 'V')} />
          <Readout k="I²R heat (total)" v={`${si(dis.heatJ, 'J')} = ${si(dis.heatJ / 3600, 'Wh')}`} tone={dis.heatJ / (dis.whOut * 3600) > 0.1 ? 'warn' : undefined} />
          <Readout k="Heat power at cursor" v={si(cur.pHeat, 'W')} />
          <Readout k="Efficiency (out / chemical)" v={`${(dis.whOut * 3600 / dis.chemJ * 100).toFixed(1)}%`} />
        </Readouts>
        <Plot height={260} xLabel="Capacity delivered" xUnit="Ah" yLabel="Terminal voltage V_t" yUnit="V" yRange={[Math.min(2.6, s.vcut - 0.2), 4.3]}
          xRange={[0, s.capacity * 1.03]}
          series={[
            { ...ocvCurve, label: s.compare === 'temp' ? `OCV (rested, ${s.temp} °C)` : 'OCV (rested)', color: 'muted', dashed: true },
            ...cmp.map((c, i) => ({ x: c.d.ah, y: c.d.v, label: c.lab, color: COLORS[i % COLORS.length], width: 1.4 })),
            { x: dis.ah, y: dis.v, label: s.compare === 'rate' ? `${s.crate.toFixed(2)}C (selected)` : `${s.temp} °C (selected)`, color: 'accent', width: 2.6 },
          ]}
          hlines={[{ at: s.vcut, label: `cutoff ${s.vcut.toFixed(2)} V`, color: 'red' }]}
          vlines={[{ at: dis.qEff, label: `accessible Q at ${s.temp} °C`, color: 'muted' }]}
          points={[{ x: dis.ah[cur.k], y: dis.v[cur.k], color: 'accent' }]} />
        <Note>Gap between the dashed OCV and a curve = I·R<sub>0</sub> + V<sub>1</sub>: the voltage you lose, and it all becomes heat (P = I²R). The curve ends where V<sub>t</sub> crosses the cutoff; with a hard cutoff, higher resistance or current means unused charge left in the cell.</Note>
      </> : <>
        <Readouts>
          <Readout k="Total charge time" v={fmtMin(chg.tTotal)} hl />
          <Readout k="CC phase" v={fmtMin(chg.tCC)} />
          <Readout k="CV phase" v={fmtMin(chg.tTotal - chg.tCC)} />
          <Readout k="SoC when CV starts" v={(chg.socAtCV * 100).toFixed(1) + '%'} />
          <Readout k="CV share: charge vs time" v={`${(cvFracQ * 100).toFixed(0)}% of Ah in ${(cvFracT * 100).toFixed(0)}% of time`} tone="warn" />
          <Readout k="Final SoC" v={(chg.finalSoc * 100).toFixed(1) + '%'} />
          <Readout k="Energy in / stored" v={`${si(chg.whIn, 'Wh')} / ${si(chg.chemJ / 3600, 'Wh')}`} />
          <Readout k="Heat while charging" v={si(chg.heatJ, 'J')} tone={coldChg ? 'bad' : undefined} />
        </Readouts>
        <Plot height={190} xLabel="Time (min)" yLabel="Charge current" yUnit="A" series={[{ x: tmin(chg.t), y: chg.i, label: 'I_chg', color: 'red', step: false }]}
          xspans={[{ from: 0, to: chg.tCC / 60, label: 'CC', color: 'blue' }, { from: chg.tCC / 60, to: chg.tTotal / 60, label: 'CV', color: 'accent' }]}
          hlines={[{ at: s.iterm * s.capacity, label: 'I_term', color: 'muted' }]} vlines={[{ at: cur.t / 60, color: 'accent' }]} />
        <Plot height={190} xLabel="Time (min)" yLabel="Terminal voltage" yUnit="V" yRange={[2.9, vmax + 0.1]} series={[{ x: tmin(chg.t), y: chg.v, label: 'V_t', color: 'blue' }, { x: tmin(chg.t), y: chg.soc.map(ocv), label: 'OCV(SoC)', color: 'muted', dashed: true }]}
          hlines={[{ at: vmax, label: `V_max = ${vmax} V`, color: 'red' }]} vlines={[{ at: cur.t / 60, color: 'accent' }]} />
        <Plot height={190} xLabel="Time (min)" yLabel="State of charge" yUnit="%" yRange={[0, 105]} series={[{ x: tmin(chg.t), y: chg.soc.map(v => v * 100), label: 'SoC', color: 'green', fill: true }]}
          hlines={[{ at: 80, label: '80%', color: 'muted' }]} points={[{ x: chg.tCC / 60, y: chg.socAtCV * 100, label: `CV starts at ${(chg.socAtCV * 100).toFixed(0)}%`, color: 'accent' }]} />
        <Note>In CV the charger holds V<sub>t</sub> = V<sub>max</sub>, so I = (V<sub>max</sub> − OCV − V<sub>1</sub>)/R<sub>0</sub>. As OCV creeps up the current falls roughly exponentially, which is why the last ~{(cvFracQ * 100).toFixed(0)}% takes {(cvFracT * 100).toFixed(0)}% of the time. Never charge Li-ion below 0 °C at normal rates (lithium plating) or above V<sub>max</sub>.</Note>
      </>}
    </SimShell>
  );
}
