// Single-FET bidirectional level shifter (BSS138 style): click each side to drive low / release.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { solve, sweep } from '../models/level-shifter';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };
type Drv = 'release' | 'low';
const logic = (v: number, vcc: number) => (v > 0.7 * vcc ? '1' : v < 0.3 * vcc ? '0' : '?');

export default function LevelShifter({ params }: SimProps) {
  const init = { vlow: n(params.vlow, 3.3), vhigh: n(params.vhigh, 5), lo: 'release' as Drv, hi: 'release' as Drv, rl: 10e3, rh: 10e3, vth: 1.3, cbus: 50e-12 };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const inp = { vlow: s.vlow, vhigh: s.vhigh, lowDrive: s.lo === 'low', highDrive: s.hi === 'low', rl: s.rl, rh: s.rh, vth: s.vth };
  const r = useMemo(() => solve(inp), [s]);
  const swH = useMemo(() => sweep(inp, 'high'), [s.vlow, s.vhigh, s.rl, s.rh, s.vth]);
  const swL = useMemo(() => sweep(inp, 'low'), [s.vlow, s.vhigh, s.rl, s.rh, s.vth]);
  const nobody = solve({ ...inp, vth: 100 });

  const schematic = useMemo(() => {
    const act = (c: boolean) => (c ? 'accent' : undefined);
    return renderCircuit({ elements: [
      { t: 'rail', at: [2, 0], label: `V_{low} = ${si(s.vlow, 'V')}`, dir: 'up' }, { t: 'rail', at: [18, 0], label: `V_{high} = ${si(s.vhigh, 'V')}`, dir: 'up' },
      { t: 'wire', pts: [[2, 0], [2, 1]] }, { t: 'R', a: [2, 1], b: [2, 4], label: 'R_L', value: si(s.rl, 'Ω'), flow: false },
      { t: 'wire', pts: [[18, 0], [18, 1]] }, { t: 'R', a: [18, 1], b: [18, 4], label: 'R_H', value: si(s.rh, 'Ω') },
      { t: 'wire', pts: [[2, 4], [2, 10], [10, 10], [10, 8]], flow: s.lo === 'low' ? 'reverse' : false }, { t: 'dot', at: [2, 10] },
      { t: 'wire', pts: [[10, 4], [18, 4]], flow: s.hi === 'low' ? false : false }, { t: 'dot', at: [18, 4] },
      { t: 'wire', pts: [[2, 0], [6, 0], [6, 6], [8, 6]] }, { t: 'dot', at: [2, 0] },
      { t: 'nmos', at: [8, 6], label: 'Q1', bodyDiode: true, color: r.vgs - s.vth > 0 ? 'green' : undefined },
      ...(s.lo === 'low' ? [{ t: 'wire', pts: [[2, 10], [2, 12]] }, { t: 'gnd', at: [2, 12] }] : []),
      ...(s.hi === 'low' ? [{ t: 'wire', pts: [[18, 4], [20, 4], [20, 7]] }, { t: 'gnd', at: [20, 7] }] : []),
      { t: 'text', at: [3, 11.2], text: `A: ${si(r.vs, 'V')} (${logic(r.vs, s.vlow)})${s.lo === 'low' ? ' driven low' : ''}`, anchor: 'start', color: 'accent' },
      { t: 'text', at: [17.4, 6], text: `B: ${si(r.vd, 'V')} (${logic(r.vd, s.vhigh)})${s.hi === 'low' ? ' driven low' : ''}`, anchor: 'end', color: 'orange' },
      { t: 'text', at: [1.5, 5.2], text: `V_{GS} = ${(Math.abs(r.vgs) < 1e-6 ? 0 : r.vgs).toFixed(2)} V`, anchor: 'end', color: r.vgs > s.vth ? 'green' : 'muted' },
    ] as any[] }).svg;
  }, [s, r]);

  const cl = s.cbus, tRiseA = 2.2 * s.rl * cl, tRiseB = 2.2 * s.rh * cl;
  const mismatch = (logic(r.vs, s.vlow) !== logic(r.vd, s.vhigh));
  return (
    <SimShell title="Single-FET bidirectional level shifter" onReset={() => set(init)}
      tryThis={<>(1) Make the <b>low side</b> drive low: V<sub>GS</sub> = V<sub>low</sub>, the FET switches on and drags the high bus down. (2) Release it, then make the <b>high side</b> drive low: nothing pulls the source node down at first, so the <b>body diode</b> clamps it near 0.6 V; that raises V<sub>GS</sub> above V<sub>th</sub>, the channel turns on and the low bus follows to 0 V. (3) Set V<sub>th</sub> to 3 V on a 3.3 V side to see why a high-threshold FET fails.</>}
      controls={<>
        <Seg label="Low-voltage side (A, FET source)" value={s.lo} options={[{ value: 'release', label: 'Release (pull-up)' }, { value: 'low', label: 'Drive low' }]} onChange={upd('lo')} />
        <Seg label="High-voltage side (B, FET drain)" value={s.hi} options={[{ value: 'release', label: 'Release (pull-up)' }, { value: 'low', label: 'Drive low' }]} onChange={upd('hi')} />
        <Slider label="Vlow (gate, side A)" value={s.vlow} min={1.0} max={5} step={0.1} unit="V" onChange={upd('vlow')} />
        <Slider label="Vhigh (side B)" value={s.vhigh} min={1.8} max={15} step={0.1} unit="V" onChange={upd('vhigh')} />
        <Slider label="Pull-up RL (A)" value={s.rl} min={1e3} max={100e3} log unit="Ω" onChange={upd('rl')} />
        <Slider label="Pull-up RH (B)" value={s.rh} min={1e3} max={100e3} log unit="Ω" onChange={upd('rh')} />
        <Slider label="FET threshold Vth" value={s.vth} min={0.5} max={3} step={0.05} unit="V" onChange={upd('vth')} />
        <Slider label="Bus capacitance" value={s.cbus} min={5e-12} max={500e-12} log unit="F" onChange={upd('cbus')} />
        <Note>BSS138-like level-1 MOSFET (K = 83 mA/V²) with body diode; the driver output resistance is 25 Ω. The DC operating point is solved exactly (KCL on both buses).</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
        <RegionBadge label={r.state} color={r.tone === 'info' ? 'info' : r.tone} />
        {mismatch && <RegionBadge label="Bus levels disagree (logic mismatch)" color="bad" />}
      </div>
      <Readouts>
        <Readout k="Side A voltage (low bus)" v={si(r.vs, 'V')} hl />
        <Readout k="Side B voltage (high bus)" v={si(r.vd, 'V')} hl />
        <Readout k="Vgs" v={si(Math.abs(r.vgs) < 1e-6 ? 0 : r.vgs, 'V')} tone={r.vgs > s.vth ? 'ok' : undefined} />
        <Readout k="Channel current" v={si(Math.abs(r.ich) < 1e-12 ? 0 : r.ich, 'A')} />
        <Readout k="Body-diode current" v={si(Math.abs(r.ibody) < 1e-12 ? 0 : r.ibody, 'A')} tone={r.ibody > 20e-6 ? 'warn' : undefined} />
        <Readout k="Rds(on) at this Vgs" v={isFinite(r.rdson) ? si(r.rdson, 'Ω') : 'off'} />
        <Readout k="Rise time A / B (10–90 %)" v={`${si(tRiseA, 's')} / ${si(tRiseB, 's')}`} />
        <Readout k="Low level w/o channel (diode only)" v={s.hi === 'low' ? si(nobody.vs, 'V') : 'n/a'} />
      </Readouts>
      <EqBox>{String.raw`V_{GS} = V_{low} - V_A = ${s.vlow.toFixed(2)} - ${r.vs.toFixed(2)} = ${r.vgs.toFixed(2)}\,\text{V}\;\; ${r.vgs > s.vth ? '>' : '<'}\;\; V_{th} = ${s.vth.toFixed(2)}\,\text{V}\quad t_r \approx 2.2\,R_{pull}C`}</EqBox>
      <Plot series={[{ ...{ x: swH.x, y: swH.y }, label: 'Side A (free) vs side B driven', color: 'accent' }, { x: swH.x, y: swH.x.map(x => x), label: 'ideal follow', color: 'muted', dashed: true }]} xUnit="V" yUnit="V" xLabel="Side B forced voltage" yLabel="Side A voltage" height={200}
        hlines={[{ at: 0.6, label: 'body diode ≈0.6 V', color: 'orange' }]} vlines={[{ at: s.vlow - s.vth, label: 'FET on below Vlow−Vth', color: 'blue' }]} />
      <Plot series={[{ x: swL.x, y: swL.y, label: 'Side B (free) vs side A driven', color: 'orange' }]} xUnit="V" yUnit="V" xLabel="Side A forced voltage" yLabel="Side B voltage" height={200}
        vlines={[{ at: s.vlow - s.vth, label: 'FET cuts off', color: 'blue' }]} />
    </SimShell>
  );
}
