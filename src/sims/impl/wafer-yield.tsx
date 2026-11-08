// Wafer map: dies placed inside the usable circle, seeded Poisson point defects, three yield models and cost per good die.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readouts, Readout, EqBox, Note } from '../kit';
import { waferYield, grossApprox } from '../models/wafer-yield';

const PRESETS: Record<string, Partial<{ dieW: number; dieH: number; D0: number }>> = {
  'small-mcu': { dieW: 2, dieH: 2, D0: 0.1 }, gpu: { dieW: 30, dieH: 20, D0: 0.1 }, 'mature-node': { dieW: 10, dieH: 10, D0: 0.02 },
};
const usd = (v: number) => !isFinite(v) ? '∞' : v >= 100 ? '$' + Math.round(v).toLocaleString() : '$' + v.toFixed(v < 1 ? 3 : 2);

export default function WaferYield({ params }: SimProps) {
  const pr = PRESETS[params.preset as string] ?? {};
  const init = { wafer: Number(params.wafer ?? 300), dieW: Number(params.dieW ?? pr.dieW ?? 10), dieH: Number(params.dieH ?? pr.dieH ?? 10), D0: Number(params.D0 ?? pr.D0 ?? 0.1), alpha: Number(params.alpha ?? 2), waferCost: Number(params.waferCost ?? 10000), edge: Number(params.edge ?? 3) };
  const [s, set] = useState(init);
  const [seed, setSeed] = useState(7);
  const [preset, setPreset] = useState('');
  const [model, setModel] = useState<'poisson' | 'murphy' | 'negbin'>('murphy');
  const up = (k: keyof typeof s) => (v: number) => { setPreset(''); set(p => ({ ...p, [k]: v })); };

  const r = useMemo(() => waferYield({ ...s, seed }), [s, seed]);
  const R = s.wafer / 2, pad = 6, view = s.wafer + pad * 2;
  const tooMany = r.gross > 6000;
  const yModel = model === 'poisson' ? r.yP : model === 'murphy' ? r.yM : r.yN;
  const costModel = model === 'poisson' ? r.costP : model === 'murphy' ? r.costM : r.costN;
  const area = s.dieW * s.dieH;

  const map = (
    <svg viewBox={`${-R - pad} ${-R - pad} ${view} ${view}`} style={{ width: '100%', maxWidth: 440, display: 'block', margin: '0 auto' }} role="img" aria-label={`Wafer map with ${r.gross} dies, ${r.good} good`}>
      <circle r={R} fill="var(--d-box)" stroke="var(--d-ink)" strokeWidth={0.8} />
      <circle r={r.lay.R} fill="none" stroke="var(--d-muted)" strokeWidth={0.4} strokeDasharray="2 2" />
      <path d={`M ${-4} ${R} h 8 v ${-2.2} h -8 z`} fill="var(--d-bg)" />
      {!tooMany && r.lay.dies.map((d, i) => <rect key={i} x={d.x0} y={-d.y0 - d.h} width={d.w} height={d.h} fill={r.bad.has(i) ? 'var(--d-red)' : 'var(--d-green)'} opacity={r.bad.has(i) ? 0.85 : 0.55} stroke="var(--d-bg)" strokeWidth={Math.min(0.25, d.w * 0.06)} />)}
      {tooMany && <text y={0} textAnchor="middle" fontSize={10} fill="var(--d-muted)">{r.gross.toLocaleString()} dies (too small to draw)</text>}
      {r.defects.slice(0, 4000).map((d, i) => <circle key={i} cx={d.x} cy={-d.y} r={Math.max(0.6, R / 150)} fill="var(--d-ink)" />)}
    </svg>);

  const bar = (label: string, y: number, c: number, key: typeof model) => (
    <div key={key} role="button" tabIndex={0} onClick={() => setModel(key)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setModel(key)} style={{ cursor: 'pointer', marginBottom: 6, opacity: model === key ? 1 : 0.65 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><b>{label}</b><span>{(y * 100).toFixed(1)}% · {usd(c)}/good die</span></div>
      <div style={{ height: 10, background: 'var(--d-box)', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: `${Math.max(0.5, y * 100)}%`, height: '100%', background: model === key ? 'var(--d-accent)' : 'var(--d-muted)' }} /></div>
    </div>);

  const AD = r.A * s.D0;
  return (
    <SimShell title="Wafer map & die yield" badge="Fab model" onReset={() => { set(init); setSeed(7); setPreset(''); }}
      tryThis={<>choose <b>gpu</b>: a 600 mm² die fits only ~{Math.round(grossApprox(300, 3, 600))} per wafer and yield collapses, so cost per good die explodes. Compare <b>small-mcu</b>. Click <b>Re-roll defects</b> to see the random wafer-to-wafer scatter around the model prediction. Raise α toward ∞ to see negative binomial approach Poisson; low α (clustered defects) gives higher yield.</>}
      controls={<>
        <Seg label="Preset" value={preset as any} options={[...Object.keys(PRESETS).map(k => ({ value: k, label: k })), { value: '' as any, label: 'custom' }]} onChange={v => { if (!v) return; setPreset(v); set(p => ({ ...p, ...PRESETS[v] })); }} />
        <Slider label="Die width" value={s.dieW} min={1} max={40} step={0.5} format={v => `${v} mm`} onChange={up('dieW')} />
        <Slider label="Die height" value={s.dieH} min={1} max={40} step={0.5} format={v => `${v} mm`} onChange={up('dieH')} />
        <Slider label="Defect density D₀" value={s.D0} min={0.01} max={1} log format={v => `${v.toPrecision(2)} /cm²`} onChange={up('D0')} />
        <Slider label="Clustering α (neg. binomial)" value={s.alpha} min={0.5} max={20} step={0.5} format={v => v.toFixed(1)} onChange={up('alpha')} />
        <Slider label="Wafer diameter" value={s.wafer} min={100} max={450} step={50} format={v => `${v} mm`} onChange={up('wafer')} />
        <Slider label="Edge exclusion" value={s.edge} min={0} max={10} step={0.5} format={v => `${v} mm`} onChange={up('edge')} />
        <Slider label="Wafer cost" value={s.waferCost} min={500} max={30000} step={100} format={v => '$' + v.toLocaleString()} onChange={up('waferCost')} />
        <button className="btn btn-sm" onClick={() => setSeed(x => x + 1)}>Re-roll defects (seed {seed})</button>
        <Note>Defects are uniform random points (seeded, so reproducible). A die is bad if any defect lands inside it. Click a model bar to use it for cost.</Note>
      </>}>
      {map}
      <div style={{ fontSize: 12, color: 'var(--d-muted)', textAlign: 'center', margin: '4px 0 8px' }}><span style={{ color: 'var(--d-green)' }}>■</span> good · <span style={{ color: 'var(--d-red)' }}>■</span> defective · ● defect · dashed = usable edge</div>
      <Readouts>
        <Readout k="Gross dies / wafer" v={r.gross.toLocaleString()} hl />
        <Readout k="Good dies (this wafer)" v={`${r.good.toLocaleString()} (${(r.simYield * 100).toFixed(1)}%)`} tone={r.simYield > 0.8 ? 'ok' : r.simYield > 0.5 ? 'warn' : 'bad'} />
        <Readout k="Defects on wafer" v={r.defects.length.toLocaleString()} />
        <Readout k="Die area" v={`${area.toFixed(area < 10 ? 1 : 0)} mm²  (A·D₀ = ${AD.toFixed(2)})`} />
        <Readout k="Cost per good die" v={usd(costModel)} hl />
        <Readout k="Cost, this wafer" v={usd(r.costSim)} />
      </Readouts>
      <div style={{ marginTop: 8 }}>
        {bar('Poisson', r.yP, r.costP, 'poisson')}
        {bar('Murphy', r.yM, r.costM, 'murphy')}
        {bar(`Neg. binomial (α=${s.alpha})`, r.yN, r.costN, 'negbin')}
      </div>
      <EqBox>{model === 'poisson' ? String.raw`Y=e^{-AD_0}=e^{-${AD.toFixed(3)}}=${(r.yP * 100).toFixed(1)}\%` : model === 'murphy' ? String.raw`Y=\left(\frac{1-e^{-AD_0}}{AD_0}\right)^{2}=${(r.yM * 100).toFixed(1)}\%` : String.raw`Y=\left(1+\frac{AD_0}{\alpha}\right)^{-\alpha}=${(r.yN * 100).toFixed(1)}\%`}</EqBox>
      <EqBox>{String.raw`\text{cost/good die}=\frac{\text{wafer cost}}{N_{gross}\cdot Y}=\frac{${s.waferCost.toLocaleString()}}{${r.gross}\cdot ${yModel.toFixed(3)}}=${usd(costModel).replace('$', '\\$')}`}</EqBox>
    </SimShell>
  );
}
