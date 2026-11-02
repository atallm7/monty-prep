// CMOS inverter / buffer: VTC + noise margins, shoot-through, power, and a series-RC transient.
// Physics in ../models/cmos-inverter.ts (square-law devices, unity-gain VIL/VIH, P = αCV²f, backward-Euler transient).
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { logspace } from '../../lib/units';
import { vtc, noiseMargins, vmAnalytic, iscPeak, iscIntegral, power, transient, vout as voutOf, currents, type InvParams } from '../models/cmos-inverter';

type View = 'vtc' | 'power' | 'transient';
type Zoom = 'full' | 'rise' | 'fall';
const fin = (v: unknown, d: number) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : n; };

function regionOf(vov: number, vds: number) { return vov <= 0 ? 'off' : vds < vov ? 'triode' : 'sat'; }

export default function CmosInverter({ params }: SimProps) {
  const init = {
    view: (['vtc', 'power', 'transient'].includes(params.view) ? params.view : 'vtc') as View,
    vdd: Math.max(0.5, fin(params.vdd, 3.3)), ratio: Math.max(0.01, fin(params.ratio, 1)), cl: Math.max(1e-15, fin(params.cl, 10e-12)), f: Math.max(1, fin(params.f, 10e6)),
    vt: 0.5, kn: 2e-3, lambda: 0, alpha: 1, tr: 1e-9, ileak: 1e-9, rs: 25, probe: NaN as number, zoom: 'full' as Zoom,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const p: InvParams = { vdd: s.vdd, kn: s.kn, ratio: s.ratio, vtn: s.vt, vtp: s.vt, lambda: s.lambda };
  const devKey = [s.vdd, s.kn, s.ratio, s.vt, s.lambda].join();

  const curve = useMemo(() => vtc(p), [devKey]);
  const nm = useMemo(() => noiseMargins(p), [devKey]);
  const ipk = useMemo(() => iscPeak(p), [devKey]);
  const scInt = useMemo(() => iscIntegral(p), [devKey]);
  const pw = power(p, { cl: s.cl, f: s.f, alpha: s.alpha, tr: s.tr, ileak: s.ileak }, scInt);
  const probe = Number.isFinite(s.probe) ? Math.min(s.probe, s.vdd) : nm.vm;
  const pv = voutOf(p, probe); const pc = currents(p, probe, pv);
  const nReg = regionOf(probe - s.vt, pv), pReg = regionOf(s.vdd - probe - s.vt, s.vdd - pv);
  const tran = useMemo(() => s.view === 'transient' ? transient(p, { cl: s.cl, rs: s.rs, f: s.f, tr: s.tr }) : null, [s.view, devKey, s.cl, s.rs, s.f, s.tr]);

  const svg = useMemo(() => {
    const tr = s.view === 'transient';
    const nOn = s.view === 'vtc' ? nReg !== 'off' : true, pOn = s.view === 'vtc' ? pReg !== 'off' : true;
    const els: any[] = [
      { t: 'rail', at: [6, -1], label: `V_{DD} = ${si(s.vdd, 'V')}` }, { t: 'wire', pts: [[6, -1], [6, 0]], flow: s.view === 'vtc' && pc.ip > 1e-9 },
      { t: 'pmos', at: [4, 2], label: 'M_P', color: pOn ? 'orange' : 'muted' },
      { t: 'nmos', at: [4, 6], label: 'M_N', color: nOn ? 'blue' : 'muted' },
      { t: 'wire', pts: [[4, 2], [2, 2], [2, 6], [4, 6]] }, { t: 'wire', pts: [[0, 4], [2, 4]] }, { t: 'dot', at: [2, 4] },
      { t: 'term', at: [0, 4], label: s.view === 'transient' ? 'V_G = \u0100' : s.view === 'power' ? 'V_{in}' : `V_{in} = ${si(probe, 'V')}`, side: 'left' },
      { t: 'wire', pts: [[6, 8], [6, 9]], flow: s.view === 'vtc' && pc.in > 1e-9 }, { t: 'gnd', at: [6, 9] },
      { t: 'wire', pts: [[6, 4], [9, 4]] }, { t: 'dot', at: [6, 4] },
    ];
    if (tr) els.push({ t: 'R', a: [10, 4], b: [14, 4], label: 'R_S', value: si(s.rs, 'Ω') }, { t: 'C', a: [14, 4], b: [14, 8], label: 'C_L', value: si(s.cl, 'F') }, { t: 'wire', pts: [[14, 8], [14, 9]] }, { t: 'gnd', at: [14, 9] }, { t: 'wire', pts: [[9, 4], [10, 4]] }, { t: 'dot', at: [9, 4] }, { t: 'text', at: [8.6, 5.4], text: 'V_{out}', size: 12 });
    else if (s.view === 'power') els.push({ t: 'C', a: [9, 4], b: [9, 8], label: 'C_L', value: si(s.cl, 'F') }, { t: 'wire', pts: [[9, 8], [9, 9]] }, { t: 'gnd', at: [9, 9] }, { t: 'dot', at: [9, 4] }, { t: 'wire', pts: [[9, 4], [11, 4]] }, { t: 'term', at: [11, 4], label: 'V_{out}', side: 'right' });
    else els.push({ t: 'term', at: [9, 4], label: `V_{out} = ${si(pv, 'V')}`, side: 'right' });
    els.push({ t: 'text', at: [-6, 4], text: ' ', anchor: 'start' }, { t: 'text', at: [15.5, 4], text: ' ', anchor: 'end' });
    return renderCircuit({ elements: els }).svg;
  }, [s, probe, pv, nReg, pReg, pc.in, pc.ip]);

  const r = Math.sqrt(s.ratio);
  let stage: JSX.Element; let eq: string; let tryThis: JSX.Element; let readouts: JSX.Element;

  if (s.view === 'vtc') {
    const matched = Math.abs(s.ratio - 1) < 1e-9 && s.lambda === 0;
    stage = <>
      <Plot series={[{ x: curve.x, y: curve.y, label: 'Vout (VTC)', color: 'accent', width: 2.6 }, { x: [0, s.vdd], y: [0, s.vdd], label: 'Vout = Vin', color: 'muted', dashed: true }]}
        xUnit="V" yUnit="V" xLabel="Vin" yLabel="Vout" height={280} xRange={[0, s.vdd]} yRange={[0, s.vdd * 1.04]}
        vlines={[{ at: nm.vil, label: 'VIL', color: 'green' }, { at: nm.vm, label: 'VM', color: 'red' }, { at: nm.vih, label: 'VIH', color: 'green' }]}
        xspans={[{ from: 0, to: nm.vil, label: 'NML', color: 'green' }, { from: nm.vih, to: s.vdd, label: 'NMH', color: 'green' }]}
        points={[{ x: nm.vil, y: nm.voutAtVil, label: '' }, { x: nm.vih, y: nm.voutAtVih, label: 'gain = −1' }, { x: probe, y: pv, label: 'probe', color: 'orange' }]} />
      <Plot series={[{ x: curve.x, y: curve.isc, label: 'shoot-through Isc = In = Ip', color: 'red', width: 2.2, fill: true }]}
        xUnit="V" yUnit="A" xLabel="Vin" yLabel="Isc" height={170} xRange={[0, s.vdd]}
        vlines={[{ at: s.vt, label: 'Vtn', color: 'blue' }, { at: s.vdd - s.vt, label: 'VDD − |Vtp|', color: 'orange' }]}
        points={[{ x: probe, y: pc.in, label: 'probe', color: 'orange' }]} />
    </>;
    eq = String.raw`V_M = \frac{V_{tn} + r\,(V_{DD}-|V_{tp}|)}{1+r},\; r=\sqrt{k_p/k_n} = ${r.toFixed(3)} \;\Rightarrow\; V_M = ${vmAnalytic(p).toFixed(3)}\,\text{V}` +
      (matched ? String.raw`\\ V_{IL} = \frac{3V_{DD}+2V_t}{8} = ${((3 * s.vdd + 2 * s.vt) / 8).toFixed(3)}\,\text{V}` : '');
    tryThis = <>at ratio 1 the curve is centred (V<sub>M</sub> = V<sub>DD</sub>/2) and NM<sub>L</sub> = NM<sub>H</sub> = (3V<sub>DD</sub> + 2V<sub>t</sub>)/8. Drop the ratio to 0.36 (equal-width devices, µ<sub>n</sub>/µ<sub>p</sub> ≈ 2.8): V<sub>M</sub> shifts low and NM<sub>L</sub> shrinks. Then drag the probe across V<sub>M</sub>: the shoot-through current peaks there with both FETs saturated.</>;
    readouts = <>
      <Readout k="Switching threshold VM" v={si(nm.vm, 'V')} hl />
      <Readout k="VIL / VIH (gain = −1)" v={`${si(nm.vil, 'V')} / ${si(nm.vih, 'V')}`} />
      <Readout k="NML = VIL − VOL" v={si(nm.nml, 'V')} tone={nm.nml < 0.3 * s.vdd ? 'warn' : 'ok'} />
      <Readout k="NMH = VOH − VIH" v={si(nm.nmh, 'V')} tone={nm.nmh < 0.3 * s.vdd ? 'warn' : 'ok'} />
      <Readout k="VOH / VOL" v={`${si(nm.voh, 'V')} / ${si(nm.vol, 'V')}`} />
      <Readout k="Gain at VM" v={Number.isFinite(nm.gainAtVm) && Math.abs(nm.gainAtVm) < 1e4 ? nm.gainAtVm.toFixed(1) : '−∞ (λ = 0)'} />
      <Readout k="Peak shoot-through" v={si(ipk, 'A')} />
      <Readout k="Probe: Vout / Isc" v={`${si(pv, 'V')} / ${si(pc.in, 'A')}`} />
      <Readout k="Probe: NMOS / PMOS" v={`${nReg} / ${pReg}`} />
    </>;
  } else if (s.view === 'power') {
    const fs = logspace(1e3, 1e9, 121);
    const pf = fs.map(f => power(p, { cl: s.cl, f, alpha: s.alpha, tr: s.tr, ileak: s.ileak }, scInt));
    stage = <Plot series={[{ x: fs, y: pf.map(q => q.total), label: 'total', color: 'ink', width: 2.6 },
      { x: fs, y: pf.map(q => q.dyn), label: 'dynamic αCV²f', color: 'accent' }, { x: fs, y: pf.map(q => q.sc), label: 'short-circuit', color: 'red', dashed: true },
      { x: fs, y: pf.map(q => q.leak), label: 'leakage VDD·Ileak', color: 'green', dashed: true }]}
      xLog yLog xUnit="Hz" yUnit="W" xLabel="Switching frequency f" yLabel="Power" height={290}
      vlines={[{ at: s.f, label: 'f now', color: 'orange' }]} points={[{ x: s.f, y: pw.total, label: si(pw.total, 'W') }]} />;
    eq = String.raw`P = \alpha C_L V_{DD}^2 f + P_{sc} + V_{DD}I_{leak} \\ = ${s.alpha.toFixed(2)}\cdot ${si(s.cl, '\\text{F}')}\cdot ${s.vdd.toFixed(2)}^2\cdot ${si(s.f, '\\text{Hz}')} + ${si(pw.sc, '\\text{W}')} + ${si(pw.leak, '\\text{W}')} = ${si(pw.total, '\\text{W}')}`;
    tryThis = <>raise V<sub>DD</sub> from 1.8 V to 3.3 V: dynamic power grows by (3.3/1.8)² ≈ 3.4× because each 0→1 transition draws C·V<sub>DD</sub>² from the supply (half is stored on C<sub>L</sub>, half burned in the PMOS). Then slow the input edge t<sub>r</sub> to 10 ns and watch short-circuit power grow linearly with it.</>;
    readouts = <>
      <Readout k="Dynamic αCV²f" v={si(pw.dyn, 'W')} hl />
      <Readout k="Short-circuit" v={si(pw.sc, 'W')} tone={pw.sc > 0.2 * pw.dyn ? 'warn' : undefined} />
      <Readout k="Leakage" v={si(pw.leak, 'W')} />
      <Readout k="Total" v={si(pw.total, 'W')} />
      <Readout k="Energy per 0→1 from VDD" v={si(pw.eSwitch, 'J')} />
      <Readout k="Stored on CL (½CV²)" v={si(pw.eSwitch / 2, 'J')} />
      <Readout k="Peak shoot-through" v={si(ipk, 'A')} />
    </>;
  } else {
    const t = tran!; const T = t.T;
    const t0 = T; // show the last two periods (the first settles the initial condition)
    const w = Math.min(0.45 * T, s.tr + 8 * t.tauEst);
    const win: [number, number] = s.zoom === 'rise' ? [t.tRise - s.tr - 0.1 * w, t.tRise + w] : s.zoom === 'fall' ? [t.tFall - s.tr - 0.1 * w, t.tFall + w] : [t0, 3 * T];
    const idx = t.t.map((x, i) => (x >= win[0] && x <= win[1] ? i : -1)).filter(i => i >= 0);
    const X = idx.map(i => t.t[i] - win[0]);
    const pick = (a: number[]) => idx.map(i => a[i]);
    const imax = Math.max(...pick(t.ip), ...pick(t.in), 1e-12);
    stage = <>
      <Plot series={[{ x: X, y: pick(t.vin), label: 'buffer input A', color: 'muted', dashed: true }, { x: X, y: pick(t.vout), label: 'Vout (driver pin)', color: 'green' }, { x: X, y: pick(t.vc), label: 'V across CL', color: 'accent', width: 2.4 }]}
        xUnit="s" yUnit="V" xLabel="time" yLabel="V" height={240} yRange={[-0.05 * s.vdd, s.vdd * 1.08]} hlines={[{ at: s.vdd / 2, label: '50%', color: 'muted' }]} />
      <Plot series={[{ x: X, y: pick(t.ip), label: 'PMOS current (charges CL on rising edge)', color: 'orange', fill: true }, { x: X, y: pick(t.in), label: 'NMOS current (discharges CL on falling edge)', color: 'blue', fill: true }]}
        xUnit="s" yUnit="A" xLabel="time" yLabel="I" height={190} yRange={[0, imax * 1.1]} />
    </>;
    eq = String.raw`E_{VDD} = \int V_{DD}\,i_P\,dt = ${si(t.eSupply, '\\text{J}')}\;\text{per cycle} \\ \text{vs}\quad C_LV_{DD}^2 = ${si(t.eCV2, '\\text{J}')}`;
    tryThis = <>zoom on the rising edge: only the PMOS (orange) conducts while C<sub>L</sub> charges; on the falling edge only the NMOS (blue). Set the ratio to 2.5 and both edges match; drop it to 0.4 and t<sub>pLH</sub> grows about 2.5×. Raise C<sub>L</sub> to 50 pF and both edges slow in proportion. Lengthen t<sub>r</sub> and the small overlap spike where both conduct (shoot-through) grows.</>;
    readouts = <>
      <Readout k="tpLH (rising, PMOS)" v={si(t.tpLH, 's')} hl />
      <Readout k="tpHL (falling, NMOS)" v={si(t.tpHL, 's')} hl />
      <Readout k="Rise 10–90%" v={si(t.trise1090, 's')} />
      <Readout k="Fall 90–10%" v={si(t.tfall1090, 's')} />
      <Readout k="Supply energy / cycle" v={si(t.eSupply, 'J')} />
      <Readout k="CL·VDD²" v={si(t.eCV2, 'J')} />
      <Readout k="Average P = E·f" v={si(t.eSupply * s.f, 'W')} />
      {!(t.trise1090 < 0.45 * T) && <Readout k="Warning" v="edge does not settle in half a period" tone="bad" />}
    </>;
  }

  return (
    <SimShell title="CMOS inverter / buffer" onReset={() => set(init)} tryThis={tryThis}
      controls={<>
        <Seg label="View" value={s.view} options={[{ value: 'vtc', label: 'VTC' }, { value: 'power', label: 'Power' }, { value: 'transient', label: 'Transient' }]} onChange={upd('view')} />
        <Slider label="Supply VDD" value={s.vdd} min={0.6} max={5} step={0.05} unit="V" onChange={upd('vdd')} />
        <Slider label="Strength ratio kp/kn" value={s.ratio} min={0.1} max={10} log format={v => v.toPrecision(3)} onChange={upd('ratio')} />
        {s.view === 'vtc' && <Slider label="Probe Vin" value={probe} min={0} max={s.vdd} step={0.005} unit="V" onChange={upd('probe')} />}
        {s.view !== 'vtc' && <Slider label="Load CL" value={s.cl} min={0.1e-12} max={200e-12} log unit="F" onChange={upd('cl')} />}
        {s.view !== 'vtc' && <Slider label="Frequency f" value={s.f} min={100e3} max={500e6} log unit="Hz" onChange={upd('f')} />}
        {s.view === 'transient' && <>
          <Slider label="Series resistor RS" value={s.rs} min={0} max={1000} step={1} unit="Ω" onChange={upd('rs')} />
          <Seg label="Zoom" value={s.zoom} options={[{ value: 'full', label: '2 periods' }, { value: 'rise', label: 'Rising edge' }, { value: 'fall', label: 'Falling edge' }]} onChange={upd('zoom')} />
        </>}
        {s.view !== 'vtc' && <Slider label="Input edge time tr" value={s.tr} min={10e-12} max={20e-9} log unit="s" onChange={upd('tr')} />}
        {s.view === 'power' && <>
          <Slider label="Activity factor α" value={s.alpha} min={0.01} max={1} step={0.01} format={v => v.toFixed(2)} onChange={upd('alpha')} />
          <Slider label="Leakage current" value={s.ileak} min={1e-12} max={1e-6} log unit="A" onChange={upd('ileak')} />
        </>}
        <Slider label="Threshold Vtn = |Vtp|" value={s.vt} min={0.1} max={Math.max(0.2, s.vdd / 2 - 0.05)} step={0.01} unit="V" onChange={upd('vt')} />
        <Slider label="NMOS kn = k'n(W/L)n" value={s.kn} min={0.1e-3} max={50e-3} log format={v => si(v, 'A/V²')} onChange={upd('kn')} />
        <Slider label="Channel-length modulation λ" value={s.lambda} min={0} max={0.2} step={0.005} format={v => `${v.toFixed(3)} V⁻¹`} onChange={upd('lambda')} />
        <Note>Long-channel square-law FETs. VIL/VIH are the unity-gain points; VOH/VOL are the rail outputs. Short-circuit power assumes a linear input ramp with no load (upper bound, Veendrick). {s.view === 'transient' ? 'The plotted gate is the output stage of a buffer, driven by the complement of A, so Vout follows A.' : ''}</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={`VM = ${si(nm.vm, 'V')} (${nm.vm > s.vdd / 2 + 0.01 ? 'above' : nm.vm < s.vdd / 2 - 0.01 ? 'below' : 'at'} VDD/2)`} color={Math.abs(nm.vm - s.vdd / 2) < 0.05 * s.vdd ? 'ok' : 'warn'} />
        <span className="small muted">NML {si(nm.nml, 'V')} · NMH {si(nm.nmh, 'V')}</span>
      </div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <Readouts>{readouts}</Readouts>
      <EqBox>{String.raw`\begin{gathered}` + eq + String.raw`\end{gathered}`}</EqBox>
      {stage}
    </SimShell>
  );
}
