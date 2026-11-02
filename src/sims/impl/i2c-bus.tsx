// I²C transaction builder: START, address, R/W̄, ACK/NACK, data, repeated START, STOP, clock stretching.
import { useMemo, useState, KeyboardEvent } from 'react';
import { SimShell, SimProps, Slider, Seg as SegCtl, Select, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import { buildTxn, waveform, txnStats, addrByte, reserved, Seg } from '../models/i2c-bus';

const hx = (v: number, w = 2) => '0x' + v.toString(16).toUpperCase().padStart(w, '0');
const parseHex = (v: any) => { const s = String(v ?? '').trim(); if (!s) return NaN; const x = parseInt(s.replace(/^0x/i, ''), 16); return /^(0x)?[0-9a-f]+$/i.test(s) ? x : NaN; };
const parseList = (s: string) => s.split(/[\s,;]+/).filter(Boolean).map(parseHex).filter(v => isFinite(v)).map(v => v & 0xff).slice(0, 6);

const FIELD_COLOR: Record<string, string> = { start: 'var(--d-orange)', rstart: 'var(--d-orange)', stop: 'var(--d-orange)', addr: 'var(--d-accent)', rw: 'var(--d-purple)', ack: 'var(--d-green)', data: 'var(--d-blue)', reg: 'var(--d-blue)', stretch: 'var(--d-red)' };
const WHO_COLOR = { C: 'var(--d-accent)', T: 'var(--d-green)', R: 'var(--d-muted)' };

function explain(s: Seg, mode: string): string {
  const who = s.driver === 'C' ? 'controller' : 'target';
  const other = s.driver === 'C' ? 'target' : 'controller';
  switch (s.field) {
    case 'start': return 'START: the controller pulls SDA low while SCL is still high. This is the only time (with STOP and Sr) that SDA may change while SCL is high, so every device can recognise it.';
    case 'rstart': return 'Repeated START (Sr): instead of a STOP, the controller issues a new START. The bus stays owned, so no other controller can win arbitration in between, and the direction can change from write to read.';
    case 'stop': return 'STOP: with SCL high, the controller releases SDA and the pull-up makes it rise. The bus is now free.';
    case 'stretch': return 'Clock stretching: after the ACK the target holds SCL low (open-drain wired-AND) until it is ready. The controller sees that SCL has not risen and waits. Every controller must support this, or it will clock data the target is not ready for.';
    case 'addr': return `Address bit ${s.bitName}: the controller ${s.value ? 'releases SDA (the pull-up gives 1)' : 'pulls SDA low (0)'} while SCL is low. Every target samples it on the SCL rising edge and compares it with its own address.`;
    case 'rw': return `R/W̄ = ${s.value}: ${s.value ? 'read. After the ACK the target drives the data bytes' : 'write. The controller keeps driving SDA for the data bytes'}. The 8-bit "address byte" on the wire is (addr << 1) | R/W̄.`;
    case 'ack': return s.nack
      ? (s.driver === 'T' ? 'NACK on the address: no target pulled SDA low, so the pull-up leaves it high. The controller must issue a STOP (or Sr) now.' : 'NACK from the controller on the last read byte: it leaves SDA high so the target stops driving data and releases SDA for the STOP.')
      : `ACK: the receiver (${who}) pulls SDA low during the 9th clock. The ${other} has released SDA, so the line is open-drain shared.`;
    default: return `${mode === 'read' || s.driver === 'T' ? 'Data from the target' : 'Data from the controller'}: bit ${s.bitName} = ${s.value}, driven by the ${who} (MSB first). It changes only while SCL is low and is sampled while SCL is high.`;
  }
}

export default function I2cBus({ params }: SimProps) {
  const a0 = parseHex(params.address ?? '0x48');
  const d0 = Array.isArray(params.data) ? params.data.map(parseHex).filter((v: number) => isFinite(v)).map((v: number) => v & 0xff) : typeof params.data === 'string' ? parseList(params.data) : [0x12, 0x34];
  const init = {
    address: isFinite(a0) ? a0 & 0x7f : 0x48,
    mode: (params.rw === 'r' ? 'read' : 'write') as 'write' | 'read' | 'wr',
    data: d0.length ? d0 : [0x12, 0x34], reg: 0x00,
    stretch: Boolean(params.stretch ?? false), stretchBits: 3, present: true, fscl: 100e3, sel: 9,
  };
  const [s, set] = useState(init);
  const [dataTxt, setDataTxt] = useState(init.data.map(v => hx(v)).join(' '));
  const [addrTxt, setAddrTxt] = useState(hx(init.address));
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const segs = useMemo(() => buildTxn(s), [s.address, s.mode, s.data, s.reg, s.stretch, s.stretchBits, s.present]);
  const wv = useMemo(() => waveform(segs), [segs]);
  const st = txnStats(segs, s.fscl);
  const sel = Math.min(s.sel, segs.length - 1);

  // ---- drawing ----
  const total = segs.reduce((a, x) => a + x.len, 0) + 2;
  const Lm = 50, bp = Math.max(15, Math.min(22, (700 - Lm - 10) / total)), W = Lm + total * bp + 10;
  const X = (t: number) => Lm + (t + 1) * bp;
  const yBand = 16, ySclH = 52, ySclL = 76, ySdaH = 104, ySdaL = 128, yVal = 144, H = 186;
  // groups of bits for the top band
  const groups: { from: number; to: number; label: string; color: string }[] = [];
  segs.forEach((g, i) => {
    const t0 = wv.segStart[i], t1 = t0 + g.len;
    const label = g.field === 'start' ? 'S' : g.field === 'rstart' ? 'Sr' : g.field === 'stop' ? 'P' : g.field === 'ack' ? (g.nack ? 'N' : 'A') : g.field === 'rw' ? (g.value ? 'R' : 'W̄') : g.field === 'stretch' ? 'stretch' : '';
    const last = groups[groups.length - 1];
    if ((g.field === 'addr' || g.field === 'data' || g.field === 'reg') && last && last.color === FIELD_COLOR[g.field] && last.to === t0 && !['A', 'N', 'S', 'Sr', 'P', 'R', 'W̄', 'stretch'].includes(last.label)) { last.to = t1; return; }
    groups.push({ from: t0, to: t1, label, color: FIELD_COLOR[g.field] });
  });
  // byte labels
  let gi = 0; let rx = 0;
  const readBytes = s.mode === 'write' ? [] : s.data.length ? s.data : [0xff];
  for (const g of groups) if (!g.label) {
    const segIdx = wv.segStart.findIndex(t => t === g.from); const sg = segs[segIdx];
    if (sg.field === 'addr') g.label = `addr ${hx(s.address)}`;
    else if (sg.field === 'reg') g.label = `reg ${hx(s.reg)}`;
    else if (sg.driver === 'T') g.label = `data ${hx(readBytes[rx++] ?? 0xff)}`;
    else g.label = `data ${hx(s.data[gi++] ?? 0)}`;
  }
  const lines: JSX.Element[] = [];
  for (let i = 0; i < wv.t.length - 1; i++) {
    const xa = X(wv.t[i]), xb = X(wv.t[i + 1]);
    // SCL
    const stretching = segs.some((g, k) => g.field === 'stretch' && wv.segStart[k] <= wv.t[i] && wv.t[i] < wv.segStart[k] + g.len);
    const yc = wv.scl[i] ? ySclH : ySclL;
    if (i > 0 && wv.scl[i] !== wv.scl[i - 1]) lines.push(<line key={'cv' + i} x1={xa} x2={xa} y1={ySclH} y2={ySclL} stroke="var(--d-ink)" strokeWidth={1.8} />);
    lines.push(<line key={'c' + i} x1={xa} x2={xb} y1={yc} y2={yc} stroke={stretching ? 'var(--d-green)' : 'var(--d-ink)'} strokeWidth={stretching ? 3 : 1.8} />);
    // SDA
    const yd = wv.sda[i] ? ySdaH : ySdaL; const who = wv.sdaDriver[i];
    if (i > 0 && wv.sda[i] !== wv.sda[i - 1]) lines.push(<line key={'dv' + i} x1={xa} x2={xa} y1={ySdaH} y2={ySdaL} stroke={WHO_COLOR[who]} strokeWidth={1.8} />);
    lines.push(<line key={'d' + i} x1={xa} x2={xb} y1={yd} y2={yd} stroke={WHO_COLOR[who]} strokeWidth={who === 'R' ? 1.6 : 2.6} strokeDasharray={who === 'R' ? '5 3' : undefined} />);
  }
  const onKey = (i: number) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); upd('sel')(i); } };

  const fieldSel = segs[sel];
  const busy = st.duration;
  return (
    <SimShell title="I²C transaction builder" onReset={() => { set(init); setDataTxt(init.data.map(v => hx(v)).join(' ')); setAddrTxt(hx(init.address)); }}
      tryThis={<>(1) Switch to <i>Write → Read (Sr)</i>, the usual way to read a sensor register. The controller writes the register pointer, then sends a repeated START with R/W̄ = 1 without releasing the bus. Click the last ACK slot: the controller NACKs the final byte. (2) Untick <i>Target present</i>: nobody pulls SDA low in the 9th clock, so the pull-up gives a NACK and the controller has to STOP. (3) Turn on clock stretching and watch the SCL low time grow (green) while the clock count stays the same.</>}
      controls={<>
        <label className="ctl"><span className="ctl-head"><span className="ctl-label">7-bit address</span><span className="ctl-val">{reserved(s.address) ? 'reserved!' : (s.address >>> 0).toString(2).padStart(7, '0')}</span></span>
          <input className="input" aria-label="7-bit address" value={addrTxt} style={{ height: 32, fontFamily: 'var(--font-mono)' }}
            onChange={e => { setAddrTxt(e.target.value); const v = parseHex(e.target.value); if (isFinite(v)) upd('address')(v & 0x7f); }} /></label>
        <SegCtl label="Transaction" value={s.mode} options={[{ value: 'write', label: 'Write' }, { value: 'read', label: 'Read' }, { value: 'wr', label: 'Write → Read (Sr)' }]} onChange={upd('mode')} />
        {s.mode === 'wr' && <label className="ctl"><span className="ctl-head"><span className="ctl-label">Register pointer</span></span>
          <input className="input" aria-label="Register pointer" defaultValue={hx(s.reg)} style={{ height: 32, fontFamily: 'var(--font-mono)' }} onChange={e => { const v = parseHex(e.target.value); if (isFinite(v)) upd('reg')(v & 0xff); }} /></label>}
        <label className="ctl"><span className="ctl-head"><span className="ctl-label">{s.mode === 'write' ? 'Data bytes written' : 'Bytes returned by target'}</span><span className="ctl-val">{s.data.length} B</span></span>
          <input className="input" aria-label="Data bytes" value={dataTxt} style={{ height: 32, fontFamily: 'var(--font-mono)' }}
            onChange={e => { setDataTxt(e.target.value); const l = parseList(e.target.value); if (l.length) upd('data')(l); }} /></label>
        <Toggle label="Target present (ACKs its address)" checked={s.present} onChange={upd('present')} />
        <Toggle label="Clock stretching by target" checked={s.stretch} onChange={upd('stretch')} />
        {s.stretch && <Slider label="Stretch per byte" value={s.stretchBits} min={0.5} max={10} step={0.5} format={v => `${v} bit times`} onChange={upd('stretchBits')} />}
        <Select label="Bus speed" value={String(s.fscl)} options={[{ value: '100000', label: 'Standard-mode 100 kHz' }, { value: '400000', label: 'Fast-mode 400 kHz' }, { value: '1000000', label: 'Fast-mode Plus 1 MHz' }]} onChange={v => upd('fscl')(Number(v))} />
      </>}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegionBadge label={!s.present ? 'Address NACK: no target' : s.mode === 'wr' ? 'Combined write/read with repeated START' : s.mode === 'read' ? 'Read transaction' : 'Write transaction'} color={s.present ? 'accent' : 'bad'} />
        {reserved(s.address) && <RegionBadge label="Reserved address range (0x00–0x07, 0x78–0x7F)" color="warn" />}
        <span style={{ fontSize: 12.5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: WHO_COLOR.C }}>━ controller pulls low</span><span style={{ color: WHO_COLOR.T }}>━ target pulls low / stretches</span><span style={{ color: WHO_COLOR.R }}>┅ released (pull-up)</span>
        </span>
      </div>
      <div className="figure-body" style={{ padding: '6px 0', justifyContent: 'flex-start' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="I2C SDA and SCL waveforms" style={{ width: W > 720 ? W : '100%', minWidth: Math.min(W, 600), height: 'auto', flex: 'none' }}>
          {groups.map((g, i) => <g key={'g' + i}>
            <rect x={X(g.from) + 1} y={yBand} width={Math.max(0, X(g.to) - X(g.from) - 2)} height={18} rx={4} fill={g.color} opacity={0.14} />
            <text x={(X(g.from) + X(g.to)) / 2} y={yBand + 13} textAnchor="middle" fontSize={g.label.length > 3 ? 10.5 : 11} fontWeight={650} fill={g.color}>{g.label}</text>
          </g>)}
          <text x={6} y={(ySclH + ySclL) / 2 + 4} fontSize={12} fontWeight={600} fill="var(--d-ink)">SCL</text>
          <text x={6} y={(ySdaH + ySdaL) / 2 + 4} fontSize={12} fontWeight={600} fill="var(--d-ink)">SDA</text>
          {segs.map((g, i) => (g.value !== undefined || g.field !== 'stretch') ? <rect key={'hit' + i} x={X(wv.segStart[i])} y={yBand - 4} width={g.len * bp} height={yVal - yBand + 10} rx={3}
            fill={i === sel ? 'var(--d-accent)' : 'transparent'} opacity={i === sel ? 0.12 : 1} role="button" tabIndex={0} aria-label={`bit ${i}: ${g.bitName ?? g.field}`} onClick={() => upd('sel')(i)} onKeyDown={onKey(i)} style={{ cursor: 'pointer' }} />
            : <rect key={'hit' + i} x={X(wv.segStart[i])} y={yBand - 4} width={g.len * bp} height={yVal - yBand + 10} fill={i === sel ? 'var(--d-accent)' : 'transparent'} opacity={0.12} role="button" tabIndex={0} aria-label="clock stretch" onClick={() => upd('sel')(i)} onKeyDown={onKey(i)} style={{ cursor: 'pointer' }} />)}
          <g style={{ pointerEvents: 'none' }}>{lines}</g>
          {segs.map((g, i) => g.value !== undefined ? <text key={'v' + i} x={X(wv.segStart[i] + 0.62)} y={yVal + 4} textAnchor="middle" fontSize={10.5} fill={g.driver === 'T' ? 'var(--d-green)' : 'var(--d-accent)'} style={{ pointerEvents: 'none' }}>{g.value}</text> : null)}
          {segs.map((g, i) => g.value !== undefined ? <text key={'n' + i} x={X(wv.segStart[i] + 0.62)} y={yVal + 18} textAnchor="middle" fontSize={8.5} fill="var(--d-muted)" style={{ pointerEvents: 'none' }}>{(g.bitName ?? '').replace('ACK', 'A').replace('NACK', 'N').replace(/^NA$/, 'N')}</text> : null)}
          <text x={6} y={yVal + 4} fontSize={10} fill="var(--d-muted)">bit</text>
          <text x={Lm} y={H - 6} fontSize={10.5} fill="var(--d-muted)">Click any bit slot to see who drives SDA. SDA changes only while SCL is low and is sampled while SCL is high.</text>
        </svg>
      </div>
      <div className="eq-box" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
        <b style={{ color: fieldSel.field === 'stretch' ? 'var(--d-green)' : FIELD_COLOR[fieldSel.field] }}>{fieldSel.field === 'stretch' ? 'Clock stretch' : fieldSel.bitName ?? fieldSel.field.toUpperCase()}</b>
        {fieldSel.driver && fieldSel.field !== 'stretch' && <> · driven by <b style={{ color: fieldSel.value === 1 ? WHO_COLOR.R : WHO_COLOR[fieldSel.driver] }}>{fieldSel.value === 1 ? `nobody (${fieldSel.driver === 'C' ? 'controller' : 'target'} releases, pull-up)` : fieldSel.driver === 'C' ? 'controller' : 'target'}</b></>}
        <div>{explain(fieldSel, s.mode)}</div>
      </div>
      <Readouts>
        <Readout k="Address byte(s) on wire" v={s.mode === 'wr' ? `${hx(addrByte(s.address, false))}, ${hx(addrByte(s.address, true))}` : hx(addrByte(s.address, s.mode === 'read'))} hl />
        <Readout k="SCL clocks" v={String(st.clocks)} />
        <Readout k="Transaction time" v={si(busy, 's')} />
        {s.stretch && <Readout k="Of which stretched" v={si(st.stretchTime, 's')} tone="warn" />}
        <Readout k="Payload bytes" v={String(st.dataBytes)} />
        <Readout k="Bus efficiency" v={(st.efficiency * 100).toFixed(0) + '%'} />
        <Readout k="ACKs / NACKs" v={`${st.acked} / ${segs.filter(x => x.nack).length}`} />
      </Readouts>
      <EqBox>{String.raw`t \approx \frac{1_{S} + 9\,(1 + N_{bytes})${s.mode === 'wr' ? ' + 1.5_{Sr} + 9' : ''} + 1.5_{P}${s.stretch ? ` + ${Math.round(st.stretchTime * s.fscl * 10) / 10}_{stretch}` : ''}}{f_{SCL}} = ${si(busy, '\\text{s}')}\ \text{at}\ ${si(s.fscl, '\\text{Hz}')}`}</EqBox>
      <Note>Both lines are open-drain with pull-ups: a device can only pull low or let go. That is what makes ACK, clock stretching and multi-controller arbitration work (wired-AND). See the I²C pull-up sim for rise-time limits.</Note>
    </SimShell>
  );
}
