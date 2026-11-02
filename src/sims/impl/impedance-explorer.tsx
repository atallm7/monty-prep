// Impedance vs frequency: ideal R/L/C vs their realistic parasitic models.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { clamp } from '../../lib/units';
import { zReal, zIdeal, srf, mag, phaseDeg, usefulUpTo, inductorUsefulFrom, freqRange, sweep, behaviour, qAt } from '../models/impedance-explorer';
import type { ImpIn, Part } from '../models/impedance-explorer';

type Cap = { c: number; esr: number; esl: number };
type Ind = { l: number; dcr: number; cp: number; rcore: number };
type Res = { r: number; ls: number; cp: number };
type St = { part: Part; cap: Cap; ind: Ind; res: Res; showIdeal: boolean; fp: number | null };

const EXAMPLES: Record<Part, { name: string; v: any }[]> = {
  capacitor: [
    { name: '100 nF 0402 MLCC', v: { c: 100e-9, esr: 0.02, esl: 0.5e-9 } },
    { name: '10 µF 0805 MLCC', v: { c: 10e-6, esr: 0.005, esl: 0.9e-9 } },
    { name: '100 µF electrolytic', v: { c: 100e-6, esr: 0.15, esl: 6e-9 } },
  ],
  inductor: [
    { name: '10 µH power', v: { l: 10e-6, dcr: 0.05, cp: 5e-12, rcore: 20e3 } },
    { name: '100 nH RF', v: { l: 100e-9, dcr: 0.1, cp: 0.15e-12, rcore: 5e3 } },
    { name: '1 mH choke', v: { l: 1e-3, dcr: 2, cp: 20e-12, rcore: 200e3 } },
  ],
  resistor: [
    { name: '1 kΩ 0603', v: { r: 1000, ls: 0.8e-9, cp: 0.1e-12 } },
    { name: '1 MΩ (C wins)', v: { r: 1e6, ls: 0.8e-9, cp: 0.1e-12 } },
    { name: '10 mΩ shunt (L wins)', v: { r: 0.01, ls: 1.5e-9, cp: 0.1e-12 } },
  ],
};

function initState(params: Record<string, any>): St {
  const part: Part = ['capacitor', 'inductor', 'resistor'].includes(params.part) ? params.part : 'capacitor';
  const n = (k: string, d: number) => { const v = Number(params[k]); return params[k] !== undefined && isFinite(v) && v >= 0 ? v : d; };
  const own = (k: string, p: Part, d: number) => part === p ? n(k, d) : d; // parasitic params apply to the chosen part
  return {
    part,
    cap: { c: n('c', 100e-9), esr: own('esr', 'capacitor', 0.02), esl: own('esl', 'capacitor', 1e-9) },
    // for an inductor, 'r' (or 'esr') is its DCR
    ind: { l: n('l', 10e-6), dcr: part === 'inductor' ? n('esr', n('r', n('dcr', 0.05))) : 0.05, cp: own('cp', 'inductor', 5e-12), rcore: 20e3 },
    res: { r: part === 'inductor' ? 1000 : n('r', 1000), ls: own('esl', 'resistor', 1e-9), cp: own('cp', 'resistor', 0.2e-12) },
    showIdeal: params.showIdeal === undefined ? true : params.showIdeal !== false && params.showIdeal !== 'false',
    fp: null,
  };
}

function toModel(s: St): ImpIn {
  return {
    part: s.part, c: s.cap.c, l: s.ind.l, r: s.res.r,
    esr: s.part === 'capacitor' ? s.cap.esr : s.ind.dcr,
    esl: s.part === 'capacitor' ? s.cap.esl : s.res.ls,
    cp: s.part === 'inductor' ? s.ind.cp : s.res.cp,
    rcore: s.ind.rcore,
  };
}

const T = (v: number, u: string) => `\\text{${si(v, u)}}`;
const NAME: Record<Part, string> = { capacitor: 'capacitor', inductor: 'inductor', resistor: 'resistor' };
const SELF: Record<Part, 'capacitive' | 'inductive' | 'resistive'> = { capacitor: 'capacitive', inductor: 'inductive', resistor: 'resistive' };

export default function ImpedanceExplorer({ params }: SimProps) {
  const init = useMemo(() => initState(params), [params]);
  const [s, set] = useState<St>(init);
  const m = useMemo(() => toModel(s), [s]);
  const [f0, f1] = useMemo(() => freqRange(m), [m]);
  const fres = useMemo(() => srf(m), [m]);
  const fp = clamp(s.fp ?? (isFinite(fres) ? fres / 10 : Math.sqrt(f0 * f1)), f0, f1);

  const sw = useMemo(() => sweep(m, f0, f1, 420), [m, f0, f1]);
  const fUp = useMemo(() => usefulUpTo(m, f0 / 100, f1 * 100), [m, f0, f1]);
  const fFrom = useMemo(() => s.part === 'inductor' ? inductorUsefulFrom(m, f0 / 100, f1 * 100) : 0, [m, s.part, f0, f1]);

  const zr = zReal(m, fp), zi = zIdeal(m, fp);
  const beh = behaviour(zr);
  const isSelf = beh === SELF[s.part];
  const w = 2 * Math.PI * fp;

  // Which parasitic dominates at the probe frequency (for highlighting in the schematic)
  const dom = useMemo(() => {
    if (s.part === 'capacitor') { // series: largest |Z| term dominates
      const t = { esr: s.cap.esr, esl: w * s.cap.esl, c: 1 / (w * s.cap.c) };
      // near resonance the reactances cancel, leaving ESR
      if (Math.abs(t.esl - t.c) < t.esr) return 'esr';
      return t.esl > t.c ? 'esl' : 'c';
    }
    const L = s.part === 'inductor' ? s.ind.l : s.res.ls; const R = s.part === 'inductor' ? s.ind.dcr : s.res.r; const Cp = s.part === 'inductor' ? s.ind.cp : s.res.cp;
    const ySeries = 1 / Math.hypot(R, w * L), yC = w * Cp, yCore = s.part === 'inductor' ? 1 / s.ind.rcore : 0;
    if (yC > ySeries && yC > yCore) return 'cp';
    if (yCore > ySeries && yCore > yC) return 'rcore';
    return R > w * L ? 'r' : 'l';
  }, [s, w]);
  const col = (k: string) => (dom === k ? 'accent' : undefined);

  const schematic = useMemo(() => {
    let el: any[];
    if (s.part === 'capacitor') {
      el = [
        { t: 'term', at: [0, 2], label: 'A', side: 'left' }, { t: 'wire', pts: [[0, 2], [1, 2]] },
        { t: 'R', a: [1, 2], b: [5, 2], label: 'ESR', value: si(s.cap.esr, 'Ω'), color: col('esr') },
        { t: 'L', a: [5, 2], b: [9, 2], label: 'ESL', value: si(s.cap.esl, 'H'), color: col('esl') },
        { t: 'C', a: [9, 2], b: [13, 2], label: 'C', value: si(s.cap.c, 'F'), color: col('c') },
        { t: 'wire', pts: [[13, 2], [14, 2]] }, { t: 'term', at: [14, 2], label: 'B', side: 'right' },
        { t: 'region', at: [0.6, -0.4], w: 8.8, h: 3.8, label: 'parasitics', color: 'orange' },
      ];
    } else if (s.part === 'inductor') {
      el = [
        { t: 'term', at: [0, 4.5], label: 'A', side: 'left' }, { t: 'wire', pts: [[0, 4.5], [2, 4.5]] },
        { t: 'wire', pts: [[2, 1], [2, 8]] }, { t: 'wire', pts: [[15, 1], [15, 8]] }, { t: 'dot', at: [2, 4.5] }, { t: 'dot', at: [15, 4.5] },
        { t: 'wire', pts: [[15, 4.5], [17, 4.5]] }, { t: 'term', at: [17, 4.5], label: 'B', side: 'right' },
        { t: 'wire', pts: [[2, 1], [3, 1]] }, { t: 'R', a: [3, 1], b: [7, 1], label: 'DCR', value: si(s.ind.dcr, 'Ω'), color: col('r') },
        { t: 'wire', pts: [[7, 1], [9, 1]] }, { t: 'L', a: [9, 1], b: [14, 1], label: 'L', value: si(s.ind.l, 'H'), color: col('l') }, { t: 'wire', pts: [[14, 1], [15, 1]] },
        { t: 'wire', pts: [[2, 4.5], [6.5, 4.5]] }, { t: 'C', a: [6.5, 4.5], b: [10.5, 4.5], label: 'C_p', value: si(s.ind.cp, 'F'), color: col('cp') }, { t: 'wire', pts: [[10.5, 4.5], [15, 4.5]] },
        { t: 'wire', pts: [[2, 8], [6.5, 8]] }, { t: 'R', a: [6.5, 8], b: [10.5, 8], label: 'R_{core}', value: si(s.ind.rcore, 'Ω'), color: col('rcore') }, { t: 'wire', pts: [[10.5, 8], [15, 8]] },
      ];
    } else {
      el = [
        { t: 'term', at: [0, 2.75], label: 'A', side: 'left' }, { t: 'wire', pts: [[0, 2.75], [2, 2.75]] },
        { t: 'wire', pts: [[2, 1], [2, 4.5]] }, { t: 'wire', pts: [[15, 1], [15, 4.5]] }, { t: 'dot', at: [2, 2.75] }, { t: 'dot', at: [15, 2.75] },
        { t: 'wire', pts: [[15, 2.75], [17, 2.75]] }, { t: 'term', at: [17, 2.75], label: 'B', side: 'right' },
        { t: 'wire', pts: [[2, 1], [3, 1]] }, { t: 'R', a: [3, 1], b: [7, 1], label: 'R', value: si(s.res.r, 'Ω'), color: col('r') },
        { t: 'wire', pts: [[7, 1], [9, 1]] }, { t: 'L', a: [9, 1], b: [14, 1], label: 'L_s', value: si(s.res.ls, 'H'), color: col('l') }, { t: 'wire', pts: [[14, 1], [15, 1]] },
        { t: 'wire', pts: [[2, 4.5], [6.5, 4.5]] }, { t: 'C', a: [6.5, 4.5], b: [10.5, 4.5], label: 'C_p', value: si(s.res.cp, 'F'), color: col('cp') }, { t: 'wire', pts: [[10.5, 4.5], [15, 4.5]] },
      ];
    }
    return renderCircuit({ elements: el }).svg;
  }, [s, dom]);

  const setPart = (part: Part) => set(p => ({ ...p, part, fp: null }));
  const updC = (k: keyof Cap) => (v: number) => set(p => ({ ...p, cap: { ...p.cap, [k]: v } }));
  const updL = (k: keyof Ind) => (v: number) => set(p => ({ ...p, ind: { ...p.ind, [k]: v } }));
  const updR = (k: keyof Res) => (v: number) => set(p => ({ ...p, res: { ...p.res, [k]: v } }));
  const applyEx = (v: any) => set(p => s.part === 'capacitor' ? { ...p, cap: { ...p.cap, ...v }, fp: null } : s.part === 'inductor' ? { ...p, ind: { ...p.ind, ...v }, fp: null } : { ...p, res: { ...p.res, ...v }, fp: null });

  const vl: { at: number; label: string; color: string }[] = [];
  if (isFinite(fres) && fres >= f0 && fres <= f1) vl.push({ at: fres, label: 'SRF', color: 'red' });
  if (isFinite(fUp) && fUp >= f0 && fUp <= f1) vl.push({ at: fUp, label: '10% off', color: 'orange' });

  const eq = s.part === 'capacitor'
    ? String.raw`\begin{gathered}Z = \text{ESR} + j\omega\,\text{ESL} + \frac{1}{j\omega C}\\ f_{SRF} = \frac{1}{2\pi\sqrt{\text{ESL}\cdot C}} = ${isFinite(fres) ? T(fres, 'Hz') : '\\infty'}\end{gathered}`
    : s.part === 'inductor'
      ? String.raw`\begin{gathered}Z = (\text{DCR} + j\omega L)\;\|\;\frac{1}{j\omega C_p}\;\|\;R_{core}\\ f_{SRF} = \frac{1}{2\pi}\sqrt{\frac{1}{LC_p} - \frac{\text{DCR}^2}{L^2}} = ${isFinite(fres) ? T(fres, 'Hz') : '\\infty'}\end{gathered}`
      : String.raw`\begin{gathered}Z = (R + j\omega L_s)\;\|\;\frac{1}{j\omega C_p}\\ \sqrt{L_s/C_p} = ${T(Math.sqrt(s.res.ls / Math.max(s.res.cp, 1e-30)), 'Ω')}\;${s.res.r > Math.sqrt(s.res.ls / Math.max(s.res.cp, 1e-30)) ? '<' : '>'}\;R\;\Rightarrow\;\text{${s.res.r > Math.sqrt(s.res.ls / Math.max(s.res.cp, 1e-30)) ? 'shunt C limits it first' : 'series L limits it first'}}\end{gathered}`;
  const eqNow = String.raw`f = ${T(fp, 'Hz')}:\quad Z = ${T(zr.re, 'Ω')} ${zr.im >= 0 ? '+' : '-'} j\,${T(Math.abs(zr.im), 'Ω')},\quad |Z| = ${T(mag(zr), 'Ω')}\,\angle\, ${phaseDeg(zr).toFixed(1)}^\circ`;

  const tryThis = s.part === 'capacitor'
    ? <>pick the <b>100 nF 0402 MLCC</b> and sweep the probe past the SRF: above it the "capacitor" is an inductor and adding capacitance no longer helps, only lower ESL does. Then halve ESL and watch the SRF rise by √2 while the minimum stays at ESR.</>
    : s.part === 'inductor'
      ? <>raise C<sub>p</sub> and watch the SRF drop as 1/√C<sub>p</sub>: above it the inductor is a capacitor and no longer blocks noise. Lower R<sub>core</sub> to see the resonant peak flatten (lossier core, lower Q).</>
      : <>pick <b>1 MΩ</b>: just 0.1 pF of shunt C pulls |Z| down to 71% at f = 1/(2πRC<sub>p</sub>) ≈ 1.6 MHz and keeps falling. Then pick the <b>10 mΩ shunt</b>: the series inductance dominates from a few MHz upward. A resistor only stays a resistor when R ≈ √(L<sub>s</sub>/C<sub>p</sub>).</>;

  return (
    <SimShell title="Impedance vs frequency: ideal vs real parts" onReset={() => set(init)} tryThis={tryThis}
      controls={<>
        <Seg label={`Part: ${NAME[s.part]}`} value={s.part} onChange={setPart} options={[{ value: 'capacitor', label: 'C' }, { value: 'inductor', label: 'L' }, { value: 'resistor', label: 'R' }]} />
        <div className="ctl"><span className="ctl-head"><span className="ctl-label">Typical parts</span></span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{EXAMPLES[s.part].map(e => <button key={e.name} type="button" className="btn btn-sm" onClick={() => applyEx(e.v)}>{e.name}</button>)}</div></div>
        {s.part === 'capacitor' && <>
          <Slider label="Capacitance C" value={s.cap.c} min={1e-12} max={1e-3} log unit="F" onChange={updC('c')} />
          <Slider label="ESR" value={s.cap.esr} min={1e-4} max={10} log unit="Ω" onChange={updC('esr')} />
          <Slider label="ESL" value={s.cap.esl} min={1e-11} max={1e-7} log unit="H" onChange={updC('esl')} />
        </>}
        {s.part === 'inductor' && <>
          <Slider label="Inductance L" value={s.ind.l} min={1e-9} max={0.1} log unit="H" onChange={updL('l')} />
          <Slider label="DCR (winding resistance)" value={s.ind.dcr} min={1e-3} max={100} log unit="Ω" onChange={updL('dcr')} />
          <Slider label="Winding capacitance Cp" value={s.ind.cp} min={1e-14} max={1e-9} log unit="F" onChange={updL('cp')} />
          <Slider label="Core-loss resistance" value={s.ind.rcore} min={10} max={1e8} log unit="Ω" onChange={updL('rcore')} />
        </>}
        {s.part === 'resistor' && <>
          <Slider label="Resistance R" value={s.res.r} min={1e-3} max={1e8} log unit="Ω" onChange={updR('r')} />
          <Slider label="Series inductance Ls" value={s.res.ls} min={1e-11} max={1e-7} log unit="H" onChange={updR('ls')} />
          <Slider label="Shunt capacitance Cp" value={s.res.cp} min={1e-15} max={1e-10} log unit="F" onChange={updR('cp')} />
        </>}
        <Slider label="Probe frequency" value={fp} min={f0} max={f1} log unit="Hz" onChange={v => set(p => ({ ...p, fp: v }))} />
        <Toggle label="Show ideal part" checked={s.showIdeal} onChange={v => set(p => ({ ...p, showIdeal: v }))} />
        <Note>Highlighted element = the one that dominates |Z| at the probe frequency. "10% off ideal" is where |Z<sub>real</sub>/Z<sub>ideal</sub> − 1| first exceeds 0.1.</Note>
      </>}>
      <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: schematic }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="small muted">At {si(fp, 'Hz')} this {NAME[s.part]} behaves</span>
        <RegionBadge label={beh} color={isSelf ? 'ok' : beh === 'resistive' ? 'warn' : 'bad'} />
        {!isSelf && <span className="small muted">{s.part === 'capacitor' && beh === 'inductive' ? '(above SRF: it is an inductor now)' : s.part === 'inductor' && beh === 'capacitive' ? '(above SRF: it is a capacitor now)' : beh === 'resistive' ? '(losses dominate)' : ''}</span>}
      </div>
      <Readouts>
        <Readout k="|Z| real" v={si(mag(zr), 'Ω')} hl />
        {s.showIdeal && <Readout k="|Z| ideal" v={si(mag(zi), 'Ω')} />}
        <Readout k="Phase" v={phaseDeg(zr).toFixed(1) + '°'} />
        <Readout k="Self-resonance" v={isFinite(fres) ? si(fres, 'Hz') : 'none'} />
        <Readout k={s.part === 'capacitor' ? '|Z| min (at SRF)' : '|Z| at SRF'} v={isFinite(fres) ? si(mag(zReal(m, fres)), 'Ω') : '—'} />
        <Readout k="Within 10% of ideal" v={s.part === 'inductor' ? `${si(fFrom, 'Hz')}–${isFinite(fUp) ? si(fUp, 'Hz') : '∞'}` : `≤ ${isFinite(fUp) ? si(fUp, 'Hz') : '∞'}`} tone={fp > fUp || fp < fFrom ? 'warn' : 'ok'} />
        {s.part !== 'resistor' && <Readout k="Q at probe" v={(() => { const q = qAt(m, fp); return isFinite(q) ? (q >= 100 ? q.toFixed(0) : q.toPrecision(3)) : '∞'; })()} />}
      </Readouts>
      <EqBox>{eq}</EqBox>
      <EqBox>{eqNow}</EqBox>
      <Plot height={240} xLog yLog xUnit="Hz" yUnit="Ω" xLabel="Frequency" yLabel="|Z|" xRange={[f0, f1]}
        series={[{ x: sw.f, y: sw.zr, label: `real ${NAME[s.part]}`, color: 'accent' }, ...(s.showIdeal ? [{ x: sw.f, y: sw.zi, label: `ideal ${NAME[s.part]}`, color: 'muted', dashed: true }] : [])]}
        vlines={vl} points={[{ x: fp, y: mag(zr), color: 'accent' }]} />
      <Plot height={170} xLog xUnit="Hz" xLabel="Frequency" yLabel="Phase (°)" yRange={[-95, 95]} xRange={[f0, f1]} legend={false}
        series={[{ x: sw.f, y: sw.pr, label: 'real', color: 'accent' }, ...(s.showIdeal ? [{ x: sw.f, y: sw.pi, label: 'ideal', color: 'muted', dashed: true }] : [])]}
        hlines={[{ at: 90, label: 'inductive', color: 'muted' }, { at: -90, label: 'capacitive', color: 'muted' }]} vlines={vl.map(v => ({ ...v, label: '' }))}
        points={[{ x: fp, y: phaseDeg(zr), color: 'accent' }]} yTickFormat={v => v.toFixed(0) + '°'} />
    </SimShell>
  );
}
