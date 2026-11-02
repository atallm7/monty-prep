// MOSFET operating regions: output family, transfer curve, resistive load line and switch use.
// Physics lives in ../models/mosfet-lab.ts (square law + λ, PMOS sign conventions).
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import {
  drainCurrent, smallSignal, outputFamily, satBoundary, transferCurve, loadLinePoint, loadLine, triodeEdgeVgs, switchSweep,
  type MosType, type Region,
} from '../models/mosfet-lab';

type View = 'output' | 'transfer' | 'loadline' | 'switch';
const VIEWS: View[] = ['output', 'transfer', 'loadline', 'switch'];
const fin = (v: unknown, d: number) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : n; };

const REGION_INFO: Record<Region, { label: string; color: 'ok' | 'warn' | 'bad' | 'info'; use: string }> = {
  cutoff: { label: 'Cut-off', color: 'bad', use: 'Open switch: |Vgs| ≤ |Vt|, no channel, Id ≈ 0 (subthreshold leakage ignored).' },
  triode: { label: 'Triode (linear)', color: 'info', use: 'Closed switch / voltage-controlled resistor: |Vds| < |Vgs| − |Vt|, Id rises with Vds. Ron ≈ 1/(k\'(W/L)·Vov).' },
  saturation: { label: 'Saturation', color: 'ok', use: 'Amplifier / current source: |Vds| ≥ |Vgs| − |Vt|, channel pinched off, Id set by Vgs (only λ makes it rise with Vds).' },
};

export default function MosfetLab({ params }: SimProps) {
  const init = {
    type: (params.type === 'pmos' ? 'pmos' : 'nmos') as MosType,
    view: (VIEWS.includes(params.view) ? params.view : 'output') as View,
    vt: Math.abs(fin(params.vt, 1)), k: fin(params.k, 200e-6), wl: fin(params.wl, 10),
    // vgs / vds are stored as magnitudes; for PMOS a value of −3 or 3 both mean Vgs = −3 V
    vgs: Math.abs(fin(params.vgs, 3)), vds: Math.abs(fin(params.vds, 5)),
    vdd: Math.abs(fin(params.vdd, 10)), rd: Math.max(1, fin(params.rd, 1000)), lambda: Math.max(0, fin(params.lambda, 0.02)),
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const isN = s.type === 'nmos'; const sg = isN ? 1 : -1;
  const mp = { type: s.type, vt: s.vt, k: s.k, wl: s.wl, lambda: s.lambda };
  const beta = s.k * s.wl;
  const ll = s.view === 'loadline' || s.view === 'switch';
  const vgsMax = ll ? Math.max(6, Math.ceil(s.vdd)) : 6;
  const vgsSigned = sg * s.vgs;

  const op = useMemo(() => {
    if (ll) { const o = loadLinePoint(mp, vgsSigned, s.vdd, s.rd); return { vgs: vgsSigned, vds: o.vds, id: o.id, region: o.region }; }
    const vds = sg * s.vds; const r = drainCurrent(mp, vgsSigned, vds); return { vgs: vgsSigned, vds, id: r.id, region: r.region };
  }, [s]);
  const ss = useMemo(() => smallSignal(mp, op.vgs, op.vds), [s, op]);

  const vdsMax = ll ? s.vdd : Math.max(6, Math.ceil(s.vds * 1.2));
  const family = useMemo(() => {
    const steps = [0.5, 1, 1.5, 2, 2.5].map(d => s.vt + d).filter(v => Math.abs(v - s.vgs) > 0.12);
    return outputFamily(mp, steps, vdsMax);
  }, [s.type, s.vt, s.k, s.wl, s.lambda, s.vgs, vdsMax]);
  const current = useMemo(() => outputFamily(mp, [s.vgs], vdsMax)[0], [s.type, s.vt, s.k, s.wl, s.lambda, s.vgs, vdsMax]);
  const boundary = useMemo(() => satBoundary(mp, Math.min(vdsMax, Math.max(s.vgs - s.vt, 0) + 2.6)), [s.type, s.vt, s.k, s.wl, s.lambda, s.vgs, vdsMax]);
  const transfer = useMemo(() => transferCurve(mp, sg * s.vds, vgsMax), [s.type, s.vt, s.k, s.wl, s.lambda, s.vds, vgsMax]);
  const edgeVgs = useMemo(() => triodeEdgeVgs(mp, s.vdd, s.rd), [s.vt, s.k, s.wl, s.lambda, s.vdd, s.rd]);
  const sw = useMemo(() => switchSweep(mp, s.vdd, s.rd, vgsMax), [s.type, s.vt, s.k, s.wl, s.lambda, s.vdd, s.rd, vgsMax]);

  // ---------- schematic ----------
  const svg = useMemo(() => {
    const dev = s.type; const hot = op.region !== 'cutoff';
    const devColor = op.region === 'saturation' ? 'green' : op.region === 'triode' ? 'blue' : 'muted';
    const idTxt = `I_D = ${si(op.id, 'A')}`;
    let els: any[];
    if (!ll) {
      if (isN) els = [
        { t: 'V', a: [1, 4], b: [1, 8], label: 'V_{GS}', value: si(op.vgs, 'V'), labelSide: 'other' },
        { t: 'wire', pts: [[1, 4], [4, 4]] },
        { t: dev, at: [4, 4], label: 'M_1', color: devColor },
        { t: 'wire', pts: [[6, 6], [6, 8]] },
        { t: 'wire', pts: [[10, 4], [10, 0], [6, 0], [6, 2]], flow: hot },
        { t: 'V', a: [10, 4], b: [10, 8], label: 'V_{DS}', value: si(op.vds, 'V') },
        { t: 'wire', pts: [[1, 8], [10, 8]] }, { t: 'dot', at: [6, 8] }, { t: 'gnd', at: [6, 8] },
        { t: 'arrow', a: [8.8, -0.7], b: [7.2, -0.7], label: idTxt },
      ];
      else els = [
        { t: 'wire', pts: [[1, 0], [10, 0]] }, { t: 'dot', at: [6, 0] }, { t: 'wire', pts: [[10, 0], [12, 0]] }, { t: 'gnd', at: [12, 0] }, { t: 'dot', at: [10, 0] },
        { t: 'V', a: [1, 0], b: [1, 4], label: 'V_{SG}', value: si(-op.vgs, 'V'), labelSide: 'other' },
        { t: 'wire', pts: [[1, 4], [4, 4]] },
        { t: dev, at: [4, 4], label: 'M_1', color: devColor },
        { t: 'wire', pts: [[6, 0], [6, 2]], flow: hot },
        { t: 'wire', pts: [[6, 6], [6, 8], [10, 8], [10, 4]], flow: hot },
        { t: 'V', a: [10, 0], b: [10, 4], label: 'V_{SD}', value: si(-op.vds, 'V') },
        { t: 'arrow', a: [7, 9], b: [9, 9], label: `|I_D| = ${si(-op.id, 'A')}` },
      ];
    } else if (isN) els = [
      { t: 'rail', at: [6, -3], label: `V_{DD} = ${si(s.vdd, 'V')}` },
      { t: 'R', a: [6, -3], b: [6, 1], label: 'R_D', value: si(s.rd, 'Ω') },
      { t: 'wire', pts: [[6, 1], [6, 2]], flow: hot }, { t: 'wire', pts: [[6, 1], [9, 1]] }, { t: 'dot', at: [6, 1] },
      { t: 'term', at: [9, 1], label: `V_{out} = ${si(op.vds, 'V')}`, side: 'right' },
      { t: 'V', a: [1, 4], b: [1, 8], label: 'V_{GS}', value: si(op.vgs, 'V'), labelSide: 'other' },
      { t: 'wire', pts: [[1, 4], [4, 4]] },
      { t: dev, at: [4, 4], label: 'M_1', color: devColor },
      { t: 'wire', pts: [[6, 6], [6, 8], [1, 8]], flow: hot }, { t: 'gnd', at: [6, 8] },
    ];
    else els = [
      { t: 'rail', at: [6, 0], label: `V_{DD} = ${si(s.vdd, 'V')}` },
      { t: 'wire', pts: [[6, 0], [6, 2]], flow: hot },
      { t: 'V', a: [1, 4], b: [1, 8], label: 'V_G', value: si(s.vdd + op.vgs, 'V'), labelSide: 'other' },
      { t: 'wire', pts: [[1, 4], [4, 4]] }, { t: 'gnd', at: [1, 8] },
      { t: dev, at: [4, 4], label: 'M_1', color: devColor },
      { t: 'wire', pts: [[6, 6], [6, 7]], flow: hot }, { t: 'wire', pts: [[6, 7], [9, 7]] }, { t: 'dot', at: [6, 7] },
      { t: 'term', at: [9, 7], label: `V_{out} = ${si(s.vdd + op.vds, 'V')}`, side: 'right' },
      { t: 'R', a: [6, 7], b: [6, 11], label: 'R_D', value: si(s.rd, 'Ω') }, { t: 'gnd', at: [6, 11] },
    ];
    return renderCircuit({ elements: els }).svg;
  }, [s, op]);

  // ---------- plots ----------
  const famSeries = family.map(c => ({ x: c.x, y: c.y, label: `Vgs = ${c.vgs.toFixed(1)} V`, color: 'muted' }));
  const curSeries = { x: current.x, y: current.y, label: `Vgs = ${(sg * s.vgs).toFixed(2)} V (now)`, color: 'accent', width: 2.6 };
  const bSeries = { ...boundary, label: 'Vds = Vgs − Vt (sat. edge)', color: 'orange', dashed: true };
  const vov = Math.max(0, s.vgs - s.vt);
  const idMaxFam = Math.max(...[...family, current].flatMap(c => c.y.map(Math.abs)), 1e-9);
  const idAxis = (m: number): [number, number] => isN ? [0, m * 1.08] : [-m * 1.08, 0];

  let plot: JSX.Element;
  if (s.view === 'output') {
    plot = <Plot series={[...famSeries, bSeries, curSeries]} xUnit="V" yUnit="A" xLabel="Vds" yLabel="Id" height={290}
      yRange={idAxis(idMaxFam)} xRange={isN ? [0, vdsMax] : [-vdsMax, 0]}
      vlines={op.region !== 'cutoff' ? [{ at: sg * vov, label: 'Vds,sat = Vov', color: 'orange' }] : []}
      points={[{ x: op.vds, y: op.id, label: 'Q', color: 'accent' }]} />;
  } else if (s.view === 'transfer') {
    const tan = op.region === 'saturation' ? (() => { const x0 = sg * (s.vt + vov * 0.4), x1 = sg * Math.min(vgsMax, s.vgs + 1.2); return { x: [x0, x1], y: [x0, x1].map(x => op.id + ss.gm * (x - op.vgs)) }; })() : null;
    const yMax = Math.max(...transfer.y.map(Math.abs), 1e-9);
    plot = <Plot series={[{ ...transfer, label: `Id at Vds = ${(sg * s.vds).toFixed(2)} V`, color: 'accent', width: 2.4 }, ...(tan ? [{ ...tan, label: 'slope gm', color: 'green', dashed: true }] : [])]}
      xUnit="V" yUnit="A" xLabel="Vgs" yLabel="Id" height={290} yRange={idAxis(yMax)} xRange={isN ? [0, vgsMax] : [-vgsMax, 0]}
      vlines={[{ at: sg * s.vt, label: isN ? 'Vt' : '−|Vtp|', color: 'red' }]}
      xspans={[{ from: Math.min(0, sg * s.vt), to: Math.max(0, sg * s.vt), label: 'cut-off', color: 'red' },
        ...(s.vt + s.vds < vgsMax ? [{ from: Math.min(sg * (s.vt + s.vds), sg * vgsMax), to: Math.max(sg * (s.vt + s.vds), sg * vgsMax), label: 'triode', color: 'blue' }] : [])]}
      points={[{ x: op.vgs, y: op.id, label: 'Q', color: 'accent' }]} />;
  } else if (s.view === 'loadline') {
    const lline = loadLine(mp, s.vdd, s.rd);
    plot = <>
      <Plot series={[...famSeries, bSeries, curSeries, { ...lline, label: `load line: VDD/RD = ${si(s.vdd / s.rd, 'A')}`, color: 'red', width: 2 }]}
        xUnit="V" yUnit="A" xLabel="Vds" yLabel="Id" height={270}
        yRange={idAxis(Math.max(s.vdd / s.rd, Math.abs(op.id)) * 1.15)} xRange={isN ? [0, s.vdd] : [-s.vdd, 0]}
        points={[{ x: op.vds, y: op.id, label: 'Q', color: 'accent' }]} />
      <Plot series={[{ x: sw.x.map(v => sg * v), y: sw.vds.map(v => isN ? v : s.vdd - v), label: 'Vout vs gate drive', color: 'accent', width: 2.2 }]}
        xUnit="V" yUnit="V" xLabel={isN ? 'Vgs' : 'Vgs = VG − VDD'} yLabel="Vout" height={180} yRange={[0, s.vdd * 1.05]}
        xspans={isN ? [{ from: 0, to: s.vt, label: 'cut-off', color: 'red' }, { from: s.vt, to: edgeVgs, label: 'sat.', color: 'green' }, { from: edgeVgs, to: vgsMax, label: 'triode', color: 'blue' }]
          : [{ from: -s.vt, to: 0, label: 'cut-off', color: 'red' }, { from: -edgeVgs, to: -s.vt, label: 'sat.', color: 'green' }, { from: -vgsMax, to: -edgeVgs, label: 'triode', color: 'blue' }]}
        points={[{ x: op.vgs, y: isN ? Math.abs(op.vds) : s.vdd - Math.abs(op.vds), label: 'Q' }]} />
    </>;
  } else {
    const ron = sw.ron; const ronF = ron.filter(v => Number.isFinite(v) && v > 0);
    plot = <Plot series={[{ x: sw.x, y: ron.map(v => Number.isFinite(v) ? v : NaN), label: 'Rds(on) = |Vds/Id| at the load-line Q-point', color: 'accent', width: 2.4 },
      { x: sw.x, y: sw.x.map(v => v > s.vt ? 1 / (beta * (v - s.vt)) : NaN), label: '1/(β·Vov) deep-triode limit', color: 'green', dashed: true }]}
      xRange={[0, vgsMax]} xUnit="V" yUnit="Ω" xLabel={isN ? 'Gate drive Vgs' : 'Gate drive Vsg = VDD − VG'} yLabel="Ron" yLog height={270}
      yRange={[Math.max(1e-3, Math.min(...ronF, 1e9) * 0.6), Math.max(s.rd * 50, Math.min(Math.max(...ronF, 1), 1e7))]}
      vlines={[{ at: s.vt, label: '|Vt|', color: 'red' }, { at: edgeVgs, label: 'enters triode', color: 'orange' }]}
      points={op.region !== 'cutoff' ? [{ x: s.vgs, y: ss.ronOp, label: 'now' }] : []} />;
  }

  const ri = REGION_INFO[op.region];
  const vgsLbl = isN ? 'Vgs' : 'Vsg = −Vgs';
  const eq = op.region === 'cutoff'
    ? String.raw`|V_{GS}| = ${s.vgs.toFixed(2)} \le |V_t| = ${s.vt.toFixed(2)}\,\text{V} \;\Rightarrow\; I_D = 0`
    : op.region === 'triode'
      ? String.raw`|I_D| = k'\tfrac{W}{L}\Big(V_{ov}|V_{DS}| - \tfrac{V_{DS}^2}{2}\Big)(1+\lambda|V_{DS}|) = ${si(beta, '\\text{A/V}^2')}\big(${vov.toFixed(2)}\cdot${Math.abs(op.vds).toFixed(3)} - \tfrac{${Math.abs(op.vds).toFixed(3)}^2}{2}\big)(1+${s.lambda}\cdot${Math.abs(op.vds).toFixed(2)}) = ${si(Math.abs(op.id), '\\text{A}')}`
      : String.raw`|I_D| = \tfrac12 k'\tfrac{W}{L}V_{ov}^2(1+\lambda|V_{DS}|) = \tfrac12\cdot${si(beta, '\\text{A/V}^2')}\cdot${vov.toFixed(2)}^2\,(1+${s.lambda}\cdot${Math.abs(op.vds).toFixed(2)}) = ${si(Math.abs(op.id), '\\text{A}')}`;

  const tryThis = s.view === 'output' ? <>set V<sub>gs</sub> = 3 V and λ = 0: the plateau is ½·k'(W/L)·(2 V)² = 4 mA with k'(W/L) = 2 mA/V². Drag V<sub>ds</sub> below 2 V and the badge flips to triode exactly at V<sub>ds</sub> = V<sub>gs</sub> − V<sub>t</sub> (orange dashed locus). Then raise λ and watch the plateau tilt; extrapolated back, every curve meets the axis at −1/λ.</>
    : s.view === 'transfer' ? <>with V<sub>ds</sub> large the curve is a parabola starting at V<sub>t</sub>; doubling the overdrive quadruples I<sub>d</sub> but only doubles g<sub>m</sub> = 2I<sub>d</sub>/V<sub>ov</sub>. Drop V<sub>ds</sub> to 0.5 V and the curve straightens above V<sub>t</sub> + V<sub>ds</sub>: the device is in triode and acts as a resistor.</>
      : s.view === 'loadline' ? <>sweep V<sub>gs</sub> from 0 to 6 V. The Q-point leaves cut-off at V<sub>t</sub>, rides the saturation curves (high gain), and crosses into triode near {si(sg * edgeVgs, 'V')}. Halve R<sub>D</sub> and that crossing moves to a higher gate voltage.</>
        : <>raise the gate drive and watch R<sub>on</sub> fall as 1/(β·V<sub>ov</sub>). Below the orange line the device is still in saturation and drops most of the supply: as a switch it would overheat. Switch type to PMOS: it turns on when the gate is pulled <i>below</i> its source (V<sub>DD</sub>) by more than |V<sub>t</sub>|.</>;

  return (
    <SimShell title={`${isN ? 'NMOS' : 'PMOS'} operating regions`} onReset={() => set(init)} tryThis={tryThis}
      controls={<>
        <Seg label="Device" value={s.type} options={[{ value: 'nmos', label: 'NMOS' }, { value: 'pmos', label: 'PMOS' }]} onChange={upd('type')} />
        <Seg label="View" value={s.view} options={[{ value: 'output', label: 'Output' }, { value: 'transfer', label: 'Transfer' }, { value: 'loadline', label: 'Load line' }, { value: 'switch', label: 'Switch' }]} onChange={upd('view')} />
        <Slider label={isN ? 'Gate–source Vgs' : 'Source–gate Vsg (Vgs = −Vsg)'} value={s.vgs} min={0} max={vgsMax} step={0.01} unit="V" onChange={upd('vgs')} />
        {!ll && <Slider label={isN ? 'Drain–source Vds' : 'Source–drain Vsd (Vds = −Vsd)'} value={s.vds} min={0} max={10} step={0.01} unit="V" onChange={upd('vds')} />}
        {ll && <Slider label="Supply VDD" value={s.vdd} min={1} max={20} step={0.1} unit="V" onChange={upd('vdd')} />}
        {ll && <Slider label="Load RD" value={s.rd} min={10} max={100e3} log unit="Ω" onChange={upd('rd')} />}
        <Slider label={isN ? 'Threshold Vt' : 'Threshold |Vtp|'} value={s.vt} min={0.2} max={3} step={0.01} unit="V" onChange={upd('vt')} />
        <Slider label="Process k' = µCox" value={s.k} min={10e-6} max={1e-3} log format={v => si(v, 'A/V²')} onChange={upd('k')} />
        <Slider label="W/L" value={s.wl} min={1} max={200} log format={v => v.toPrecision(3)} onChange={upd('wl')} />
        <Slider label="Channel-length modulation λ" value={s.lambda} min={0} max={0.2} step={0.005} format={v => `${v.toFixed(3)} V⁻¹`} onChange={upd('lambda')} />
        <Note>Long-channel square law (SPICE level 1). {isN ? '' : 'PMOS: all voltages and Id are negative (Id flows out of the drain); the sliders set magnitudes. '}Subthreshold conduction and velocity saturation are ignored.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={ri.label} color={ri.color} />
        <span className="small muted">{ri.use}</span>
      </div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <Readouts>
        <Readout k="Id" v={si(op.id, 'A')} hl />
        <Readout k={vgsLbl} v={si(sg * op.vgs, 'V')} />
        <Readout k={isN ? 'Vds' : 'Vds (Vsd)'} v={isN ? si(op.vds, 'V') : `${si(op.vds, 'V')} (${si(-op.vds, 'V')})`} />
        <Readout k="Overdrive Vov" v={si(vov, 'V')} />
        <Readout k="k'·W/L" v={si(beta, 'A/V²')} />
        {op.region === 'saturation' && <Readout k="gm" v={si(ss.gm, 'S')} />}
        {op.region === 'saturation' && <Readout k="ro = 1/(λ·Id)" v={Number.isFinite(ss.ro) ? si(ss.ro, 'Ω') : '∞ (λ = 0)'} />}
        {op.region === 'saturation' && Number.isFinite(ss.ro) && <Readout k="Intrinsic gain gm·ro" v={(ss.gm * ss.ro).toFixed(1)} />}
        {op.region !== 'cutoff' && <Readout k="Ron (Vds→0) = 1/(βVov)" v={si(ss.ron, 'Ω')} />}
        {op.region !== 'cutoff' && <Readout k="|Vds/Id| at Q" v={si(ss.ronOp, 'Ω')} tone={op.region === 'triode' ? 'ok' : undefined} />}
        {ll && <Readout k="Device dissipation" v={si(Math.abs(op.id * op.vds), 'W')} tone={s.view === 'switch' && op.region === 'saturation' ? 'bad' : undefined} />}
        {ll && <Readout k="Triode edge at |Vgs|" v={si(edgeVgs, 'V')} />}
      </Readouts>
      <EqBox>{eq}</EqBox>
      {plot}
    </SimShell>
  );
}
