// Trace impedance calculator: microstrip / stripline / edge-coupled differential pairs.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, num } from '../kit';
import Plot from '../../components/Plot';
import { logspace } from '../../lib/units';
import { solve, designZ, widthFor, Kind, TraceIn } from '../models/microstrip-calc';

const mm = (v: number) => (v >= 1 ? v.toFixed(2) : v >= 0.1 ? v.toFixed(3) : v.toFixed(4)) + ' mm';
const mil = (v: number) => (v / 0.0254).toFixed(1) + ' mil';

function CrossSection({ p, h2 }: { p: TraceIn; h2?: boolean }) {
  const strip = p.type.includes('stripline'), diff = p.type.startsWith('diff');
  const h = h2 ? 2 * p.h : p.h;
  const span = diff ? 2 * p.w + p.s : p.w;
  const stack = strip ? 2 * h + p.t : h + p.t;
  const W = 340, H = 170, cx = W / 2;
  const k = Math.min(200 / span, 96 / stack);
  const tp = Math.max(3, p.t * k), hp = h * k, wp = p.w * k, sp = p.s * k;
  const yPlane = strip ? 26 + hp * 2 + tp : 30 + hp + tp;
  const yTop = strip ? 26 : 30;
  const yTraceBot = strip ? yTop + hp + tp : yPlane - hp;
  const yTrace = yTraceBot - tp;
  const xs = diff ? [cx - sp / 2 - wp, cx + sp / 2] : [cx - wp / 2];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 460, display: 'block', margin: '0 auto' }} role="img" aria-label="Trace cross-section">
      <rect x={20} y={strip ? yTop : yTraceBot} width={W - 40} height={strip ? yPlane - yTop : hp} fill="var(--d-green)" opacity={0.16} />
      <rect x={20} y={yPlane} width={W - 40} height={6} fill="var(--d-orange)" />
      {strip && <rect x={20} y={yTop - 6} width={W - 40} height={6} fill="var(--d-orange)" />}
      {xs.map((x, i) => <rect key={i} x={x} y={yTrace} width={wp} height={tp} fill="var(--d-orange)" stroke="var(--d-ink)" strokeWidth={0.6} />)}
      <text x={26} y={yPlane + 20} fontSize={10.5} fill="var(--d-muted)">ground plane</text>
      <text x={W - 26} y={(strip ? yTop : yTraceBot) + 14} textAnchor="end" fontSize={10.5} fill="var(--d-muted)">εr = {p.er.toFixed(2)}</text>
      {/* height dimension */}
      <line x1={xs[0] - 22} x2={xs[0] - 22} y1={yTraceBot} y2={yPlane} stroke="var(--d-ink)" strokeWidth={0.8} markerStart="url(#dimA)" markerEnd="url(#dimA)" />
      <text x={xs[0] - 26} y={(yTraceBot + yPlane) / 2 + 4} textAnchor="end" fontSize={11} fill="var(--d-ink)">h = {mm(h)}{h2 ? ' (2×)' : ''}</text>
      {/* width */}
      <line x1={xs[0]} x2={xs[0] + wp} y1={yTrace - 9} y2={yTrace - 9} stroke="var(--d-ink)" strokeWidth={0.8} markerStart="url(#dimA)" markerEnd="url(#dimA)" />
      <text x={xs[0] + wp / 2} y={yTrace - 13} textAnchor="middle" fontSize={11} fill="var(--d-ink)">w = {mm(p.w)}</text>
      {diff && <><line x1={xs[0] + wp} x2={xs[1]} y1={yTraceBot + 10} y2={yTraceBot + 10} stroke="var(--d-ink)" strokeWidth={0.8} markerStart="url(#dimA)" markerEnd="url(#dimA)" />
        <text x={cx} y={yTraceBot + 22} textAnchor="middle" fontSize={11} fill="var(--d-ink)">s = {mm(p.s)}</text></>}
      <text x={(xs[xs.length - 1] + wp) + 8} y={yTrace + tp / 2 + 4} fontSize={10.5} fill="var(--d-muted)">t = {(p.t * 1000).toFixed(0)} µm</text>
      <defs><marker id="dimA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--d-ink)" /></marker></defs>
    </svg>
  );
}

export default function MicrostripCalc({ params }: SimProps) {
  const ty = String(params.type ?? 'microstrip');
  const type0 = (['microstrip', 'stripline', 'diff-microstrip', 'diff-stripline'].includes(ty) ? ty : 'microstrip') as Kind;
  const init = {
    type: type0, w: Number(params.w ?? 0.3), h: Number(params.h ?? 0.2), t: Number(params.t ?? 0.035), er: Number(params.er ?? 4.3), s: Number(params.s ?? 0.2),
    target: type0.startsWith('diff') ? 100 : 50, double: false,
  };
  const [st, set] = useState(init);
  const upd = <K extends keyof typeof st>(k: K) => (v: (typeof st)[K]) => set(p => ({ ...p, [k]: v }));
  const setType = (t: Kind) => set(p => ({ ...p, type: t, target: t.startsWith('diff') === p.type.startsWith('diff') ? p.target : t.startsWith('diff') ? 100 : 50 }));
  const p: TraceIn = { type: st.type, w: st.w, h: st.h, t: st.t, er: st.er, s: st.s };
  const diff = st.type.startsWith('diff'), strip = st.type.includes('stripline');
  const r = useMemo(() => solve(p), [st]);
  const r2 = useMemo(() => solve({ ...p, h: 2 * p.h }), [st]);
  const zNow = diff ? r.zdiff : r.z0, zDbl = diff ? r2.zdiff : r2.z0;
  const wT = useMemo(() => widthFor(st.target, p), [st]);
  const wT2 = useMemo(() => widthFor(st.target, { ...p, h: 2 * p.h }), [st]);
  const curve = useMemo(() => {
    const xs = logspace(Math.max(0.01, st.h * 0.05), Math.min(10, st.h * 20), 160);
    return { x: xs, y: xs.map(w => designZ({ ...p, w })), y2: xs.map(w => designZ({ ...p, w, h: 2 * p.h })) };
  }, [st]);
  const err = (zNow - st.target) / st.target;
  const zName = diff ? 'Z_diff' : 'Z0';

  const eq = strip
    ? String.raw`Z_0=\frac{30}{\sqrt{\varepsilon_r}}\ln\!\left[1+\frac{4}{\pi m}\left(\frac{8}{\pi m}+\sqrt{\left(\tfrac{8}{\pi m}\right)^2+6.27}\right)\right],\; m=\frac{w_{\text{eff}}}{b-t}\;\Rightarrow\; Z_0=${r.z0.toFixed(1)}\,\Omega`
    : String.raw`Z_0=\frac{\eta_0}{2\pi\sqrt{\varepsilon_{\text{eff}}}}\ln\!\left[\frac{f(u)}{u}+\sqrt{1+\tfrac{4}{u^2}}\right],\;u=\tfrac{w_{\text{eff}}}{h}=${(st.w / st.h).toFixed(2)}\;\Rightarrow\;Z_0=${r.z0.toFixed(1)}\,\Omega,\;\varepsilon_{\text{eff}}=${r.eeff.toFixed(2)}`;
  const eqDiff = diff ? (strip ? String.raw`\\ Z_{diff}\approx 2Z_0\left(1-0.347\,e^{-2.9 s/b}\right)=${r.zdiff.toFixed(1)}\,\Omega` : String.raw`\\ Z_{diff}\approx 2Z_0\left(1-0.48\,e^{-0.96 s/h}\right)=${r.zdiff.toFixed(1)}\,\Omega`) : '';

  return (
    <SimShell title="Trace impedance calculator" onReset={() => set(init)}
      tryThis={<>keep w = 0.3 mm and toggle <b>2× substrate</b>: Z0 jumps from about 55 Ω to over 70 Ω because the trace is now twice as far from its return plane (less C per length, more L). The table shows the new width needed to get back to the target. Then switch to <b>Stripline</b>: the same trace is lower in impedance and slower (εeff = εr, all field inside the dielectric).</>}
      controls={<>
        <Seg label="Geometry" value={st.type} options={[{ value: 'microstrip', label: 'Microstrip' }, { value: 'stripline', label: 'Stripline' }, { value: 'diff-microstrip', label: 'Diff microstrip' }, { value: 'diff-stripline', label: 'Diff stripline' }]} onChange={setType} />
        <Slider label="Trace width w" value={st.w} min={0.02} max={5} log format={v => `${mm(v)} (${mil(v)})`} onChange={upd('w')} />
        <Slider label={strip ? 'Dielectric to each plane h' : 'Dielectric height h'} value={st.h} min={0.05} max={3} log format={v => `${mm(v)} (${mil(v)})`} onChange={upd('h')} />
        <Slider label="Copper thickness t" value={st.t} min={0.005} max={0.105} step={0.001} format={v => `${(v * 1000).toFixed(0)} µm (${(v / 0.0347).toFixed(2)} oz)`} onChange={upd('t')} />
        <Slider label="Dielectric constant εr" value={st.er} min={1} max={12} step={0.05} format={v => v.toFixed(2)} onChange={upd('er')} />
        {diff && <Slider label="Pair spacing s (edge to edge)" value={st.s} min={0.05} max={3} log format={v => `${mm(v)} (${mil(v)})`} onChange={upd('s')} />}
        <Slider label={`Target ${diff ? 'Zdiff' : 'Z0'}`} value={st.target} min={20} max={150} step={1} unit="Ω" onChange={upd('target')} />
        <Toggle label="Compare: substrate twice as thick (2h)" checked={st.double} onChange={upd('double')} />
        <Note>Microstrip: Hammerstad–Jensen with thickness correction (≈1% accurate). Stripline: Wheeler, trace centred, plane spacing b = 2h + t. Differential: IPC-2141A coupling approximations (±5–10%). FR-4 εr ≈ 4.0–4.5; Rogers RO4350B 3.66.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 6 }}><CrossSection p={p} h2={st.double} /></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <RegionBadge label={`${zName} = ${zNow.toFixed(1)} Ω ${Math.abs(err) < 0.05 ? '≈ target' : err > 0 ? 'above target' : 'below target'}`} color={Math.abs(err) < 0.05 ? 'ok' : Math.abs(err) < 0.1 ? 'warn' : 'bad'} />
        {st.double && <RegionBadge label={`2h: ${zDbl.toFixed(1)} Ω (${zDbl > zNow ? '+' : ''}${((zDbl / zNow - 1) * 100).toFixed(0)}%)`} color="info" />}
      </div>
      <Readouts>
        <Readout k={diff ? 'Z_diff' : 'Z0'} v={zNow.toFixed(1) + ' Ω'} hl tone={Math.abs(err) < 0.05 ? 'ok' : Math.abs(err) < 0.1 ? 'warn' : 'bad'} />
        {diff && <Readout k="Single-ended Z0 / Z_odd" v={`${r.z0.toFixed(1)} / ${r.zodd.toFixed(1)} Ω`} />}
        <Readout k="εeff" v={r.eeff.toFixed(3)} />
        <Readout k="Delay" v={`${r.tpd_ps_mm.toFixed(2)} ps/mm · ${r.tpd_ps_in.toFixed(0)} ps/in`} />
        <Readout k="Velocity" v={`${(r.vFrac * 100).toFixed(1)}% of c`} />
        <Readout k="L′ / C′ per mm" v={`${(r.L_nH_mm * 1000).toFixed(0)} pH · ${(r.C_pF_mm * 1000).toFixed(1)} fF`} />
        {!strip && <Readout k="IPC-2141 quick formula" v={num(r.ipc, 3) + ' Ω'} />}
        <Readout k={`Width for ${st.target} Ω`} v={isFinite(wT) ? `${mm(wT)} (${mil(wT)})` : 'out of range'} />
        {st.double && <Readout k={`Width for ${st.target} Ω at 2h`} v={isFinite(wT2) ? `${mm(wT2)} (${mil(wT2)})` : 'out of range'} />}
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}` + eq + eqDiff + String.raw`\end{gathered}`}</EqBox>
      <Plot height={230} xLog xUnit="" xLabel="trace width w (mm)" yLabel={diff ? 'Z_diff (Ω)' : 'Z0 (Ω)'} xTickFormat={v => num(v, 2)} yTickFormat={v => num(v, 3)}
        series={[
          { x: curve.x, y: curve.y, label: `h = ${mm(st.h)}`, color: 'accent' },
          ...(st.double ? [{ x: curve.x, y: curve.y2, label: `2h = ${mm(2 * st.h)}`, color: 'orange', dashed: true }] : []),
        ]}
        hlines={[{ at: st.target, label: `target ${st.target} Ω`, color: 'green' }]}
        points={[{ x: st.w, y: zNow, label: 'now', color: 'accent' }, ...(st.double ? [{ x: st.w, y: zDbl, label: '2h', color: 'orange' }] : [])]} />
    </SimShell>
  );
}
