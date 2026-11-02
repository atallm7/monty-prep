// Register map decoder: field extraction with mask/shift, read-modify-write composition and the C code for it.
import { useMemo, useState, KeyboardEvent as RKE, CSSProperties } from 'react';
import { SimShell, SimProps, Select, Toggle, Readout, Readouts, EqBox, Note, RegionBadge } from '../kit';
import { PRESETS, DEFAULT_VALUE, Field, getField, setField, fieldMask, fieldWidth, checkFields, parseHex, cWrite, hex, bitOf } from '../models/register-decoder';

const COLORS = ['var(--d-accent)', 'var(--d-orange)', 'var(--d-green)', 'var(--d-purple)', 'var(--d-blue)', 'var(--d-red)'];
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };
const th: CSSProperties = { padding: '4px 6px', fontWeight: 600, fontSize: 11.5, color: 'var(--text-2)', textAlign: 'left', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '3px 6px', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'middle' };

export default function RegisterDecoder({ params }: SimProps) {
  const p0 = PRESETS[params.preset] ? String(params.preset) : 'ctrl';
  const v0 = (name: string, useParam: boolean) => (useParam && params.value !== undefined && parseHex(String(params.value)) !== null ? parseHex(String(params.value))! : parseHex(DEFAULT_VALUE[name])!) % 2 ** PRESETS[name].width;
  const [presetName, setPresetName] = useState(p0);
  const [fields, setFields] = useState<Field[]>(PRESETS[p0].fields);
  const [value, setValue] = useState(() => v0(p0, true));
  const [text, setText] = useState(() => hex(v0(p0, true), PRESETS[p0].width));
  const [last, setLast] = useState<{ field: Field; before: number; v: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const reg = PRESETS[presetName]; const W = reg.width;

  const load = (name: string, useParam = false) => { setPresetName(name); setFields(PRESETS[name].fields); const v = v0(name, useParam); setValue(v); setText(hex(v, PRESETS[name].width)); setLast(null); };
  const apply = (v: number) => { setValue(v); setText(hex(v, W)); };
  const onText = (s: string) => { setText(s); const v = parseHex(s); if (v !== null) setValue(v % 2 ** W); };
  const flipBit = (k: number) => { const f = fields.find(f => k >= f.lsb && k <= f.msb); const nv = bitOf(value, k) ? value - 2 ** k : value + 2 ** k; if (f) setLast({ field: f, before: value, v: getField(nv, f) }); apply(nv); };
  const writeField = (f: Field, fv: number) => { const nv = setField(value, f, fv); setLast({ field: f, before: value, v: getField(nv, f) }); apply(nv); };
  const kb = (fn: () => void) => (e: RKE) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

  const chk = useMemo(() => checkFields(fields, W), [fields, W]);
  const ownerIdx = (k: number) => fields.findIndex(f => k >= f.lsb && k <= f.msb && f.msb < W);
  const rows = W === 32 ? 2 : 1; const perRow = W / rows;
  const valid = parseHex(text) !== null;
  const code = last ? cWrite(reg.name, last.field, last.v, W) : null;
  const lastMask = last ? fieldMask(last.field) : 0;
  const rsvdTouched = fields.some(f => f.access === 'RSVD' && getField(value, f) !== 0);

  const updField = (i: number, patch: Partial<Field>) => setFields(fs => fs.map((f, k) => k === i ? { ...f, ...patch } : f));

  return (
    <SimShell title="Register map decoder" onReset={() => { load(p0, true); setEditing(false); }}
      tryThis={<>in <b>TIMx_CTRL</b>, set PRESCALE to 10 using the field editor and watch the C read-modify-write: only bits 7:4 change because the old value is ANDed with <code>~mask</code> first. Then load <b>ACCEL_CONFIG</b> and set AFS_SEL to ±4 g: the register byte becomes 0x08 (1 &lt;&lt; 3). Click a reserved bit and note the warning.</>}
      controls={<>
        <Select label="Register preset" value={presetName} onChange={n => load(n)} options={[{ value: 'ctrl', label: 'TIMx_CTRL (32-bit control)' }, { value: 'status', label: 'UART_SR (16-bit status)' }, { value: 'imu-config', label: 'ACCEL_CONFIG (8-bit IMU)' }]} />
        <label className="ctl"><span className="ctl-head"><span className="ctl-label">Register value (hex)</span></span>
          <input className="input" style={{ height: 34, ...mono, fontSize: 15, borderColor: valid ? undefined : 'var(--bad)' }} value={text} onChange={e => onText(e.target.value)} onBlur={() => setText(hex(value, W))} aria-label="Register value (hex)" spellCheck={false} />
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => { apply(reg.reset); setLast(null); }}>Reset value ({hex(reg.reset, W)})</button>
          <button className="btn btn-sm" onClick={() => { apply(0); setLast(null); }}>All 0</button>
        </div>
        <Toggle label="Edit field definitions" checked={editing} onChange={setEditing} />
        <Note>Click bits to flip them, or type a new value into a field. The field value is <code>(reg &amp; mask) &gt;&gt; lsb</code>; writing a field is a read-modify-write that preserves every other bit.</Note>
      </>}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <b style={mono}>{reg.name}</b><span className="small muted">offset {hex(reg.addr, reg.addr > 0xFFFF ? 32 : 8)} · {W}-bit · reset {hex(reg.reset, W)}</span>
        <span style={{ flex: 1 }} /><span style={{ ...mono, fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{hex(value, W)}</span>
      </div>
      {/* bit diagram */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: rows }, (_, row) => {
          const hi = W - 1 - row * perRow, lo = hi - perRow + 1;
          // field bands within this row
          const bands = fields.map((f, i) => ({ f, i, a: Math.min(f.msb, hi), b: Math.max(f.lsb, lo) })).filter(x => x.a >= x.b && x.f.msb < W);
          return <div key={row} style={{ display: 'grid', gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`, gap: 2, rowGap: 3 }}>
            {bands.map(({ f, i, a, b }) => <div key={'b' + i} style={{ gridRow: 1, gridColumn: `${hi - a + 1} / ${hi - b + 2}`, fontSize: 11, fontWeight: 650, textAlign: 'center', color: COLORS[i % COLORS.length], borderBottom: `3px solid ${COLORS[i % COLORS.length]}`, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', opacity: f.access === 'RSVD' ? 0.6 : 1 }} title={`${f.name} [${f.msb}:${f.lsb}]`}>{f.name}</div>)}
            {Array.from({ length: perRow }, (_, j) => { const k = hi - j; return <div key={'n' + k} style={{ gridRow: 2, gridColumn: j + 1, fontSize: 9.5, textAlign: 'center', color: 'var(--text-3)', ...mono }}>{k}</div>; })}
            {Array.from({ length: perRow }, (_, j) => {
              const k = hi - j; const b = bitOf(value, k); const oi = ownerIdx(k); const col = oi >= 0 ? COLORS[oi % COLORS.length] : 'var(--d-muted)';
              const changed = last && k >= last.field.lsb && k <= last.field.msb && bitOf(last.before, k) !== b;
              return <span key={'v' + k} role="button" tabIndex={0} aria-label={`bit ${k} = ${b}; press to flip`} onClick={() => flipBit(k)} onKeyDown={kb(() => flipBit(k))}
                style={{ gridRow: 3, gridColumn: j + 1, textAlign: 'center', padding: '5px 0', borderRadius: 5, cursor: 'pointer', ...mono, fontWeight: 700, fontSize: 14, userSelect: 'none',
                  background: b ? col : 'var(--surface-2)', color: b ? 'var(--d-bg)' : 'var(--text-3)', border: `1px solid ${changed ? 'var(--d-red)' : oi >= 0 ? col : 'var(--border)'}`, outline: changed ? '2px solid var(--d-red)' : undefined, outlineOffset: -1 }}>{b}</span>;
            })}
          </div>;
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chk.overlaps.length > 0 && <RegionBadge label={`Overlap: ${chk.overlaps.map(o => o.join('/')).join(', ')}`} color="bad" />}
        {chk.outOfRange.length > 0 && <RegionBadge label={`Invalid range: ${chk.outOfRange.join(', ')}`} color="bad" />}
        {chk.unassigned.length > 0 && <RegionBadge label={`${chk.unassigned.length} unassigned bit${chk.unassigned.length > 1 ? 's' : ''}`} color="info" />}
        {rsvdTouched && <RegionBadge label="Reserved bits are non-zero: write 0 / preserve on RMW" color="warn" />}
        {!chk.overlaps.length && !chk.outOfRange.length && !rsvdTouched && <RegionBadge label="Field map valid" color="ok" />}
      </div>
      {/* field table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead style={{ background: 'var(--surface-2)' }}><tr>
            <th style={th}>Field</th><th style={th}>Bits</th>{editing && <th style={th}></th>}<th style={th}>Mask</th><th style={th}>Binary</th><th style={th}>Dec</th><th style={th}>Write value</th><th style={th}>Meaning</th>
          </tr></thead>
          <tbody>{fields.map((f, i) => {
            const ok = f.msb < W && f.lsb >= 0 && f.msb >= f.lsb; const fv = ok ? getField(value, f) : 0; const w = ok ? fieldWidth(f) : 0; const col = COLORS[i % COLORS.length];
            return <tr key={i}>
              <td style={{ ...td, fontWeight: 650, color: col, whiteSpace: 'nowrap' }}>{editing ? <input className="input" style={{ height: 26, width: 96, ...mono, fontSize: 12.5 }} value={f.name} onChange={e => updField(i, { name: e.target.value.replace(/\s/g, '_') })} aria-label={`name of field ${i + 1}`} /> : f.name}
                {f.access && !editing && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4, fontWeight: 500 }}>{f.access}</span>}</td>
              <td style={{ ...td, ...mono, whiteSpace: 'nowrap' }}>{editing ? <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>[<input className="input" type="number" min={0} max={W - 1} style={{ height: 26, width: 50, ...mono, fontSize: 12.5 }} value={f.msb} onChange={e => updField(i, { msb: Math.round(Number(e.target.value)) || 0 })} aria-label={`msb of ${f.name}`} />:<input className="input" type="number" min={0} max={W - 1} style={{ height: 26, width: 50, ...mono, fontSize: 12.5 }} value={f.lsb} onChange={e => updField(i, { lsb: Math.round(Number(e.target.value)) || 0 })} aria-label={`lsb of ${f.name}`} />]</span> : f.msb === f.lsb ? `[${f.msb}]` : `[${f.msb}:${f.lsb}]`}</td>
              {editing && <td style={td}><button className="btn btn-sm btn-ghost" onClick={() => setFields(fs => fs.filter((_, k) => k !== i))} aria-label={`delete ${f.name}`}>✕</button></td>}
              <td style={{ ...td, ...mono, fontSize: 12 }}>{ok ? hex(fieldMask(f), W) : '—'}</td>
              <td style={{ ...td, ...mono }}>{ok ? fv.toString(2).padStart(w, '0') : '—'}</td>
              <td style={{ ...td, ...mono, fontWeight: 700 }}>{ok ? fv : '—'}</td>
              <td style={td}>{ok && f.access !== 'RSVD' && f.access !== 'RO' ? (f.enums
                ? <select className="input" style={{ height: 28, fontSize: 12.5, maxWidth: 150 }} value={fv} onChange={e => writeField(f, Number(e.target.value))} aria-label={`write ${f.name}`}>
                    {Array.from({ length: 2 ** w }, (_, v) => <option key={v} value={v}>{v}{f.enums![v] ? ` · ${f.enums![v]}` : ''}</option>)}</select>
                : <input className="input" type="number" min={0} max={2 ** w - 1} style={{ height: 28, width: 90, ...mono, fontSize: 12.5 }} value={fv} onChange={e => writeField(f, Math.max(0, Math.min(2 ** w - 1, Math.round(Number(e.target.value)) || 0)))} aria-label={`write ${f.name}`} />)
                : <span className="small muted">{f.access === 'RO' ? 'read-only' : f.access === 'RSVD' ? 'reserved' : '—'}</span>}</td>
              <td style={{ ...td, fontSize: 12.5, color: 'var(--text-2)', minWidth: 120 }}>{f.enums?.[fv] ? <b style={{ color: 'var(--text)' }}>{f.enums[fv]}</b> : null}{f.enums?.[fv] ? ' · ' : ''}{f.name === 'PRESCALE' ? `÷${2 ** fv} · ` : ''}{f.desc}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {editing && <div style={{ display: 'flex', gap: 6 }}><button className="btn btn-sm" onClick={() => { const free = chk.unassigned; const lsb = free.length ? free[0] : 0; setFields(fs => [...fs, { name: 'NEW' + fs.length, msb: lsb, lsb, access: 'RW' }]); }}>+ Add field</button></div>}

      {last && code ? <>
        <EqBox>{String.raw`\underbrace{\texttt{${hex(last.before, W)}}}_{\text{old}}\ \&\ \sim\!\underbrace{\texttt{${hex(lastMask, W)}}}_{\text{mask}}\ \big|\ (${last.v} \ll ${last.field.lsb}) = \texttt{${hex(value, W)}}`}</EqBox>
        <pre style={{ ...mono, fontSize: 12.5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', margin: 0, overflowX: 'auto', whiteSpace: 'pre' }}>{`${code.defines}\n\n/* write ${last.field.name} = ${last.v} (read-modify-write) */\n${code.write}\n/* same thing inline */\n${code.inline}\n/* read it back */\n${code.read}`}</pre>
      </> : <EqBox>{String.raw`\text{field} = (\text{reg}\ \&\ \text{mask}) \gg \text{lsb},\qquad \text{mask} = (2^{\,msb-lsb+1}-1) \ll \text{lsb}`}</EqBox>}
      <Readouts>
        <Readout k="Register" v={hex(value, W)} hl />
        <Readout k="Decimal" v={value.toLocaleString('en-US')} />
        {last && <Readout k={`Changed bits (${last.field.name})`} v={hex(Math.abs(value - last.before) ? xor(value, last.before) : 0, W)} />}
        <Readout k="Set bits" v={Array.from({ length: W }, (_, k) => bitOf(value, k)).reduce((a, b) => a + b, 0)} />
      </Readouts>
      {fields.some(f => f.access === 'W1C') && <Note><b>W1C</b> (write-1-to-clear) flags are cleared by writing 1 to that bit, so never do a plain read-modify-write on a status register: writing back a 1 you just read clears an event you haven't handled yet. Write only the mask of the flag you want to clear.</Note>}
    </SimShell>
  );
}
function xor(a: number, b: number) { let r = 0; for (let k = 0; k < 32; k++) if (bitOf(a, k) !== bitOf(b, k)) r += 2 ** k; return r; }
