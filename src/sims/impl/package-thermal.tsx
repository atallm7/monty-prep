// Package thermal network: live θ network diagram, heat split, steady-state Tj and transient step response.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { Pkg, PKGS, steady, transient, maxPower } from '../models/package-thermal';

const PRESETS: Record<string, { pkg: Pkg; heatsink: boolean; airflow: number; P: number }> = {
  'qfn-board': { pkg: 'qfn', heatsink: false, airflow: 0, P: 2 },
  'bga-heatsink': { pkg: 'bga', heatsink: true, airflow: 2, P: 5 },
  to220: { pkg: 'to220', heatsink: true, airflow: 0, P: 8 },
};
const f1 = (v: number) => v.toFixed(1);

export default function PackageThermal({ params }: SimProps) {
  const pk = String(params.pkg ?? 'qfn');
  const init = {
    P: Number(params.P ?? 2), Ta: Number(params.Ta ?? 40), pkg: (pk in PKGS ? pk : 'qfn') as Pkg,
    heatsink: params.heatsink === true || params.heatsink === 'true', airflow: Number(params.airflow ?? 0), Tjmax: Number(params.Tjmax ?? 125),
  };
  const [s, set] = useState(init);
  const [preset, setPreset] = useState('');
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => { setPreset(''); set(q => ({ ...q, [k]: v })); };

  const r = useMemo(() => steady(s), [s.P, s.Ta, s.pkg, s.heatsink, s.airflow]);
  const tr = useMemo(() => transient(s), [s.P, s.Ta, s.pkg, s.heatsink, s.airflow]);
  const pmax = maxPower(s, s.Tjmax);
  const margin = s.Tjmax - r.Tj;
  const tone = margin < 0 ? 'bad' : margin < 15 ? 'warn' : 'ok';
  const t63 = useMemo(() => { const target = s.Ta + 0.632 * (r.Tj - s.Ta); const k = tr.Tj.findIndex(v => v >= target); return k > 0 ? tr.t[k] : 0; }, [tr, r, s.Ta]);

  const sweep = useMemo(() => {
    const v = Array.from({ length: 41 }, (_, k) => k * 0.25);
    const mk = (hs: boolean) => v.map(a => steady({ ...s, heatsink: hs, airflow: a }).Tj);
    return { v, now: mk(s.heatsink), other: mk(!s.heatsink) };
  }, [s.P, s.Ta, s.pkg, s.heatsink]);

  const R = r.R;
  const flow = (frac: number) => 2 + 8 * Math.min(1, frac);
  const rail = (y: number, q: number, color: string) => (
    <path d={y < 100 ? 'M48,115 V55 H385' : 'M48,115 V175 H385'} fill="none" stroke={color} strokeWidth={flow(q / Math.max(r.P, 1e-9))} strokeOpacity={0.28} strokeLinejoin="round" />
  );
  const Res = ({ x, y, w, name, v }: { x: number; y: number; w: number; name: string; v: number }) => (
    <g>
      <rect x={x} y={y - 11} width={w} height={22} rx={3} fill="var(--d-box)" stroke="var(--d-ink)" strokeWidth={1.4} />
      <text x={x + w / 2} y={y + 4} textAnchor="middle" fontSize={11} fill="var(--d-ink)" fontWeight={600}>{v.toFixed(v < 10 ? 1 : 0)}</text>
      <text x={x + w / 2} y={y - 16} textAnchor="middle" fontSize={11} fill="var(--d-muted)">{name}</text>
    </g>
  );
  const Node = ({ x, y, label, T, hot }: { x: number; y: number; label: string; T: number; hot?: boolean }) => (
    <g>
      <circle cx={x} cy={y} r={hot ? 7 : 5} fill={hot ? (tone === 'bad' ? 'var(--d-red)' : tone === 'warn' ? 'var(--d-orange)' : 'var(--d-green)') : 'var(--d-ink)'} />
      <text x={hot ? x + 14 : x} y={hot ? y - 2 : y + 22} textAnchor={hot ? 'start' : 'middle'} fontSize={11} fill="var(--d-muted)">{label}</text>
      <text x={hot ? x + 14 : x} y={hot ? y + 13 : y + 35} textAnchor={hot ? 'start' : 'middle'} fontSize={12} fontWeight={700} fill="var(--d-ink)">{f1(T)}°C</text>
    </g>
  );
  const topColor = 'var(--d-orange)', botColor = 'var(--d-blue)';
  const dash = (q: number) => <animate attributeName="stroke-dashoffset" from="24" to="0" dur={`${Math.max(0.4, 2.4 - 2 * Math.min(1, q / Math.max(r.P, 1e-9)))}s`} repeatCount="indefinite" />;

  const diagram = (
    <svg viewBox="0 0 420 235" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Thermal resistance network from junction to ambient">
      {rail(55, r.Qtop, topColor)}{rail(175, r.Qb, botColor)}
      {/* animated heat flow */}
      {r.P > 0 && <>
        <path d="M48,115 V55 H385" fill="none" stroke={topColor} strokeWidth={2.5} strokeDasharray="6 18" strokeLinecap="round" opacity={Math.max(0.15, r.fracTop)}>{dash(r.Qtop)}</path>
        <path d="M48,115 V175 H385" fill="none" stroke={botColor} strokeWidth={2.5} strokeDasharray="6 18" strokeLinecap="round" opacity={Math.max(0.15, 1 - r.fracTop)}>{dash(r.Qb)}</path>
      </>}
      {/* power in */}
      <line x1={6} y1={115} x2={40} y2={115} stroke="var(--d-red)" strokeWidth={3} />
      <path d="M40,109 L50,115 L40,121 Z" fill="var(--d-red)" />
      <text x={6} y={98} fontSize={12} fontWeight={700} fill="var(--d-red)">P = {si(r.P, 'W')}</text>
      {/* top path */}
      <Res x={72} y={55} w={44} name="θJC" v={R.jc} />
      {s.heatsink ? <><Res x={176} y={55} w={40} name="θTIM" v={R.tim} /><Res x={252} y={55} w={44} name="θSA" v={R.sa} /></> : <Res x={190} y={55} w={70} name="θCA (bare)" v={R.ca} />}
      <Node x={146} y={55} label="Case" T={r.Tcase} />
      {s.heatsink && <Node x={234} y={55} label="Sink" T={r.Tsink} />}
      {/* board path */}
      <Res x={72} y={175} w={44} name="θJB" v={R.jb} />
      <Res x={190} y={175} w={70} name="θBA" v={R.ba} />
      <Node x={146} y={175} label="Board" T={r.Tboard} />
      {/* junction and ambient */}
      <Node x={48} y={115} label="Tj" T={r.Tj} hot />
      <line x1={385} y1={55} x2={385} y2={175} stroke="var(--d-ink)" strokeWidth={3} />
      <text x={392} y={118} fontSize={12} fill="var(--d-ink)" fontWeight={700}>Ta</text>
      <text x={392} y={132} fontSize={11} fill="var(--d-muted)">{f1(s.Ta)}°C</text>
      {/* heat-flow split labels */}
      <text x={340} y={80} textAnchor="end" fontSize={11} fontWeight={700} fill={topColor}>top {si(r.Qtop, 'W')} ({(r.fracTop * 100).toFixed(0)}%)</text>
      <text x={340} y={198} textAnchor="end" fontSize={11} fontWeight={700} fill={botColor}>board {si(r.Qb, 'W')} ({((1 - r.fracTop) * 100).toFixed(0)}%)</text>
      <text x={210} y={229} textAnchor="middle" fontSize={10} fill="var(--d-muted)">θ in K/W (typical illustrative values); line thickness = heat flow</text>
    </svg>
  );

  const pick = (name: string) => { const p = PRESETS[name]; set(q => ({ ...q, ...p })); setPreset(name); };

  return (
    <SimShell title="Package thermal network (θJA)" onReset={() => { set(init); setPreset(''); }}
      tryThis={<>pick the TO-220, then turn the heatsink on: θ<sub>JA</sub> collapses and almost all heat leaves through the top path. Now switch to the QFN and add airflow: the board path (θ<sub>JB</sub>+θ<sub>BA</sub>) barely changes, so a heatsink on a QFN helps far less than on a TO-220. Raise P until Tj crosses T<sub>jmax</sub> and watch the transient: a heatsink adds a slow thermal time constant, so Tj rises quickly at first, then creeps.</>}
      controls={<>
        <Seg label="Preset" value={preset as any} options={Object.keys(PRESETS).map(k => ({ value: k, label: k }))} onChange={pick} />
        <Seg label="Package" value={s.pkg} options={(Object.keys(PKGS) as Pkg[]).map(k => ({ value: k, label: k.toUpperCase() }))} onChange={upd('pkg')} />
        <Slider label="Power P" value={s.P} min={0} max={30} step={0.1} unit="W" onChange={upd('P')} />
        <Slider label="Ambient Ta" value={s.Ta} min={-40} max={85} step={1} unit="°C" format={v => `${v.toFixed(0)} °C`} onChange={upd('Ta')} />
        <Toggle label="Heatsink (with thermal interface)" checked={s.heatsink} onChange={upd('heatsink')} />
        <Slider label="Airflow" value={s.airflow} min={0} max={10} step={0.1} unit="m/s" format={v => `${v.toFixed(1)} m/s`} onChange={upd('airflow')} />
        <Slider label="Tj max" value={s.Tjmax} min={85} max={175} step={5} unit="°C" format={v => `${v.toFixed(0)} °C`} onChange={upd('Tjmax')} />
        <Note>{PKGS[s.pkg].name}: {PKGS[s.pkg].note}. All θ and C values are typical illustrations, not datasheet numbers; always use the part's own θJC/θJB and your board's measured θJA.</Note>
      </>}>
      <div className="figure-body" style={{ padding: '6px 4px' }}>{diagram}</div>
      <Readouts>
        <Readout k="Junction Tj" v={`${f1(r.Tj)} °C`} hl tone={tone} />
        <Readout k="Margin to Tjmax" v={`${margin >= 0 ? '+' : ''}${f1(margin)} K`} tone={tone} />
        <Readout k="θJA (parallel)" v={`${R.ja.toFixed(1)} K/W`} />
        <Readout k="Top / board path" v={`${R.top.toFixed(1)} / ${R.board.toFixed(1)} K/W`} />
        <Readout k="Max P at Tjmax" v={si(pmax, 'W')} />
        <Readout k="Step 63% time" v={si(t63, 's')} />
      </Readouts>
      <div style={{ margin: '6px 0' }}><RegionBadge label={margin < 0 ? 'Over temperature' : margin < 15 ? 'Thermally tight' : 'Within limit'} color={tone === 'bad' ? 'bad' : tone === 'warn' ? 'warn' : 'ok'} /></div>
      <EqBox>{String.raw`T_j = T_a + P\,\theta_{JA},\quad \theta_{JA} = (\theta_{JC}{+}\theta_{TIM}{+}\theta_{SA}) \parallel (\theta_{JB}{+}\theta_{BA}) = ${R.top.toFixed(1)} \parallel ${R.board.toFixed(1)} = ${R.ja.toFixed(2)}\ \text{K/W}`}</EqBox>
      <EqBox>{String.raw`T_j = ${f1(s.Ta)} + ${s.P.toFixed(1)}\cdot${R.ja.toFixed(2)} = ${f1(r.Tj)}^\circ\text{C}`}</EqBox>
      <Plot series={[{ x: tr.t.slice(1), y: tr.Tj.slice(1), label: 'Tj(t) after power step', color: 'accent' }]} xLog xUnit="s" yUnit="°C" xLabel="Time after power step (3-node RC model)" yLabel="Tj" height={230}
        hlines={[{ at: s.Tjmax, label: 'Tjmax', color: 'red' }, { at: r.Tj, label: 'steady state', color: 'muted' }]} />
      <Plot series={[{ x: sweep.v, y: sweep.now, label: s.heatsink ? 'with heatsink' : 'bare package', color: 'accent' }, { x: sweep.v, y: sweep.other, label: s.heatsink ? 'bare package' : 'with heatsink', color: 'muted', dashed: true }]} xUnit="m/s" yUnit="°C" xLabel="Airflow" yLabel="Steady Tj" height={210}
        hlines={[{ at: s.Tjmax, label: 'Tjmax', color: 'red' }]} points={[{ x: s.airflow, y: r.Tj, label: 'now', color: 'accent' }]} />
    </SimShell>
  );
}
