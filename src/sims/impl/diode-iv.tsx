// Diode I–V curve & operating point. Physics lives in ../models/diode-iv.ts (Shockley + Rs + breakdown + T).
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Select, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { DEVICES, DeviceId, operatingPoint, ivCurve, forwardVoltage, isAtT } from '../models/diode-iv';

const DEV_OPTS = (Object.keys(DEVICES) as DeviceId[]).map(k => ({ value: k, label: DEVICES[k].name }));
const SYMBOL: Record<DeviceId, string> = { si: 'D', schottky: 'Schottky', ge: 'D', 'led-red': 'LED', 'led-blue': 'LED', zener: 'Zener' };
const DEV_COLOR: Record<DeviceId, string> = { si: 'accent', schottky: 'green', ge: 'orange', 'led-red': 'red', 'led-blue': 'blue', zener: 'purple' };

export default function DiodeIV({ params }: SimProps) {
  const dev0 = (String(params.device ?? 'si') in DEVICES ? String(params.device ?? 'si') : 'si') as DeviceId;
  const init = {
    device: dev0, vs: Number(params.vs ?? 5), r: Number(params.r ?? 1000),
    view: (params.view === 'curve' ? 'curve' : 'loadline') as 'curve' | 'loadline',
    tC: 25, logI: false, full: false, overlay: false,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const d = DEVICES[s.device];

  const op = useMemo(() => operatingPoint({ device: s.device, vs: s.vs, r: s.r, tC: s.tC }), [s.device, s.vs, s.r, s.tC]);

  // ---- plot data ----
  const plot = useMemo(() => {
    const vHi = (s.view === 'curve' && s.overlay
      ? Math.max(...(Object.keys(DEVICES) as DeviceId[]).map(k => forwardVoltage(k, 60e-3, s.tC)))
      : forwardVoltage(s.device, 60e-3, s.tC)) + 0.15;
    if (s.view === 'curve') {
      const v0 = s.full ? -1.15 * d.bv : -Math.min(1, 0.4 * d.bv);
      const N = 700;
      const main = ivCurve(s.device, v0, vHi, N, s.tC);
      const tr = (c: { x: number[]; y: number[] }) => s.logI ? { x: c.x, y: c.y.map(Math.abs) } : c;
      const series: any[] = [];
      if (s.overlay) {
        for (const k of Object.keys(DEVICES) as DeviceId[]) if (k !== s.device) {
          const lo = s.full ? -1.15 * d.bv : v0;
          series.push({ ...tr(ivCurve(k, lo, vHi, N, s.tC)), label: DEVICES[k].name.split(' (')[0], color: DEV_COLOR[k], width: 1.2, dashed: true });
        }
      }
      if (Math.abs(s.tC - 25) > 0.5) series.push({ ...tr(ivCurve(s.device, v0, vHi, N, 25)), label: `${d.name.split(' (')[0]} @ 25 °C`, color: 'muted', dashed: true });
      series.push({ ...tr(main), label: `${d.name.split(' (')[0]} @ ${s.tC.toFixed(0)} °C`, color: DEV_COLOR[s.device], width: 2.4 });
      const vf1 = forwardVoltage(s.device, 1e-3, s.tC);
      return {
        series, xRange: [v0, vHi] as [number, number],
        yRange: s.logI ? [1e-15, 1] as [number, number] : [s.full ? -60e-3 : -5e-3, 60e-3] as [number, number],
        vlines: [{ at: vf1, label: `Vf @ 1 mA = ${vf1.toFixed(3)} V`, color: 'muted' }, ...(s.full ? [{ at: -d.bv, label: `−BV = −${d.bv} V`, color: 'red' }] : [])],
        points: [] as any[],
      };
    }
    // load-line view
    const isc = s.vs / Math.max(s.r, 1e-3);
    const xa = Math.min(0, s.vs, op.vd), xb = Math.max(0, s.vs, op.vd);
    const pad = Math.max(0.15, 0.06 * (xb - xa));
    const xRange: [number, number] = [xa - pad, xb + pad];
    const iy = [0, isc, op.i];
    const ya = Math.min(...iy), yb = Math.max(...iy); const ypad = Math.max(1e-6, 0.12 * (yb - ya));
    const curve = ivCurve(s.device, xRange[0], xRange[1], 600, s.tC);
    const ll = { x: [xRange[0], xRange[1]], y: [(s.vs - xRange[0]) / s.r, (s.vs - xRange[1]) / s.r] };
    return {
      series: [{ ...curve, label: 'diode I(V)', color: DEV_COLOR[s.device], width: 2.4 }, { ...ll, label: 'load line I = (Vs − V)/R', color: 'muted', dashed: true }],
      xRange, yRange: [ya - ypad, yb + ypad] as [number, number],
      vlines: [] as any[],
      points: [{ x: op.vd, y: op.i, label: `Q (${op.vd.toFixed(3)} V, ${si(op.i, 'A')})`, color: 'accent' }],
    };
  }, [s, d, op]);

  // ---- schematic ----
  const flowing = Math.abs(op.i) > 1e-6;
  const lit = (s.device === 'led-red' || s.device === 'led-blue') && op.i > 1e-3;
  const schematic = useMemo(() => renderCircuit({
    elements: [
      { t: 'V', a: [0, 2], b: [0, 6], label: 'V_S', value: si(s.vs, 'V') },
      { t: 'wire', pts: [[0, 2], [0, 0], [1, 0]], flow: flowing ? (op.i > 0 ? true : 'reverse') : undefined },
      { t: 'R', a: [1, 0], b: [5, 0], label: 'R', value: si(s.r, 'Ω') },
      { t: 'wire', pts: [[5, 0], [7, 0], [7, 2]], flow: flowing ? (op.i > 0 ? true : 'reverse') : undefined },
      { t: SYMBOL[s.device], a: [7, 2], b: [7, 6], label: 'D', value: `V_D = ${si(op.vd, 'V')}`, color: lit ? DEV_COLOR[s.device] : (op.region === 'breakdown' ? 'purple' : op.region === 'forward' && flowing ? 'accent' : undefined) },
      { t: 'wire', pts: [[7, 6], [7, 8], [0, 8], [0, 6]], flow: flowing ? (op.i > 0 ? true : 'reverse') : undefined },
      { t: 'gnd', at: [3.5, 8] },
      { t: 'text', at: [13.2, 4], text: ' ' }, // spacer: the renderer's viewBox does not include part value labels
      { t: 'arrow', a: [2, 2], b: [4.6, 2], label: `I = ${si(op.i, 'A')}` },
    ],
  }).svg, [s.vs, s.r, s.device, op, flowing, lit]);

  const regionColor = op.region === 'forward' ? 'ok' : op.region === 'breakdown' ? 'bad' : 'info';
  const regionLabel = op.region === 'forward' ? (op.i > 1e-4 ? 'Forward: conducting' : 'Forward: below knee') : op.region === 'breakdown' ? 'Reverse breakdown' : 'Reverse: blocking';
  const isT = isAtT(d, op.T);

  return (
    <SimShell title="Diode I–V curve & operating point" onReset={() => set(init)}
      tryThis={s.view === 'loadline'
        ? <>pick the <b>Zener</b>, set V<sub>S</sub> = −12 V and sweep R from 200 Ω to 5 kΩ: V<sub>D</sub> stays pinned near −5.1 V while the current changes 20×. That is a shunt regulator. Then pick <b>Silicon</b> at +5 V and raise the temperature 50 °C: V<sub>D</sub> falls by about 100 mV (≈ −2 mV/°C).</>
        : <>switch on <b>log |I|</b>: the forward branch is a straight line whose slope is one decade per n·V<sub>T</sub>·ln10 (≈ 60 mV × n). Overlay all devices and compare where each one reaches 1 mA, then turn on the full range to see the Zener break down at −5.1 V.</>}
      controls={<>
        <Select label="Device" value={s.device} options={DEV_OPTS} onChange={upd('device')} />
        <Seg label="View" value={s.view} options={[{ value: 'loadline', label: 'Load line' }, { value: 'curve', label: 'I–V curve' }]} onChange={upd('view')} />
        {s.view === 'loadline' && <>
          <Slider label="Source Vs" value={s.vs} min={-30} max={30} step={0.05} unit="V" onChange={upd('vs')} />
          <Slider label="Series R" value={s.r} min={1} max={1e6} log unit="Ω" onChange={upd('r')} />
        </>}
        <Slider label="Temperature" value={s.tC} min={-40} max={150} step={1} format={v => `${v.toFixed(0)} °C`} onChange={upd('tC')} />
        {s.view === 'curve' && <>
          <Toggle label="Log |I| axis" checked={s.logI} onChange={upd('logI')} />
          <Toggle label="Full range (show breakdown)" checked={s.full} onChange={upd('full')} />
          <Toggle label="Overlay all devices" checked={s.overlay} onChange={upd('overlay')} />
        </>}
        <Note>{d.note}. Model: I<sub>S</sub> = {si(d.is, 'A')} at 27 °C, n = {d.n}, R<sub>S</sub> = {d.rs} Ω, BV = {d.bv} V.</Note>
      </>}>
      {s.view === 'loadline' && <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '4px 0 8px' }}>
        {s.view === 'loadline' ? <RegionBadge label={regionLabel} color={regionColor} /> : <RegionBadge label={d.name} color="accent" />}
        {s.view === 'loadline' && <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Newton–bisection solve: {op.iter} iterations, KVL residual {si(Math.abs(op.residual), 'V')}</span>}
      </div>
      {s.view === 'loadline' ? (
        <Readouts>
          <Readout k="Diode voltage V_D" v={si(op.vd, 'V')} hl />
          <Readout k="Current I" v={si(op.i, 'A')} hl />
          <Readout k="V across R" v={si(op.vr, 'V')} />
          <Readout k="Diode power" v={si(op.pd, 'W')} tone={Math.abs(op.pd) > 0.5 ? 'bad' : Math.abs(op.pd) > 0.2 ? 'warn' : undefined} />
          <Readout k="Small-signal r_d" v={si(op.rd, 'Ω')} />
          <Readout k="I_S at T" v={si(isT, 'A')} />
        </Readouts>
      ) : (
        <Readouts>
          <Readout k="Vf @ 1 mA" v={si(forwardVoltage(s.device, 1e-3, s.tC), 'V')} hl />
          <Readout k="Vf @ 20 mA" v={si(forwardVoltage(s.device, 20e-3, s.tC), 'V')} />
          <Readout k="I_S at T" v={si(isT, 'A')} />
          <Readout k="n·V_T" v={si(d.n * op.vt, 'V')} />
          <Readout k="mV per decade" v={(d.n * op.vt * Math.LN10 * 1000).toFixed(1) + ' mV'} />
          <Readout k="Breakdown" v={`−${d.bv} V`} />
        </Readouts>
      )}
      <EqBox>{s.view === 'loadline'
        ? (op.region === 'breakdown' ? String.raw`I \approx -I_{BV}e^{-(V_j+BV)/n_{bv}V_T} = \frac{V_S - V_D}{R}` : String.raw`I = I_S\left(e^{(V_D - IR_S)/nV_T}-1\right) = \frac{V_S - V_D}{R}`) + String.raw`\;\Rightarrow\; ${si(op.i, '\\text{A}')} = \frac{${s.vs.toFixed(2)} - (${op.vd.toFixed(3)})}{${si(s.r, '\\Omega')}}`
        : String.raw`I = I_S\left(e^{V_j/nV_T}-1\right) - I_{BV}e^{-(V_j+BV)/n_{bv}V_T},\quad V_T = \frac{kT}{q} = ${(op.vt * 1000).toFixed(2)}\,\text{mV}`}</EqBox>
      <Plot series={plot.series} xRange={plot.xRange} yRange={plot.yRange} yLog={s.view === 'curve' && s.logI}
        xLabel="Diode voltage V_D" yLabel={s.view === 'curve' && s.logI ? 'Current |I|' : 'Current I'} xUnit="V" yUnit="A" height={290}
        hlines={s.view === 'loadline' || !s.logI ? [{ at: 0, color: 'muted' }] : []}
        vlines={plot.vlines} points={plot.points} />
    </SimShell>
  );
}
