// Decoupling network (PDN) impedance vs a target impedance.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { zPdn, zGroup, zVrm, magC, srfOf, sweep, extremes, violations, totalC, hfInductance, preset } from '../models/decap-network';
import type { Group, Pdn, PresetId, Vrm } from '../models/decap-network';

const PRESETS: { value: PresetId; label: string }[] = [
  { value: 'single', label: 'Single 100 nF' },
  { value: 'many-same', label: '20 × 100 nF (all same)' },
  { value: 'mixed', label: 'Mixed 10 µF / 1 µF / 100 nF' },
  { value: 'far-placement', label: 'Mixed, placed far (3 nH vias)' },
];
const F0 = 1e4, F1 = 1e9;
const GCOL = ['orange', 'blue', 'green', 'purple'];
type Sel = '0' | '1' | '2' | '3' | 'vrm';
type St = { preset: PresetId; zt: number; fmax: number; pdn: Pdn; sel: Sel; showParts: boolean };

function initState(params: Record<string, any>): St {
  const id: PresetId = PRESETS.some(p => p.value === params.preset) ? params.preset : 'mixed';
  const zt = Number(params.ztarget ?? 0.05);
  return { preset: id, zt: isFinite(zt) && zt > 0 ? zt : 0.05, fmax: 100e6, pdn: preset(id), sel: '1', showParts: true };
}
const T = (v: number, u: string) => `\\text{${si(v, u)}}`;
const gname = (g: Group, i: number) => (i === 0 ? 'Bulk' : `C_${g.name}`);

export default function DecapNetwork({ params }: SimProps) {
  const init = useMemo(() => initState(params), [params]);
  const [s, set] = useState<St>(init);
  const p = s.pdn;

  const sw = useMemo(() => sweep(p, F0, F1, 500), [p]);
  const ex = useMemo(() => extremes(p, F0, F1), [p]);
  const viol = useMemo(() => violations(p, s.zt, F0, F1), [p, s.zt]);
  const parts = useMemo(() => {
    const xs = sw.f; const out: { x: number[]; y: number[]; label: string; color: string; dashed: boolean }[] = [];
    p.groups.forEach((g, i) => { if (g.on && g.n > 0) out.push({ x: xs, y: xs.map(f => magC(zGroup(g, f))), label: `${i === 0 ? 'bulk' : g.name}: ${g.n}× ${si(g.c, 'F')}`, color: GCOL[i], dashed: true }); });
    if (p.vrm.on) out.push({ x: xs, y: xs.map(f => magC(zVrm(p.vrm, f))), label: 'VRM', color: 'muted', dashed: true });
    return out;
  }, [p, sw]);

  const inBand = viol.filter(v => v.from <= s.fmax);
  const pass = inBand.length === 0;
  const worstBand = useMemo(() => { let m = 0, fm = F0; for (let i = 0; i < sw.f.length; i++) if (sw.f[i] <= s.fmax && sw.z[i] > m) { m = sw.z[i]; fm = sw.f[i]; } for (const pk of ex.peaks) if (pk.f <= s.fmax && pk.z > m) { m = pk.z; fm = pk.f; } return { z: m, f: fm }; }, [sw, ex, s.fmax]);
  const meets = viol.length === 0 ? Infinity : viol[0].from <= F0 * 1.001 ? 0 : viol[0].from;
  const Lhf = hfInductance(p);
  const fL = Lhf > 0 && isFinite(Lhf) ? s.zt / (2 * Math.PI * Lhf) : Infinity; // where ωL_hf crosses target

  const ymin = Math.min(...sw.z) / 3, ymax = Math.max(Math.max(...sw.z) * 3, s.zt * 20);

  const setPreset = (id: PresetId) => set(st => ({ ...st, preset: id, pdn: preset(id) }));
  const updG = (i: number, k: keyof Group) => (v: number | boolean) => set(st => ({ ...st, pdn: { ...st.pdn, groups: st.pdn.groups.map((g, j) => (j === i ? { ...g, [k]: v } : g)) } }));
  const updV = (k: keyof Vrm) => (v: number | boolean) => set(st => ({ ...st, pdn: { ...st.pdn, vrm: { ...st.pdn.vrm, [k]: v } } }));

  const schematic = useMemo(() => {
    const el: any[] = [];
    const xs = [7, 12, 17, 22];
    const vcol = p.vrm.on ? undefined : 'muted';
    if (s.sel === 'vrm') el.push({ t: 'region', at: [-0.5, -0.6], w: 7.1, h: 4.2, color: 'accent' });
    el.push({ t: 'box', at: [0, 0], w: 4, h: 3, label: 'VRM', pins: [{ side: 'right', pos: 1.5, name: '' }], color: vcol });
    el.push({ t: 'wire', pts: [[4, 1.5], [4.5, 1.5]] });
    el.push({ t: 'L', a: [4.5, 1.5], b: [7, 1.5], label: 'L_{vrm}', value: si(p.vrm.l, 'H'), color: vcol });
    el.push({ t: 'wire', pts: [[7, 1.5], [27, 1.5]], flow: true, label: '' });
    el.push({ t: 'box', at: [27, 0], w: 4, h: 3, label: 'IC', pins: [{ side: 'left', pos: 1.5, name: '' }] });
    el.push({ t: 'wire', pts: [[29, 3], [29, 9.5], [7, 9.5]] }); el.push({ t: 'gnd', at: [18.5, 9.5] });
    p.groups.forEach((g, i) => {
      const x = xs[i]; const col = g.on && g.n > 0 ? GCOL[i] : 'muted';
      if (s.sel === String(i)) el.push({ t: 'region', at: [x - 1.2, 2.2], w: 4.8, h: 6.8, color: 'accent' });
      el.push({ t: 'dot', at: [x, 1.5] });
      el.push({ t: 'L', a: [x, 1.5], b: [x, 5], label: '', value: si(g.esl + g.lmnt, 'H'), color: col });
      el.push({ t: 'C', a: [x, 5], b: [x, 8.5], label: `${gname(g, i)} ×${g.on ? g.n : 0}`, value: si(g.c, 'F'), color: col });
      el.push({ t: 'wire', pts: [[x, 8.5], [x, 9.5]] }); if (i > 0) el.push({ t: 'dot', at: [x, 9.5] });
    });
    el.push({ t: 'text', at: [15, -1], text: `|Z_{PDN}| peak ${si(worstBand.z, 'Ω')} @ ${si(worstBand.f, 'Hz')}`, color: pass ? 'green' : 'red', anchor: 'middle' });
    return renderCircuit({ elements: el }).svg;
  }, [p, s.sel, worstBand, pass]);

  const sel = s.sel;
  const gi = sel === 'vrm' ? -1 : Number(sel);
  const g = gi >= 0 ? p.groups[gi] : null;

  const eqT = String.raw`Z_{target} = \frac{V_{dd}\cdot\text{ripple}}{\Delta I}:\quad ${T(s.zt, 'Ω')}\text{ on a 1.0 V rail with 5\% ripple allows } \Delta I = \frac{\text{50 mV}}{${T(s.zt, 'Ω')}} = ${T(0.05 / s.zt, 'A')}`;
  const eqG = g ? String.raw`Z_{${gi === 0 ? 'bulk' : g.name}} = \frac{1}{${g.n}}\Big(\text{ESR} + j\omega(\text{ESL}+L_{mnt}) + \tfrac{1}{j\omega C}\Big),\quad f_{SRF} = \frac{1}{2\pi\sqrt{${T(g.esl + g.lmnt, 'H')}\cdot ${T(g.c, 'F')}}} = ${T(srfOf(g), 'Hz')}`
    : String.raw`Z_{VRM} = R + j\omega L_{vrm}:\quad |Z_{VRM}| = Z_{target}\text{ at } f = \frac{Z_{target}}{2\pi L_{vrm}} = ${T(s.zt / (2 * Math.PI * p.vrm.l), 'Hz')}`;

  const xspans = [
    ...viol.map(v => ({ from: v.from, to: v.to, color: 'red' })),
    ...(s.fmax < F1 ? [{ from: s.fmax, to: F1, label: 'package / die cap', color: 'muted' }] : []),
  ];
  const pts = ex.peaks.filter(pk => pk.f >= F0 && pk.f <= F1).map(pk => ({ x: pk.f, y: pk.z, color: pk.z > s.zt ? 'red' : 'ink' }));

  return (
    <SimShell title="Decoupling network (PDN) impedance" onReset={() => set(init)}
      tryThis={<>start from <b>Single 100 nF</b>: the bulk cap's inductance resonates with the 100 nF and makes a tall anti-resonance peak. Switch to <b>20 × 100 nF</b>: more of the same lowers the curve but the bulk/MLCC peak remains. <b>Mixed</b> values fill the gaps. Then try <b>placed far</b>: 3 nH of via/trace inductance per cap raises every SRF-to-HF slope, and the target fails tens of MHz earlier even though the capacitance didn't change.</>}
      controls={<>
        <Select label="Preset" value={s.preset} options={PRESETS} onChange={setPreset} />
        <Slider label="Target impedance" value={s.zt} min={1e-3} max={1} log unit="Ω" onChange={v => set(st => ({ ...st, zt: v }))} />
        <Slider label="Board band of interest up to" value={s.fmax} min={1e6} max={1e9} log unit="Hz" onChange={v => set(st => ({ ...st, fmax: v }))} />
        <Seg label="Edit branch" value={sel} onChange={v => set(st => ({ ...st, sel: v }))} options={[{ value: '0', label: 'Bulk' }, { value: '1', label: 'A' }, { value: '2', label: 'B' }, { value: '3', label: 'C' }, { value: 'vrm', label: 'VRM' }]} />
        {g && <>
          <Toggle label={`${gi === 0 ? 'Bulk capacitor' : 'Group ' + g.name} fitted`} checked={g.on} onChange={updG(gi, 'on')} />
          <Slider label="Capacitance (each)" value={g.c} min={1e-9} max={1e-3} log unit="F" onChange={updG(gi, 'c')} />
          <Slider label="Count" value={g.n} min={0} max={50} step={1} format={v => String(v)} onChange={v => updG(gi, 'n')(Math.round(v))} />
          <Slider label="ESR (each)" value={g.esr} min={5e-4} max={1} log unit="Ω" onChange={updG(gi, 'esr')} />
          <Slider label="ESL of part" value={g.esl} min={1e-10} max={1e-8} log unit="H" onChange={updG(gi, 'esl')} />
          <Slider label="Mounting + via L" value={g.lmnt} min={1e-10} max={1e-8} log unit="H" onChange={updG(gi, 'lmnt')} />
        </>}
        {!g && <>
          <Toggle label="VRM connected" checked={p.vrm.on} onChange={updV('on')} />
          <Slider label="VRM output R" value={p.vrm.r} min={1e-4} max={0.1} log unit="Ω" onChange={updV('r')} />
          <Slider label="VRM effective L" value={p.vrm.l} min={1e-9} max={1e-6} log unit="H" onChange={updV('l')} />
        </>}
        <Toggle label="Show individual branches" checked={s.showParts} onChange={v => set(st => ({ ...st, showParts: v }))} />
        <Note>Above ~100 MHz a real PDN is held up by package and on-die capacitance; board caps can't help there because of their mounting inductance.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <RegionBadge label={pass ? `Meets ${si(s.zt, 'Ω')} up to ${si(s.fmax, 'Hz')}` : `Fails target in band`} color={pass ? 'ok' : 'bad'} />
        {!pass && <span className="small muted">{inBand.map(v => `${si(v.from, 'Hz')}–${si(Math.min(v.to, s.fmax), 'Hz')}`).join(', ')} above target</span>}
      </div>
      <Readouts>
        <Readout k="Worst |Z| in band" v={si(worstBand.z, 'Ω')} tone={worstBand.z > s.zt ? 'bad' : 'ok'} hl />
        <Readout k="at frequency" v={si(worstBand.f, 'Hz')} />
        <Readout k="Below target up to" v={meets === Infinity ? '1 GHz+' : si(meets, 'Hz')} tone={meets >= s.fmax ? 'ok' : 'warn'} />
        <Readout k="Anti-resonances" v={String(ex.peaks.length)} />
        <Readout k="Total capacitance" v={si(totalC(p), 'F')} />
        <Readout k="HF loop L (all ∥)" v={si(Lhf, 'H')} />
        <Readout k="HF limit (ωL = Z_target)" v={si(fL, 'Hz')} />
      </Readouts>
      <Plot height={300} xLog yLog xUnit="Hz" yUnit="Ω" xLabel="Frequency" yLabel="|Z|" xRange={[F0, F1]} yRange={[ymin, ymax]}
        series={[{ x: sw.f, y: sw.z, label: '|Z_PDN| total', color: 'ink', width: 2.5 }, ...(s.showParts ? parts : [])]}
        hlines={[{ at: s.zt, label: `Z_target ${si(s.zt, 'Ω')}`, color: 'red' }]} xspans={xspans} points={pts} />
      <EqBox>{eqG}</EqBox>
      <EqBox>{eqT}</EqBox>
      {ex.peaks.length > 0 && <div className="small muted">Anti-resonance peaks: {ex.peaks.map((pk, i) => <span key={i} style={{ color: pk.z > s.zt ? 'var(--bad)' : undefined, marginRight: 10 }}>{si(pk.f, 'Hz')} → {si(pk.z, 'Ω')}</span>)}</div>}
    </SimShell>
  );
}
