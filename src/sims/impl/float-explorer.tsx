// IEEE-754 explorer: click bits, type numbers, see exact stored value, error and ULP; compare to Q-format fixed point.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, num } from '../kit';
import Plot from '../../components/Plot';
import { Fmt, SPEC, encode, decode, fields, toBinary, toHex, exactDecimal, parseRational, roundingError, ulpOf, ulpAt, neighbours, toFixed, maxFinite, minNormal, minSubnormal } from '../models/float-explorer';

const sci = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 1e10 || Math.abs(v) < 1e-4 ? v.toExponential(6).replace(/\.?0+e/, 'e') : String(Number(v.toPrecision(10))));
const clsLabel = { zero: 'zero', subnormal: 'denormal', normal: 'normal', inf: 'infinity', nan: 'NaN' } as const;

export default function FloatExplorer({ params }: SimProps) {
  const fmt0: Fmt = params.fmt === 'f16' ? 'f16' : 'f32';
  const x0 = String(params.x ?? 0.1);
  const [fmt, setFmt] = useState<Fmt>(fmt0);
  const [text, setText] = useState(x0);
  const [bits, setBits] = useState(() => { const v = parseFloat(x0); return encode(Number.isFinite(v) ? v : 0.1, fmt0); });
  const [typed, setTyped] = useState<string | null>(x0); // null = bits were edited directly
  const [q, setQ] = useState(Math.round(Number(params.q ?? 15)));
  const sp = SPEC[fmt];

  const apply = (str: string, f: Fmt) => {
    setText(str); const t = str.trim().toLowerCase();
    let v = NaN; let ok = true;
    if (t === 'inf' || t === '+inf' || t === 'infinity') v = Infinity; else if (t === '-inf' || t === '-infinity') v = -Infinity; else if (t === 'nan') v = NaN;
    else if (t === '-0') v = -0; else if (parseRational(t)) v = parseFloat(t); else ok = false;
    if (ok) { setBits(encode(v, f)); setTyped(t); }
  };
  const flip = (i: number) => { setBits(b => { const mask = 2 ** (sp.w - 1 - i); return Math.floor(b / mask) % 2 ? b - mask : b + mask; }); setTyped(null); setText(''); };
  const setFormat = (f: Fmt) => {
    if (typed !== null) { setFmt(f); apply(text, f); } else { const v = decode(bits, fmt); setFmt(f); setBits(encode(v, f)); }
    setQ(qq => Math.min(qq, SPEC[f].w - 1));
  };
  const setValue = (str: string) => { setTyped(str); apply(str, fmt); };

  const f = fields(bits, fmt); const val = decode(bits, fmt);
  const exact = useMemo(() => exactDecimal(bits, fmt), [bits, fmt]);
  const bin = toBinary(bits, fmt);
  const rat = typed !== null ? parseRational(typed) : null;
  const err = useMemo(() => (rat && f.cls !== 'inf' && f.cls !== 'nan' ? roundingError(rat, bits, fmt) : null), [rat, bits, fmt, f.cls]);
  const ulp = ulpOf(bits, fmt); const nb = neighbours(bits, fmt);
  const wantedOverflow = typed !== null && rat && f.cls === 'inf' && !/inf/.test(typed);
  const xv = typed !== null && rat ? parseFloat(typed) : val; // double for fixed-point comparison
  const fx = toFixed(Number.isFinite(xv) ? xv : 0, sp.w, q);

  const ulpPlot = useMemo(() => {
    const lo = fmt === 'f32' ? -149 : -24, hi = fmt === 'f32' ? 127 : 15; const xs: number[] = [], ys: number[] = [];
    for (let e = lo; e <= hi; e += 0.25) { const a = 2 ** e; xs.push(a); ys.push(ulpAt(a, fmt)); }
    return { x: xs, y: ys };
  }, [fmt]);
  const absv = Math.abs(val);

  const fieldOf = (i: number) => (i === 0 ? 's' : i <= sp.eb ? 'e' : 'm');
  const col = { s: 'var(--d-red)', e: 'var(--d-orange)', m: 'var(--d-blue)' } as const;
  const perRow = 16;
  const rows = sp.w / perRow;

  const eq = f.cls === 'normal'
    ? String.raw`(-1)^{${f.s}}\times 2^{${f.e}-${sp.bias}}\times\left(1+\tfrac{${f.m}}{2^{${sp.mb}}}\right) = ${sci(val).replace('e', '\\times 10^{') + (sci(val).includes('e') ? '}' : '')}`
    : f.cls === 'subnormal' ? String.raw`(-1)^{${f.s}}\times 2^{1-${sp.bias}}\times\left(0+\tfrac{${f.m}}{2^{${sp.mb}}}\right) = ${sci(val).replace('e', '\\times 10^{') + (sci(val).includes('e') ? '}' : '')}`
    : f.cls === 'zero' ? String.raw`e=0,\ m=0 \Rightarrow \pm 0\ (\text{sign bit still distinguishes } +0 \text{ and } -0)`
    : f.cls === 'inf' ? String.raw`e = 11\ldots1,\ m = 0 \Rightarrow ${f.s ? '-' : '+'}\infty`
    : String.raw`e = 11\ldots1,\ m \ne 0 \Rightarrow \text{NaN (not a number)}`;

  const reset = () => { setFmt(fmt0); setText(x0); setTyped(x0); const v = parseFloat(x0); setBits(encode(Number.isFinite(v) ? v : 0.1, fmt0)); setQ(Math.round(Number(params.q ?? 15))); };
  const quick: [string, string][] = [['0.1', '0.1'], ['1/3', '0.3333333333333333'], ['2²⁴+1', '16777217'], ['65504', '65504'], ['1e-40', '1e-40'], ['6.1035e-5', '6.1035e-5'], ['1e39', '1e39'], ['−0', '-0'], ['+∞', 'inf'], ['NaN', 'nan']];

  return (
    <SimShell title="Floating point & fixed point" onReset={reset}
      tryThis={<>type <b>0.1</b> and read the exact stored decimal, then try <b>16777217</b> in 32-bit: the 2²⁴+1 rounds to 16777216 because the ULP there is 2. Switch to 16-bit and type 65504, then 65520 (overflows to ∞). Click the lowest mantissa bit to step by one ULP. Type <b>1e-40</b> in 32-bit to enter denormals, where the implicit leading 1 disappears.</>}
      controls={<>
        <Seg label="Format" value={fmt} options={[{ value: 'f32', label: '32-bit (binary32)' }, { value: 'f16', label: '16-bit (binary16)' }]} onChange={setFormat} />
        <Slider label={`Fixed-point fractional bits q (Q${sp.w - 1 - Math.min(q, sp.w - 1)}.${Math.min(q, sp.w - 1)})`} value={Math.min(q, sp.w - 1)} min={0} max={sp.w - 1} step={1} format={v => String(Math.round(v))} onChange={v => setQ(Math.round(v))} />
        <div className="ctl"><span className="ctl-head"><span className="ctl-label">Quick values</span></span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{quick.map(([l, v]) => <button key={l} className="btn btn-sm btn-ghost" onClick={() => setValue(v)}>{l}</button>)}</div></div>
        <Note>Fixed point uses the same total width ({sp.w} bits, signed, round-to-nearest, saturating). Exact decimals are computed with BigInt; nothing is rounded for display.</Note>
      </>}>
      <label className="ctl"><span className="ctl-head"><span className="ctl-label">Type a number (e.g. 0.1, 1e-5, inf, nan)</span></span>
        <input className="input" style={{ height: 36, fontSize: 15, fontFamily: 'var(--mono, monospace)' }} value={text} inputMode="text" aria-label="Number to encode"
          onChange={e => apply(e.target.value, fmt)} />
        {text !== '' && typed === null ? null : text !== '' && !parseRational(text.trim()) && !/^(\+|-)?(inf|infinity|nan)$/i.test(text.trim()) ? <span style={{ color: 'var(--bad)', fontSize: 12 }}>Not a number: showing the last valid value.</span> : null}
      </label>
      <div style={{ margin: '6px 0 2px', fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span><span style={{ color: col.s }}>■</span> sign (1)</span><span><span style={{ color: col.e }}>■</span> exponent ({sp.eb})</span><span><span style={{ color: col.m }}>■</span> mantissa ({sp.mb})</span><span style={{ color: 'var(--text-3)' }}>click a bit to flip it</span>
      </div>
      <div role="group" aria-label="Bit pattern" style={{ display: 'grid', gridTemplateColumns: `repeat(${perRow}, 1fr)`, gap: 2 }}>
        {bin.split('').map((b, i) => { const fld = fieldOf(i); const on = b === '1'; const gi = rows > 1 && i >= perRow ? 1 : 0; void gi; return (
          <button key={i} type="button" aria-label={`bit ${sp.w - 1 - i} (${fld === 's' ? 'sign' : fld === 'e' ? 'exponent' : 'mantissa'}) = ${b}`} aria-pressed={on} onClick={() => flip(i)}
            style={{ height: 34, padding: 0, minWidth: 0, fontFamily: 'var(--mono, monospace)', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 4,
              border: `1.5px solid ${col[fld]}`, background: on ? col[fld] : 'transparent', color: on ? 'var(--d-bg)' : col[fld], marginLeft: (i === 0 || i === sp.eb) && false ? 4 : 0 }}>{b}</button>); })}
      </div>
      <div style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12.5, margin: '6px 0', color: 'var(--text-2)' }}>{toHex(bits, fmt)} · sign {f.s} · exponent {f.e} (unbiased {f.cls === 'normal' || f.cls === 'subnormal' ? f.unbiased : '—'}) · mantissa {f.m}</div>
      <Readouts>
        <Readout k="Class" v={clsLabel[f.cls]} tone={f.cls === 'nan' || f.cls === 'inf' ? 'bad' : f.cls === 'subnormal' ? 'warn' : undefined} />
        <Readout k="Stored value" v={f.cls === 'nan' ? 'NaN' : val === Infinity ? '+∞' : val === -Infinity ? '−∞' : Object.is(val, -0) ? '−0' : sci(val)} hl />
        <Readout k="ULP (spacing here)" v={Number.isNaN(ulp) ? '—' : num(ulp, 4)} />
        <Readout k="Error (stored − typed)" v={err ? (err.exact ? 'exact (0)' : `${sci(err.abs)}`) : typed === null ? 'bits edited' : wantedOverflow ? 'overflow' : '—'} tone={err && !err.exact ? 'warn' : err ? 'ok' : undefined} />
        <Readout k="Relative error" v={err ? (err.exact ? '0' : (err.rel * 100).toExponential(2) + ' %') : '—'} />
      </Readouts>
      <div style={{ fontSize: 13, margin: '6px 0', wordBreak: 'break-all' }}><b>Exact decimal of the stored value:</b><div style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12.5, marginTop: 2 }}>{exact}</div></div>
      {(f.cls === 'normal' || f.cls === 'subnormal' || f.cls === 'zero') && <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Neighbours: previous {Number.isNaN(nb.smaller) ? '—' : sci(nb.smaller)} · next {Number.isNaN(nb.larger) ? '—' : sci(nb.larger)}. Range: min denormal {sci(minSubnormal(fmt))}, min normal {sci(minNormal(fmt))}, max {sci(maxFinite(fmt))}.</div>}
      <EqBox>{eq}</EqBox>

      <h4 style={{ margin: '12px 0 4px', fontSize: 14 }}>Same value in fixed point: Q{fx.intBits}.{q} ({sp.w}-bit signed)</h4>
      <Readouts>
        <Readout k="Raw integer" v={`${fx.raw} (0x${(fx.raw < 0 ? fx.raw + 2 ** sp.w : fx.raw).toString(16).toUpperCase().padStart(sp.w / 4, '0')})`} />
        <Readout k="Stored value" v={sci(fx.value)} hl tone={fx.sat ? 'bad' : undefined} />
        <Readout k="Error vs typed" v={fx.sat ? 'saturated!' : sci(fx.err)} tone={fx.sat ? 'bad' : fx.err === 0 ? 'ok' : 'warn'} />
        <Readout k="Resolution (constant)" v={sci(fx.step)} />
        <Readout k="Range" v={`${sci(fx.min)} … ${sci(fx.max)}`} />
        <Readout k="Float ULP here / fixed step" v={Number.isNaN(ulp) || ulp === 0 ? '—' : (ulp / fx.step).toPrecision(3)} />
      </Readouts>
      <Plot series={[{ ...ulpPlot, label: `${fmt === 'f32' ? '32' : '16'}-bit float ULP`, color: 'accent' }]} xLog yLog height={240} xLabel="|x|" yLabel="spacing"
        hlines={[{ at: fx.step, label: `fixed Q${fx.intBits}.${q} step`, color: 'orange' }]}
        vlines={[{ at: 2 ** (sp.w - 1 - q), label: 'fixed-point max', color: 'orange' }]}
        points={absv > 0 && Number.isFinite(absv) && !Number.isNaN(ulp) ? [{ x: absv, y: ulp, label: 'you are here', color: 'ink' }] : []} />
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Float spacing grows with magnitude (constant relative precision); fixed-point spacing is flat but the range ends at the vertical line. The ULP flattens at the left: that is the denormal range.</div>
    </SimShell>
  );
}
