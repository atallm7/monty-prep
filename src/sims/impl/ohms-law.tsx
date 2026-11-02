// Ohm's law explorer: pick the unknown (I, V or R), drive the other two, see V–I line, power and a water analogy.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, Toggle, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { linspace, clamp } from '../../lib/units';
import { ohm, powerForms, ratingFor, Solve } from '../models/ohms-law';

const texSI = (v: number, u: string) => isFinite(v) ? `\\text{${si(v, u).replace('−', '-')}}` : '\\infty';

/** Water-pipe analogy: tank height = voltage (pressure), constriction = resistance, flow speed = current. */
function WaterPipe({ v, r, i, playing }: { v: number; r: number; i: number; playing: boolean }) {
  const [phase, setPhase] = useState(0);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  // particle speed: log-mapped so 1 µA..1 A stays visible (px/s). Same speed everywhere along the loop: series current is equal everywhere.
  const speed = i > 0 && isFinite(i) ? clamp(14 * (Math.log10(i / 1e-7) + 0.3), 4, 160) : 0;
  useEffect(() => {
    if (!playing || speed === 0) { last.current = null; return; }
    const tick = (t: number) => {
      if (last.current !== null) { const dt = Math.min(0.05, (t - last.current) / 1000); setPhase(p => (p + speed * dt) % 1000); }
      last.current = t; raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); last.current = null; };
  }, [playing, speed]);

  const level = clamp(v / 30, 0, 1); // tank fill fraction (pressure head ∝ V)
  const tankTop = 52, tankBot = 150, waterY = tankBot - 6 - level * (tankBot - tankTop - 14);
  // constriction opening ∝ 1/log(R): 1 Ω -> full bore, 1 MΩ -> needle
  const open = clamp(14 - 2.1 * Math.log10(Math.max(1, r)), 1.2, 14);
  // closed loop: tank outlet -> bottom pipe (restriction) -> riser with pump -> top return into the tank
  const pathPts: [number, number][] = [[78, 140], [322, 140], [322, 26], [49, 26], [49, 60]];
  const segs: { a: [number, number]; b: [number, number]; len: number }[] = [];
  let total = 0;
  for (let k = 0; k < pathPts.length - 1; k++) { const a = pathPts[k], b = pathPts[k + 1]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, len }); total += len; }
  const at = (s: number): [number, number] => { s = ((s % total) + total) % total; for (const g of segs) { if (s <= g.len) { const t = s / g.len; return [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t]; } s -= g.len; } return pathPts[0]; };
  const n = 22; const dots = speed > 0 ? Array.from({ length: n }, (_, k) => at(phase + (k * total) / n)) : [];
  const d = 'M' + pathPts.map(p => p.join(',')).join(' L');
  return (
    <svg viewBox="0 0 360 176" style={{ width: '100%', maxWidth: 440, height: 'auto' }} role="img" aria-label={`Water analogy: pressure ${si(v, 'V')}, restriction ${si(r, 'Ω')}, flow ${si(i, 'A')}`}>
      {/* pipe walls: thick ink stroke with a background-coloured core */}
      <path d={d} fill="none" stroke="var(--d-ink)" strokeWidth={17} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="var(--d-bg)" strokeWidth={13} strokeLinejoin="round" />
      {/* tank */}
      <rect x={20} y={tankTop} width={58} height={tankBot - tankTop} fill="var(--d-bg)" stroke="var(--d-ink)" strokeWidth={2} />
      <rect x={21} y={waterY} width={56} height={tankBot - waterY - 1} fill="var(--d-blue)" opacity={0.3} />
      <line x1={21} x2={77} y1={waterY} y2={waterY} stroke="var(--d-blue)" strokeWidth={2} />
      <text x={49} y={tankTop + 14} fontSize={10.5} textAnchor="middle" fill="var(--d-muted)">level = V</text>
      <text x={49} y={Math.min(tankBot - 8, waterY + 16)} fontSize={12} textAnchor="middle" fill="var(--d-blue)" fontWeight={600}>{si(v, 'V')}</text>
      {/* restriction (the resistor) on the bottom run */}
      <path d={`M160,133.5 L174,${140 - open / 2} L216,${140 - open / 2} L230,133.5 Z`} fill="var(--d-orange)" stroke="var(--d-orange)" strokeWidth={1.2} />
      <path d={`M160,146.5 L174,${140 + open / 2} L216,${140 + open / 2} L230,146.5 Z`} fill="var(--d-orange)" stroke="var(--d-orange)" strokeWidth={1.2} />
      <text x={195} y={122} fontSize={11} textAnchor="middle" fill="var(--d-orange)" fontWeight={600}>restriction = R ({si(r, 'Ω')})</text>
      {/* pump on the riser */}
      <circle cx={322} cy={84} r={14} fill="var(--d-bg)" stroke="var(--d-ink)" strokeWidth={2} />
      <path d="M322,92 L322,76 M316,82 L322,75 L328,82" fill="none" stroke="var(--d-ink)" strokeWidth={2} />
      <text x={302} y={88} fontSize={11} textAnchor="end" fill="var(--d-muted)">pump = source</text>
      {dots.map(([x, y], k) => <circle key={k} cx={x} cy={y} r={2.6} fill="var(--d-accent)" />)}
      <text x={210} y={168} fontSize={11.5} textAnchor="middle" fill="var(--d-accent)" fontWeight={600}>{speed > 0 ? `flow = I = ${si(i, 'A')} (same everywhere in the loop)` : 'no flow'}</text>
    </svg>
  );
}

export default function OhmsLaw({ params }: SimProps) {
  const s0: Solve = (['I', 'V', 'R'] as const).includes(params.solve) ? params.solve : 'I';
  const v0 = Number(params.v ?? 5), r0 = Number(params.r ?? 1000);
  const init = { solve: s0, v: v0, r: r0, i: r0 > 0 ? v0 / r0 : 0 };
  const [s, set] = useState(init);
  const [play, setPlay] = useState(true);
  const res = useMemo(() => ohm(s), [s]);
  const changeSolve = (solve: Solve) => set(p => { const o = ohm(p); return { solve, v: o.v, i: isFinite(o.i) ? o.i : p.i, r: isFinite(o.r) ? o.r : p.r }; });
  const upd = (k: 'v' | 'i' | 'r') => (x: number) => set(p => ({ ...p, [k]: x }));

  const pf = powerForms(res.v, res.i, res.r);
  const rating = ratingFor(res.p);
  const quarterOk = res.p <= 0.125;

  const schematic = useMemo(() => {
    const flowing = res.i > 0 && isFinite(res.i);
    return renderCircuit({ elements: [
      { t: 'V', a: [0, 1.5], b: [0, 5.5], label: 'V', value: si(res.v, 'V'), color: s.solve === 'V' ? 'accent' : undefined },
      { t: 'wire', pts: [[0, 1.5], [0, 0], [3, 0]], flow: flowing },
      { t: 'A', a: [3, 0], b: [7, 0], label: 'I', value: si(res.i, 'A'), color: s.solve === 'I' ? 'accent' : undefined },
      { t: 'wire', pts: [[7, 0], [10, 0], [10, 1]], flow: flowing },
      { t: 'R', a: [10, 1], b: [10, 6], label: 'R', value: si(res.r, 'Ω'), color: s.solve === 'R' ? 'accent' : 'orange' },
      { t: 'wire', pts: [[10, 6], [10, 7], [0, 7], [0, 5.5]], flow: flowing },
      { t: 'text', at: [5, 3.6], text: `P = ${si(res.p, 'W')}`, color: quarterOk ? 'muted' : 'red' },
    ] }).svg;
  }, [res, s.solve, quarterOk]);

  // V–I characteristic: I = V/R, plus 2R and R/2 for contrast (slope = conductance)
  const vmax = Math.max(1, Math.abs(res.v) * 1.6, 1e-6);
  const plot = useMemo(() => {
    const xs = linspace(0, vmax, 60);
    const R = isFinite(res.r) && res.r > 0 ? res.r : 1e12;
    return [
      { x: xs, y: xs.map(x => x / R), label: `R = ${si(R, 'Ω')}`, color: 'accent' },
      { x: xs, y: xs.map(x => x / (R / 2)), label: 'R/2 (steeper)', color: 'muted', dashed: true },
      { x: xs, y: xs.map(x => x / (2 * R)), label: '2R (shallower)', color: 'muted', dashed: true },
    ];
  }, [vmax, res.r]);
  const imax = isFinite(res.r) && res.r > 0 ? vmax / res.r * 1.1 : 1;

  const eq = s.solve === 'I'
    ? String.raw`I = \frac{V}{R} = \frac{${texSI(res.v, 'V')}}{${texSI(res.r, 'Ω')}} = ${texSI(res.i, 'A')}`
    : s.solve === 'V'
      ? String.raw`V = I\,R = ${texSI(res.i, 'A')}\times ${texSI(res.r, 'Ω')} = ${texSI(res.v, 'V')}`
      : String.raw`R = \frac{V}{I} = \frac{${texSI(res.v, 'V')}}{${texSI(res.i, 'A')}} = ${texSI(res.r, 'Ω')}`;

  return (
    <SimShell title="Ohm's law explorer" onReset={() => set(init)}
      tryThis={<>with "Solve for I", double V and watch I double (the V–I line is straight: that is what "ohmic" means). Then double R instead: I halves and power drops 4× at fixed V (P = V²/R). Finally push V to 24 V on 1 kΩ: P = 0.58 W, enough to cook a ¼ W resistor.</>}
      controls={<>
        <Seg label="Solve for" value={s.solve} onChange={changeSolve} options={[{ value: 'I', label: 'Current I' }, { value: 'V', label: 'Voltage V' }, { value: 'R', label: 'Resistance R' }]} />
        {s.solve !== 'V' && <Slider label="Voltage V" value={s.v} min={0} max={30} step={0.1} unit="V" onChange={upd('v')} />}
        {s.solve !== 'I' && <Slider label="Current I" value={s.i} min={1e-6} max={1} log unit="A" onChange={upd('i')} />}
        {s.solve !== 'R' && <Slider label="Resistance R" value={s.r} min={1} max={1e6} log unit="Ω" onChange={upd('r')} />}
        <Toggle label="Animate water flow" checked={play} onChange={setPlay} />
        <Note>The highlighted quantity in the schematic is the computed one. Flow animation speed is log-scaled in current so 1 µA and 1 A are both visible.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="sim-note">Solving for <b>{s.solve}</b>:</span>
        {res.note ? <RegionBadge label={res.note} color="bad" /> : quarterOk ? <RegionBadge label="Safe for a ⅛ W resistor" color="ok" /> : rating ? <RegionBadge label={`Needs ≥ ${rating} W resistor (2× margin)`} color={res.p > 0.25 ? 'bad' : 'warn'} /> : <RegionBadge label="Power beyond any common resistor" color="bad" />}
      </div>
      <EqBox>{eq}</EqBox>
      <Readouts>
        <Readout k="Current I" v={si(res.i, 'A')} hl={s.solve === 'I'} />
        <Readout k="Voltage V" v={si(res.v, 'V')} hl={s.solve === 'V'} />
        <Readout k="Resistance R" v={si(res.r, 'Ω')} hl={s.solve === 'R'} />
        <Readout k="Conductance G = 1/R" v={si(res.g, 'S')} />
        <Readout k="Power P = VI" v={si(res.p, 'W')} tone={res.p > 0.25 ? 'bad' : res.p > 0.125 ? 'warn' : 'ok'} />
        <Readout k="P = I²R = V²/R" v={si(pf.i2r, 'W')} />
      </Readouts>
      <div style={{ display: 'flex', justifyContent: 'center' }}><WaterPipe v={res.v} r={res.r} i={res.i} playing={play} /></div>
      <Plot series={plot} xRange={[0, vmax]} yRange={[0, imax]} xUnit="V" yUnit="A" xLabel="Voltage V" yLabel="Current I" height={230}
        points={isFinite(res.i) ? [{ x: res.v, y: res.i, label: 'operating point', color: 'accent' }] : []} />
      <Note>Slope of the V–I line = 1/R = G. A steeper line is a smaller resistance. All three power forms (VI, I²R, V²/R) give the same number for a resistor because they are the same equation rearranged with V = IR.</Note>
    </SimShell>
  );
}
