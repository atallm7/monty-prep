// Eye diagram: PRBS7 through a band-limited channel with noise and jitter, folded into a persistence-style eye.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { logspace } from '../../lib/units';
import { simulate, response, EyeIn } from '../models/eye-diagram';

function EyeView({ r, A }: { r: ReturnType<typeof simulate>; A: number }) {
  const W = 620, H = 300, L = 52, R = 12, Tm = 12, B = 30;
  let ymax = A * 1.25; for (const t of r.traces) for (const v of t.y) ymax = Math.max(ymax, Math.abs(v) * 1.05);
  ymax = Math.min(ymax, A * 3);
  const X = (u: number) => L + (u + 1) / 2 * (W - L - R);
  const Y = (v: number) => Tm + (1 - (v + ymax) / (2 * ymax)) * (H - Tm - B);
  const d = useMemo(() => r.traces.map(t => t.x.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(Math.max(-ymax, Math.min(ymax, t.y[i]))).toFixed(1)}`).join('')).join(''), [r, ymax]);
  const mask = r.mask.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const yt = [-1, -0.5, 0, 0.5, 1].map(f => f * Math.round(ymax * 10) / 10).filter((v, i, a) => a.indexOf(v) === i);
  const open = r.height > 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Eye diagram">
      <rect x={L} y={Tm} width={W - L - R} height={H - Tm - B} fill="var(--d-bg)" stroke="var(--d-muted)" strokeWidth={0.6} />
      {[-1, -0.5, 0, 0.5, 1].map(u => <g key={u}><line x1={X(u)} x2={X(u)} y1={Tm} y2={H - B} stroke="var(--d-muted)" strokeOpacity={0.25} /><text x={X(u)} y={H - B + 15} textAnchor="middle" fontSize={11} fill="var(--d-muted)">{u} UI</text></g>)}
      {yt.map(v => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--d-muted)" strokeOpacity={0.25} /><text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="var(--d-muted)">{si(v, 'V', 2)}</text></g>)}
      <path d={d} fill="none" stroke="var(--d-accent)" strokeOpacity={0.2} strokeWidth={1.1} />
      <polygon points={mask} fill="var(--d-red)" fillOpacity={r.hits.length ? 0.28 : 0.12} stroke="var(--d-red)" strokeWidth={1.2} />
      {r.hits.slice(0, 400).map((h, i) => <circle key={i} cx={X(h.x)} cy={Y(h.y)} r={1.8} fill="var(--d-red)" />)}
      {open && <g>
        <line x1={X(r.sample)} x2={X(r.sample)} y1={Tm} y2={H - B} stroke="var(--d-green)" strokeOpacity={0.5} strokeDasharray="2 3" />
        <text x={X(r.sample)} y={H - B - 4} textAnchor="middle" fontSize={10} fill="var(--d-green)">best sampling phase</text>
        <line x1={X(r.sample)} x2={X(r.sample)} y1={Y(r.innerTop)} y2={Y(r.innerBot)} stroke="var(--d-green)" strokeWidth={2} markerStart="url(#eyeA)" markerEnd="url(#eyeA)" />
        <text x={X(r.sample) + 6} y={Y(r.innerTop) + 14} fontSize={11.5} fontWeight={600} fill="var(--d-green)">{si(r.height, 'V', 3)}</text>
        <line x1={X(r.sample - r.wl)} x2={X(r.sample + r.wr)} y1={Y(0)} y2={Y(0)} stroke="var(--d-orange)" strokeWidth={1.6} strokeDasharray="4 3" />
        <text x={X(r.sample + r.wr) + 4} y={Y(0) - 5} fontSize={11.5} fontWeight={600} fill="var(--d-orange)">{r.width.toFixed(2)} UI</text>
      </g>}
      <text x={14} y={(H - B) / 2} transform={`rotate(-90 14 ${(H - B) / 2})`} textAnchor="middle" fontSize={11.5} fill="var(--d-muted)">slicer input</text>
      <defs><marker id="eyeA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--d-green)" /></marker></defs>
    </svg>
  );
}

export default function EyeDiagram({ params }: SimProps) {
  const init = {
    rate: Number(params.rate ?? 5e9), bw: Number(params.bw ?? 2.5e9), noise: Number(params.noise ?? 0.02), jitter: Number(params.jitter ?? 0.02), preemph: Number(params.preemph ?? 0),
    ctle: Number(params.ctle ?? 0), poles: (Number(params.poles ?? 1) === 2 ? '2' : '1') as '1' | '2', maskW: 0.4, maskH: 0.2, seed: 12345,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const A = 0.5;
  const p: EyeIn = { rate: s.rate, bw: s.bw, noise: s.noise, jitter: s.jitter, preemph: s.preemph, ctle: s.ctle, poles: s.poles === '2' ? 2 : 1, amp: A, seed: s.seed, maskW: s.maskW, maskH: s.maskH };
  const r = useMemo(() => simulate(p), [s]);
  const nyq = response(p, s.rate / 2);
  const lossDb = 20 * Math.log10(nyq.ch);
  const fr = useMemo(() => {
    const f = logspace(s.rate / 200, s.rate * 2, 160);
    const resp = f.map(x => response(p, x));
    const db = (v: number) => 20 * Math.log10(Math.max(1e-6, v));
    return { f, ch: resp.map(x => db(x.ch)), ct: resp.map(x => db(x.ct)), fir: resp.map(x => db(x.fir)), tot: resp.map(x => db(x.total)) };
  }, [s]);
  const snip = useMemo(() => {
    const n = Math.min(r.tAxis.length, 32 * r.OS); const o = 16 * r.OS;
    return { t: r.tAxis.slice(0, n), tx: Array.from(r.tx.slice(o, o + n)), rx: Array.from(r.eq.slice(o, o + n)) };
  }, [r]);
  const UI = 1 / s.rate;
  const state = r.height <= 0 ? { l: 'Eye closed', c: 'bad' as const } : r.hits.length > 0 ? { l: `Mask violated by ${r.hitTraces} trace${r.hitTraces === 1 ? '' : 's'}`, c: 'warn' as const } : { l: 'Eye open, mask passes', c: 'ok' as const };
  const berTxt = r.ber < 1e-30 ? '< 1e−30' : r.ber.toExponential(1).replace('-', '−');

  return (
    <SimShell title="Eye diagram" onReset={() => set(init)}
      tryThis={<>drop the channel bandwidth to 1 GHz (a lossy 5 Gb/s link): the eye closes from ISI, not noise. Now add about 4 dB of TX de-emphasis <i>or</i> 6–8 dB of CTLE boost and watch the inner opening come back. Too much de-emphasis over-equalises and the eye shrinks again. Then raise the jitter to 0.08 UI: the width collapses while the height barely moves.</>}
      controls={<>
        <Slider label="Bit rate" value={s.rate} min={1e9} max={32e9} log unit="b/s" onChange={upd('rate')} />
        <Slider label="Channel −3 dB bandwidth" value={s.bw} min={0.1e9} max={50e9} log unit="Hz" onChange={upd('bw')} />
        <Seg label="Channel model" value={s.poles} options={[{ value: '1', label: '1-pole RC' }, { value: '2', label: '2-pole' }]} onChange={upd('poles')} />
        <Slider label="Noise (rms at slicer)" value={s.noise} min={0} max={0.15} step={0.002} unit="V" onChange={upd('noise')} />
        <Slider label="Random jitter (rms)" value={s.jitter} min={0} max={0.15} step={0.002} format={v => `${v.toFixed(3)} UI (${si(v * UI, 's')})`} onChange={upd('jitter')} />
        <Slider label="TX de-emphasis" value={s.preemph} min={0} max={12} step={0.1} format={v => v.toFixed(1) + ' dB'} onChange={upd('preemph')} />
        <Slider label="RX CTLE boost" value={s.ctle} min={0} max={15} step={0.5} format={v => v.toFixed(1) + ' dB'} onChange={upd('ctle')} />
        <Slider label="Mask width" value={s.maskW} min={0.1} max={0.8} step={0.02} format={v => v.toFixed(2) + ' UI'} onChange={upd('maskW')} />
        <Slider label="Mask height" value={s.maskH} min={0.02} max={0.6} step={0.01} unit="V" onChange={upd('maskH')} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => set(v => ({ ...v, seed: (v.seed * 1103515245 + 12345) >>> 0 }))}>New noise / jitter seed</button>
        <Note>{r.traces.length} PRBS7 bits at ±{A} V. De-emphasis keeps the transition-bit swing and shrinks repeated bits; CTLE cuts DC gain by the boost so Nyquist sees 0 dB. Noise is referred to the slicer, so CTLE does not amplify it here (real CTLEs do).</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <RegionBadge label={state.l} color={state.c} />
        <RegionBadge label={`Channel loss at Nyquist: ${lossDb.toFixed(1)} dB`} color={lossDb < -6 ? 'warn' : 'info'} />
      </div>
      <div className="figure-body" style={{ padding: 4 }}><EyeView r={r} A={A} /></div>
      <Readouts>
        <Readout k="Eye height (inner)" v={r.height > 0 ? si(r.height, 'V') : 'closed'} hl tone={r.height <= 0 ? 'bad' : r.height < s.maskH ? 'warn' : 'ok'} />
        <Readout k="Eye width" v={r.width > 0 ? `${r.width.toFixed(2)} UI · ${si(r.width * UI, 's')}` : 'closed'} tone={r.width <= 0 ? 'bad' : r.width < s.maskW ? 'warn' : 'ok'} />
        <Readout k="Q factor" v={isFinite(r.Q) && r.Q < 1e6 ? r.Q.toFixed(1) : '∞'} />
        <Readout k="BER estimate ½erfc(Q/√2)" v={berTxt} tone={r.ber > 1e-12 ? 'bad' : 'ok'} />
        <Readout k="Mask hits (traces)" v={`${r.hitTraces} / ${r.traces.length}`} tone={r.hitTraces ? 'bad' : 'ok'} />
        <Readout k="Bit errors in this run" v={`${r.errors} / ${r.decisions}`} tone={r.errors ? 'bad' : 'ok'} />
      </Readouts>
      <EqBox>{String.raw`Q=\frac{\mu_1-\mu_0}{\sigma_1+\sigma_0}=\frac{${(r.mu1 * 1000).toFixed(0)}-(${(r.mu0 * 1000).toFixed(0)})\,\text{mV}}{${(r.sd1 * 1000).toFixed(1)}+${(r.sd0 * 1000).toFixed(1)}\,\text{mV}}=${isFinite(r.Q) && r.Q < 1e6 ? r.Q.toFixed(1) : '\\infty'},\quad \text{BER}\approx\tfrac12\,\mathrm{erfc}\!\left(\tfrac{Q}{\sqrt2}\right)`}</EqBox>
      <Plot height={200} xUnit="s" yUnit="V" xLabel="time (32 bits)" yLabel="voltage"
        series={[{ x: snip.t, y: snip.tx, label: 'TX (after FIR)', color: 'muted', step: true }, { x: snip.t, y: snip.rx, label: 'slicer input', color: 'accent' }]}
        hlines={[{ at: 0, color: 'muted' }]} />
      <Plot height={210} xLog xUnit="Hz" xLabel="frequency" yLabel="gain (dB)" yUnit="" yRange={[-30, 6]} yTickFormat={v => v.toFixed(0)}
        series={[
          { x: fr.f, y: fr.ch, label: 'channel', color: 'red' },
          ...(s.preemph > 0 ? [{ x: fr.f, y: fr.fir, label: 'TX FIR', color: 'orange', dashed: true }] : []),
          ...(s.ctle > 0 ? [{ x: fr.f, y: fr.ct, label: 'CTLE', color: 'green', dashed: true }] : []),
          { x: fr.f, y: fr.tot, label: 'total', color: 'accent', width: 2.2 },
        ]}
        vlines={[{ at: s.rate / 2, label: 'Nyquist', color: 'muted' }]} />
    </SimShell>
  );
}
