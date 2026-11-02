// PN junction & depletion region. Physics in ../models/pn-junction.ts (abrupt junction, depletion approximation).
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { pn, profile, bands, sweep, PnOut, E_CRIT } from '../models/pn-junction';
import { linspace } from '../../lib/units';

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const sci = (v: number) => { let e = Math.floor(Math.log10(v)); let m = v / 10 ** e; if (m >= 9.95) { m = 1; e += 1; } return `${m.toFixed(1)}×10${String(e).split('').map(c => SUP[c] ?? c).join('')}`; };
const sciHtml = (v: number) => { const e = Math.floor(Math.log10(v)); const m = v / 10 ** e; return <>{m.toFixed(1)}×10<sup>{e}</sup></>; };
const um = (cm: number) => cm * 1e4;

/** Physical cross-section: neutral p, depletion region with fixed ions, neutral n. */
function CrossSection({ r, x0, x1 }: { r: PnOut; x0: number; x1: number }) {
  const W = 520, H = 170, L = 14, R = 506, top = 30, bot = 112;
  const X = (x: number) => L + ((x - x0) / (x1 - x0)) * (R - L);
  const xpP = X(-r.xp), x0P = X(0), xnP = X(r.xn);
  // fixed-ion and carrier glyphs on a jittered grid, density ∝ log(doping)
  const glyphs: JSX.Element[] = [];
  const rows = 4;
  const colsFor = (N: number) => 3 + 1.1 * (Math.log10(N) - 14); // glyph columns per 100 px
  const fill = (a: number, b: number, N: number, kind: 'ionA' | 'ionD' | 'hole' | 'elec', key: string) => {
    const per = colsFor(N) / 100; const n = Math.max(0, Math.floor((b - a) * per));
    for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
      const cx = a + (i + 0.5) * (b - a) / n + ((j % 2) ? 2 : -2); const cy = top + 12 + j * ((bot - top - 24) / (rows - 1));
      if (cx < a + 2 || cx > b - 2) continue;
      const k = `${key}${i}-${j}`;
      if (kind === 'ionA') glyphs.push(<text key={k} x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fill="var(--d-blue)">−</text>);
      else if (kind === 'ionD') glyphs.push(<text key={k} x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fill="var(--d-red)">+</text>);
      else if (kind === 'hole') glyphs.push(<circle key={k} cx={cx} cy={cy} r={2.6} fill="none" stroke="var(--d-red)" strokeWidth={1.1} />);
      else glyphs.push(<circle key={k} cx={cx} cy={cy} r={2.4} fill="var(--d-blue)" />);
    }
  };
  fill(L, xpP, r.NA, 'hole', 'h'); fill(xpP, x0P, r.NA, 'ionA', 'a'); fill(x0P, xnP, r.ND, 'ionD', 'd'); fill(xnP, R, r.ND, 'elec', 'e');
  const arrowY = bot + 13;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Junction cross-section">
      <rect x={L} y={top} width={xpP - L} height={bot - top} fill="var(--d-red)" opacity={0.07} />
      <rect x={xnP} y={top} width={R - xnP} height={bot - top} fill="var(--d-blue)" opacity={0.07} />
      <rect x={xpP} y={top} width={xnP - xpP} height={bot - top} fill="var(--d-orange)" opacity={0.14} />
      <rect x={L} y={top} width={R - L} height={bot - top} fill="none" stroke="var(--d-ink)" strokeWidth={1.2} />
      <line x1={xpP} y1={top} x2={xpP} y2={bot} stroke="var(--d-orange)" strokeDasharray="4 3" />
      <line x1={xnP} y1={top} x2={xnP} y2={bot} stroke="var(--d-orange)" strokeDasharray="4 3" />
      <line x1={x0P} y1={top - 4} x2={x0P} y2={bot + 4} stroke="var(--d-muted)" />
      {glyphs}
      <text x={L} y={20} textAnchor="start" fontSize={13} fill="var(--d-ink)">p: N<tspan baselineShift="sub" fontSize="70%">A</tspan> = {sci(r.NA)} cm⁻³</text>
      <text x={R} y={20} textAnchor="end" fontSize={13} fill="var(--d-ink)">n: N<tspan baselineShift="sub" fontSize="70%">D</tspan> = {sci(r.ND)} cm⁻³</text>
      {/* field arrow inside depletion region (points n → p) */}
      {xnP - xpP > 30 && <g stroke="var(--d-accent)" fill="var(--d-accent)">
        <line x1={xnP - 6} y1={arrowY} x2={xpP + 10} y2={arrowY} strokeWidth={1.6} />
        <path d={`M${xpP + 4},${arrowY} l8,-4 l0,8 z`} stroke="none" />
      </g>}
      <text x={(xpP + xnP) / 2} y={arrowY + 18} textAnchor="middle" fontSize={12} fill="var(--d-accent)">E field, W = {um(r.W).toPrecision(3)} µm</text>
      <text x={L + 4} y={H - 4} fontSize={11} fill="var(--d-muted)">○ holes  − acceptor ions</text>
      <text x={R - 4} y={H - 4} textAnchor="end" fontSize={11} fill="var(--d-muted)">+ donor ions  ● electrons</text>
    </svg>
  );
}

export default function PnJunction({ params }: SimProps) {
  const init = { na: Number(params.na ?? 1e17), nd: Number(params.nd ?? 1e16), va: Number(params.vbias ?? 0), view: 'stack' as 'stack' | 'bands' | 'bias' };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const r = useMemo(() => pn({ na: s.na, nd: s.nd, va: s.va }), [s.na, s.nd, s.va]);
  const r0 = useMemo(() => pn({ na: s.na, nd: s.nd, va: 0 }), [s.na, s.nd]);

  // Fixed x-window based on the widest of {this bias, 0 V, −5 V} so the widening/narrowing is visible while dragging bias.
  const win = useMemo(() => {
    const ref = pn({ na: s.na, nd: s.nd, va: Math.min(s.va, -5) });
    return sweep(ref, 2);
  }, [s.na, s.nd, s.va < -5 ? s.va : 0]);

  const data = useMemo(() => {
    const xs = linspace(win.x0, win.x1, 500).concat([-r.xp, 0, r.xn, -r.xp - 1e-13, r.xn + 1e-13, -1e-16, 1e-16]).sort((a, b) => a - b);
    const xu = xs.map(um);
    const pr = xs.map(x => profile(r, x));
    const pr0 = xs.map(x => profile(r0, x));
    const bd = xs.map(x => bands(r, x));
    return { xu, rho: pr.map(p => p.rho), e: pr.map(p => p.e), phi: pr.map(p => p.phi), e0: pr0.map(p => p.e), phi0: pr0.map(p => p.phi), bd };
  }, [r, r0, win]);

  const biasCurve = useMemo(() => {
    const vas = linspace(-20, Math.min(0.9, r0.vbi - 0.06), 240);
    const rs = vas.map(va => pn({ na: s.na, nd: s.nd, va }));
    return { vas, W: rs.map(q => um(q.W)), C: rs.map(q => q.cj * 1e-8 * 1e15) /* fF/µm² */ };
  }, [s.na, s.nd, r0.vbi]);

  const xr: [number, number] = [um(win.x0), um(win.x1)];
  const vl = [{ at: um(-r.xp), label: '−x_p', color: 'orange' }, { at: um(r.xn), label: 'x_n', color: 'orange' }];
  const biasLbl = s.va > 0.005 ? 'Forward bias' : s.va < -0.005 ? 'Reverse bias' : 'Equilibrium (0 V)';
  const showRef = Math.abs(s.va) > 0.005;

  return (
    <SimShell title="PN junction & depletion region" onReset={() => set(init)}
      tryThis={<>drag the bias from 0 to −10 V: W grows as √(V<sub>bi</sub> − V<sub>a</sub>), so 13× the voltage only gives about 3.7× the width (and C<sub>j</sub> falls by the same factor: the principle of a varactor). Then make N<sub>A</sub> 100× N<sub>D</sub>: nearly all of the depletion region moves into the lightly doped n side, because N<sub>A</sub>x<sub>p</sub> = N<sub>D</sub>x<sub>n</sub>.</>}
      controls={<>
        <Slider label="Acceptors NA (p side)" value={s.na} min={1e14} max={1e19} log format={v => sci(v) + ' cm⁻³'} onChange={upd('na')} />
        <Slider label="Donors ND (n side)" value={s.nd} min={1e14} max={1e19} log format={v => sci(v) + ' cm⁻³'} onChange={upd('nd')} />
        <Slider label="Applied bias Va (+ = forward)" value={s.va} min={-20} max={0.9} step={0.01} unit="V" onChange={upd('va')} />
        <Seg label="Plots" value={s.view} options={[{ value: 'stack', label: 'ρ, E, φ' }, { value: 'bands', label: 'Bands' }, { value: 'bias', label: 'W, Cj vs V' }]} onChange={upd('view')} />
        <Note>Silicon at 300 K, n<sub>i</sub> = 10<sup>10</sup> cm⁻³, ε<sub>s</sub> = 11.7ε<sub>0</sub>. Abrupt junction, depletion approximation (no free carriers inside −x<sub>p</sub>…x<sub>n</sub>).</Note>
      </>}>
      <CrossSection r={r} x0={win.x0} x1={win.x1} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '6px 0 8px' }}>
        <RegionBadge label={biasLbl} color={s.va > 0.005 ? 'ok' : s.va < -0.005 ? 'info' : 'accent'} />
        {r.clamped && <RegionBadge label={`Va capped at Vbi − 2kT/q = ${r.vaEff.toFixed(2)} V (high injection)`} color="warn" />}
        {r.breakdownRisk && <RegionBadge label={`Emax > ${E_CRIT / 1e5}×10⁵ V/cm: avalanche breakdown likely`} color="bad" />}
      </div>
      <Readouts>
        <Readout k="Built-in Vbi" v={si(r.vbi, 'V')} hl />
        <Readout k="Depletion width W" v={um(r.W).toPrecision(3) + ' µm'} hl />
        <Readout k="x_p / x_n" v={`${um(r.xp).toPrecision(3)} / ${um(r.xn).toPrecision(3)} µm`} />
        <Readout k="Peak field |Emax|" v={si(r.emax, 'V/cm')} tone={r.breakdownRisk ? 'bad' : undefined} />
        <Readout k="Cj per area" v={`${(r.cj * 1e9).toPrecision(3)} nF/cm²`} />
        <Readout k="Barrier q(Vbi − Va)" v={si(r.vj, 'eV')} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}V_{bi} = \frac{kT}{q}\ln\frac{N_AN_D}{n_i^2} = ${r.vbi.toFixed(3)}\,\text{V} \\ W = \sqrt{\frac{2\varepsilon_s (V_{bi}-V_a)}{q}\left(\frac{1}{N_A}+\frac{1}{N_D}\right)} = ${um(r.W).toPrecision(3)}\,\mu\text{m}\end{gathered}`}</EqBox>
      {s.view === 'stack' && <>
        <Plot series={[{ x: data.xu, y: data.rho, label: 'ρ/q (net fixed charge)', color: 'purple', fill: true }]} height={160} xRange={xr}
          yLabel="ρ/q (cm⁻³)" yTickFormat={v => v === 0 ? '0' : v.toExponential(0).replace('e+', 'e').replace('-', '−')} vlines={vl} legend={false} />
        <Plot series={[...(showRef ? [{ x: data.xu, y: data.e0.map(v => v / 1e3), label: 'E at 0 V', color: 'muted', dashed: true }] : []), { x: data.xu, y: data.e.map(v => v / 1e3), label: 'E(x)', color: 'accent' }]} height={160} xRange={xr}
          yLabel="E (kV/cm)" vlines={vl} legend={showRef} points={[{ x: 0, y: -r.emax / 1e3, label: `Emax = ${si(r.emax, 'V/cm')}`, color: 'accent' }]} />
        <Plot series={[...(showRef ? [{ x: data.xu, y: data.phi0, label: 'φ at 0 V', color: 'muted', dashed: true }] : []), { x: data.xu, y: data.phi, label: 'φ(x)', color: 'green' }]} height={170} xRange={xr}
          xLabel="Position x (µm), junction at 0" yLabel="φ (V)" vlines={vl} legend={showRef}
          hlines={[{ at: r.vj, label: `Vbi − Va = ${r.vj.toFixed(3)} V`, color: 'muted' }]} />
      </>}
      {s.view === 'bands' && <Plot height={300} xRange={xr} xLabel="Position x (µm)" yLabel="Electron energy (eV)"
        series={[
          { x: data.xu, y: data.bd.map(b => b.ec), label: 'E_C', color: 'blue' },
          { x: data.xu, y: data.bd.map(b => b.ev), label: 'E_V', color: 'red' },
          { x: data.xu, y: data.bd.map(b => b.ei), label: 'E_i', color: 'muted', dashed: true },
          { x: data.xu.filter(x => x <= um(r.xn)), y: data.xu.filter(x => x <= um(r.xn)).map(() => 0), label: 'E_Fp', color: 'orange' },
          { x: data.xu.filter(x => x >= um(-r.xp)), y: data.xu.filter(x => x >= um(-r.xp)).map(() => r.vaEff), label: 'E_Fn', color: 'green' },
        ]} vlines={vl} />}
      {s.view === 'bias' && <>
        <Plot height={200} series={[{ x: biasCurve.vas, y: biasCurve.W, label: 'W', color: 'accent' }]} xLabel="Applied bias Va" xUnit="V" yLabel="W (µm)"
          points={[{ x: r.vaEff, y: um(r.W), label: `${um(r.W).toPrecision(3)} µm`, color: 'accent' }]} vlines={[{ at: r.vbi, label: 'Vbi', color: 'muted' }]} legend={false} />
        <Plot height={200} series={[{ x: biasCurve.vas, y: biasCurve.C, label: 'Cj', color: 'orange' }]} xLabel="Applied bias Va" xUnit="V" yLabel="Cj (fF/µm²)"
          points={[{ x: r.vaEff, y: r.cj * 1e7, label: `${(r.cj * 1e7).toPrecision(3)} fF/µm²`, color: 'orange' }]} legend={false} />
      </>}
      <Note>Fixed charge: N<sub>A</sub>·x<sub>p</sub> = {sciHtml(r.NA * r.xp)} cm⁻² = N<sub>D</sub>·x<sub>n</sub> (charge neutrality). Peak field E<sub>max</sub> = 2(V<sub>bi</sub> − V<sub>a</sub>)/W: the area under E(x) is the barrier height.</Note>
    </SimShell>
  );
}
