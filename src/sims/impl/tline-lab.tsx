// Transmission-line reflections: source → lossless line → load, with terminations, bounce diagram and transient.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { simulate, lattice, LoadKind, Term, TlIn } from '../models/tline-lab';

const fmtG = (g: number) => (Math.abs(g) < 5e-4 ? '0' : g.toFixed(3).replace('-', '−'));

function Lattice({ p }: { p: TlIn }) {
  const L = useMemo(() => lattice(p, 5), [p]);
  const n = Math.max(2, L.segs.length);
  const W = 340, x0 = 70, x1 = 270, top = 34, dy = Math.min(34, 260 / n), H = top + dy * n + 26;
  const y = (k: number) => top + k * dy;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto' }} role="img" aria-label="Bounce diagram">
      <text x={x0} y={14} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--d-ink)">Source</text>
      <text x={x1} y={14} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="var(--d-ink)">Load</text>
      <text x={x0} y={27} textAnchor="middle" fontSize={10.5} fill="var(--d-muted)">Γs = {fmtG(L.gs)}</text>
      <text x={x1} y={27} textAnchor="middle" fontSize={10.5} fill="var(--d-muted)">ΓL = {fmtG(L.gl)}</text>
      <line x1={x0} x2={x0} y1={top} y2={H - 14} stroke="var(--d-ink)" strokeWidth={2} />
      <line x1={x1} x2={x1} y1={top} y2={H - 14} stroke="var(--d-ink)" strokeWidth={2} />
      {L.segs.map((s, k) => {
        const ya = y(k), yb = y(k + 1); const fwd = s.from === 'S';
        const xa = fwd ? x0 : x1, xb = fwd ? x1 : x0;
        const mx = (xa + xb) / 2, my = (ya + yb) / 2;
        return <g key={k}>
          <line x1={xa} y1={ya} x2={xb} y2={yb} stroke={fwd ? 'var(--d-accent)' : 'var(--d-orange)'} strokeWidth={1.6} markerEnd="url(#tlArrow)" />
          <text x={mx} y={my - 4} textAnchor="middle" fontSize={10.5} fill={fwd ? 'var(--d-accent)' : 'var(--d-orange)'}>{(s.amp >= 0 ? '+' : '−') + Math.abs(s.amp).toFixed(3)} V</text>
          <text x={fwd ? x1 + 6 : x0 - 6} y={yb + 4} textAnchor={fwd ? 'start' : 'end'} fontSize={10.5} fill="var(--d-ink)">{s.vAfter.toFixed(3)}</text>
          {k === 0 && <text x={x0 - 6} y={ya + 4} textAnchor="end" fontSize={10.5} fill="var(--d-ink)">{L.v1.toFixed(3)}</text>}
          <text x={6} y={yb + 4} fontSize={9.5} fill="var(--d-muted)">{k + 1}td</text>
        </g>;
      })}
      <defs><marker id="tlArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--d-muted)" /></marker></defs>
      <text x={W / 2} y={H - 2} textAnchor="middle" fontSize={10} fill="var(--d-muted)">time ↓ · end labels: voltage change from idle after each arrival (V)</text>
    </svg>
  );
}

export default function TlineLab({ params }: SimProps) {
  const rlp = params.rl ?? 'open';
  const load0: LoadKind = rlp === 'open' ? 'open' : rlp === 'short' ? 'short' : rlp === 'cap' || rlp === 'C' ? 'C' : isFinite(Number(rlp)) ? 'R' : 'open';
  const t0 = String(params.term ?? 'none') as Term;
  const init = {
    vs: Number(params.vs ?? 1),
    z0: Number(params.z0 ?? 50), rs: Number(params.rs ?? 10),
    rl: load0 === 'R' ? Math.max(0.1, Number(rlp)) : 50,
    load: load0, cl: Number(params.cl ?? 10e-12),
    td: Number(params.td ?? 1e-9), tr: Number(params.tr ?? 100e-12),
    term: (['none', 'series', 'parallel', 'thevenin', 'ac'].includes(t0) ? t0 : 'none') as Term,
    cac: Number(params.cac ?? 100e-12),
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const p: TlIn = useMemo(() => ({ ...s }), [s]);
  const r = useMemo(() => simulate(p), [p]);
  const n = r.net;

  const schematic = useMemo(() => {
    const Y = 4, B = 11; const hasT = s.term === 'parallel' || s.term === 'thevenin' || s.term === 'ac';
    const xr = hasT ? 20 : 16;
    const el: any[] = [
      { t: 'Vsq', a: [0, 6], b: [0, 10], label: 'V_S', value: si(s.vs, 'V') },
      { t: 'wire', pts: [[0, 6], [0, Y], [1, Y]] },
      { t: 'R', a: [1, Y], b: [4, Y], label: 'R_S', value: si(s.rs, 'Ω') },
      s.term === 'series' ? { t: 'R', a: [4, Y], b: [7, Y], label: 'R_{ser}', value: si(n.rser, 'Ω'), color: 'green' } : { t: 'wire', pts: [[4, Y], [7, Y]] },
      { t: 'box', at: [7, Y - 1], w: 6, h: 2, label: `Z0=${si(s.z0, 'Ω')}  td=${si(s.td, 's')}` },
      { t: 'wire', pts: [[13, Y], [16, Y]] },
      { t: 'text', at: [7.2, Y - 1.6], text: 'V_{src}', anchor: 'start', color: 'orange' },
      { t: 'text', at: [15.8, Y - 1.6], text: 'V_{load}', anchor: 'end', color: 'accent' },
      { t: 'wire', pts: [[0, 10], [0, B], [xr, B]] }, { t: 'gnd', at: [6, B] },
      { t: 'wire', pts: [[7, B], [7, Y + 1]], dashed: true }, { t: 'wire', pts: [[13, B], [13, Y + 1]], dashed: true },
    ];
    if (s.load === 'R') el.push({ t: 'R', a: [16, Y], b: [16, Y + 4], label: 'R_L', value: si(s.rl, 'Ω'), color: 'orange' }, { t: 'wire', pts: [[16, Y + 4], [16, B]] });
    else if (s.load === 'C') el.push({ t: 'C', a: [16, Y], b: [16, Y + 4], label: 'C_L', value: si(s.cl, 'F'), color: 'orange' }, { t: 'wire', pts: [[16, Y + 4], [16, B]] });
    else if (s.load === 'short') el.push({ t: 'wire', pts: [[16, Y], [16, B]], color: 'orange' }, { t: 'text', at: [16.6, Y + 3.5], text: 'short', anchor: 'start', muted: true });
    else el.push({ t: 'text', at: [16.4, Y + 1.8], text: 'open', anchor: 'start', muted: true });
    if (hasT) {
      el.push({ t: 'wire', pts: [[16, Y], [20, Y]] }, { t: 'dot', at: [16, Y] });
      if (s.load !== 'open') el.push({ t: 'dot', at: [16, B] });
      if (s.term === 'parallel') el.push({ t: 'R', a: [20, Y], b: [20, Y + 4], label: 'R_T', value: si(s.z0, 'Ω'), color: 'green' }, { t: 'wire', pts: [[20, Y + 4], [20, B]] });
      if (s.term === 'thevenin') el.push({ t: 'R', a: [20, Y], b: [20, Y + 4], label: 'R_2', value: si(2 * s.z0, 'Ω'), color: 'green' }, { t: 'wire', pts: [[20, Y + 4], [20, B]] }, { t: 'R', a: [20, 0], b: [20, Y], label: 'R_1', value: si(2 * s.z0, 'Ω'), color: 'green' }, { t: 'rail', at: [20, 0], label: `V_{CC}=${si(s.vs, 'V')}` }, { t: 'dot', at: [20, Y] });
      if (s.term === 'ac') el.push({ t: 'R', a: [20, Y], b: [20, Y + 3], label: 'R_T', value: si(s.z0, 'Ω'), color: 'green' }, { t: 'C', a: [20, Y + 3], b: [20, Y + 6], label: 'C_T', value: si(s.cac, 'F'), color: 'green' }, { t: 'wire', pts: [[20, Y + 6], [20, B]] });
    }
    return renderCircuit({ elements: el }).svg;
  }, [s, n.rser]);

  const electricallyShort = s.tr > 2 * s.td;
  const ov = r.vFinal !== 0 ? (r.peak - r.vFinal) / Math.abs(r.vFinal) : 0;
  const matchedL = Math.abs(n.gl) < 0.05, matchedS = Math.abs(n.gs) < 0.05;
  const state = s.load === 'C' && !matchedL ? { l: 'Capacitive load: dip, then RC charge', c: 'warn' as const } : matchedL ? { l: 'Load matched: no reflection', c: 'ok' as const } : matchedS ? { l: 'Source matched: one reflection, then flat', c: 'ok' as const } : Math.abs(n.gl * n.gs) > 0.3 ? { l: 'Ringing: both ends mismatched', c: 'bad' as const } : { l: 'Mismatched: decaying reflections', c: 'warn' as const };
  const gTex = !isFinite(n.rHF) ? String.raw`R_{L,\text{eff}}=\infty\Rightarrow\Gamma_L=+1` : String.raw`\Gamma_L=\frac{R_{L,\text{eff}}-Z_0}{R_{L,\text{eff}}+Z_0}=\frac{${n.rHF.toPrecision(3)}-${s.z0.toFixed(0)}}{${n.rHF.toPrecision(3)}+${s.z0.toFixed(0)}}=${fmtG(n.gl).replace('−', '-')}`;

  return (
    <SimShell title="Transmission line reflections" onReset={() => set(init)}
      tryThis={<>start with the open load and R<sub>S</sub> = 10 Ω: the load jumps to 1.67 V (Γ<sub>L</sub> = +1 doubles the 0.83 V launch) and rings. Now pick <b>series</b> termination: the source launches V<sub>S</sub>/2, the open end doubles it to exactly V<sub>S</sub>, and it is clean after one round trip. Finally raise t<sub>r</sub> above 2·t<sub>d</sub> and watch the reflections blur into the edge (the line is electrically short).</>}
      controls={<>
        <Slider label="Line impedance Z0" value={s.z0} min={20} max={150} step={1} unit="Ω" onChange={upd('z0')} />
        <Slider label="Source resistance RS" value={s.rs} min={1} max={500} log unit="Ω" onChange={upd('rs')} />
        <Select label="Load" value={s.load} options={[{ value: 'open', label: 'Open (CMOS input)' }, { value: 'R', label: 'Resistor RL' }, { value: 'short', label: 'Short' }, { value: 'C', label: 'Capacitor CL' }]} onChange={upd('load')} />
        {s.load === 'R' && <Slider label="Load RL" value={s.rl} min={1} max={10000} log unit="Ω" onChange={upd('rl')} />}
        {s.load === 'C' && <Slider label="Load CL" value={s.cl} min={0.1e-12} max={100e-12} log unit="F" onChange={upd('cl')} />}
        <Seg label="Termination" value={s.term} options={[{ value: 'none', label: 'None' }, { value: 'series', label: 'Series' }, { value: 'parallel', label: 'Parallel' }, { value: 'thevenin', label: 'Thevenin' }, { value: 'ac', label: 'AC (RC)' }]} onChange={upd('term')} />
        {s.term === 'ac' && <Slider label="AC-termination C_T" value={s.cac} min={1e-12} max={1e-9} log unit="F" onChange={upd('cac')} />}
        <Slider label="Line delay td" value={s.td} min={20e-12} max={10e-9} log unit="s" onChange={upd('td')} />
        <Slider label="Rise time tr" value={s.tr} min={10e-12} max={10e-9} log unit="s" onChange={upd('tr')} />
        <Slider label="Source step VS" value={s.vs} min={0.5} max={5} step={0.1} unit="V" onChange={upd('vs')} />
        <Note>Lossless line solved with the method of characteristics (exact wave delays), load network integrated with the trapezoidal rule. Terminations: series R = Z0 − R<sub>S</sub>; parallel R = Z0 to ground; Thevenin 2Z0/2Z0 ≡ Z0 to V<sub>CC</sub>/2; AC = Z0 in series with C<sub>T</sub>.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <RegionBadge label={state.l} color={state.c} />
        {electricallyShort && <RegionBadge label="tr > 2·td: electrically short line" color="info" />}
        {s.load === 'C' && <RegionBadge label="Capacitor: Γ starts at −1, ends at +1" color="info" />}
        {s.term === 'ac' && <RegionBadge label={`R_T·C_T = ${si(s.z0 * s.cac, 's')} vs 2td = ${si(2 * s.td, 's')}`} color={s.z0 * s.cac > 3 * 2 * s.td ? 'ok' : 'warn'} />}
      </div>
      <Plot height={260} xUnit="s" yUnit="V" xLabel="time" yLabel="voltage" xRange={[0, r.tEnd]}
        series={[
          { x: r.t, y: r.vIn, label: 'source EMF', color: 'muted', dashed: true },
          { x: r.t, y: r.vSrc, label: 'V at source end', color: 'orange' },
          { x: r.t, y: r.vLoad, label: 'V at load', color: 'accent', width: 2.2 },
        ]}
        hlines={[{ at: r.vFinal, label: 'final ' + si(r.vFinal, 'V'), color: 'muted' }]}
        vlines={[{ at: s.td, label: 'td', color: 'muted' }, { at: 2 * s.td, label: '2td', color: 'muted' }]} />
      <Readouts>
        <Readout k="Γ source" v={fmtG(n.gs)} tone={Math.abs(n.gs) < 0.05 ? 'ok' : undefined} />
        <Readout k="Γ load (at the edge)" v={fmtG(n.gl)} tone={Math.abs(n.gl) < 0.05 ? 'ok' : undefined} />
        <Readout k="Launched step" v={si(r.launched, 'V')} />
        <Readout k="Peak at load" v={`${si(r.peak, 'V')}${ov > 0.005 ? ` (+${(ov * 100).toFixed(0)}%)` : ''}`} hl tone={ov > 0.2 ? 'bad' : ov > 0.05 ? 'warn' : 'ok'} />
        <Readout k="Final value" v={si(r.vFinal, 'V')} />
        <Readout k="Settling (±5%)" v={r.settle > 0 ? si(r.settle, 's') : '—'} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}` + gTex + String.raw`\\ V_{launch}=V_S\frac{Z_0}{R_{S,\text{eff}}+Z_0}=\text{${si(r.launched, 'V')}},\quad \Gamma_S=${fmtG(n.gs).replace('−', '-')}\end{gathered}`}</EqBox>
      {s.load === 'C' ? <Note>Bounce diagram hidden: a capacitor has no single Γ. It looks like a short (Γ = −1) to the edge and an open (Γ = +1) after a few Z0·C time constants, so the reflection is a negative dip that recovers.</Note>
        : <div className="figure-body"><Lattice p={p} /></div>}
    </SimShell>
  );
}
