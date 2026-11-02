// Doping, carriers & conductivity. Physics in ../models/doping-lab.ts.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Select, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { MATERIALS, MaterialId, doping, nVsP, niAt, intrinsicTemp, mobility } from '../models/doping-lab';
import { logspace, linspace } from '../../lib/units';

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const sci = (v: number) => {
  if (!(v > 0)) return '0';
  const [ms, es] = v.toExponential(2).split('e'); const m = Number(ms), e = Number(es);
  return `${m.toFixed(m < 10 ? 2 : 1).replace(/\.?0+$/, '')}×10${String(e).split('').map(c => SUP[c] ?? c).join('')}`;
};
const sciTex = (v: number) => { if (!(v > 0)) return '0'; const [m, e] = v.toExponential(2).split('e'); return `${m}\\times10^{${Number(e)}}`; };
const big = (v: number, u: string) => (Math.abs(v) >= 1e15 || (v !== 0 && Math.abs(v) < 1e-15)) ? `${sci(v)} ${u}` : si(v, u);
const ohmcm = (r: number) => big(r, 'Ω·cm');
const MAT_OPTS = (Object.keys(MATERIALS) as MaterialId[]).map(k => ({ value: k, label: MATERIALS[k].name }));
type Mode = 'n' | 'p' | 'comp' | 'i';

/** Log-scale bar chart of n, p, ni, Nd, Na: shows n and p mirror-symmetric about ni (mass-action law). */
function CarrierBars({ rows, lo, hi }: { rows: { k: string; v: number; color: string }[]; lo: number; hi: number }) {
  const W = 560, L = 64, R = 540, rowH = 24, H = rows.length * rowH + 30;
  const X = (v: number) => L + (Math.min(hi, Math.max(lo, Math.log10(Math.max(v, 1e-300)))) - lo) / (hi - lo) * (R - L);
  const ticks: number[] = []; const st = hi - lo > 30 ? 10 : 5;
  for (let e = Math.ceil(lo / st) * st; e <= hi; e += st) ticks.push(e);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Carrier concentrations, log scale">
      {ticks.map(e => <g key={e}><line x1={L + (e - lo) / (hi - lo) * (R - L)} x2={L + (e - lo) / (hi - lo) * (R - L)} y1={4} y2={H - 22} stroke="var(--d-muted)" strokeOpacity={0.25} />
        <text x={L + (e - lo) / (hi - lo) * (R - L)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--d-muted)">10{String(e).split('').map(c => SUP[c] ?? c).join('')}</text></g>)}
      {rows.map((r, i) => <g key={r.k}>
        <text x={L - 8} y={10 + i * rowH + 9} textAnchor="end" fontSize={13} fill="var(--d-ink)">{r.k[0]}{r.k.length > 1 && <tspan baselineShift="sub" fontSize="72%">{r.k.slice(2)}</tspan>}</text>
        {r.v > 0 && <rect x={L} y={6 + i * rowH} width={Math.max(1, X(r.v) - L)} height={rowH - 8} rx={3} fill={`var(--d-${r.color})`} opacity={0.75} />}
        <text x={Math.min(R - 4, X(r.v) + 6)} y={10 + i * rowH + 9} textAnchor={X(r.v) + 90 > R ? 'end' : 'start'} fontSize={12} fill="var(--d-ink)">{r.v > 0 ? sci(r.v) : '0'}</text>
      </g>)}
      <text x={R} y={14} textAnchor="end" fontSize={11} fill="var(--d-muted)">log scale, cm⁻³</text>
    </svg>
  );
}

export default function DopingLab({ params }: SimProps) {
  const pnd = params.nd !== undefined ? Number(params.nd) : undefined;
  const pna = params.na !== undefined ? Number(params.na) : undefined;
  const mode0: Mode = (pnd ?? 0) > 0 && (pna ?? 0) > 0 ? 'comp' : (pna ?? 0) > 0 ? 'p' : (pnd !== undefined && pnd <= 0 && !(pna! > 0)) ? 'i' : 'n';
  const mat0 = (String(params.material ?? 'si') in MATERIALS ? String(params.material ?? 'si') : 'si') as MaterialId;
  const init = {
    material: mat0, mode: mode0, nd: pnd && pnd > 0 ? pnd : 1e16, na: pna && pna > 0 ? pna : (pnd && pnd > 0 ? pnd / 3 : 3e15),
    t: Number(params.t ?? 300), view: 'rho' as 'rho' | 'temp' | 'mob',
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const ndE = s.mode === 'n' || s.mode === 'comp' ? s.nd : 0;
  const naE = s.mode === 'p' || s.mode === 'comp' ? s.na : 0;
  const m = MATERIALS[s.material];

  const r = useMemo(() => doping({ material: s.material, nd: ndE, na: naE, t: s.t }), [s.material, ndE, naE, s.t]);
  const Nref = Math.max(ndE, naE, 1e12);
  const cmp = useMemo(() => nVsP(s.material, Nref, s.t), [s.material, Nref, s.t]);
  const tInt15 = useMemo(() => intrinsicTemp(s.material, 1e15), [s.material]);
  const tInt = useMemo(() => intrinsicTemp(s.material, Math.max(Math.abs(ndE - naE), 1)), [s.material, ndE, naE]);

  const plot = useMemo(() => {
    if (s.view === 'rho') {
      const Ns = logspace(1e12, 1e20, 160);
      return {
        series: [
          { x: Ns, y: Ns.map(N => doping({ material: s.material, nd: N, na: 0, t: s.t }).rho), label: 'n-type (donors)', color: 'blue' },
          { x: Ns, y: Ns.map(N => doping({ material: s.material, nd: 0, na: N, t: s.t }).rho), label: 'p-type (acceptors)', color: 'red' },
        ],
        xLog: true, yLog: true, xLabel: 'Doping N (cm⁻³)', yLabel: 'Resistivity ρ (Ω·cm)',
        points: [{ x: Nref, y: r.rho, label: `now: ${ohmcm(r.rho)}`, color: 'accent' }],
      };
    }
    if (s.view === 'temp') {
      const Ts = linspace(150, 800, 200);
      const rs = Ts.map(T => doping({ material: s.material, nd: ndE, na: naE, t: T }));
      return {
        series: [
          { x: Ts, y: rs.map(q => q.n), label: 'n (electrons)', color: 'blue' },
          { x: Ts, y: rs.map(q => q.p), label: 'p (holes)', color: 'red' },
          { x: Ts, y: Ts.map(T => niAt(m, T)), label: 'n_i', color: 'muted', dashed: true },
        ],
        xLog: false, yLog: true, xLabel: 'Temperature T (K)', yLabel: 'Concentration (cm⁻³)',
        points: [{ x: s.t, y: Math.max(r.n, r.p), label: 'majority', color: 'accent' }],
        yRange: [Math.max(10 ** (Math.floor(Math.log10(Math.max(...rs.map(q => Math.max(q.n, q.p))))) - 17), Math.min(...rs.map(q => Math.min(q.n, q.p))) / 3), 3e20] as [number, number],
      };
    }
    const Ns = logspace(1e13, 1e20, 160);
    return {
      series: [
        { x: Ns, y: Ns.map(N => mobility(m.mn, N, s.t)), label: 'µn electrons', color: 'blue' },
        { x: Ns, y: Ns.map(N => mobility(m.mp, N, s.t)), label: 'µp holes', color: 'red' },
      ],
      xLog: true, yLog: true, xLabel: 'Total impurity Nd + Na (cm⁻³)', yLabel: 'Mobility (cm²/V·s)',
      points: [{ x: Math.max(ndE + naE, 1e13), y: r.un, label: `µn ${r.un.toFixed(0)}`, color: 'blue' }, { x: Math.max(ndE + naE, 1e13), y: r.up, label: `µp ${r.up.toFixed(0)}`, color: 'red' }],
    };
  }, [s.view, s.material, s.t, ndE, naE, r, Nref, m]);

  const bars = [
    { k: 'N_D', v: ndE, color: 'blue' }, { k: 'N_A', v: naE, color: 'red' },
    { k: 'n', v: r.n, color: 'blue' }, { k: 'p', v: r.p, color: 'red' }, { k: 'n_i', v: r.ni, color: 'muted' },
  ];
  const lo = Math.floor(Math.min(Math.log10(Math.max(r.p, 1e-300)), Math.log10(Math.max(r.n, 1e-300)), Math.log10(r.ni)) - 1);
  const typeBadge = r.type === 'n' ? <RegionBadge label="n-type (electrons majority)" color="info" /> : r.type === 'p' ? <RegionBadge label="p-type (holes majority)" color="bad" /> : <RegionBadge label="Intrinsic (n ≈ p ≈ nᵢ)" color="warn" />;

  return (
    <SimShell title="Doping, carriers & conductivity" onReset={() => set(init)}
      tryThis={<>with n-type silicon at 10<sup>16</sup> cm⁻³, switch to p-type: ρ jumps about 2.8× because holes are slower (µ<sub>p</sub> &lt; µ<sub>n</sub>). That is why an NMOS is about 2–3× stronger than a same-size PMOS. Then open <b>Carriers vs T</b> with 10<sup>15</sup> cm⁻³: n stays flat until about {isFinite(tInt15) ? Math.round(tInt15) + ' K' : 'beyond 3000 K'}, where n<sub>i</sub> catches up and the doping stops mattering. Try Ge, then SiC.</>}
      controls={<>
        <Select label="Material" value={s.material} options={MAT_OPTS} onChange={upd('material')} />
        <Seg label="Doping" value={s.mode} options={[{ value: 'n', label: 'N-type' }, { value: 'p', label: 'P-type' }, { value: 'comp', label: 'Both' }, { value: 'i', label: 'Intrinsic' }]} onChange={upd('mode')} />
        {(s.mode === 'n' || s.mode === 'comp') && <Slider label="Donors ND" value={s.nd} min={1e12} max={1e20} log format={v => sci(v) + ' cm⁻³'} onChange={upd('nd')} />}
        {(s.mode === 'p' || s.mode === 'comp') && <Slider label="Acceptors NA" value={s.na} min={1e12} max={1e20} log format={v => sci(v) + ' cm⁻³'} onChange={upd('na')} />}
        <Slider label="Temperature T" value={s.t} min={150} max={800} step={1} format={v => `${v.toFixed(0)} K (${(v - 273.15).toFixed(0)} °C)`} onChange={upd('t')} />
        <Seg label="Plot" value={s.view} options={[{ value: 'rho', label: 'ρ vs N' }, { value: 'temp', label: 'Carriers vs T' }, { value: 'mob', label: 'Mobility' }]} onChange={upd('view')} />
        <Note>{m.note}. Model: E<sub>g</sub>(T) Varshni, n<sub>i</sub> ∝ T<sup>3/2</sup>e<sup>−Eg/2kT</sup>, full dopant ionization (no freeze-out; for SiC/GaN, real dopants are only partly ionized at 300 K), Caughey–Thomas mobility. Non-degenerate statistics, so treat values above ~10<sup>19</sup> cm⁻³ as approximate.</Note>
      </>}>
      <CarrierBars rows={bars} lo={Math.max(lo, -40)} hi={21} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '6px 0 8px' }}>
        {typeBadge}
        {r.intrinsicish && r.type !== 'i' && <RegionBadge label="nᵢ comparable to doping: going intrinsic" color="warn" />}
        <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>E<sub>g</sub> = {r.eg.toFixed(3)} eV, E<sub>F</sub> − E<sub>i</sub> = {(r.efi * 1000).toFixed(0)} meV</span>
      </div>
      <Readouts>
        <Readout k="Intrinsic nᵢ" v={sci(r.ni) + ' cm⁻³'} />
        <Readout k="Electrons n" v={sci(r.n) + ' cm⁻³'} hl={r.type === 'n'} />
        <Readout k="Holes p" v={sci(r.p) + ' cm⁻³'} hl={r.type === 'p'} />
        <Readout k="µn / µp (cm²/V·s)" v={`${r.un.toFixed(0)} / ${r.up.toFixed(0)}`} />
        <Readout k="Conductivity σ" v={big(r.sigma, 'S/cm')} />
        <Readout k="Resistivity ρ" v={ohmcm(r.rho)} hl />
        <Readout k={`Same N: ρ n-type vs p-type`} v={`${ohmcm(cmp.rhoN)} vs ${ohmcm(cmp.rhoP)}`} />
        <Readout k="p-type / n-type ρ" v={cmp.ratio.toFixed(2) + '×'} tone={cmp.ratio > 1 ? 'ok' : undefined} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered} n\,p = n_i^2:\; (${sciTex(r.n)})(${sciTex(r.p)}) = (${sciTex(r.ni)})^2 \\ \sigma = q\,(n\mu_n + p\mu_p) = ${sciTex(r.sigma)}\,\text{S/cm},\quad \rho = 1/\sigma = ${sciTex(r.rho)}\,\Omega\,\text{cm} \end{gathered}`}</EqBox>
      <Plot series={plot.series} xLog={plot.xLog} yLog xLabel={plot.xLabel} yLabel={plot.yLabel} height={280}
        yRange={'yRange' in plot ? plot.yRange : undefined} points={plot.points}
        xTickFormat={plot.xLog ? (v => sci(v).replace(/^1×/, '')) : undefined} yTickFormat={v => sci(v).replace(/^1×/, '')}
        vlines={s.view === 'temp' ? [{ at: s.t, label: `${s.t.toFixed(0)} K`, color: 'accent' }, ...(isFinite(tInt) && tInt < 800 && tInt > 150 ? [{ at: tInt, label: 'nᵢ = |N_D − N_A|', color: 'orange' }] : [])] : s.view === 'rho' ? [{ at: Nref, color: 'muted' }] : []} />
    </SimShell>
  );
}
