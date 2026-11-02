// Inductive kick & flyback protection: none / diode / diode+Zener / RC snubber / TVS.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { simulate, zoom, predict, type FlyIn, type Protection } from '../models/flyback-protection';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };
const PROT = ['none', 'diode', 'zener', 'rc', 'tvs'] as const;
const NAMES: Record<Protection, string> = { none: 'None', diode: 'Diode', zener: 'Diode + Zener', rc: 'RC snubber', tvs: 'TVS' };

export default function FlybackProtection({ params }: SimProps) {
  const p0 = (PROT as readonly string[]).includes(params.protection) ? (params.protection as Protection) : 'none';
  const init = { protection: p0, l: n(params.l, 10e-3), i0: n(params.i0, 1), vs: n(params.vsupply, 12), cp: 100e-12, vf: 0.7, vz: 24, rsn: 47, csn: 2.2e-6, vtvs: 33, aval: false, bv: 60 };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(q => ({ ...q, [k]: v }));
  const fin: FlyIn = s;
  const r = useMemo(() => simulate(fin), [s]);
  const pr = useMemo(() => predict(fin), [s]);
  const zm = useMemo(() => zoom(fin, Math.min(r.tEnd, 4 / r.ringF)), [s, r.tEnd, r.ringF]);
  const all = useMemo(() => PROT.map(pp => { const o = simulate({ ...fin, protection: pp }); return { pp, vPeak: o.vPeak, tZero: o.tDecay, e: o.e }; }), [s.l, s.i0, s.vs, s.cp, s.vf, s.vz, s.rsn, s.csn, s.vtvs, s.aval, s.bv]);
  const e0 = 0.5 * s.l * s.i0 * s.i0;
  const act = (c: boolean) => (c ? 'accent' : undefined);

  const schematic = useMemo(() => {
    const pp = s.protection, el: any[] = [
      { t: 'rail', at: [8, 0], label: `V_s = ${si(s.vs, 'V')}`, dir: 'up' }, { t: 'wire', pts: [[8, 0], [8, 1]], flow: true },
      { t: 'L', a: [8, 1], b: [8, 5], label: 'L', value: si(s.l, 'H'), labelSide: 'other' },
      { t: 'wire', pts: [[8, 5], [8, 8]] }, { t: 'dot', at: [8, 8] }, { t: 'dot', at: [8, 1] },
      { t: 'SW', a: [8, 8], b: [8, 11] }, { t: 'text', at: [9.4, 9.8], text: 'switch opens at t = 0', anchor: 'start', muted: true },
      { t: 'wire', pts: [[8, 11], [8, 12]] }, { t: 'gnd', at: [8, 12] },
      { t: 'wire', pts: [[8, 8], [4, 8]] }, { t: 'C', a: [4, 8], b: [4, 11], label: 'C_p', value: si(s.cp, 'F'), color: 'orange', labelSide: 'other' }, { t: 'wire', pts: [[4, 11], [8, 11]] }, { t: 'dot', at: [8, 11] },
      { t: 'text', at: [11, 7.2], text: `peak V_X = ${si(r.vPeak, 'V')}`, anchor: 'start', color: r.vPeak > 60 ? 'red' : 'accent' },
    ];
    if (pp === 'diode') el.push({ t: 'wire', pts: [[8, 8], [13, 8]] }, { t: 'D', a: [13, 8], b: [13, 2], label: 'D_{fw}', color: 'accent' }, { t: 'wire', pts: [[13, 2], [13, 1], [8, 1]] });
    if (pp === 'zener') el.push({ t: 'wire', pts: [[8, 8], [13, 8]] }, { t: 'D', a: [13, 8], b: [13, 5], label: 'D', color: 'accent' }, { t: 'Zener', a: [13, 5], b: [13, 2], label: 'Z', value: si(s.vz, 'V'), color: 'accent' }, { t: 'wire', pts: [[13, 2], [13, 1], [8, 1]] });
    if (pp === 'rc') el.push({ t: 'wire', pts: [[8, 8], [13, 8]] }, { t: 'R', a: [13, 8], b: [13, 5], label: 'R_{sn}', value: si(s.rsn, 'Ω'), color: 'accent' }, { t: 'C', a: [13, 5], b: [13, 2], label: 'C_{sn}', value: si(s.csn, 'F'), color: 'accent' }, { t: 'wire', pts: [[13, 2], [13, 1], [8, 1]] });
    if (pp === 'tvs') el.push({ t: 'wire', pts: [[8, 8], [13, 8]] }, { t: 'TVS', a: [13, 8], b: [13, 11], label: 'TVS', value: si(s.vtvs, 'V'), color: 'accent' }, { t: 'wire', pts: [[13, 11], [8, 11]] });
    if (pp === 'none') el.push({ t: 'text', at: [11, 5], text: s.aval ? `switch avalanche @ ${si(s.bv, 'V')}` : 'nothing clamps the node', anchor: 'start', muted: true });
    return renderCircuit({ elements: el }).svg;
  }, [s, r.vPeak]);

  const verdict = r.vPeak > 100 ? { l: `Spike ${si(r.vPeak, 'V')}: destroys the switch`, c: 'bad' as const } : r.vPeak > 60 ? { l: `Spike ${si(r.vPeak, 'V')}: above typical 60 V FET rating`, c: 'bad' as const }
    : r.vPeak > s.vs + 10 ? { l: 'Clamped, switch sees a raised voltage', c: 'warn' as const } : { l: 'Safely clamped near the supply', c: 'ok' as const };
  const eRows = [['Coil resistance', r.e.coilR], ['Diode', r.e.diode], ['Zener', r.e.zener], ['Snubber R', r.e.snubR], ['TVS', r.e.tvs], ['Switch avalanche', r.e.aval], ['Body diode', r.e.body]].filter(x => (x[1] as number) > 1e-9 * e0 + 1e-12) as [string, number][];

  return (
    <SimShell title="Inductive kick & flyback protection" onReset={() => set(init)}
      tryThis={<>(1) With <b>None</b>, the stored ½·L·I² has nowhere to go except C<sub>p</sub>: V<sub>X</sub> peaks near V<sub>s</sub> + I<sub>0</sub>√(L/C<sub>p</sub>) (kilovolts). Turn on <i>switch avalanche</i> to see the FET clamp at its BV. (2) Choose <b>Diode</b>: the spike vanishes but the current decays slowly (τ = L/R<sub>c</sub>). (3) Add a Zener: higher clamp, much faster decay. Compare the five in the table.</>}
      controls={<>
        <Seg label="Protection" value={s.protection} options={PROT.map(v => ({ value: v, label: NAMES[v] }))} onChange={upd('protection')} />
        <Slider label="Inductance L" value={s.l} min={10e-6} max={1} log unit="H" onChange={upd('l')} />
        <Slider label="Switched current I0" value={s.i0} min={0.05} max={10} step={0.05} unit="A" onChange={upd('i0')} />
        <Slider label="Supply Vs" value={s.vs} min={3} max={48} step={0.5} unit="V" onChange={upd('vs')} />
        <Slider label="Parasitic Cp" value={s.cp} min={10e-12} max={10e-9} log unit="F" onChange={upd('cp')} />
        {s.protection === 'zener' && <Slider label="Zener Vz" value={s.vz} min={3} max={100} step={1} unit="V" onChange={upd('vz')} />}
        {s.protection === 'rc' && <><Slider label="Snubber R" value={s.rsn} min={1} max={1000} log unit="Ω" onChange={upd('rsn')} /><Slider label="Snubber C" value={s.csn} min={100e-9} max={100e-6} log unit="F" onChange={upd('csn')} /></>}
        {s.protection === 'tvs' && <Slider label="TVS breakdown" value={s.vtvs} min={s.vs + 2} max={120} step={1} unit="V" onChange={upd('vtvs')} />}
        {s.protection === 'none' && <><Toggle label="Switch avalanches at BVdss" checked={s.aval} onChange={upd('aval')} />{s.aval && <Slider label="BVdss" value={s.bv} min={20} max={200} step={1} unit="V" onChange={upd('bv')} />}</>}
        <Note>Coil resistance is set so the steady current is I0 (R<sub>c</sub> = V<sub>s</sub>/I0). Stiff switching network solved with variable-step BDF2; energy balance error {(r.balanceErr * 100).toFixed(2)} %.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ margin: '6px 0' }}><RegionBadge label={verdict.l} color={verdict.c} /></div>
      <Readouts>
        <Readout k="Peak switch voltage" v={si(r.vPeak, 'V')} hl tone={verdict.c === 'ok' ? 'ok' : verdict.c === 'warn' ? 'warn' : 'bad'} />
        <Readout k="Time until |i| < 10 % of I0" v={si(r.tDecay, 's')} />
        <Readout k="Stored energy ½LI²" v={si(e0, 'J')} />
        <Readout k="Ring frequency 1/(2π√LCp)" v={si(r.ringF, 'Hz')} />
        <Readout k="Characteristic Z0 = √(L/Cp)" v={si(r.z0, 'Ω')} />
        <Readout k="Predicted clamp (theory)" v={si(pr.vClamp, 'V')} />
        {eRows.map(([k, v]) => <Readout key={k} k={`Energy: ${k}`} v={`${si(v, 'J')} (${(100 * v / e0).toFixed(0)} %)`} />)}
      </Readouts>
      <EqBox>{String.raw`v = L\frac{di}{dt}\;\Rightarrow\; V_{peak}\approx V_s + I_0\sqrt{L/C_p} = ${si(s.vs + s.i0 * r.z0, 'V').replace(' ', '\\,')},\qquad t_{0}=\tfrac{L}{R_c}\ln\!\left(1+\tfrac{R_cI_0}{V_{clamp}-V_s}\right)`}</EqBox>
      <Plot series={[{ x: r.t, y: r.vx, label: 'Switch node VX', color: 'red' }]} xUnit="s" yUnit="V" xLabel="Time after switch opens" yLabel="VX" height={210} hlines={[{ at: s.vs, label: 'Vs', color: 'muted' }]} />
      <Plot series={[{ x: r.t, y: r.il, label: 'Inductor current', color: 'accent' }]} xUnit="s" yUnit="A" xLabel="Time after switch opens" yLabel="iL" height={170} />
      <Plot series={[{ x: zm.t, y: zm.vx, label: 'VX (first ring periods)', color: 'red' }]} xUnit="s" yUnit="V" xLabel="Zoom: spike and ringing" yLabel="VX" height={190} hlines={[{ at: s.vs, label: 'Vs', color: 'muted' }]} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}><th>Protection</th><th>Peak VX</th><th>Time to 10 % of I0</th><th>Energy in clamp</th></tr></thead>
          <tbody>{all.map(a => <tr key={a.pp} style={{ borderBottom: '1px solid var(--border)', fontWeight: a.pp === s.protection ? 700 : 400, cursor: 'pointer' }} onClick={() => upd('protection')(a.pp)}>
            <td>{NAMES[a.pp]}</td><td>{si(a.vPeak, 'V')}</td><td>{si(a.tZero, 's')}</td>
            <td>{si(a.e.diode + a.e.zener + a.e.snubR + a.e.tvs + a.e.aval, 'J')}</td></tr>)}</tbody>
        </table>
      </div>
    </SimShell>
  );
}
