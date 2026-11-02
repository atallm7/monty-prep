// BJT characteristics & load line: Ebers–Moll + Early effect (model in ../models/bjt-lab.ts).
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { loadLinePoint, outputFamily, ibEdgeOfSat, ibFromVbb, ibSweep, smallSignal, type BjtType, type BjtRegion } from '../models/bjt-lab';

const fin = (v: unknown, d: number) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : n; };
type Drive = 'ib' | 'vbb';

const REG: Record<BjtRegion, { l: string; c: 'ok' | 'info' | 'bad'; use: string }> = {
  cutoff: { l: 'Cut-off', c: 'bad', use: 'Both junctions off: Ic = 0, Vce = Vcc. Open switch.' },
  active: { l: 'Forward-active', c: 'ok', use: 'B–E forward, B–C reverse biased: Ic = β·Ib·(1 + Vce/VA). Linear amplifier region.' },
  saturation: { l: 'Saturation', c: 'info', use: 'Both junctions forward: Ic is limited by the load (Ic < β·Ib), Vce ≈ 0.1–0.2 V. Closed switch.' },
};

export default function BjtLab({ params }: SimProps) {
  const init = {
    type: (params.type === 'pnp' ? 'pnp' : 'npn') as BjtType,
    beta: Math.max(1, fin(params.beta, 100)), vcc: Math.abs(fin(params.vcc, 10)), rc: Math.max(1, fin(params.rc, 1000)), ib: Math.abs(fin(params.ib, 20e-6)),
    drive: 'ib' as Drive, vbb: 2.7, rb: 100e3, va: 100, early: true,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const isN = s.type === 'npn'; const sg = isN ? 1 : -1;
  const bp = { type: s.type, beta: s.beta, va: s.early ? s.va : Infinity };

  const ibMag = useMemo(() => s.drive === 'ib' ? s.ib : ibFromVbb(bp, s.vbb, s.rb, s.vcc, s.rc), [s]);
  const op = useMemo(() => loadLinePoint(bp, ibMag, s.vcc, s.rc), [s, ibMag]);
  const icM = Math.abs(op.ic), vceM = Math.abs(op.vce);
  const ss = smallSignal(bp, icM, vceM);
  const ibSat = ibEdgeOfSat(s.beta, s.vcc, s.rc);

  const famTop = Math.max(ibMag, ibSat) * 1.25;
  const family = useMemo(() => outputFamily(bp, [1, 2, 3, 4, 5].map(k => k * famTop / 5).filter(b => Math.abs(b - ibMag) > famTop * 0.04), s.vcc), [s.type, s.beta, s.va, s.early, s.vcc, famTop, ibMag]);
  const cur = useMemo(() => outputFamily(bp, [ibMag], s.vcc)[0], [s.type, s.beta, s.va, s.early, s.vcc, ibMag]);
  const ibMax = Math.max(ibSat * 2, ibMag * 1.2, 1e-6);
  const sweep = useMemo(() => ibSweep(bp, s.vcc, s.rc, ibMax), [s.type, s.beta, s.va, s.early, s.vcc, s.rc, ibMax]);

  const svg = useMemo(() => {
    const hot = op.region !== 'cutoff';
    const col = op.region === 'active' ? 'green' : op.region === 'saturation' ? 'blue' : 'muted';
    const drv: any[] = s.drive === 'ib'
      ? [{ t: 'I', a: isN ? [1, 8] : [1, 4], b: isN ? [1, 4] : [1, 8], label: 'I_B', value: si(ibMag, 'A'), labelSide: 'other' }, { t: 'wire', pts: [[1, 4], [5, 4]], flow: hot ? (isN ? true : 'reverse') : false }, { t: 'gnd', at: [1, 8] }]
      : [{ t: 'V', a: [0, 4], b: [0, 8], label: isN ? 'V_{BB}' : 'V_B', value: si(isN ? s.vbb : s.vcc - s.vbb, 'V'), labelSide: 'other' },
        { t: 'R', a: [0, 4], b: [5, 4], label: 'R_B', value: si(s.rb, 'Ω') }, { t: 'gnd', at: [0, 8] },
        { t: 'arrow', a: isN ? [1.6, 6] : [3.4, 6], b: isN ? [3.4, 6] : [1.6, 6], label: `I_B = ${si(ibMag, 'A')}` }];
    const els: any[] = isN ? [
      { t: 'rail', at: [7, -3], label: `V_{CC} = ${si(s.vcc, 'V')}` },
      { t: 'R', a: [7, -3], b: [7, 1], label: 'R_C', value: si(s.rc, 'Ω') },
      { t: 'wire', pts: [[7, 1], [7, 2]], flow: hot }, { t: 'wire', pts: [[7, 1], [10, 1]] }, { t: 'dot', at: [7, 1] },
      { t: 'term', at: [10, 1], label: `V_{CE} = ${si(op.vce, 'V')}`, side: 'right' },
      { t: 'npn', at: [5, 4], label: 'Q_1', color: col },
      { t: 'wire', pts: [[7, 6], [7, 8]], flow: hot }, { t: 'gnd', at: [7, 8] }, ...drv,
    ] : [
      { t: 'rail', at: [7, 0], label: `V_{CC} = ${si(s.vcc, 'V')}` },
      { t: 'wire', pts: [[7, 0], [7, 2]], flow: hot },
      { t: 'pnp', at: [5, 4], label: 'Q_1', color: col },
      { t: 'wire', pts: [[7, 6], [7, 7]], flow: hot }, { t: 'wire', pts: [[7, 7], [10, 7]] }, { t: 'dot', at: [7, 7] },
      { t: 'term', at: [10, 7], label: `V_C = ${si(s.vcc + op.vce, 'V')}`, side: 'right' },
      { t: 'R', a: [7, 7], b: [7, 11], label: 'R_C', value: si(s.rc, 'Ω') }, { t: 'gnd', at: [7, 11] }, ...drv,
    ];
    return renderCircuit({ elements: els }).svg;
  }, [s, op, ibMag]);

  const ri = REG[op.region];
  const lineY = s.vcc / s.rc;
  const yTop = Math.max(lineY * 1.2, ...family.concat(cur).map(c => Math.max(...c.y.map(Math.abs))), 1e-6) * 1.05;
  const famS = family.map(c => ({ x: c.x, y: c.y, label: `Ib = ${si(c.ib, 'A')}`, color: 'muted' }));
  const eq = op.region === 'cutoff' ? String.raw`I_B = 0 \Rightarrow I_C = 0,\; |V_{CE}| = V_{CC} = ${s.vcc.toFixed(2)}\,\text{V}`
    : op.region === 'active' ? String.raw`|I_C| = \beta I_B\Big(1+\frac{|V_{CE}|}{V_A}\Big) = ${s.beta.toFixed(0)}\cdot ${si(ibMag, '\\text{A}')}\cdot\Big(1+\frac{${vceM.toFixed(2)}}{${s.early ? s.va.toFixed(0) : '\\infty'}}\Big) = ${si(icM, '\\text{A}')} \\ |V_{CE}| = V_{CC}-|I_C|R_C = ${vceM.toFixed(2)}\,\text{V}`
      : String.raw`|I_C| = \frac{V_{CC}-V_{CE,sat}}{R_C} = \frac{${s.vcc.toFixed(2)}-${vceM.toFixed(3)}}{${si(s.rc, '\\Omega')}} = ${si(icM, '\\text{A}')} < \beta I_B = ${si(s.beta * ibMag, '\\text{A}')} \\ \beta_{forced} = I_C/I_B = ${op.forcedBeta.toFixed(1)}`;

  return (
    <SimShell title={`${isN ? 'NPN' : 'PNP'} BJT: characteristics & load line`} onReset={() => set(init)}
      tryThis={<>with V<sub>CC</sub> = 10 V and R<sub>C</sub> = 1 kΩ the load line ends at 10 mA, so the transistor saturates once β·I<sub>B</sub> exceeds it: I<sub>B</sub> ≈ (V<sub>CC</sub> − 0.2)/(β·R<sub>C</sub>) = {si(ibSat, 'A')}. Raise I<sub>B</sub> past that and watch V<sub>CE</sub> collapse to ~0.1 V while I<sub>C</sub> stops following β·I<sub>B</sub>. For a reliable switch, designers overdrive the base to a forced β of 10–20. Then switch to PNP: every voltage and current flips sign.</>}
      controls={<>
        <Seg label="Device" value={s.type} options={[{ value: 'npn', label: 'NPN' }, { value: 'pnp', label: 'PNP' }]} onChange={upd('type')} />
        <Seg label="Base drive" value={s.drive} options={[{ value: 'ib', label: 'Current IB' }, { value: 'vbb', label: 'Voltage via RB' }]} onChange={upd('drive')} />
        {s.drive === 'ib' ? <Slider label={isN ? 'Base current IB' : 'Base current |IB| (out of base)'} value={s.ib} min={0} max={500e-6} step={0.5e-6} format={v => si(v, 'A')} onChange={upd('ib')} />
          : <>
            <Slider label={isN ? 'Base source VBB' : 'Drive below VCC (VCC − VB)'} value={s.vbb} min={0} max={Math.max(s.vcc, 5)} step={0.01} unit="V" onChange={upd('vbb')} />
            <Slider label="Base resistor RB" value={s.rb} min={1e3} max={1e6} log unit="Ω" onChange={upd('rb')} />
          </>}
        <Slider label="Current gain β" value={s.beta} min={10} max={500} log format={v => v.toFixed(0)} onChange={upd('beta')} />
        <Slider label="Supply VCC" value={s.vcc} min={1} max={30} step={0.1} unit="V" onChange={upd('vcc')} />
        <Slider label="Collector load RC" value={s.rc} min={10} max={100e3} log unit="Ω" onChange={upd('rc')} />
        <Toggle label="Early effect" checked={s.early} onChange={upd('early')} />
        {s.early && <Slider label="Early voltage VA" value={s.va} min={10} max={500} log unit="V" onChange={upd('va')} />}
        <Note>Ebers–Moll transistor (Is = 10 fA, β<sub>R</sub> = 1, 300 K) with the Early effect. {isN ? '' : 'PNP: emitter at VCC, Ib and Ic flow out of the base and collector, so Ib, Ic, Vbe and Vce are negative. '}Saturation is flagged when the B–C junction is forward-biased by more than 0.4 V.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <RegionBadge label={ri.l} color={ri.c} /><span className="small muted">{ri.use}</span>
      </div>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
      <Readouts>
        <Readout k="Ic" v={si(op.ic, 'A')} hl />
        <Readout k="Ib" v={si(op.ib, 'A')} />
        <Readout k="Vce" v={si(op.vce, 'V')} />
        <Readout k="Vbe" v={si(op.vbe, 'V')} />
        <Readout k="Ic / Ib (forced β)" v={op.region === 'cutoff' ? '—' : op.forcedBeta.toFixed(1)} tone={op.region === 'saturation' ? 'warn' : undefined} />
        <Readout k="IB for edge of sat." v={si(ibSat, 'A')} />
        {op.region === 'active' && <Readout k="gm = Ic/VT" v={si(ss.gm, 'S')} />}
        {op.region === 'active' && <Readout k="rπ = β/gm" v={si(ss.rpi, 'Ω')} />}
        {op.region === 'active' && <Readout k="ro = (VA+Vce)/Ic" v={Number.isFinite(ss.ro) ? si(ss.ro, 'Ω') : '∞'} />}
        <Readout k="Transistor dissipation" v={si(op.pd, 'W')} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}` + eq + String.raw`\end{gathered}`}</EqBox>
      <Plot series={[...famS, { x: cur.x, y: cur.y, label: `Ib = ${si(op.ib, 'A')} (now)`, color: 'accent', width: 2.6 },
        { x: [0, sg * s.vcc], y: [sg * lineY, 0], label: `load line (Vcc/Rc = ${si(lineY, 'A')})`, color: 'red', width: 2 }]}
        xUnit="V" yUnit="A" xLabel="Vce" yLabel="Ic" height={290}
        xRange={isN ? [0, s.vcc] : [-s.vcc, 0]} yRange={isN ? [0, yTop] : [-yTop, 0]}
        xspans={[{ from: isN ? 0 : -0.3, to: isN ? 0.3 : 0, label: 'sat.', color: 'blue' }]}
        points={[{ x: op.vce, y: op.ic, label: 'Q', color: 'accent' }]} />
      <Plot series={[{ x: sweep.ib, y: sweep.ic, label: '|Ic|', color: 'accent', width: 2.2 }, { x: sweep.ib, y: sweep.ib.map(b => Math.min(s.beta * b, lineY * 1.3)), label: 'β·Ib', color: 'muted', dashed: true }]}
        xUnit="A" yUnit="A" xLabel="|Ib| (switch drive)" yLabel="|Ic|" height={180} yRange={[0, lineY * 1.25]}
        vlines={[{ at: ibSat, label: 'edge of sat.', color: 'orange' }]} xspans={[{ from: ibSat, to: ibMax, label: 'saturated (switch ON)', color: 'blue' }]}
        points={[{ x: ibMag, y: icM, label: 'Q' }]} />
    </SimShell>
  );
}
