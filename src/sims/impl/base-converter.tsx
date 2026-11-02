// Number bases, two's complement and endianness. Model: models/base-converter.ts
import { useMemo, useState, KeyboardEvent as RKE, CSSProperties } from 'react';
import { SimShell, SimProps, Seg, Readout, Readouts, EqBox, Note, RegionBadge } from '../kit';
import { parseValue, encode, divisionSteps, expansion, twosSteps, memoryLayout, hex2 } from '../models/base-converter';

const BYTE_COLORS = ['var(--d-accent)', 'var(--d-orange)', 'var(--d-green)', 'var(--d-purple)'];
const mono: CSSProperties = { fontFamily: 'var(--font-mono)' };
const th: CSSProperties = { padding: '3px 8px', fontWeight: 600, fontSize: 12, color: 'var(--text-2)', textAlign: 'right', borderBottom: '1px solid var(--border)' };
const td: CSSProperties = { padding: '2px 8px', textAlign: 'right', ...mono, fontSize: 13 };
const group = (s: string, n: number) => s.replace(new RegExp(`(.{${n}})(?=.)`, 'g'), '$1 ');
// group from the right (so the leftmost group is the short one)
const groupR = (s: string, n: number) => { const out: string[] = []; for (let i = s.length; i > 0; i -= n) out.unshift(s.slice(Math.max(0, i - n), i)); return out.join(' '); };

export default function BaseConverter({ params }: SimProps) {
  const init = { text: String(params.value ?? '0xBEEF'), bits: [8, 16, 32].includes(Number(params.bits)) ? Number(params.bits) : 16, view: params.view === 'endian' ? 'endian' : 'convert' as 'convert' | 'endian' };
  const [text, setText] = useState(init.text);
  const [bits, setBits] = useState(init.bits);
  const [view, setView] = useState<'convert' | 'endian'>(init.view);
  const [work, setWork] = useState<'hex' | 'bin' | 'expand'>('hex');
  const [addr, setAddr] = useState(0x2000);

  const parsed = useMemo(() => parseValue(text), [text]);
  const value = parsed.ok ? parsed.value : 0;
  const e = useMemo(() => encode(value, bits), [value, bits]);
  const setFromU = (u: number) => setText('0x' + u.toString(16).toUpperCase().padStart(bits / 4, '0'));
  const flip = (k: number) => setFromU(Math.floor(e.u / 2 ** k) % 2 ? e.u - 2 ** k : e.u + 2 ** k);
  const kb = (fn: () => void) => (ev: RKE) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fn(); } };

  const divBase = work === 'bin' ? 2 : 16;
  const steps = useMemo(() => divisionSteps(e.u, divBase), [e.u, divBase]);
  const expDigits = parsed.ok && parsed.base !== 10 && !parsed.neg ? { digits: parsed.digits, base: parsed.base } : { digits: e.hex, base: 16 };
  const exp = useMemo(() => expansion(expDigits.digits, expDigits.base), [expDigits.digits, expDigits.base]);
  const tw = twosSteps(value, bits);
  const mem = memoryLayout(e.u, bits, addr);
  const nBytes = bits / 8;
  const rows = bits === 32 ? 2 : 1; const perRow = bits / rows;
  const status = !parsed.ok ? { l: 'Invalid input', c: 'bad' as const } : !e.fitsUnsigned && !e.fitsSigned ? { l: `Overflow: does not fit in ${bits} bits (wrapped)`, c: 'bad' as const } : value < 0 ? { l: `Negative: stored as two's complement`, c: 'info' as const } : e.msb ? { l: 'MSB set: signed and unsigned readings differ', c: 'warn' as const } : { l: 'MSB clear: signed = unsigned', c: 'ok' as const };

  return (
    <SimShell title="Number bases, two's complement & endianness" onReset={() => { setText(init.text); setBits(init.bits); setView(init.view); setWork('hex'); setAddr(0x2000); }}
      tryThis={<>type <b>-1</b> and switch between 8, 16 and 32 bits: the pattern is all ones every time (0xFF, 0xFFFF, 0xFFFFFFFF). Then type <b>128</b> with 8 bits: it fits as unsigned but reads as −128 signed. In <b>Endianness</b> view, enter <b>0x12345678</b> with 32 bits: a little-endian CPU (x86, most ARM MCUs) stores 0x78 at the lowest address.</>}
      controls={<>
        <label className="ctl"><span className="ctl-head"><span className="ctl-label">Value (0x…, 0b…, 0o…, decimal, may be negative)</span></span>
          <input className="input" style={{ height: 34, ...mono, fontSize: 15 }} value={text} onChange={ev => setText(ev.target.value)} aria-label="Value" spellCheck={false} />
          {!parsed.ok && <span className="small" style={{ color: 'var(--bad)' }}>{parsed.error}</span>}
          {parsed.ok && <span className="small muted">Read as base {parsed.base}{parsed.neg ? ', negative' : ''}</span>}
        </label>
        <Seg label="Word size" value={String(bits)} onChange={v => setBits(Number(v))} options={[{ value: '8', label: '8-bit' }, { value: '16', label: '16-bit' }, { value: '32', label: '32-bit' }]} />
        <Seg label="View" value={view} onChange={setView} options={[{ value: 'convert', label: 'Conversion' }, { value: 'endian', label: 'Endianness' }]} />
        {view === 'convert' && <Seg label="Show working" value={work} onChange={setWork} options={[{ value: 'hex', label: 'dec → hex' }, { value: 'bin', label: 'dec → bin' }, { value: 'expand', label: 'positional' }]} />}
        {view === 'endian' && <Seg label="Base address" value={String(addr)} onChange={v => setAddr(Number(v))} options={[{ value: String(0x2000), label: '0x2000' }, { value: String(0x20000100), label: '0x20000100' }]} />}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['0xBEEF', '175', '-1', '-128', '0x12345678', '0b1010'].map(v => <button key={v} className="btn btn-sm" onClick={() => setText(v)} style={mono}>{v}</button>)}
        </div>
        <Note>Click any bit in the bit field to flip it. Values that don't fit the word size are wrapped modulo 2<sup>n</sup>, exactly as a C cast to <code>uint{bits}_t</code> would.</Note>
      </>}>
      {/* bit field */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: rows }, (_, row) => {
          const hi = bits - 1 - row * perRow;
          return <div key={row} style={{ display: 'grid', gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`, gap: 2 }}>
            {Array.from({ length: perRow }, (_, j) => {
              const k = hi - j; const b = Math.floor(e.u / 2 ** k) % 2; const byte = Math.floor(k / 8); const isMsb = k === bits - 1, isLsb = k === 0;
              return <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: j > 0 && (k + 1) % 4 === 0 ? 3 : 0 }}>
                <span style={{ fontSize: 9.5, color: isMsb || isLsb ? 'var(--accent)' : 'var(--text-3)', fontWeight: isMsb || isLsb ? 700 : 400, ...mono }}>{isMsb ? 'MSB' : isLsb ? 'LSB' : k}</span>
                <span role="button" tabIndex={0} aria-label={`bit ${k} = ${b}; press to flip`} onClick={() => flip(k)} onKeyDown={kb(() => flip(k))}
                  style={{ width: '100%', textAlign: 'center', padding: '5px 0', borderRadius: 5, cursor: 'pointer', ...mono, fontSize: 15, fontWeight: 700, userSelect: 'none',
                    background: b ? (isMsb && e.msb ? 'var(--d-red)' : BYTE_COLORS[byte % 4]) : 'var(--surface-2)', color: b ? 'var(--d-bg)' : 'var(--text-3)',
                    border: `1px solid ${view === 'endian' ? BYTE_COLORS[byte % 4] : 'var(--border)'}` }}>{b}</span>
                {k % 4 === 0 && <span style={{ fontSize: 11, color: 'var(--text-2)', ...mono, fontWeight: 600 }} title="hex digit of this nibble">{(Math.floor(e.u / 2 ** k) % 16).toString(16).toUpperCase()}</span>}
                {k % 4 !== 0 && <span style={{ fontSize: 11 }}>&nbsp;</span>}
              </div>;
            })}
          </div>;
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><RegionBadge label={status.l} color={status.c} /></div>
      <Readouts>
        <Readout k="Hex" v={'0x' + groupR(e.hex, 4)} hl />
        <Readout k="Unsigned decimal" v={e.u.toLocaleString('en-US')} />
        <Readout k={`Signed (int${bits}_t)`} v={e.signed.toLocaleString('en-US').replace('-', '−')} tone={e.signed < 0 ? 'warn' : undefined} />
        <Readout k="Octal" v={'0o' + e.oct.replace(/^0+(?=.)/, '')} />
        <Readout k="Binary" v={<span style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{group(e.bin, 4)}</span>} />
        <Readout k={`Range (${bits}-bit)`} v={<span style={{ fontSize: 12 }}>u: 0…{(2 ** bits - 1).toLocaleString('en-US')}<br />s: −{(2 ** (bits - 1)).toLocaleString('en-US')}…{(2 ** (bits - 1) - 1).toLocaleString('en-US')}</span>} />
      </Readouts>

      {view === 'convert' && <>
        <EqBox>{e.msb
          ? String.raw`\text{signed} = -b_{${bits - 1}}\,2^{${bits - 1}} + \sum_{k=0}^{${bits - 2}} b_k 2^k = -${2 ** (bits - 1)} + ${e.u - 2 ** (bits - 1)} = ${e.signed}`
          : String.raw`N = \sum_{k} b_k\,2^k = ${e.u}\quad(\text{MSB}=0,\ \text{signed} = \text{unsigned})`}</EqBox>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {work !== 'expand' ? <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Repeated division by {divBase} (decimal {e.u} → base {divBase})</div>
            <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}><tr><th style={th}>n</th><th style={th}>÷ {divBase} = q</th><th style={th}>remainder</th><th style={th}>digit</th></tr></thead>
                <tbody>{steps.map((s, i) => <tr key={i}><td style={td}>{s.n}</td><td style={td}>{s.q}</td><td style={{ ...td, color: 'var(--accent)', fontWeight: 700 }}>{s.r}</td><td style={{ ...td, color: 'var(--text-3)' }}>{divBase === 16 ? `d${i} = ${s.r.toString(16).toUpperCase()}` : `b${i}`}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="small" style={{ marginTop: 4 }}>Read remainders bottom-up: <b style={mono}>{steps.map(s => s.r.toString(divBase).toUpperCase()).reverse().join('')}</b><sub>{divBase}</sub></div>
          </div> : <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Positional expansion of {expDigits.base === 16 ? '0x' : expDigits.base === 2 ? '0b' : '0o'}{expDigits.digits} (base {expDigits.base} → decimal)</div>
            <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)' }}><tr><th style={th}>digit</th><th style={th}>× {expDigits.base}^k</th><th style={th}>term</th></tr></thead>
                <tbody>{exp.map((t, i) => <tr key={i} style={{ opacity: t.d ? 1 : 0.5 }}><td style={td}>{t.d.toString(16).toUpperCase()}{expDigits.base === 16 && t.d > 9 ? ` (${t.d})` : ''}</td><td style={td}>{expDigits.base}^{t.k} = {(expDigits.base ** t.k).toLocaleString('en-US')}</td><td style={{ ...td, color: 'var(--accent)', fontWeight: 600 }}>{t.term.toLocaleString('en-US')}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="small" style={{ marginTop: 4 }}>Sum = <b style={mono}>{exp.reduce((a, t) => a + t.term, 0).toLocaleString('en-US')}</b><sub>10</sub></div>
          </div>}
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            {(() => {
              // Case 1: negative input -> |x|, invert, +1 gives the stored pattern.
              // Case 2: positive pattern with MSB set -> invert, +1 gives the magnitude of its signed reading.
              // Case 3: MSB clear -> show how −x would be stored.
              const decode = value >= 0 && e.msb === 1;
              const t = decode ? twosSteps(e.u, bits) : tw; const m = Math.abs(value) % 2 ** bits;
              return <>
                <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{decode ? `Decoding 0x${e.hex} as signed (${bits}-bit)` : value < 0 ? `Encoding ${value} in ${bits}-bit two's complement` : `How −${m} would be stored (${bits}-bit)`}</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', ...mono, fontSize: 12.5, lineHeight: 1.8, overflowX: 'auto' }}>
                  <div><span className="muted">{decode ? 'pattern' : '|x| = '}</span> {group(t.magBin, 4)}</div>
                  <div><span className="muted">invert </span> {group(t.inv, 4)}</div>
                  <div><span className="muted">+1 = &nbsp;</span> <b style={{ color: 'var(--accent)' }}>{group(t.plusOne, 4)}</b></div>
                  <div className="muted">{decode ? `= ${t.result} → signed value = −${t.result}` : `= 0x${t.result.toString(16).toUpperCase().padStart(bits / 4, '0')} = 2^${bits} − ${m} = ${t.result}`}</div>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>{decode ? 'MSB is 1, so the signed reading is negative; invert-and-add-one recovers its magnitude.' : value < 0 ? 'This is the pattern stored for your negative value.' : 'Negation in two\'s complement = invert all bits, add 1.'}</div>
              </>;
            })()}
          </div>
        </div>
      </>}

      {view === 'endian' && <>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {(['big', 'little'] as const).map(kind => <div key={kind} style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{kind === 'big' ? 'Big-endian (MSB first; network order, Motorola, SPI/I²C register dumps)' : 'Little-endian (LSB first; x86, ARM Cortex-M, RISC-V)'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {mem.map((m, i) => { const b = kind === 'big' ? m.big : m.little; const sig = kind === 'big' ? nBytes - 1 - i : i; // byte significance (0 = LSB)
                return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...mono, fontSize: 12, color: 'var(--text-3)', width: 92, textAlign: 'right' }}>0x{m.addr.toString(16).toUpperCase().padStart(4, '0')}</span>
                  <span style={{ ...mono, fontSize: 15, fontWeight: 700, padding: '4px 14px', borderRadius: 6, border: `2px solid ${BYTE_COLORS[sig % 4]}`, color: BYTE_COLORS[sig % 4], minWidth: 56, textAlign: 'center' }}>{hex2(b)}</span>
                  <span className="small muted">byte {sig}{sig === nBytes - 1 ? ' (MSB)' : sig === 0 ? ' (LSB)' : ''}</span>
                </div>; })}
            </div>
          </div>)}
        </div>
        <EqBox>{String.raw`\texttt{0x${e.hex}}:\ \ \text{BE} = [${mem.map(m => '\\texttt{' + hex2(m.big) + '}').join(',\\,')}],\ \ \text{LE} = [${mem.map(m => '\\texttt{' + hex2(m.little) + '}').join(',\\,')}]`}</EqBox>
        <Note>Endianness is only about the <b>order of bytes</b> in memory; the bits inside each byte don't move. Reading <code>uint8_t *p = (uint8_t*)&amp;x; p[0]</code> gives 0x{hex2(mem[0].little)} on a little-endian MCU but 0x{hex2(mem[0].big)} on a big-endian one. Use <code>htonl()</code>/<code>ntohl()</code> (or explicit shifts) when sending multi-byte values over a network or bus.</Note>
      </>}
    </SimShell>
  );
}
