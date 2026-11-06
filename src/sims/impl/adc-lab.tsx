// ADC lab: quantization, SAR, flash, code <-> voltage conversion. Model: models/adc-lab.ts
import { useEffect, useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { renderCircuit } from '../../diagrams/circuit.mjs';
import { linspace } from '../../lib/units';
import { quantize, sar, flash, codeToV, lsb, toBin } from '../models/adc-lab';

type View = 'quantize' | 'sar' | 'flash' | 'convert';
const VIEWS: View[] = ['quantize', 'sar', 'flash', 'convert'];
const hex = (c: number, bits: number) => '0x' + c.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0');

function FlashLadder({ bits, vref, vin }: { bits: number; vref: number; vin: number }) {
  const f = useMemo(() => flash(bits, vref, vin), [bits, vref, vin]);
  const K = f.comparators, RHt = bits <= 3 ? 30 : bits === 4 ? 20 : 14, H = K * RHt + 56, VW = 640, L = lsb(bits, vref);
  const yOf = (k: number) => 28 + (K - k) * RHt + RHt / 2; // threshold tap k = 1..K (top = highest)
  const yVin = Math.max(20, Math.min(H - 20, 28 + (K - vin / L) * RHt + RHt / 2));
  return (
    <svg viewBox={`0 0 ${VW} ${H}`} style={{ width: '100%', display: 'block', maxWidth: 580 }} role="img" aria-label={`Flash ADC with ${K} comparators, output code ${f.code}`}>
      <g transform="translate(80,0)">
      <text x={14} y={16} fontSize={12} fontWeight={700} fill="var(--d-ink)">Vref</text>
      {Array.from({ length: K + 1 }, (_, i) => <rect key={i} x={29} y={28 + i * RHt + 1} width={14} height={RHt - 2} fill="var(--d-box)" stroke="var(--d-ink)" strokeWidth={1.2} />)}
      <text x={14} y={H - 8} fontSize={11} fill="var(--d-muted)">GND</text>
      {f.therm.map((on, i) => { const k = i + 1; const y = yOf(k); const th = RHt * 0.4; return (
        <g key={k}>
          <line x1={43} x2={150} y1={y - RHt / 2} y2={y - RHt / 2} stroke="var(--d-muted)" strokeWidth={1} />
          <path d={`M150,${y - RHt / 2 - th} L182,${y - RHt / 2} L150,${y - RHt / 2 + th} Z`} fill={on ? 'var(--d-green)' : 'var(--d-box)'} fillOpacity={on ? 0.5 : 1} stroke="var(--d-ink)" strokeWidth={1.2} />
          {RHt >= 14 && <text x={100} y={y - RHt / 2 - 2} fontSize={9.5} fill="var(--d-muted)" textAnchor="middle">{si(k * L, 'V', 3)}</text>}
          <line x1={182} x2={236} y1={y - RHt / 2} y2={y - RHt / 2} stroke={on ? 'var(--d-green)' : 'var(--d-muted)'} strokeWidth={on ? 2.2 : 1} />
          <rect x={236} y={y - RHt / 2 - RHt * 0.36} width={24} height={RHt * 0.72} rx={3} fill={on ? 'var(--d-green)' : 'var(--d-box)'} fillOpacity={on ? 0.55 : 1} stroke="var(--d-ink)" strokeWidth={1} />
          {RHt >= 14 && <text x={248} y={y - RHt / 2 + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--d-ink)">{on ? 1 : 0}</text>}
        </g>); })}
      <line x1={136} x2={136} y1={22} y2={H - 22} stroke="var(--d-accent)" strokeWidth={1.4} opacity={0.4} />
      <path d={`M136,${yVin} H140`} stroke="var(--d-accent)" strokeWidth={2} />
      <line x1={-80} x2={136} y1={yVin} y2={yVin} stroke="var(--d-accent)" strokeWidth={1.8} strokeDasharray="5 3" />
      <text x={-78} y={yVin - 5} fontSize={11} fontWeight={700} fill="var(--d-accent)" stroke="var(--d-bg)" strokeWidth={3} paintOrder="stroke">Vin = {si(vin, 'V')}</text>
      <g transform={`translate(330, ${Math.max(10, H / 2 - 50)})`}>
        <rect width={120} height={100} rx={8} fill="var(--d-box)" stroke="var(--d-ink)" strokeWidth={1.4} />
        <text x={60} y={22} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--d-ink)">Encoder</text>
        <text x={60} y={40} textAnchor="middle" fontSize={10.5} fill="var(--d-muted)">thermometer → binary</text>
        <text x={60} y={68} textAnchor="middle" fontSize={bits > 4 ? 15 : 18} fontWeight={700} fontFamily="var(--font-mono, monospace)" fill="var(--d-accent)">{toBin(f.code, bits)}</text>
        <text x={60} y={88} textAnchor="middle" fontSize={11} fill="var(--d-muted)">code {f.code}</text>
      </g>
      <line x1={260} x2={330} y1={Math.max(10, H / 2 - 50) + 50} y2={Math.max(10, H / 2 - 50) + 50} stroke="var(--d-muted)" strokeWidth={1.2} strokeDasharray="3 3" />
      </g>
    </svg>
  );
}

export default function AdcLab({ params }: SimProps) {
  const v0: View = (VIEWS as string[]).includes(params.view) ? params.view : 'quantize';
  const init = { view: v0, bits: Math.min(16, Math.max(1, Math.round(Number(params.bits ?? 10)))), vref: Number(params.vref ?? 3.3), vin: Number(params.vin ?? 1.234), round: false, conv: 'pow2' as 'pow2' | 'pow2m1', step: -1 as number, codeSel: -1 as number };
  const [s, setS] = useState(init);
  const u = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => setS(p => ({ ...p, [k]: v }));
  const { bits, vref } = s; const vin = Math.max(0, s.vin);
  const L = lsb(bits, vref);
  const q = useMemo(() => quantize(bits, vref, vin, s.round), [bits, vref, vin, s.round]);
  const flashBits = Math.min(bits, 5);
  const sr = useMemo(() => sar(bits, vref, Math.min(vin, vref)), [bits, vref, vin]);
  const stepN = s.step < 0 ? bits : Math.min(s.step, bits);   // number of decisions shown
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return; const id = setInterval(() => setS(p => { const cur = p.step < 0 ? 0 : p.step; if (cur >= p.bits) { setPlaying(false); return p; } return { ...p, step: cur + 1 }; }), 600);
    return () => clearInterval(id);
  }, [playing]);
  const codeSel = s.codeSel < 0 ? q.code : Math.min(s.codeSel, 2 ** bits - 1);

  // ---- transfer staircase + error plots
  const zoom = bits > 6;
  const tr = useMemo(() => {
    const lo = zoom ? Math.max(0, vin - 4 * L) : 0, hi = zoom ? Math.min(vref * 1.05, vin + 4 * L) : vref * 1.05;
    const xs = linspace(lo, Math.max(hi, lo + L), zoom ? 400 : 900);
    return { x: xs, y: xs.map(x => quantize(bits, vref, x, s.round).code), yi: xs.map(x => x / L - (s.round ? 0 : 0)) };
  }, [bits, vref, vin, s.round, L, zoom]);
  const err = useMemo(() => ({ x: tr.x, y: tr.x.map(x => { const r = quantize(bits, vref, x, s.round); return r.clipped ? NaN : r.err / L; }) }), [tr, bits, vref, s.round, L]);
  const errBand = s.round ? [-0.5, 0.5] : [0, 1];
  const vfmt = (v: number) => (zoom ? v.toFixed(Math.max(3, Math.ceil(-Math.log10(L)) + 1)) : v.toFixed(2)) + ' V';

  // ---- SAR block diagram
  const sarSvg = useMemo(() => {
    const shown = sr.steps.slice(0, stepN); const cur = shown.length ? shown[shown.length - 1] : null;
    const word = cur ? toBin(cur.keep ? cur.code : cur.code, bits) : '0'.repeat(bits);
    const trial = stepN < bits ? sr.steps[stepN] : null;
    return renderCircuit({ elements: [
      { t: 'box', at: [0, 0], w: 5, h: 3, label: 'DAC', pins: [{ side: 'right', pos: 1, name: '' }, { side: 'top', pos: 2.5, name: '' }] },
      { t: 'wire', pts: [[5, 1], [6, 1], [6, 3], [7, 3]], color: 'orange' },
      { t: 'text', at: [2.5, 3.9], text: `V_DAC = ${si(trial ? trial.dac : cur ? cur.code * L : 0, 'V')}`, color: 'orange', anchor: 'middle' },
      { t: 'opamp', at: [7, 4], label: 'CMP' },
      { t: 'wire', pts: [[0, 5], [7, 5]], flow: true, color: 'accent' }, { t: 'term', at: [0, 5], label: 'V_{in}', side: 'left' },
      { t: 'wire', pts: [[11, 4], [13, 4]], color: 'green' },
      { t: 'box', at: [13, 1], w: 5, h: 5, label: 'SAR logic', pins: [{ side: 'left', pos: 3, name: '' }, { side: 'top', pos: 2.5, name: '' }, { side: 'right', pos: 3, name: '' }] },
      { t: 'wire', pts: [[15.5, 1], [15.5, -1.5], [2.5, -1.5], [2.5, 0]], color: 'purple' },
      { t: 'text', at: [9, -2.3], text: `D = ${word}`, color: 'purple', anchor: 'middle' },
      { t: 'wire', pts: [[18, 4], [19, 4]], color: 'accent' }, { t: 'text', at: [15.5, 6.9], text: `code = ${cur ? cur.code : 0}`, color: 'accent', anchor: 'middle' },
    ] }).svg;
  }, [sr, stepN, bits, L]);

  const status = q.clipped ? { label: q.clipped === 'high' ? 'Over-range: code clipped at full scale' : 'Under-range: clipped to 0', color: 'bad' as const } : { label: 'In range', color: 'ok' as const };
  const eqQ = String.raw`\text{code}=\left\lfloor \frac{V_{in}}{V_{ref}/2^{N}} \right\rfloor=\left\lfloor \frac{${vin.toFixed(3)}}{${(L * 1000).toFixed(3)}\,\text{mV}} \right\rfloor = ${q.code},\qquad \text{LSB}=\frac{V_{ref}}{2^{${bits}}}=\text{${si(L, 'V')}}`;

  const view = s.view;
  return (
    <SimShell title="ADC: quantization, SAR, flash & code conversion" onReset={() => { setS(init); setPlaying(false); }}
      tryThis={<>
        {view === 'quantize' && <>set <b>bits</b> to 3 and slide V<sub>in</sub>: the code steps every LSB and the error sawtooths between 0 and 1 LSB. Each extra bit halves the LSB and adds 6.02 dB of SQNR. Push V<sub>in</sub> past V<sub>ref</sub> to see clipping.</>}
        {view === 'sar' && <>press <b>Next bit</b> repeatedly: each step halves the search interval (binary search on V<sub>DAC</sub>). N bits need exactly N comparisons. Move V<sub>in</sub> to see different bit patterns.</>}
        {view === 'flash' && <>raise V<sub>in</sub> and watch the thermometer code grow one comparator at a time. Increase the bits: comparators double with every added bit (2<sup>N</sup>−1).</>}
        {view === 'convert' && <>pick a code, then switch the convention between 2<sup>N</sup> and 2<sup>N</sup>−1: the top code reads V<sub>ref</sub>−1 LSB or exactly V<sub>ref</sub>, and the two readings differ by up to 1 LSB.</>}
      </>}
      controls={<>
        <Seg label="View" value={view} onChange={v => { u('view')(v); setPlaying(false); }} options={VIEWS.map(v => ({ value: v, label: v === 'sar' ? 'SAR' : v[0].toUpperCase() + v.slice(1) }))} />
        <Slider label="Resolution N" value={bits} min={1} max={16} step={1} format={v => `${Math.round(v)} bits`} onChange={v => setS(p => ({ ...p, bits: Math.round(v), step: -1, codeSel: -1 }))} />
        <Slider label="Reference Vref" value={vref} min={0.5} max={5.5} step={0.1} unit="V" onChange={u('vref')} />
        <Slider label="Input Vin" value={Math.min(vin, vref * 1.1)} min={0} max={Math.max(vref * 1.1, 0.1)} step={Math.max(L / 4, 0.0005)} unit="V" onChange={v => setS(p => ({ ...p, vin: v, step: -1, codeSel: -1 }))} />
        {view === 'quantize' && <Toggle label="Rounding (mid-tread, ±½ LSB error)" checked={s.round} onChange={u('round')} />}
        {view === 'sar' && <div className="ctl"><span className="ctl-head"><span className="ctl-label">Conversion step {stepN} / {bits}</span></span>
          <div className="seg"><button type="button" onClick={() => setS(p => ({ ...p, step: Math.min(bits, (p.step < 0 ? 0 : p.step) + 1) }))}>Next bit</button><button type="button" onClick={() => setS(p => ({ ...p, step: 0 }))}>Restart</button><button type="button" onClick={() => { setS(p => ({ ...p, step: 0 })); setPlaying(true); }}>Run</button></div></div>}
        {view === 'convert' && <>
          <Seg label="Convention" value={s.conv} onChange={u('conv')} options={[{ value: 'pow2', label: 'Vref / 2^N' }, { value: 'pow2m1', label: 'Vref / (2^N−1)' }]} />
          <Slider label="Code" value={codeSel} min={0} max={2 ** bits - 1} step={1} format={v => `${Math.round(v)} (${toBin(Math.round(v), bits)})`} onChange={v => u('codeSel')(Math.round(v))} />
        </>}
        {view === 'flash' && bits > 5 && <Note>The ladder drawing is limited to 5 bits ({2 ** 5 - 1} comparators); a real {bits}-bit flash would need {(2 ** bits - 1).toLocaleString()}.</Note>}
      </>}>
      {view === 'quantize' && <>
        <Plot series={[{ x: tr.x, y: tr.y, label: 'ADC code', color: 'accent', step: false }, { x: tr.x, y: tr.yi, label: 'ideal Vin/LSB', color: 'muted', dashed: true }]}
          xTickFormat={vfmt} xUnit="V" xLabel={zoom ? `Vin (zoom ±4 LSB, ${bits} bits)` : 'Vin'} yLabel="code" height={230} vlines={[{ at: vin, label: 'Vin', color: 'orange' }, ...(zoom ? [] : [{ at: vref, label: 'Vref', color: 'red' }])]}
          points={[{ x: Math.min(vin, tr.x[tr.x.length - 1]), y: q.code, label: `code ${q.code}` }]} yRange={zoom ? [Math.max(0, vin / L - 5), vin / L + 5] : undefined} />
        <Plot series={[{ x: err.x, y: err.y, label: 'quantization error', color: 'red' }]} xTickFormat={vfmt} xUnit="V" yUnit="LSB" xLabel="Vin" yLabel="error e_q (LSB)" height={170}
          hlines={[{ at: errBand[0], label: s.round ? '−½ LSB' : '0', color: 'muted' }, { at: errBand[1], label: s.round ? '+½ LSB' : '1 LSB', color: 'muted' }]} vlines={[{ at: vin, color: 'orange' }]} yTickFormat={v => String(+v.toFixed(2))} />
        <Readouts>
          <Readout k="Code" v={`${q.code}  ${toBin(q.code, bits)}  ${hex(q.code, bits)}`} hl />
          <Readout k="LSB = Vref/2^N" v={si(L, 'V')} />
          <Readout k="Quantized Vq = code·LSB" v={si(q.vq, 'V')} />
          <Readout k="Error Vin − Vq" v={q.clipped ? 'clipped' : `${si(q.err, 'V')} (${(q.err / L).toFixed(2)} LSB)`} tone={q.clipped ? 'bad' : undefined} />
          <Readout k="Levels / max code" v={`${2 ** bits} / ${2 ** bits - 1}`} />
          <Readout k="SQNR (full-scale sine)" v={`${q.sqnr.toFixed(2)} dB`} />
          <Readout k="rms error LSB/√12" v={si(q.rmsErr, 'V')} />
        </Readouts>
        <div style={{ marginTop: 6 }}><RegionBadge label={status.label} color={status.color} /></div>
        <EqBox>{eqQ}</EqBox>
      </>}
      {view === 'sar' && <>
        <div className="figure-body" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: sarSvg }} />
        <div role="group" aria-label="SAR bit register" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '8px 0' }}>
          {sr.steps.map((st, i) => { const done = i < stepN, cur = i === stepN; return (
            <div key={i} style={{ minWidth: 34, textAlign: 'center', padding: '4px 2px', borderRadius: 6, border: `2px solid ${cur ? 'var(--accent)' : 'var(--border)'}`, background: done ? (st.keep ? 'var(--ok-soft)' : 'var(--bad-soft)') : 'var(--bg-elev, transparent)', fontFamily: 'var(--font-mono, monospace)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>b{st.bit}</div><div style={{ fontSize: 15, fontWeight: 700 }}>{done ? (st.keep ? 1 : 0) : cur ? '?' : '·'}</div></div>); })}
        </div>
        <Plot series={[{ x: sr.steps.slice(0, stepN).map((_, i) => i + 1), y: sr.steps.slice(0, stepN).map(st => st.dac), label: 'V_DAC trial', color: 'orange', points: true, step: true }]}
          xRange={[0.5, bits + 0.5]} yRange={[0, vref * 1.05]} yUnit="V" xLabel="decision step (MSB first)" yLabel="V_DAC" height={210} hlines={[{ at: Math.min(vin, vref), label: 'Vin', color: 'accent' }]} />
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th>Step</th><th>Trial code</th><th>V_DAC</th><th>Vin ≥ V_DAC?</th><th>Bit</th></tr></thead>
          <tbody>{sr.steps.slice(0, stepN).map((st, i) => <tr key={i} style={{ borderTop: '1px solid var(--border)' }}><td>{i + 1} (b{st.bit})</td><td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{toBin(st.trial, bits)}</td><td>{si(st.dac, 'V')}</td><td>{st.keep ? 'yes: keep' : 'no: clear'}</td><td>{st.keep ? 1 : 0}</td></tr>)}</tbody></table></div>
        <Readouts>
          <Readout k="Result code" v={stepN >= bits ? `${sr.code}  ${toBin(sr.code, bits)}` : 'converting…'} hl />
          <Readout k="Decisions" v={`${stepN} of ${bits}`} />
          <Readout k="Conversion time" v={`${bits} clocks`} />
          <Readout k="Uncertainty window" v={si(vref / 2 ** stepN, 'V')} />
          <Readout k="Matches ideal quantizer" v={sr.code === quantize(bits, vref, Math.min(vin, vref)).code ? 'yes' : 'no'} tone="ok" />
        </Readouts>
        <EqBox>{String.raw`D_{k}=\begin{cases}1 & V_{in}\ge V_{DAC}(\text{trial})\\ 0 & \text{otherwise}\end{cases},\qquad V_{DAC}=\Big(\sum_i b_i 2^{i}\Big)\,\frac{V_{ref}}{2^{N}}`}</EqBox>
      </>}
      {view === 'flash' && <>
        <div className="figure-body" style={{ padding: 6, display: 'block' }}><FlashLadder bits={flashBits} vref={vref} vin={Math.min(vin, vref * 1.1)} /></div>
        <Readouts>
          <Readout k="Comparators 2^N − 1" v={(2 ** bits - 1).toLocaleString()} hl tone={bits > 8 ? 'warn' : undefined} />
          <Readout k="Ladder resistors 2^N" v={(2 ** bits).toLocaleString()} />
          <Readout k="Thermometer ones" v={String(flash(flashBits, vref, vin).code)} />
          <Readout k="Code (N bits)" v={`${q.code}  ${toBin(q.code, bits)}`} />
          <Readout k="Conversion time" v="1 clock (parallel)" />
        </Readouts>
        <EqBox>{String.raw`V_{th,k}=k\,\frac{V_{ref}}{2^{N}},\; k=1\ldots 2^{N}-1,\qquad \text{code}=\sum_k [V_{in}\ge V_{th,k}]`}</EqBox>
        <Note>Fastest architecture (one clock), but cost, area and input capacitance double with every bit; flash converters are usually 6 to 8 bits.</Note>
      </>}
      {view === 'convert' && (() => {
        const vA = codeToV(codeSel, bits, vref, 'pow2'), vB = codeToV(codeSel, bits, vref, 'pow2m1'); const used = s.conv === 'pow2' ? vA : vB;
        const cx = linspace(0, 2 ** bits - 1, 200);
        return <>
          <Readouts>
            <Readout k="Code" v={`${codeSel}  ${toBin(codeSel, bits)}  ${hex(codeSel, bits)}`} hl />
            <Readout k="V = code·Vref/2^N" v={si(vA, 'V', 5)} />
            <Readout k="V = code·Vref/(2^N−1)" v={si(vB, 'V', 5)} />
            <Readout k="Selected convention" v={si(used, 'V', 5)} hl />
            <Readout k="Difference" v={`${((vB - vA) / L).toFixed(3)} LSB`} />
            <Readout k="Top code reads" v={si(codeToV(2 ** bits - 1, bits, vref, s.conv), 'V', 5)} />
            <Readout k="Vin → code (floor)" v={`${vin.toFixed(3)} V → ${quantize(bits, vref, vin).code}`} />
          </Readouts>
          <EqBox>{s.conv === 'pow2' ? String.raw`V=\text{code}\cdot\frac{V_{ref}}{2^{N}}=${codeSel}\cdot\frac{${vref}}{${2 ** bits}}=\text{${si(vA, 'V', 5)}}` : String.raw`V=\text{code}\cdot\frac{V_{ref}}{2^{N}-1}=${codeSel}\cdot\frac{${vref}}{${2 ** bits - 1}}=\text{${si(vB, 'V', 5)}}`}</EqBox>
          <Plot series={[{ x: cx, y: cx.map(c => c / (2 ** bits - 1)), label: 'difference between conventions (LSB)', color: 'purple' }]} xLabel="code" yLabel="V(2^N−1) − V(2^N)  [LSB]" height={190} yRange={[0, 1.1]}
            points={[{ x: codeSel, y: codeSel / (2 ** bits - 1), label: `${(codeSel / (2 ** bits - 1)).toFixed(2)} LSB` }]} hlines={[{ at: 1, label: '1 LSB at full scale', color: 'muted' }]} />
          <Note>With V = code·V<sub>ref</sub>/2<sup>N</sup> an ADC can never report V<sub>ref</sub> itself: full scale is V<sub>ref</sub> − 1 LSB. Dividing by 2<sup>N</sup>−1 makes the top code read V<sub>ref</sub> exactly, but then the step size is not exactly 1 LSB. Always check which one the datasheet uses.</Note>
        </>;
      })()}
    </SimShell>
  );
}
