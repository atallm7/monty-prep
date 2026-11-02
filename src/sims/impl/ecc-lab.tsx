// Radiation upsets, ECC & TMR. Model: models/ecc-lab.ts
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge } from '../kit';
import Plot from '../../components/Plot';
import { logspace, linspace } from '../../lib/units';
import { encode74, encodeSecded, decode, wordFailure, majority, rTMR, rSimplex, TMR_CROSSOVER_LT, POS_NAMES, COVER } from '../models/ecc-lab';

type Mode = 'hamming' | 'tmr';
const b2s = (b: number[]) => b.join('');
const Cell = ({ label, v, flipped, kind, onClick, mark }: { label: string; v: number; flipped?: boolean; kind: 'p' | 'd'; onClick?: () => void; mark?: boolean }) => (
  <button type="button" onClick={onClick} disabled={!onClick} aria-label={`${label} = ${v}${flipped ? ', flipped' : ''}${onClick ? ', click to flip' : ''}`} aria-pressed={flipped}
    style={{ minWidth: 40, padding: '4px 2px', borderRadius: 8, textAlign: 'center', cursor: onClick ? 'pointer' : 'default', border: `2px solid ${flipped ? 'var(--bad)' : mark ? 'var(--ok)' : 'var(--border)'}`,
      background: flipped ? 'var(--bad-soft)' : kind === 'p' ? 'var(--info-soft)' : 'var(--bg-elev, transparent)', color: 'var(--text)', font: 'inherit', fontFamily: 'var(--font-mono, monospace)' }}>
    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div><div style={{ fontSize: 17, fontWeight: 700 }}>{v}</div></button>
);

export default function EccLab({ params }: SimProps) {
  const m0: Mode = params.mode === 'tmr' ? 'tmr' : 'hamming';
  const init = { mode: m0, data: [1, 0, 1, 1], secded: false, flips: [] as number[], tflips: [[], [], []] as number[][], p: 1e-3, lt: 0.3, rv: 1 };
  const [s, setS] = useState(init);
  const set = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => setS(p => ({ ...p, [k]: v }));
  const W = s.secded ? 8 : 7;
  const sent = useMemo(() => (s.secded ? encodeSecded(s.data) : encode74(s.data)), [s.data, s.secded]);
  const flips = s.flips.filter(i => i < W);
  const recv = sent.map((b, i) => (flips.includes(i) ? b ^ 1 : b));
  const dec = useMemo(() => decode(recv, s.secded), [recv.join(''), s.secded]);
  const names = s.secded ? POS_NAMES : POS_NAMES.slice(1);
  const toggleFlip = (i: number) => setS(p => ({ ...p, flips: p.flips.includes(i) ? p.flips.filter(x => x !== i) : [...p.flips, i] }));
  const rnd = (k: number) => setS(p => { const idx = [...Array(W).keys()]; const out: number[] = []; for (let j = 0; j < k; j++) out.push(idx.splice(Math.floor(Math.random() * idx.length), 1)[0]); return { ...p, flips: out }; });
  const same = b2s(dec.data) === b2s(s.data);
  const verdict = flips.length === 0 ? { t: 'No upset: data delivered intact', c: 'ok' as const }
    : dec.status === 'double' ? { t: 'Double error DETECTED (not correctable): flagged, no silent corruption', c: 'warn' as const }
    : same ? { t: dec.status === 'p0' ? 'Parity bit p0 upset: data untouched' : 'Single error CORRECTED', c: 'ok' as const }
    : { t: flips.length >= 2 ? 'MIS-CORRECTED: syndrome pointed at the wrong bit, data silently wrong' : 'Data wrong', c: 'bad' as const };
  const wf = useMemo(() => logspace(1e-6, 0.3, 80).map(p => ({ p, ...wordFailure(p) })), []);
  const now = wordFailure(s.p);
  const eqH = String.raw`\text{syndrome}=s_4s_2s_1=\text{position of the flipped bit}:\ (${dec.s.join(',')})_2=${dec.syndrome}`;

  // ---- TMR
  const t = s.tflips; const tv = t.map(f => s.data.map((b, i) => (f.includes(i) ? b ^ 1 : b)));
  const vote = s.data.map((_, i) => majority(tv[0][i], tv[1][i], tv[2][i]));
  const voteOk = b2s(vote) === b2s(s.data); const faulty = t.filter(f => f.length).length;
  const maskedBits = s.data.map((_, i) => [0, 1, 2].some(m => t[m].includes(i))).filter(Boolean).length;
  const flipT = (m: number, i: number) => setS(p => ({ ...p, tflips: p.tflips.map((f, k) => (k === m ? (f.includes(i) ? f.filter(x => x !== i) : [...f, i]) : f)) }));
  const lx = useMemo(() => linspace(0, 3, 150), []);
  const R = rSimplex(s.lt), RT = rTMR(R, s.rv);

  return (
    <SimShell title={s.mode === 'hamming' ? 'Radiation upsets & ECC (Hamming / SECDED)' : 'Triple modular redundancy (TMR)'} onReset={() => setS(init)}
      tryThis={s.mode === 'hamming' ? <>click any <b>one</b> bit of the received word: the syndrome spells its position in binary and the decoder flips it back. Now click a <b>second</b> bit: plain Hamming(7,4) miscorrects (silently wrong data), while <b>SECDED</b> sees a non-zero syndrome with even overall parity and raises a double-error flag.</>
        : <>flip one bit in module A, then the <i>same</i> bit in module B: the voter now outputs the wrong value because two of three modules agree on it. Upsets in <i>different</i> bit positions of different modules are all masked.</>}
      controls={<>
        <Seg label="Topic" value={s.mode} onChange={set('mode')} options={[{ value: 'hamming', label: 'Hamming / SECDED' }, { value: 'tmr', label: 'TMR' }]} />
        <div className="ctl"><span className="ctl-head"><span className="ctl-label">Data bits d1..d4 (click)</span></span>
          <div style={{ display: 'flex', gap: 6 }}>{s.data.map((b, i) => <Cell key={i} label={`d${i + 1}`} v={b} kind="d" onClick={() => setS(p => ({ ...p, data: p.data.map((x, k) => (k === i ? x ^ 1 : x)) }))} />)}</div></div>
        {s.mode === 'hamming' ? <>
          <Seg label="Code" value={s.secded ? '8' : '7'} onChange={v => setS(p => ({ ...p, secded: v === '8', flips: [] }))} options={[{ value: '7', label: 'Hamming(7,4) SEC' }, { value: '8', label: 'SECDED(8,4)' }]} />
          <div className="seg"><button type="button" onClick={() => rnd(1)}>Flip 1 random</button><button type="button" onClick={() => rnd(2)}>Flip 2 random</button><button type="button" onClick={() => set('flips')([])}>Clear</button></div>
          <Slider label="Per-bit upset probability p" value={s.p} min={1e-6} max={0.3} log format={v => v.toExponential(1)} onChange={set('p')} />
        </> : <>
          <div className="seg"><button type="button" onClick={() => set('tflips')([[], [], []])}>Clear upsets</button></div>
          <Slider label="Module reliability exponent λt" value={s.lt} min={0.01} max={3} step={0.01} onChange={set('lt')} />
          <Slider label="Voter reliability" value={s.rv} min={0.9} max={1} step={0.001} format={v => v.toFixed(3)} onChange={set('rv')} />
        </>}
      </>}>
      {s.mode === 'hamming' ? <>
        <div role="group" aria-label="Transmitted code word" style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>Stored code word (p = parity, d = data)</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{sent.map((b, i) => <Cell key={i} label={names[i]} v={b} kind={names[i][0] === 'p' ? 'p' : 'd'} />)}</div></div>
        <div role="group" aria-label="Received code word, click to flip bits" style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 3 }}>Received word after radiation (click a bit to flip it)</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{recv.map((b, i) => <Cell key={i} label={names[i]} v={b} kind={names[i][0] === 'p' ? 'p' : 'd'} flipped={flips.includes(i)} onClick={() => toggleFlip(i)} />)}</div></div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th>Check</th><th>Covers positions</th><th>Received bits</th><th>XOR</th></tr></thead>
          <tbody>{([4, 2, 1] as const).map((k, j) => <tr key={k} style={{ borderTop: '1px solid var(--border)' }}><td>s{k}</td><td>{COVER[k].join(', ')}</td><td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{COVER[k].map(pos => recv[s.secded ? pos : pos - 1]).join(' ')}</td>
            <td style={{ fontWeight: 700, color: dec.s[j] ? 'var(--bad)' : 'var(--ok)' }}>{dec.s[j]}</td></tr>)}
            {s.secded && <tr style={{ borderTop: '1px solid var(--border)' }}><td>P (overall)</td><td>all 8 bits</td><td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{recv.join(' ')}</td><td style={{ fontWeight: 700, color: dec.overall ? 'var(--bad)' : 'var(--ok)' }}>{dec.overall}</td></tr>}</tbody></table></div>
        <div style={{ margin: '8px 0' }}><RegionBadge label={verdict.t} color={verdict.c} /></div>
        <Readouts>
          <Readout k="Syndrome" v={`${dec.s.join('')}₂ = ${dec.syndrome}`} hl />
          <Readout k="Upsets injected" v={String(flips.length)} />
          <Readout k="Decoder action" v={dec.status === 'ok' ? 'none' : dec.status === 'double' ? 'flag double error' : dec.status === 'p0' ? 'fix p0' : `flip ${names[s.secded ? (dec.flipPos as number) : (dec.flipPos as number) - 1]}`} />
          <Readout k="Data in / out" v={`${b2s(s.data)} / ${b2s(dec.data)}`} tone={same ? 'ok' : dec.status === 'double' ? 'warn' : 'bad'} />
          <Readout k="Rate" v={s.secded ? '4/8 = 50 %' : '4/7 = 57 %'} />
          <Readout k={`P(word fails) at p=${s.p.toExponential(0)}`} v={s.secded ? `${now.secUncorr.toExponential(2)} (silent ${now.secSilent.toExponential(1)})` : now.ham.toExponential(2)} />
        </Readouts>
        <EqBox>{eqH}</EqBox>
        <Plot series={[{ x: wf.map(r => r.p), y: wf.map(r => r.none), label: 'no ECC (any upset)', color: 'red' }, { x: wf.map(r => r.p), y: wf.map(r => r.ham), label: 'Hamming(7,4): ≥2 upsets', color: 'orange' }, { x: wf.map(r => r.p), y: wf.map(r => r.secUncorr), label: 'SECDED: uncorrectable', color: 'blue', dashed: true }, { x: wf.map(r => r.p), y: wf.map(r => r.secSilent), label: 'SECDED: silent (≥3)', color: 'green' }]}
          xLog yLog yRange={[1e-12, 1]} xLabel="per-bit upset probability p" yLabel="word failure probability" height={230} vlines={[{ at: s.p, label: 'p', color: 'accent' }]} />
        <Note>For small p: unprotected ≈ 4p, Hamming(7,4) fails when ≥2 bits flip ≈ 21p², SECDED turns most of those into detected (not silent) errors, so silent corruption needs ≥3 flips ∝ p³.</Note>
      </> : <>
        <div style={{ display: 'grid', gap: 8 }}>
          {['A', 'B', 'C'].map((nm, m) => <div key={nm} role="group" aria-label={`Module ${nm}`}><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Module {nm} output (click to upset a bit)</div>
            <div style={{ display: 'flex', gap: 5 }}>{tv[m].map((b, i) => <Cell key={i} label={`bit ${i}`} v={b} kind="d" flipped={t[m].includes(i)} onClick={() => flipT(m, i)} />)}</div></div>)}
          <div role="group" aria-label="Majority voter output"><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Voter output y = ab + bc + ca (bitwise)</div>
            <div style={{ display: 'flex', gap: 5 }}>{vote.map((b, i) => <Cell key={i} label={`bit ${i}`} v={b} kind="p" mark={b === s.data[i]} flipped={b !== s.data[i]} />)}</div></div>
        </div>
        <div style={{ margin: '8px 0' }}><RegionBadge label={faulty === 0 ? 'No upsets' : voteOk ? `Masked: ${maskedBits} faulty bit(s) outvoted` : 'VOTER OUTPUT WRONG: same bit upset in ≥2 modules'} color={faulty === 0 ? 'info' : voteOk ? 'ok' : 'bad'} /></div>
        <Readouts>
          <Readout k="Expected" v={b2s(s.data)} />
          <Readout k="Voter output" v={b2s(vote)} hl tone={voteOk ? 'ok' : 'bad'} />
          <Readout k="Modules with upsets" v={`${faulty} of 3`} />
          <Readout k="R single (e^−λt)" v={R.toFixed(4)} />
          <Readout k="R TMR (3R²−2R³)·Rv" v={RT.toFixed(4)} tone={RT > R ? 'ok' : 'bad'} />
          <Readout k="MTTF ratio TMR/simplex" v={`${(5 / 6 * s.rv).toFixed(3)} (5/6 for ideal voter)`} />
        </Readouts>
        <EqBox>{String.raw`R_{TMR}=3R^2-2R^3=${RT.toFixed(4)}\ \ (R=e^{-\lambda t}=${R.toFixed(4)}),\quad R_{TMR}>R \iff R>0.5`}</EqBox>
        <Plot series={[{ x: lx, y: lx.map(rSimplex), label: 'single module', color: 'muted', dashed: true }, { x: lx, y: lx.map(x => rTMR(rSimplex(x), s.rv)), label: 'TMR', color: 'accent' }]} xLabel="λt (mission time ÷ MTTF of one module)" yLabel="reliability R(t)" height={230} yRange={[0, 1.02]}
          vlines={[{ at: TMR_CROSSOVER_LT, label: 'crossover λt = ln 2', color: 'orange' }, { at: s.lt, label: 'now', color: 'purple' }]} hlines={[{ at: 0.5, label: 'R = 0.5', color: 'muted' }]} points={[{ x: s.lt, y: RT }, { x: s.lt, y: R }]} />
        <Note>TMR is excellent for short missions (λt below ln 2 ≈ 0.69) but worse than a single module for long ones, and its MTTF is only 5/6 of a single module's. Scrubbing (re-syncing modules) restores the benefit.</Note>
      </>}
    </SimShell>
  );
}
