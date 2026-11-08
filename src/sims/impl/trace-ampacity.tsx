// Trace & via current capacity (IPC-2221). Pure model in ../models/trace-ampacity.ts
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { logspace } from '../../lib/units';
import { Layer, ipcCurrent, ipcWidthMm, areaMil2, traceElectrical, viaCapacity, kLayer, OZ_MIL, MIL_MM } from '../models/trace-ampacity';

type Mode = 'current' | 'width';
const OZ = [0.5, 1, 2, 3, 4];

export default function TraceAmpacity({ params }: SimProps) {
  const init = {
    mode: (params.mode === 'width' ? 'width' : 'current') as Mode,
    w: Number(params.w ?? 0.5), oz: Number(params.oz ?? 1),
    layer: (params.layer === 'internal' ? 'internal' : 'external') as Layer,
    dT: Number(params.dT ?? 10), I: Number(params.I ?? 2), len: Number(params.len ?? 50),
    drill: 0.3, plate: 25, nvia: 1,
  };
  const [s, set] = useState(init);
  const up = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const r = useMemo(() => {
    const wEff = s.mode === 'current' ? s.w : ipcWidthMm(s.I, s.oz, s.layer, s.dT);
    const iMax = s.mode === 'current' ? ipcCurrent(s.w, s.oz, s.layer, s.dT) : s.I;
    const A = areaMil2(wEff, s.oz);
    const el = traceElectrical(wEff, s.oz, s.len, iMax, s.dT);
    const other: Layer = s.layer === 'external' ? 'internal' : 'external';
    const wOther = ipcWidthMm(iMax, s.oz, other, s.dT);
    const via = viaCapacity(s.drill, s.plate, s.dT);
    const viaTot = via.I * s.nvia;
    const viasNeeded = via.I > 0 ? Math.ceil(iMax / via.I - 1e-9) : Infinity;
    return { wEff, iMax, A, el, other, wOther, via, viaTot, viasNeeded };
  }, [s]);

  const ws = useMemo(() => logspace(0.05, 20, 120), []);
  const curves = useMemo(() => ({
    ext: ws.map(w => ipcCurrent(w, s.oz, 'external', s.dT)),
    int: ws.map(w => ipcCurrent(w, s.oz, 'internal', s.dT)),
  }), [ws, s.oz, s.dT]);

  const hot = Math.min(1, s.dT / 100);
  const tone = s.dT > 45 ? 'bad' : s.dT > 20 ? 'warn' : 'ok';

  // ---- cross-section drawing (width to scale on log-ish scale; copper thickness exaggerated for visibility)
  const CW = 340, cx = CW / 2;
  const wPx = Math.max(6, Math.min(300, 20 + 80 * Math.log10(Math.max(0.05, r.wEff) / 0.05)));
  const tPx = Math.max(5, Math.min(26, s.oz * 8));
  const inner = s.layer === 'internal';
  const yTop = 44, boardH = 96, yCu = inner ? yTop + 38 : yTop; // copper top edge
  const heatFill = `color-mix(in srgb, var(--d-red) ${Math.round(18 + hot * 70)}%, var(--d-orange))`;

  return (
    <SimShell title="Trace & via current capacity (IPC-2221)" onReset={() => set(init)}
      tryThis={<>set 1 oz external, ΔT = 10 °C, then switch the layer to <b>Internal</b>: the same trace carries exactly half the current (k = 0.024 vs 0.048). In <b>Width</b> mode enter 5 A: an outer trace needs about 2.8 mm, an inner one 2.6× the copper area. Raise ΔT from 10 to 40 °C and the current only rises by 4<sup>0.44</sup> = 1.84×.</>}
      controls={<>
        <Seg label="Solve for" value={s.mode} options={[{ value: 'current', label: 'Max current' }, { value: 'width', label: 'Width needed' }]} onChange={up('mode')} />
        {s.mode === 'current'
          ? <Slider label="Trace width w" value={s.w} min={0.05} max={20} log unit="m" format={v => v.toFixed(v < 1 ? 2 : 1) + ' mm'} onChange={up('w')} />
          : <Slider label="Required current I" value={s.I} min={0.1} max={40} log unit="A" onChange={up('I')} />}
        <Select label="Copper weight" value={String(s.oz)} options={OZ.map(o => ({ value: String(o), label: `${o} oz (${(o * OZ_MIL * MIL_MM * 1000).toFixed(0)} µm)` }))} onChange={v => up('oz')(Number(v))} />
        <Seg label="Layer" value={s.layer} options={[{ value: 'external', label: 'External (k=0.048)' }, { value: 'internal', label: 'Internal (k=0.024)' }]} onChange={up('layer')} />
        <Slider label="Allowed rise ΔT" value={s.dT} min={5} max={100} step={1} unit="°C" format={v => v.toFixed(0) + ' °C'} onChange={up('dT')} />
        <Slider label="Trace length" value={s.len} min={5} max={500} log format={v => v.toFixed(0) + ' mm'} onChange={up('len')} />
        <div className="ctl-label" style={{ marginTop: 6 }}>Via barrel</div>
        <Slider label="Drill diameter" value={s.drill} min={0.15} max={1} step={0.05} format={v => v.toFixed(2) + ' mm'} onChange={up('drill')} />
        <Slider label="Plating thickness" value={s.plate} min={12} max={50} step={1} format={v => v.toFixed(0) + ' µm'} onChange={up('plate')} />
        <Slider label="Vias in parallel" value={s.nvia} min={1} max={12} step={1} format={v => String(v)} onChange={up('nvia')} />
        <Note>Thermal rise assumes still air and a trace with no nearby copper pour; real boards run cooler with pours and airflow. IPC-2221 is conservative at large widths.</Note>
      </>}>
      <svg viewBox={`0 0 ${CW} 185`} width="100%" role="img" aria-label="Trace cross-section" style={{ display: 'block', maxWidth: 440, margin: '0 auto' }}>
        <rect x={8} y={yTop} width={CW - 16} height={boardH} rx={3} fill="var(--d-box)" stroke="var(--d-muted)" />
        <text x={14} y={yTop + boardH - 6} fontSize={10} fill="var(--d-muted)">FR-4 dielectric</text>
        {inner && <rect x={8} y={yTop} width={CW - 16} height={36} fill="var(--d-muted)" opacity={0.12} />}
        {inner && <text x={14} y={yTop + 14} fontSize={10} fill="var(--d-muted)">prepreg above (no airflow, heat trapped)</text>}
        {/* heat halo */}
        <rect x={cx - wPx / 2 - 8 - hot * 12} y={yCu - 8 - hot * 12} width={wPx + 16 + hot * 24} height={tPx + 16 + hot * 24} rx={8} fill={heatFill} opacity={0.18 + 0.3 * hot} />
        <rect x={cx - wPx / 2} y={yCu} width={wPx} height={tPx} fill="var(--d-orange)" stroke="var(--d-ink)" strokeWidth={1} />
        <text x={cx} y={yCu + tPx / 2 + 3.5} fontSize={10} fill="var(--d-ink)" textAnchor="middle">{wPx > 70 ? 'copper' : ''}</text>
        {/* dimensions */}
        <line x1={cx - wPx / 2} x2={cx + wPx / 2} y1={yCu - 11} y2={yCu - 11} stroke="var(--d-accent)" strokeWidth={1.5} />
        <text x={cx} y={yCu - 15} fontSize={11} textAnchor="middle" fill="var(--d-accent)">w = {r.wEff.toFixed(r.wEff < 1 ? 2 : 1)} mm ({(r.wEff / MIL_MM).toFixed(0)} mil)</text>
        <text x={cx + wPx / 2 + 6} y={yCu + tPx / 2 + 4} fontSize={10} fill="var(--d-ink)">t = {(s.oz * OZ_MIL * MIL_MM * 1000).toFixed(0)} µm</text>
        {!inner && <text x={CW - 14} y={yTop + boardH - 6} fontSize={10} textAnchor="end" fill="var(--d-muted)">top surface open to air: cools better</text>}
        <text x={CW - 14} y={yTop + boardH + 18} fontSize={11} textAnchor="end" fill="var(--d-ink)">A = {r.A.toFixed(1)} mil² · ΔT = {s.dT} °C above ambient</text>
      </svg>

      <Readouts>
        {s.mode === 'current'
          ? <Readout k="Max current (IPC-2221)" v={si(r.iMax, 'A')} hl tone={tone} />
          : <Readout k="Width needed" v={`${r.wEff.toFixed(2)} mm (${(r.wEff / MIL_MM).toFixed(0)} mil)`} hl tone={tone} />}
        <Readout k="Cross-section" v={`${r.A.toFixed(1)} mil² = ${(r.A * MIL_MM * MIL_MM).toFixed(4)} mm²`} />
        <Readout k={`Same I on ${r.other}`} v={`${r.wOther.toFixed(2)} mm (${(r.wOther / (r.wEff || 1)).toFixed(2)}×)`} />
        <Readout k={`R @ ${(25 + s.dT).toFixed(0)} °C, ${s.len} mm`} v={si(r.el.R, 'Ω')} />
        <Readout k="Voltage drop" v={si(r.el.vdrop, 'V')} tone={r.el.vdrop > 0.1 ? 'warn' : undefined} />
        <Readout k="I²R loss" v={si(r.el.p, 'W')} />
      </Readouts>
      <div style={{ margin: '6px 0' }}>
        <RegionBadge label={s.layer === 'internal' ? 'Internal: derate ×2 in current' : 'External: best cooling'} color={s.layer === 'internal' ? 'warn' : 'ok'} />{' '}
        <RegionBadge label={s.dT > 45 ? 'Very hot: check Tg & reliability' : s.dT > 20 ? 'Warm' : 'Conservative rise'} color={s.dT > 45 ? 'bad' : s.dT > 20 ? 'warn' : 'ok'} />
      </div>
      <EqBox>{String.raw`I = k\,\Delta T^{0.44}A^{0.725} = ${kLayer(s.layer)}\cdot ${s.dT}^{0.44}\cdot ${r.A.toFixed(1)}^{0.725} = ${r.iMax.toFixed(2)}\,\text{A}`}</EqBox>

      <Plot series={[
        { x: ws, y: curves.ext, label: 'External', color: 'accent' },
        { x: ws, y: curves.int, label: 'Internal', color: 'purple' },
      ]} xLog yLog xUnit="m" yUnit="A" xLabel={`Trace width (${s.oz} oz, ΔT ${s.dT} °C)`} yLabel="Max current" height={230}
        xTickFormat={v => (v < 1 ? v.toFixed(2) : v.toFixed(0)) + ' mm'}
        points={[{ x: r.wEff, y: r.iMax, label: 'now', color: 'orange' }]}
        hlines={[{ at: r.iMax, color: 'muted' }]} />

      {/* via panel */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        <svg viewBox="0 0 120 110" width={120} role="img" aria-label="Via barrel cross-section" style={{ flex: '0 0 auto' }}>
          <rect x={10} y={8} width={100} height={94} fill="var(--d-box)" stroke="var(--d-muted)" />
          {[18, 90].map(y => <rect key={y} x={10} y={y - 2} width={100} height={6} fill="var(--d-orange)" opacity={0.85} />)}
          {(() => { const hw = 8 + s.drill * 30; const tt = Math.max(1.5, s.plate / 5); return <>
            <rect x={60 - hw} y={8} width={hw * 2} height={94} fill="var(--d-bg)" stroke="none" />
            <rect x={60 - hw - tt} y={8} width={tt} height={94} fill="var(--d-orange)" />
            <rect x={60 + hw} y={8} width={tt} height={94} fill="var(--d-orange)" />
            <text x={60} y={58} fontSize={9} textAnchor="middle" fill="var(--d-muted)">drill</text></>; })()}
          <text x={60} y={108} fontSize={9} textAnchor="middle" fill="var(--d-muted)">plated barrel</text>
        </svg>
        <div style={{ flex: '1 1 180px' }}>
          <Readouts>
            <Readout k="One via carries" v={si(r.via.I, 'A')} />
            <Readout k={`${s.nvia} via${s.nvia > 1 ? 's' : ''} carry`} v={si(r.viaTot, 'A')} tone={r.viaTot >= r.iMax ? 'ok' : 'bad'} />
            <Readout k={`Vias for ${si(r.iMax, 'A')}`} v={Number.isFinite(r.viasNeeded) ? String(r.viasNeeded) : '—'} hl />
          </Readouts>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Barrel area A = π·t·(D−t) = {r.via.aMm2.toFixed(4)} mm² ({r.via.aMil2.toFixed(0)} mil²); same IPC-2221 formula. A via is a short, well-cooled conductor, so this is conservative.</div>
        </div>
      </div>
    </SimShell>
  );
}
