// UART framing & 16× oversampling: frame builder, receiver sample points, baud-mismatch drift and failure.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { buildFrame, receive, tolerance, baudGen, frameStats, Parity } from '../models/uart-frame';

const BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000];
const CLOCKS = [1e6, 4e6, 8e6, 11.0592e6, 14.7456e6, 16e6, 20e6, 48e6];

function parseChar(c: any): number {
  if (typeof c === 'number' && isFinite(c)) return c & 0xff;
  const s = String(c ?? 'A');
  if (/^0x[0-9a-f]{1,2}$/i.test(s)) return parseInt(s, 16);
  return s.length ? s.charCodeAt(0) & 0xff : 0x41;
}
const show = (code: number) => code >= 0x20 && code < 0x7f ? `'${String.fromCharCode(code)}'` : code === 0x0a ? "'\\n'" : code === 0x0d ? "'\\r'" : '·';
const hex = (v: number) => '0x' + v.toString(16).toUpperCase().padStart(2, '0');
const KIND_COLOR: Record<string, string> = { start: 'var(--d-orange)', data: 'var(--d-accent)', parity: 'var(--d-purple)', stop: 'var(--d-green)' };

export default function UartFrame({ params }: SimProps) {
  const par0 = String(params.parity ?? 'none');
  const init = {
    code: parseChar(params.char ?? 'A'),
    baud: Number(params.baud ?? 115200) || 115200,
    parity: (['none', 'even', 'odd'].includes(par0) ? par0 : 'none') as Parity,
    stop: (Number(params.stop ?? 1) === 2 ? 2 : 1) as 1 | 2,
    mismatch: Number(params.mismatch ?? 0) || 0,
    phase: 0.5, fclk: 16e6,
  };
  const [s, set] = useState(init);
  const [txt, setTxt] = useState<string>(String.fromCharCode(init.code));
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const cfg = { code: s.code, parity: s.parity, stop: s.stop };

  const frame = useMemo(() => buildFrame(cfg), [s.code, s.parity, s.stop]);
  const rx = useMemo(() => receive(cfg, s.baud, s.mismatch / 100, s.phase), [s]);
  const st = frameStats(cfg, s.baud);
  const tol = useMemo(() => ({ p: tolerance(cfg, 1), n: tolerance(cfg, -1) }), [s.parity, s.stop]);
  const gen = baudGen(s.fclk, s.baud);
  const lastIdx = rx.offsets.length - 1;
  const drift = rx.offsets[lastIdx];

  const status = !rx.timingOk && !rx.ok ? { l: 'Frame lost: samples slipped into the wrong bit', c: 'bad' as const }
    : !rx.ok ? { l: 'Wrong data received', c: 'bad' as const }
    : !rx.timingOk ? { l: 'Decoded by luck: a sample hit the wrong bit', c: 'warn' as const }
    : Math.abs(s.mismatch / 100) > 0.6 * (s.mismatch >= 0 ? tol.p : tol.n) ? { l: 'Received OK, low margin', c: 'warn' as const }
    : { l: 'Received OK', c: 'ok' as const };

  // ---- drawing ----
  const W = 720, L = 46, nb = frame.length + 2, bw = (W - L - 8) / nb;
  const xOf = (t: number) => L + (t * s.baud + 1) * bw;
  const yH = 40, yLo = 72, yTick = 104, yRx = 128;
  let path = `M ${L} ${yH}`;
  let prev = 1;
  frame.forEach((b, i) => { const x = L + (i + 1) * bw; const y = b.v ? yH : yLo; if (b.v !== prev) path += ` L ${x} ${prev ? yH : yLo} L ${x} ${y}`; prev = b.v; });
  path += ` L ${L + (frame.length + 1) * bw} ${prev ? yH : yLo}`;
  if (prev === 0) path += ` L ${L + (frame.length + 1) * bw} ${yH}`;
  path += ` L ${W - 8} ${yH}`;
  const Ts = 1 / (s.baud * (1 + s.mismatch / 100)) / 16;
  const nTicks = 16 * rx.offsets.length + 2;
  const ticks = Array.from({ length: nTicks }, (_, k) => ({ k, t: rx.tDetect + k * Ts })).filter(o => xOf(o.t) < W - 8);
  const sampleSet = new Map(rx.samples.map(sm => [sm.tick, sm]));

  const offs = rx.offsets.map((o, j) => ({ x: j, y: o * 100 }));

  return (
    <SimShell title="UART frame & 16× oversampling receiver" onReset={() => { set(init); setTxt(String.fromCharCode(init.code)); }}
      tryThis={<>(1) Drag the baud mismatch to about ±{(tol.n * 100).toFixed(1)}–{(tol.p * 100).toFixed(1)}%: the red sample dots creep across bit boundaries, and the stop bit is the first to fail, giving a framing error. (2) Select a 16 MHz MCU clock at 115200 baud and press <i>Use as RX error</i>: the divider rounds to 9, giving −3.5%. That is why 14.7456 MHz "baud-rate crystals" exist. Adding a parity bit makes the frame longer and tightens the tolerance. A second stop bit leaves it unchanged, because the receiver only checks the first.</>}
      controls={<>
        <label className="ctl"><span className="ctl-head"><span className="ctl-label">Character to send</span><span className="ctl-val">{hex(s.code)}</span></span>
          <input className="input" aria-label="Character to send" value={txt} maxLength={4} style={{ height: 32, fontSize: 14, fontFamily: 'var(--font-mono)' }}
            onChange={e => { const v = e.target.value; setTxt(v); if (v.length) upd('code')(parseChar(v)); }} />
        </label>
        <Select label="Baud rate" value={String(s.baud)} options={BAUDS.map(b => ({ value: String(b), label: b.toLocaleString('en-US') + ' bd' }))} onChange={v => upd('baud')(Number(v))} />
        <Seg label="Parity" value={s.parity} options={[{ value: 'none', label: 'None' }, { value: 'even', label: 'Even' }, { value: 'odd', label: 'Odd' }]} onChange={upd('parity')} />
        <Seg label="Stop bits" value={String(s.stop) as '1' | '2'} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }]} onChange={v => upd('stop')(Number(v) as 1 | 2)} />
        <Slider label="RX baud mismatch (+ = RX fast)" value={s.mismatch} min={-8} max={8} step={0.1} format={v => (v > 0 ? '+' : '') + v.toFixed(1) + ' %'} onChange={upd('mismatch')} />
        <Slider label="Start-edge phase vs RX tick" value={s.phase} min={0} max={0.99} step={0.01} format={v => `${(v / 16 * 100).toFixed(1)}% bit`} onChange={upd('phase')} />
        <Select label="RX MCU clock (baud generator)" value={String(s.fclk)} options={CLOCKS.map(c => ({ value: String(c), label: si(c, 'Hz', 6) }))} onChange={v => upd('fclk')(Number(v))} />
        <div className="sim-note">Divider = round({si(s.fclk, 'Hz')} / (16·{s.baud})) = <b>{gen.div}</b> → {Math.round(gen.actual).toLocaleString('en-US')} bd, error <b style={{ color: Math.abs(gen.err) > 0.02 ? 'var(--bad)' : 'inherit' }}>{(gen.err * 100).toFixed(2)}%</b>
          <div style={{ marginTop: 6 }}><button className="btn btn-sm" type="button" onClick={() => upd('mismatch')(Math.max(-8, Math.min(8, Math.round(gen.err * 1000) / 10)))}>Use as RX error</button></div>
        </div>
      </>}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegionBadge label={status.l} color={status.c} />
        {!rx.framingOk && <RegionBadge label="Framing error (stop bit read 0)" color="bad" />}
        {s.parity !== 'none' && !rx.parityOk && <RegionBadge label="Parity error" color="bad" />}
        {rx.noise && <RegionBadge label="Noise flag (3 samples disagree)" color="warn" />}
      </div>
      <div className="figure-body" style={{ padding: '6px 0' }}>
        <svg viewBox={`0 0 ${W} 150`} role="img" aria-label="UART frame waveform with receiver sample points" style={{ width: '100%', minWidth: 560, height: 'auto' }}>
          {frame.map((b, i) => { const x = L + (i + 1) * bw; return <g key={i}>
            <rect x={x} y={yH - 6} width={bw} height={yLo - yH + 12} fill={KIND_COLOR[b.kind]} opacity={b.kind === 'data' && i % 2 ? 0.05 : 0.11} />
            <text x={x + bw / 2} y={18} textAnchor="middle" fontSize={11} fontWeight={600} fill={KIND_COLOR[b.kind]}>{b.name.replace('Stop', b.name === 'Stop' ? 'Stop' : 'S')}</text>
            <text x={x + bw * 0.25} y={(yH + yLo) / 2 + 4} textAnchor="middle" fontSize={12} fill="var(--d-muted)">{b.v}</text>
          </g>; })}
          <text x={L + bw / 2} y={18} textAnchor="middle" fontSize={11} fill="var(--d-muted)">idle</text>
          <text x={6} y={(yH + yLo) / 2 + 4} fontSize={12} fontWeight={600} fill="var(--d-ink)">TX</text>
          <path d={path} fill="none" stroke="var(--d-ink)" strokeWidth={2} strokeLinejoin="round" />
          <text x={6} y={yTick + 4} fontSize={11} fill="var(--d-ink)" fontWeight={600}>RX 16×</text>
          <line x1={xOf(rx.tDetect)} x2={xOf(ticks[ticks.length - 1]?.t ?? rx.tDetect)} y1={yTick} y2={yTick} stroke="var(--d-muted)" strokeWidth={1} />
          {ticks.map(o => { const sm = sampleSet.get(o.k); const x = xOf(o.t); const major = o.k % 16 === 0;
            return <line key={o.k} x1={x} x2={x} y1={yTick - (sm ? 7 : major ? 6 : 3)} y2={yTick + (sm ? 7 : major ? 6 : 3)} stroke={sm ? (sm.ok ? 'var(--d-green)' : 'var(--d-red)') : major ? 'var(--d-ink)' : 'var(--d-muted)'} strokeWidth={sm ? 1.6 : 1} />; })}
          {rx.samples.filter(sm => sm.tick % 16 === 8).map(sm => <line key={'v' + sm.bit} x1={xOf(sm.t)} x2={xOf(sm.t)} y1={yH - 4} y2={yTick - 7} stroke={sm.ok ? 'var(--d-green)' : 'var(--d-red)'} strokeDasharray="3 3" strokeWidth={1} />)}
          {rx.samples.map((sm, i) => <circle key={i} cx={xOf(sm.t)} cy={sm.v ? yH : yLo} r={sm.tick % 16 === 8 ? 3.6 : 2.2} fill={sm.ok ? 'var(--d-green)' : 'var(--d-red)'} stroke="var(--d-bg)" strokeWidth={1} />)}
          <line x1={xOf(rx.tDetect)} x2={xOf(rx.tDetect)} y1={yLo + 4} y2={yTick - 8} stroke="var(--d-orange)" strokeWidth={1.4} />
          <text x={xOf(rx.tDetect) - 3} y={yLo + 16} textAnchor="end" fontSize={10} fill="var(--d-orange)">edge detected</text>
          <text x={6} y={yRx + 4} fontSize={11} fill="var(--d-ink)" fontWeight={600}>RX bit</text>
          {rx.votes.map((v, j) => { const sm = rx.samples[j * 3 + 1]; return <text key={j} x={xOf(sm.t)} y={yRx + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill={rx.samples.slice(j * 3, j * 3 + 3).every(q => q.ok) ? 'var(--d-ink)' : 'var(--d-red)'}>{v}</text>; })}
          <text x={W - 10} y={146} textAnchor="end" fontSize={10.5} fill="var(--d-muted)">dots: samples at ticks 7, 8, 9 of each bit (majority vote). Green = inside the intended bit.</text>
        </svg>
      </div>
      <Readouts>
        <Readout k="Sent" v={`${show(s.code)} ${hex(s.code)}`} />
        <Readout k="Data LSB-first" v={frame.filter(b => b.kind === 'data').map(b => b.v).join('')} />
        <Readout k={rx.ok ? "Received" : "Received (rejected)"} v={`${show(rx.code)} ${hex(rx.code)}`} hl tone={rx.ok ? 'ok' : 'bad'} />
        <Readout k="Bit time 1/baud" v={si(st.tbit, 's')} />
        <Readout k={`Frame (${st.nbits} bits)`} v={si(st.tframe, 's')} />
        <Readout k="Max throughput" v={`${si(st.bytesPerSec, 'B/s')} (${(st.efficiency * 100).toFixed(0)}%)`} />
        <Readout k="Stop-bit sample offset" v={`${(drift * 100).toFixed(1)}% bit`} tone={Math.abs(drift) < 0.3 ? 'ok' : Math.abs(drift) < 0.5 ? 'warn' : 'bad'} />
        <Readout k="Mismatch tolerance" v={`−${(tol.n * 100).toFixed(1)} / +${(tol.p * 100).toFixed(1)} %`} />
      </Readouts>
      <EqBox>{String.raw`\text{offset}_j \approx \underbrace{\tfrac{\phi}{16}}_{\text{edge detect}} - \frac{\Delta f}{f}\left(j+\tfrac12\right)\ \Rightarrow\ \left|\tfrac{\Delta f}{f}\right|_{max} \approx \frac{\tfrac12 - \tfrac{1}{16}}{N_{bits}-\tfrac12} = \frac{0.4375}{${(st.nbits - (s.stop - 1)) - 0.5}} = ${(0.4375 / (st.nbits - (s.stop - 1) - 0.5) * 100).toFixed(2)}\%`}</EqBox>
      <Plot series={[{ x: offs.map(o => o.x), y: offs.map(o => o.y), label: 'centre-sample offset from bit centre', color: 'accent', points: true }]}
        xLabel="Bit index (0 = start)" yLabel="Offset (% of bit)" height={190} xRange={[0, Math.max(1, lastIdx)]} yRange={[-70, 70]}
        xTickFormat={v => Number.isInteger(v) ? (v === 0 ? 'S' : v <= 8 ? 'D' + (v - 1) : v === lastIdx ? 'Stop' : 'P') : ''}
        hlines={[{ at: 50, label: 'next bit', color: 'red' }, { at: -50, label: 'previous bit', color: 'red' }, { at: 50 - 100 / 16, color: 'orange' }, { at: -50 + 100 / 16, color: 'orange' }]} />
      <Note>A real receiver re-synchronises on every start edge, so drift only accumulates across one frame. That is why UARTs tolerate a few percent of clock error but a long synchronous stream would not.</Note>
    </SimShell>
  );
}
