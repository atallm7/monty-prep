// Switched-capacitor charge pump: doubler / inverter, two-phase animation, droop, ripple, efficiency.
import { useEffect, useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { pump, startup, nSteps, type CPIn } from '../models/charge-pump';

const n = (v: any, d: number) => { const x = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(x) ? x : d; };
const tex = (v: number, u: string) => si(v, u).replace('µ', '\\mu ').replace('Ω', '\\Omega').replace(' ', '\\,');

export default function ChargePump({ params }: SimProps) {
  const init = {
    mode: (params.mode === 'inverter' ? 'inverter' : 'doubler') as CPIn['mode'],
    vin: n(params.vin, 3.3), f: n(params.f, 500e3), cfly: n(params.cfly, 1e-6), cout: n(params.cout, 10e-6), iout: n(params.iout, 0.02), rsw: n(params.rsw, 1),
  };
  const [s, set] = useState(init);
  const [phase, setPhase] = useState<1 | 2>(1);
  const [auto, setAuto] = useState(true);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  useEffect(() => { if (!auto) return; const id = setInterval(() => setPhase(p => (p === 1 ? 2 : 1)), 900); return () => clearInterval(id); }, [auto]);

  const p: CPIn = s;
  const r = useMemo(() => pump(p), [s]);
  const N = nSteps(p), sgn = s.mode === 'doubler' ? 1 : -1;
  const T = 1 / s.f;
  const nPts = r.t.length / 4; // samples per phase block incl. endpoint (161)
  const vcEnd1 = r.vc[Math.round(nPts) - 1], vcEnd2 = r.vc[2 * Math.round(nPts) - 1];

  // plots ------------------------------------------------------------
  const wave = useMemo(() => ({ t: r.t, vo: r.vo, vc: r.vc }), [r]);
  const su = useMemo(() => { const cyc = Math.round(Math.min(3000, Math.max(40, 12 * s.cout / s.cfly + 30))); return startup(p, cyc); }, [s]);
  const load = useMemo(() => {
    const imax = Math.max(1e-3, Math.min(5, (N * s.vin) / Math.max(1e-3, r.rout) * 1.1)), xs: number[] = [], vo: number[] = [], eta: number[] = [];
    for (let i = 0; i <= 50; i++) { const io = (imax * i) / 50, q = pump({ ...p, iout: io }); xs.push(io); vo.push(q.ok ? Math.abs(q.vout) : 0); eta.push(q.ok ? q.eff * 100 : 0); }
    return { xs, vo, eta };
  }, [s, r.rout]);
  const fSweep = useMemo(() => {
    const xs: number[] = [], vo: number[] = [];
    for (let i = 0; i <= 60; i++) { const f = 1e3 * 10 ** (i * 5 / 60); const q = pump({ ...p, f }); xs.push(f); vo.push(q.ok ? Math.abs(q.vout) : 0); }
    return { xs, vo };
  }, [s]);

  // schematic ---------------------------------------------------------
  const schematic = useMemo(() => {
    const p1 = phase === 1, on = (c: boolean) => (c ? 'SWclosed' : 'SW');
    const el: any[] = [
      { t: 'V', a: [0, 1], b: [0, 6], label: 'V_{in}', value: si(s.vin, 'V') },
      { t: 'wire', pts: [[0, 1], [4, 1]], flow: p1 || s.mode === 'doubler' },
      { t: 'wire', pts: [[4, 1], [8, 1]], flow: p1 }, { t: 'dot', at: [4, 1] },
      { t: on(p1), a: [8, 1], b: [8, 4], label: 'S1', labelSide: 'other' },
      { t: 'dot', at: [8, 4] },
      { t: 'C', a: [8, 4], b: [8, 8], label: 'C_{fly}', value: si(s.cfly, 'F'), color: 'accent' },
      { t: 'dot', at: [8, 8] },
      { t: on(p1), a: [8, 8], b: [8, 11], label: 'S2' },
      { t: 'wire', pts: [[8, 11], [0, 11], [0, 6]], flow: true },
      { t: 'gnd', at: [4, 11] },
    ];
    if (s.mode === 'doubler') {
      el.push(
        { t: 'wire', pts: [[4, 1], [4, 8]], flow: !p1 }, { t: on(!p1), a: [4, 8], b: [8, 8], label: 'S4', labelSide: 'other' },
        { t: on(!p1), a: [8, 4], b: [12, 4], label: 'S3' }, { t: 'dot', at: [12, 4] },
        { t: 'wire', pts: [[12, 4], [18, 4]], flow: !p1 },
        { t: 'C', a: [14, 4], b: [14, 8], label: 'C_{out}', value: si(s.cout, 'F') }, { t: 'dot', at: [14, 4] },
        { t: 'wire', pts: [[14, 8], [14, 11], [8, 11]], flow: true }, { t: 'dot', at: [14, 11] },
        { t: 'I', a: [18, 4], b: [18, 8], label: 'I_{out}', value: si(s.iout, 'A'), color: 'orange' },
        { t: 'wire', pts: [[18, 8], [18, 11], [14, 11]], flow: true },
        { t: 'term', at: [20, 4], label: 'V_{out}', side: 'right' }, { t: 'wire', pts: [[18, 4], [20, 4]] },
        { t: 'text', at: [19.6, 2.6], text: `${si(r.vout, 'V')}`, color: 'accent', anchor: 'start' },
      );
    } else {
      el.push(
        { t: on(!p1), a: [8, 4], b: [12, 4], label: 'S3' }, { t: 'gnd', at: [12, 4] },
        { t: on(!p1), a: [8, 8], b: [12, 8], label: 'S4' }, { t: 'dot', at: [12, 8] },
        { t: 'wire', pts: [[12, 4], [18, 4]] }, { t: 'dot', at: [14, 4] },
        { t: 'C', a: [14, 4], b: [14, 8], label: 'C_{out}', value: si(s.cout, 'F') },
        { t: 'wire', pts: [[12, 8], [18, 8]], flow: !p1 }, { t: 'dot', at: [14, 8] },
        { t: 'I', a: [18, 4], b: [18, 8], label: 'I_{out}', value: si(s.iout, 'A'), color: 'orange' },
        { t: 'term', at: [20, 8], label: 'V_{out}', side: 'right' }, { t: 'wire', pts: [[18, 8], [20, 8]] },
        { t: 'text', at: [19.6, 6.6], text: `${si(r.vout, 'V')}`, color: 'accent', anchor: 'start' },
      );
    }
    el.push({ t: 'text', at: [4, -0.8], text: p1 ? 'Phase 1: Cfly charges from Vin' : (s.mode === 'doubler' ? 'Phase 2: Cfly stacked on Vin, dumps into Cout' : 'Phase 2: Cfly flips, + plate to GND, charges Cout negative'), anchor: 'start', color: 'accent' });
    el.push({ t: 'text', at: [7.5, 6.3], text: `${si(p1 ? vcEnd1 : vcEnd2, 'V')}`, anchor: 'end', muted: true });
    return renderCircuit({ elements: el }).svg;
  }, [s, phase, r.vout, vcEnd1, vcEnd2]);

  const regime = r.rssl > 1.5 * r.rfsl ? { l: `Slow-switching limit (R_SSL = ${si(r.rssl, 'Ω')}): raise f or C_fly`, c: 'warn' as const }
    : r.rfsl > 1.5 * r.rssl ? { l: `Fast-switching limit (R_FSL = ${si(r.rfsl, 'Ω')}): lower R_sw`, c: 'info' as const }
    : { l: 'Balanced: both limits contribute', c: 'ok' as const };
  const tone = (r.ok ? (r.eff > 0.8 ? 'ok' : r.eff > 0.6 ? 'warn' : 'bad') : 'bad') as 'ok' | 'warn' | 'bad';

  return (
    <SimShell title="Charge pump (switched-capacitor)" onReset={() => { set(init); setPhase(1); }}
      tryThis={<>(1) Drop f from 500 kHz to 20 kHz: the droop I<sub>out</sub>/(f·C<sub>fly</sub>) grows 25× and V<sub>out</sub> sags. That is the slow-switching limit. (2) Now push f up to 10 MHz with R<sub>sw</sub> = 10 Ω: f stops helping because R<sub>out</sub> flattens at 8·R<sub>sw</sub> (fast-switching limit). (3) Switch to <i>inverter</i> and note |V<sub>out</sub>| ≤ V<sub>in</sub> and the input current is only 1×I<sub>out</sub>, not 2×.</>}
      controls={<>
        <Seg label="Mode" value={s.mode} options={[{ value: 'doubler', label: 'Doubler (2·Vin)' }, { value: 'inverter', label: 'Inverter (−Vin)' }]} onChange={upd('mode')} />
        <Slider label="Input voltage Vin" value={s.vin} min={1} max={12} step={0.1} unit="V" onChange={upd('vin')} />
        <Slider label="Switching frequency f" value={s.f} min={1e3} max={1e7} log unit="Hz" onChange={upd('f')} />
        <Slider label="Flying cap Cfly" value={s.cfly} min={10e-9} max={100e-6} log unit="F" onChange={upd('cfly')} />
        <Slider label="Output cap Cout" value={s.cout} min={100e-9} max={1e-3} log unit="F" onChange={upd('cout')} />
        <Slider label="Load current Iout" value={s.iout} min={0} max={0.2} step={0.001} unit="A" onChange={upd('iout')} />
        <Slider label="Switch resistance Rsw" value={s.rsw} min={0.01} max={50} log unit="Ω" onChange={upd('rsw')} />
        <Toggle label="Auto-run the two phases" checked={auto} onChange={setAuto} />
        {!auto && <Seg label="Show phase" value={String(phase) as '1' | '2'} options={[{ value: '1', label: 'Phase 1' }, { value: '2', label: 'Phase 2' }]} onChange={v => setPhase(v === '1' ? 1 : 2)} />}
        <Note>Exact periodic steady state of the two-phase circuit (ideal switches with R<sub>sw</sub>, constant-current load, no gate-drive loss).</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '6px 0' }}>
        <RegionBadge label={r.ok ? regime.l : 'Overloaded: output collapses'} color={r.ok ? regime.c : 'bad'} />
        {!r.settled && <RegionBadge label="Cfly cannot fully charge in T/2" color="warn" />}
      </div>
      <Readouts>
        <Readout k="Vout (average)" v={si(r.vout, 'V')} hl tone={tone} />
        <Readout k={`Ideal ${N === 2 ? '2·Vin' : '−Vin'}`} v={si(r.vIdeal, 'V')} />
        <Readout k="Droop Iout/(f·Cfly)" v={si(r.droop, 'V')} />
        <Readout k="Rout (SSL ⊕ FSL)" v={`${si(r.rout, 'Ω')} (${si(r.rssl, 'Ω')} ⊕ ${si(r.rfsl, 'Ω')})`} />
        <Readout k="Ripple p-p" v={si(r.ripple, 'V')} />
        <Readout k="Efficiency" v={r.ok ? (r.eff * 100).toFixed(1) + ' %' : '0 %'} tone={tone} />
        <Readout k="Input current" v={si(r.iin, 'A')} />
        <Readout k="Pout / loss" v={`${si(r.pout, 'W')} / ${si(r.ploss, 'W')}`} />
      </Readouts>
      <EqBox>{String.raw`V_{out} = ${N === 2 ? '2' : '-'}V_{in} \mp I_{out}R_{out} \approx ${(sgn * (N * s.vin - s.iout * r.rout)).toFixed(2)}\,\text{V}`}</EqBox>
      <EqBox>{String.raw`R_{out}\approx\sqrt{\left(\tfrac{1}{fC_{fly}}\right)^2+(8R_{sw})^2} = ${tex(r.rout, '\\Omega')}`}</EqBox>
      <Plot series={[{ x: wave.t, y: wave.vo, label: 'Vout', color: 'accent' }, { x: wave.t, y: wave.vc, label: 'Vcfly', color: 'blue', dashed: true }]} xUnit="s" yUnit="V" xLabel="Time (two switching periods)" yLabel="Voltage" height={220}
        hlines={[{ at: r.vIdeal, label: 'ideal', color: 'muted' }]} vlines={[{ at: T / 2, label: 'phase 2 starts', color: 'orange' }]} />
      <Plot series={[{ x: su.t, y: su.vo, label: 'Vout start-up', color: 'accent' }]} xUnit="s" yUnit="V" xLabel="Time from power-up" yLabel="Vout" height={190} hlines={[{ at: r.vout, label: 'steady state', color: 'muted' }]} />
      <Plot series={[{ x: load.xs, y: load.vo, label: '|Vout| (V)', color: 'accent' }]} xUnit="A" yUnit="V" xLabel="Load current" yLabel="|Vout|" height={190} points={[{ x: s.iout, y: Math.abs(r.vout), label: 'now', color: 'accent' }]} hlines={[{ at: N * s.vin, label: 'ideal', color: 'muted' }]} />
      <Plot series={[{ x: fSweep.xs, y: fSweep.vo, label: '|Vout| vs f', color: 'blue' }]} xLog xUnit="Hz" yUnit="V" xLabel="Switching frequency" yLabel="|Vout|" height={190} points={[{ x: s.f, y: Math.abs(r.vout), label: 'now', color: 'accent' }]} hlines={[{ at: N * s.vin, label: 'ideal', color: 'muted' }]} vlines={[{ at: 1 / (8 * s.rsw * s.cfly), label: 'f where Rssl = Rfsl', color: 'orange' }]} />
    </SimShell>
  );
}
