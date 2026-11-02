// SPI modes (CPOL/CPHA) timing and bus topologies (independent chip-selects vs daisy chain).
import { useMemo, useState, KeyboardEvent } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import { Mode, cpol, cpha, sampleEdge, clockEdges, sclkLevel, dataWindows, bitsOf, crossReceive, daisyChain } from '../models/spi-modes';

const parseHex = (v: any, d: number) => { const s = String(v ?? '').trim(); const x = /^0x/i.test(s) ? parseInt(s, 16) : /^[0-9a-f]{1,2}$/i.test(s) ? parseInt(s, 16) : NaN; return isFinite(x) ? x & 0xff : d; };
const hex = (v: number) => '0x' + (v & 0xff).toString(16).toUpperCase().padStart(2, '0');
const bin = (v: number) => (v & 0xff).toString(2).padStart(8, '0');

function HexInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [t, setT] = useState<string | null>(null);
  return <label className="ctl"><span className="ctl-head"><span className="ctl-label">{label}</span><span className="ctl-val">{bin(value)}</span></span>
    <input className="input" aria-label={label} value={t ?? hex(value)} style={{ height: 32, fontSize: 14, fontFamily: 'var(--font-mono)' }}
      onChange={e => { setT(e.target.value); const v = parseHex(e.target.value, NaN); if (isFinite(v)) onChange(v); }} onBlur={() => setT(null)} /></label>;
}

const SLAVE_INIT = [0x3C, 0x5A, 0xC3, 0x0F];

export default function SpiModes({ params }: SimProps) {
  const m0 = Math.round(Number(params.mode ?? 0));
  const init = {
    mode: ([0, 1, 2, 3].includes(m0) ? m0 : 0) as Mode,
    mosi: parseHex(params.byte ?? '0xA5', 0xA5),
    miso: 0x3C,
    view: (params.view === 'topology' ? 'topology' : 'timing') as 'timing' | 'topology',
    msb: true, slaveMode: ([0, 1, 2, 3].includes(m0) ? m0 : 0) as Mode, fsclk: 1e6,
    topo: 'independent' as 'independent' | 'daisy', nslaves: 3, sel: 0, clocks: 0,
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const mode = s.mode;
  const xr = useMemo(() => crossReceive(mode, s.slaveMode, s.mosi, s.msb), [mode, s.slaveMode, s.mosi, s.msb]);
  const back = useMemo(() => crossReceive(s.slaveMode, mode, s.miso, s.msb), [mode, s.slaveMode, s.miso, s.msb]);
  const edgeName = (e: 'rising' | 'falling') => e === 'rising' ? 'rising ↑' : 'falling ↓';
  const shiftEdge = sampleEdge(mode) === 'rising' ? 'falling' : 'rising';
  const mismatch = s.slaveMode !== mode;
  const ok = xr.valueIfHoldOk === s.mosi && xr.valueIfLate === s.mosi;

  // ---------- timing SVG ----------
  const timing = useMemo(() => {
    const W = 720, L = 64, t0 = -1.5, t1 = 18.5, ux = (W - L - 12) / (t1 - t0);
    const X = (t: number) => L + (t - t0) * ux;
    const RH = 26, GAP = 20, top = 26;
    const rowY = (r: number) => top + r * (RH + GAP);
    const lvl = (r: number, v: 0 | 1 | null) => v === null ? rowY(r) + RH / 2 : v ? rowY(r) : rowY(r) + RH;
    const digital = (r: number, pts: { t: number; v: 0 | 1 | null }[]) => {
      // pts: breakpoints sorted, value holds until next
      const segs: JSX.Element[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = Math.max(t0, pts[i].t), b = i + 1 < pts.length ? pts[i + 1].t : t1;
        const y = lvl(r, pts[i].v);
        if (i > 0) { const yp = lvl(r, pts[i - 1].v); if (yp !== y) segs.push(<line key={'e' + i} x1={X(a)} x2={X(a)} y1={yp} y2={y} stroke="var(--d-ink)" strokeWidth={1.8} />); }
        segs.push(<line key={'s' + i} x1={X(a)} x2={X(b)} y1={y} y2={y} stroke={pts[i].v === null ? 'var(--d-blue)' : 'var(--d-ink)'} strokeWidth={1.8} strokeDasharray={pts[i].v === null ? '4 4' : undefined} />);
      }
      return segs;
    };
    const csPts = [{ t: t0, v: 1 as const }, { t: 0, v: 0 as const }, { t: 17, v: 1 as const }];
    const clkPts: { t: number; v: 0 | 1 }[] = [{ t: t0, v: sclkLevel(mode, t0) }];
    for (let k = 1; k <= 16; k++) clkPts.push({ t: k, v: sclkLevel(mode, k) });
    const dataPts = (m: Mode, byte: number) => {
      const b = bitsOf(byte, s.msb); const w = dataWindows(m);
      const pts: { t: number; v: 0 | 1 | null }[] = [{ t: t0, v: null }];
      w.forEach((x, i) => pts.push({ t: x.from, v: b[i] }));
      pts.push({ t: 17, v: null });
      return { pts, w, b };
    };
    const mo = dataPts(mode, s.mosi), mi = dataPts(s.slaveMode, s.miso);
    const edges = clockEdges(mode);
    const sampT = new Set(edges.filter(e => e.leading === (cpha(mode) === 0)).map(e => e.t));
    const slaveT = new Set(xr.edges);
    const H = rowY(4) + 30;
    const bitLabel = (i: number) => 'b' + (s.msb ? 7 - i : i);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`SPI mode ${mode} timing`} style={{ width: '100%', minWidth: 560, height: 'auto' }}>
        {edges.map(e => <line key={'g' + e.t} x1={X(e.t)} x2={X(e.t)} y1={top - 14} y2={rowY(3) + RH + 2}
          stroke={sampT.has(e.t) ? 'var(--d-green)' : 'var(--d-orange)'} strokeWidth={1} strokeDasharray={sampT.has(e.t) ? '3 3' : '1 4'} opacity={0.9} />)}
        {edges.map(e => sampT.has(e.t) ? <text key={'n' + e.t} x={X(e.t)} y={top - 16} textAnchor="middle" fontSize={10} fill="var(--d-green)">{e.dir === 'rising' ? '↑' : '↓'}</text> : null)}
        {['CS', 'SCLK', 'MOSI', 'MISO'].map((n, r) => <text key={n} x={8} y={rowY(r) + RH / 2 + 4} fontSize={12} fontWeight={600} fill="var(--d-ink)">{n}{n === 'CS' ? '' : ''}</text>)}
        <line x1={8} x2={24} y1={rowY(0) - 1} y2={rowY(0) - 1} stroke="var(--d-ink)" strokeWidth={1} />
        {digital(0, csPts)}
        {digital(1, clkPts)}
        {digital(2, mo.pts)}
        {digital(3, mi.pts)}
        {mo.w.map((w, i) => <text key={'mo' + i} x={X((w.from + Math.min(w.to, w.from + 2)) / 2)} y={rowY(2) - 3} textAnchor="middle" fontSize={10} fill="var(--d-muted)">{bitLabel(i)}={mo.b[i]}</text>)}
        {mi.w.map((w, i) => <text key={'mi' + i} x={X((w.from + Math.min(w.to, w.from + 2)) / 2)} y={rowY(3) - 3} textAnchor="middle" fontSize={10} fill="var(--d-muted)">{mi.b[i]}</text>)}
        {[...sampT].map(t => <g key={'d' + t}>
          <circle cx={X(t)} cy={lvl(2, mo.pts.filter(p => p.t <= t).slice(-1)[0].v)} r={3.5} fill="var(--d-green)" stroke="var(--d-bg)" />
          <circle cx={X(t)} cy={lvl(3, mi.pts.filter(p => p.t <= t).slice(-1)[0].v)} r={3.5} fill="var(--d-green)" stroke="var(--d-bg)" />
        </g>)}
        {[...slaveT].map(t => { const race = xr.race && mo.w.some(w => w.from === t);
          return <path key={'sl' + t} d={`M ${X(t) - 5} ${rowY(3) + RH + 13} L ${X(t) + 5} ${rowY(3) + RH + 13} L ${X(t)} ${rowY(3) + RH + 5} Z`} fill={race ? 'var(--d-red)' : 'var(--d-purple)'} />; })}
        <text x={8} y={rowY(3) + RH + 13} fontSize={10} fill="var(--d-purple)">periph. samples</text>
        <text x={X(0)} y={rowY(0) + RH + 13} fontSize={10} textAnchor="middle" fill="var(--d-muted)">CS↓</text>
        <text x={X(17)} y={rowY(0) + RH + 13} fontSize={10} textAnchor="middle" fill="var(--d-muted)">CS↑</text>
        <g fontSize={10.5}>
          <line x1={L} x2={L + 18} y1={H - 8} y2={H - 8} stroke="var(--d-green)" strokeDasharray="3 3" /><text x={L + 22} y={H - 4} fill="var(--d-ink)">sample edge</text>
          <line x1={L + 110} x2={L + 128} y1={H - 8} y2={H - 8} stroke="var(--d-orange)" strokeDasharray="1 4" /><text x={L + 132} y={H - 4} fill="var(--d-ink)">shift edge</text>
          <line x1={L + 210} x2={L + 228} y1={H - 8} y2={H - 8} stroke="var(--d-blue)" strokeDasharray="4 4" /><text x={L + 232} y={H - 4} fill="var(--d-ink)">high-Z (CS high)</text>
          <path d={`M ${L + 345} ${H - 4} l 10 0 l -5 -7 Z`} fill="var(--d-purple)" /><text x={L + 360} y={H - 4} fill="var(--d-ink)">peripheral's sampling edge (red = race)</text>
        </g>
      </svg>
    );
  }, [mode, s.mosi, s.miso, s.msb, s.slaveMode, xr, mismatch]);

  // ---------- topology SVG ----------
  const chain = useMemo(() => daisyChain(SLAVE_INIT.slice(0, s.nslaves), Array.from({ length: s.nslaves }, (_, k) => [s.mosi, 0x11, 0x22, 0x33][k]), s.clocks), [s.nslaves, s.mosi, s.clocks]);
  const topo = useMemo(() => {
    const N = s.nslaves, W = 640, sy = (k: number) => 30 + k * 96, H = sy(N) + 10;
    const mx1 = 150, sx0 = 430, sx1 = 560;
    const mY = (i: number) => 40 + i * 22; // master pins: MISO, SCLK, MOSI, CS1..
    const els: JSX.Element[] = [];
    const vline = (x: number, ys: number[], key: string, color = 'var(--d-ink)') => els.push(<line key={key} x1={x} x2={x} y1={Math.min(...ys)} y2={Math.max(...ys)} stroke={color} strokeWidth={1.6} />);
    const wire = (pts: number[][], key: string, color = 'var(--d-ink)', dashed = false, w = 1.6) => els.push(<polyline key={key} points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={w} strokeDasharray={dashed ? '5 4' : undefined} />);
    const dot = (x: number, y: number, key: string) => els.push(<circle key={key} cx={x} cy={y} r={3} fill="var(--d-ink)" />);
    const pinTxt = (x: number, y: number, t: string, anchor: 'start' | 'end', key: string) => els.push(<text key={key} x={x} y={y + 3.5} fontSize={10} textAnchor={anchor} fill="var(--d-muted)">{t}</text>);
    const masterPins = s.topo === 'independent' ? ['MISO', 'SCLK', 'MOSI', ...Array.from({ length: N }, (_, k) => 'CS' + (k + 1))] : ['MISO', 'SCLK', 'MOSI', 'CS'];
    els.push(<rect key="mbox" x={20} y={20} width={mx1 - 20} height={Math.max(100, mY(masterPins.length) - 10)} rx={6} fill="var(--d-box)" stroke="var(--d-ink)" strokeWidth={1.6} />);
    els.push(<text key="mt" x={(20 + mx1) / 2} y={36} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--d-ink)">Controller</text>);
    masterPins.forEach((p, i) => pinTxt(mx1 - 5, mY(i) + 11, p, 'end', 'mp' + i));
    const pinY = (k: number, i: number) => sy(k) + 16 + i * 17; // slave pins: SCLK, SDI, SDO, CS
    for (let k = 0; k < N; k++) {
      const active = s.topo === 'daisy' || s.sel === k;
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); upd('sel')(k); } };
      els.push(<g key={'sb' + k} role="button" tabIndex={0} aria-label={`Select peripheral ${k + 1}`} onClick={() => upd('sel')(k)} onKeyDown={onKey} style={{ cursor: s.topo === 'independent' ? 'pointer' : 'default' }}>
        <rect x={sx0} y={sy(k)} width={sx1 - sx0} height={80} rx={6} fill="var(--d-box)" stroke={active && s.topo === 'independent' ? 'var(--d-accent)' : 'var(--d-ink)'} strokeWidth={active && s.topo === 'independent' ? 2.4 : 1.6} />
        <text x={sx1 - 8} y={sy(k) + 18} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--d-ink)">Periph {k + 1}</text>
        <text x={sx1 - 8} y={sy(k) + 70} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--d-accent)">{s.topo === 'daisy' ? bin(chain.regs[k]) : hex(SLAVE_INIT[k])}</text>
      </g>);
      ['SCLK', 'SDI', 'SDO', 'CS'].forEach((p, i) => pinTxt(sx0 + 5, pinY(k, i), p, 'start', `sp${k}${i}`));
    }
    const yM = (i: number) => mY(i) + 11;
    if (s.topo === 'independent') {
      const xs = { miso: 210, sclk: 240, mosi: 270 };
      // SCLK and MOSI trunks
      wire([[mx1, yM(1)], [xs.sclk, yM(1)]], 'tsclk'); vline(xs.sclk, [yM(1), pinY(0, 0), pinY(N - 1, 0)], 'vsclk'); dot(xs.sclk, yM(1), 'dsclk');
      wire([[mx1, yM(2)], [xs.mosi, yM(2)]], 'tmosi'); vline(xs.mosi, [yM(2), pinY(0, 1), pinY(N - 1, 1)], 'vmosi'); dot(xs.mosi, yM(2), 'dmosi');
      wire([[mx1, yM(0)], [xs.miso, yM(0)]], 'tmiso', 'var(--d-green)'); vline(xs.miso, [yM(0), pinY(0, 2), pinY(N - 1, 2)], 'vmiso', 'var(--d-green)'); dot(xs.miso, yM(0), 'dmiso');
      for (let k = 0; k < N; k++) {
        wire([[xs.sclk, pinY(k, 0)], [sx0, pinY(k, 0)]], 'c' + k); dot(xs.sclk, pinY(k, 0), 'dc' + k);
        wire([[xs.mosi, pinY(k, 1)], [sx0, pinY(k, 1)]], 'm' + k); dot(xs.mosi, pinY(k, 1), 'dm' + k);
        const act = s.sel === k;
        wire([[sx0, pinY(k, 2)], [xs.miso, pinY(k, 2)]], 'o' + k, act ? 'var(--d-green)' : 'var(--d-blue)', !act, act ? 2.4 : 1.4); dot(xs.miso, pinY(k, 2), 'do' + k);
        if (!act) els.push(<text key={'hz' + k} x={sx0 - 22} y={pinY(k, 2) - 3} fontSize={9.5} textAnchor="middle" fill="var(--d-blue)">Hi-Z</text>);
        const cx = 300 + 22 * k;
        wire([[mx1, yM(3 + k)], [cx, yM(3 + k)], [cx, pinY(k, 3)], [sx0, pinY(k, 3)]], 'cs' + k, act ? 'var(--d-accent)' : 'var(--d-ink)', false, act ? 2.4 : 1.6);
        els.push(<text key={'csl' + k} x={cx + 4} y={pinY(k, 3) - 4} fontSize={9.5} fill={act ? 'var(--d-accent)' : 'var(--d-muted)'}>{act ? 'low' : 'high'}</text>);
      }
    } else {
      const xs = { sclk: 210, cs: 240 };
      wire([[mx1, yM(1)], [xs.sclk, yM(1)]], 'tsclk'); vline(xs.sclk, [yM(1), pinY(0, 0), pinY(N - 1, 0)], 'vsclk'); dot(xs.sclk, yM(1), 'dsclk');
      wire([[mx1, yM(3)], [xs.cs, yM(3)]], 'tcs'); vline(xs.cs, [yM(3), pinY(0, 3), pinY(N - 1, 3)], 'vcs'); dot(xs.cs, yM(3), 'dcs');
      for (let k = 0; k < N; k++) {
        wire([[xs.sclk, pinY(k, 0)], [sx0, pinY(k, 0)]], 'c' + k); dot(xs.sclk, pinY(k, 0), 'dc' + k);
        wire([[xs.cs, pinY(k, 3)], [sx0, pinY(k, 3)]], 'cs' + k); dot(xs.cs, pinY(k, 3), 'dcs' + k);
      }
      // MOSI → periph 1 SDI
      wire([[mx1, yM(2)], [290, yM(2)], [290, pinY(0, 1)], [sx0, pinY(0, 1)]], 'mosi', 'var(--d-accent)', false, 2.2);
      for (let k = 0; k < N - 1; k++) {
        const yb = sy(k) + 88;
        wire([[sx0, pinY(k, 2)], [sx0 - 14, pinY(k, 2)], [sx0 - 14, yb - 0], [sx0 - 28, yb], [sx0 - 28, pinY(k + 1, 1)], [sx0, pinY(k + 1, 1)]].map((p, i) => i === 3 ? [sx0 - 28, yb] : p), 'ch' + k, 'var(--d-accent)', false, 2.2);
      }
      // last SDO → MISO, routed over the top
      const yl = pinY(N - 1, 2);
      wire([[sx0, yl], [sx0 - 14, yl], [sx0 - 14, sy(N - 1) + 88], [600, sy(N - 1) + 88], [600, 8], [180, 8], [180, yM(0)], [mx1, yM(0)]], 'back', 'var(--d-green)', false, 2.2);
      els.push(<text key="lbl" x={610} y={sy(0) + 40} fontSize={10} fill="var(--d-green)" transform={`rotate(90 610 ${sy(0) + 40})`}>last SDO → MISO</text>);
    }
    return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="SPI bus topology" style={{ width: '100%', minWidth: 520, height: 'auto' }}>{els}</svg>;
  }, [s.topo, s.nslaves, s.sel, chain, s.mosi]);

  const byteTime = 8 / s.fsclk;
  const misoBytes = Array.from({ length: Math.floor(chain.miso.length / 8) }, (_, k) => chain.miso.slice(8 * k, 8 * k + 8).reduce((a, b) => (a << 1) | b, 0));

  return (
    <SimShell title="SPI modes & bus topologies" onReset={() => set(init)}
      tryThis={s.view === 'timing'
        ? <>(1) Step through modes 0 to 3. CPOL only flips the idle level of the clock. CPHA decides whether the first bit must already be on MOSI when CS falls (CPHA = 0) or appears on the first edge (CPHA = 1). (2) Leave the controller in mode 0 and set the peripheral to mode 1. It now samples on the edge where the controller changes MOSI, so the result depends on hold time. It reads {hex(xr.valueIfHoldOk)} if the old bit is still held and {hex(xr.valueIfLate)} if the new bit has already arrived, which can change with temperature or trace length.</>
        : <>Switch to <i>daisy chain</i> and step the SCLK cycles from 0 to {8 * s.nslaves}. Each peripheral's register passes its bits to the next one. After 8·N clocks the first byte sent ends up in the last device, and the controller has read every device's old contents on MISO, last device first.</>}
      controls={<>
        <Seg label="View" value={s.view} options={[{ value: 'timing', label: 'Timing' }, { value: 'topology', label: 'Topology' }]} onChange={upd('view')} />
        {s.view === 'timing' ? <>
          <Seg label="SPI mode (CPOL, CPHA)" value={String(mode) as any} options={[0, 1, 2, 3].map(m => ({ value: String(m), label: `${m} (${m >> 1},${m & 1})` }))} onChange={v => set(p => ({ ...p, mode: Number(v) as Mode, slaveMode: p.slaveMode === p.mode ? Number(v) as Mode : p.slaveMode }))} />
          <HexInput label="Controller sends (MOSI)" value={s.mosi} onChange={upd('mosi')} />
          <HexInput label="Peripheral replies (MISO)" value={s.miso} onChange={upd('miso')} />
          <Seg label="Bit order" value={s.msb ? 'msb' : 'lsb'} options={[{ value: 'msb', label: 'MSB first' }, { value: 'lsb', label: 'LSB first' }]} onChange={v => upd('msb')(v === 'msb')} />
          <Select label="Peripheral configured for" value={String(s.slaveMode)} options={[0, 1, 2, 3].map(m => ({ value: String(m), label: `Mode ${m}${m === mode ? ' (matches)' : ''}` }))} onChange={v => upd('slaveMode')(Number(v) as Mode)} />
          <Slider label="SCLK frequency" value={s.fsclk} min={1e5} max={5e7} log unit="Hz" onChange={upd('fsclk')} />
        </> : <>
          <Seg label="Topology" value={s.topo} options={[{ value: 'independent', label: 'Independent CS' }, { value: 'daisy', label: 'Daisy chain' }]} onChange={upd('topo')} />
          <Slider label="Peripherals" value={s.nslaves} min={1} max={4} step={1} format={v => String(v)} onChange={v => set(p => ({ ...p, nslaves: Math.round(v), sel: Math.min(p.sel, Math.round(v) - 1), clocks: Math.min(p.clocks, 8 * Math.round(v)) }))} />
          {s.topo === 'independent'
            ? <Select label="Selected peripheral (CS low)" value={String(s.sel)} options={Array.from({ length: s.nslaves }, (_, k) => ({ value: String(k), label: `Periph ${k + 1}` }))} onChange={v => upd('sel')(Number(v))} />
            : <Slider label="SCLK cycles clocked" value={s.clocks} min={0} max={8 * s.nslaves} step={1} format={v => `${v} / ${8 * s.nslaves}`} onChange={v => upd('clocks')(Math.round(v))} />}
          <HexInput label="First byte sent (MOSI)" value={s.mosi} onChange={upd('mosi')} />
          <Note>{s.topo === 'independent' ? 'Click a peripheral to select it. Unselected peripherals must tri-state SDO, or MISO contention results.' : 'Bytes sent in order: ' + Array.from({ length: s.nslaves }, (_, k) => hex([s.mosi, 0x11, 0x22, 0x33][k])).join(', ') + '. Starting register contents: ' + SLAVE_INIT.slice(0, s.nslaves).map(hex).join(', ') + '.'}</Note>
        </>}
      </>}>
      {s.view === 'timing' ? <>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <RegionBadge label={`Mode ${mode}: CPOL=${cpol(mode)}, CPHA=${cpha(mode)}`} color="accent" />
          {mismatch && (ok ? <RegionBadge label={`Peripheral mode ${s.slaveMode} also samples on ${sampleEdge(s.slaveMode)} edges: works`} color="ok" />
            : xr.race ? <RegionBadge label="Mode mismatch: hold-time race" color="bad" /> : <RegionBadge label="Mode mismatch: wrong data" color="bad" />)}
        </div>
        <div className="figure-body" style={{ padding: '8px 0' }}>{timing}</div>
        <Readouts>
          <Readout k="Clock idles" v={cpol(mode) ? 'high' : 'low'} />
          <Readout k="Sample on" v={edgeName(sampleEdge(mode))} hl />
          <Readout k="Shift (change) on" v={edgeName(shiftEdge)} />
          <Readout k="First bit valid" v={cpha(mode) ? 'at 1st edge' : 'when CS falls'} />
          <Readout k="Peripheral receives" v={xr.race ? `${hex(xr.valueIfHoldOk)} or ${hex(xr.valueIfLate)}` : hex(xr.valueIfHoldOk)} tone={ok ? 'ok' : 'bad'} />
          <Readout k="Controller receives" v={back.race ? `${hex(back.valueIfHoldOk)} or ${hex(back.valueIfLate)}` : hex(back.valueIfHoldOk)} tone={back.valueIfHoldOk === s.miso && back.valueIfLate === s.miso ? 'ok' : 'bad'} />
          <Readout k="Byte time 8/f" v={si(byteTime, 's')} />
          <Readout k="Half-period setup/hold budget" v={si(0.5 / s.fsclk, 's')} />
        </Readouts>
        <EqBox>{String.raw`\text{mode} = 2\cdot\text{CPOL} + \text{CPHA} = 2\cdot${cpol(mode)} + ${cpha(mode)} = ${mode},\qquad \text{sample edge} = \begin{cases}\uparrow & \text{CPOL}\oplus\text{CPHA}=0\\ \downarrow & \text{CPOL}\oplus\text{CPHA}=1\end{cases}`}</EqBox>
        <Note>Data is launched on one edge and captured on the opposite edge, so each side gets about half an SCLK period (here {si(0.5 / s.fsclk, 's')}) for clock-to-out, flight time and setup. Modes 0 and 3 both sample on the rising edge, which is why many parts accept either.</Note>
      </> : <>
        <div className="figure-body" style={{ padding: '8px 0' }}>{topo}</div>
        <Readouts>
          <Readout k="Signal wires" v={s.topo === 'independent' ? `${3 + s.nslaves} (3 + N)` : '4'} hl />
          <Readout k="Controller pins for CS" v={s.topo === 'independent' ? String(s.nslaves) : '1'} />
          <Readout k="Clocks to update all" v={s.topo === 'independent' ? `${8 * s.nslaves} (${s.nslaves} × 8, separate frames)` : `${8 * s.nslaves} (one frame)`} />
          {s.topo === 'daisy' && <Readout k="Read back on MISO" v={misoBytes.length ? misoBytes.map(hex).join(' ') : '—'} tone={s.clocks === 8 * s.nslaves ? 'ok' : undefined} />}
          <Readout k="Access one device" v={s.topo === 'independent' ? '8 clocks' : `${8 * s.nslaves} clocks (whole chain)`} />
        </Readouts>
        <Note>{s.topo === 'independent'
          ? 'Independent selects: any device can be addressed alone and devices may use different modes and speeds, at the cost of one CS pin each. MISO is shared, so every unselected device must release (tri-state) it.'
          : 'Daisy chain: one CS and four wires for any N, but every transfer must clock the whole chain. All devices latch together on CS rising, and the chain runs only as fast as its slowest SDO→SDI hop.'}</Note>
      </>}
    </SimShell>
  );
}
