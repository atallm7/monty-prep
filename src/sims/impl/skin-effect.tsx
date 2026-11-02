// Skin effect: skin depth vs frequency, AC resistance of a round wire or PCB trace, animated current-density cross-section.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { logspace } from '../../lib/units';
import { MATERIALS, Material, Shape, skinDepth, analyze, wireProfile } from '../models/skin-effect';

const MATS: Material[] = ['cu', 'al', 'au', 'ag'];
const COL: Record<Material, string> = { cu: 'orange', al: 'muted', au: 'purple', ag: 'blue' };

// slab (one direction) current density J(y)/J(surface) with k=(1+j)/delta, y from centre, half-thickness h
function slab(y: number, h: number, d: number) {
  const dd = (h - Math.abs(y)) / d, H = h / d;
  if (H > 25) return { re: Math.exp(-dd) * Math.cos(-dd), im: Math.exp(-dd) * Math.sin(-dd) };
  const ch = (a: number, b: number) => ({ re: Math.cosh(a) * Math.cos(b), im: Math.sinh(a) * Math.sin(b) });
  const n = ch(Math.abs(y) / d, Math.abs(y) / d), m = ch(H, H), den = m.re * m.re + m.im * m.im;
  return { re: (n.re * m.re + n.im * m.im) / den, im: (n.im * m.re - n.re * m.im) / den };
}

export default function SkinEffect({ params }: SimProps) {
  const mat0 = (MATS as string[]).includes(params.material) ? (params.material as Material) : 'cu';
  const init = { material: mat0, f: Number(params.f ?? 1e6), shape: (params.shape === 'wire' ? 'wire' : 'trace') as Shape, diam: 1e-3, w: 1e-3, t: 35e-6, len: 1 };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const a = useMemo(() => analyze(s), [s]);
  const [play, setPlay] = useState(true); const [ph, setPh] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!play) return; let last = performance.now();
    const loop = (now: number) => { setPh(p => (p + (now - last) * 0.004) % (2 * Math.PI)); last = now; raf.current = requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf.current);
  }, [play]);

  const fs = useMemo(() => logspace(10, 1e10, 160), []);
  const dCurves = useMemo(() => MATS.map(m => fs.map(f => skinDepth(MATERIALS[m].rho, f))), [fs]);
  const ratio = useMemo(() => ({ x: fs, y: fs.map(f => analyze({ ...s, f }).ratio) }), [fs, s]);
  const half = a.half;

  // depth profile from surface to centre
  const prof = useMemo(() => {
    const x: number[] = [], y: number[] = [], ref: number[] = [];
    for (let i = 0; i <= 120; i++) {
      const dep = half * i / 120; x.push(dep);
      if (s.shape === 'wire') y.push(wireProfile(Math.max(0, 1 - dep / half), half / a.delta).mag);
      else { const j = slab(half - dep, half, a.delta); y.push(Math.hypot(j.re, j.im)); }
      ref.push(Math.exp(-dep / a.delta));
    } return { x, y, ref };
  }, [s.shape, half, a.delta]);

  // cross-section drawing (display units: px)
  const cs = useMemo(() => {
    const cell = 9; const cells: { x: number; y: number; m: number; p: number }[] = [];
    let W = 0, H = 0, cut = false;
    if (s.shape === 'wire') {
      const R = 84, X = a.half / a.delta; W = 2 * R + 8; H = 2 * R + 8;
      for (let cx = -R + cell / 2; cx < R; cx += cell) for (let cy = -R + cell / 2; cy < R; cy += cell) {
        const r = Math.hypot(cx, cy); if (r > R - 1) continue; const pr = wireProfile(r / R, X); cells.push({ x: cx + W / 2, y: cy + H / 2, m: Math.min(1, pr.mag), p: pr.phase });
      }
      return { cells, W, H, shape: 'wire' as const, R, px: R / a.half, cut };
    }
    const th = 84; const aspect = s.w / s.t; const wpx = Math.min(aspect, 3.2) * th; cut = aspect > 3.2; W = wpx + 16; H = th + 16;
    const hx = (cut ? 3.2 * s.t : s.w) / 2, hy = s.t / 2, pxm = th / s.t;
    for (let cx = cell / 2; cx < wpx; cx += cell) for (let cy = cell / 2; cy < th; cy += cell) {
      const jx = slab((cx - wpx / 2) / pxm, hx, a.delta), jy = slab((cy - th / 2) / pxm, hy, a.delta);
      const re = jx.re * jy.re - jx.im * jy.im, im = jx.re * jy.im + jx.im * jy.re; cells.push({ x: cx + 8, y: cy + 8, m: Math.min(1, Math.hypot(re, im)), p: Math.atan2(im, re) });
    }
    return { cells, W, H, shape: 'trace' as const, wpx, th, px: pxm, cut, R: 0 };
  }, [s.shape, s.w, s.t, a.half, a.delta]);

  const heavy = a.ratio > 1.5 ? 'bad' : a.ratio > 1.05 ? 'warn' : 'ok';
  const badge = a.ratio > 1.5 ? { l: 'Skin effect dominant', c: 'bad' as const } : a.ratio > 1.05 ? { l: 'Skin effect noticeable', c: 'warn' as const } : { l: 'DC-like current (δ ≥ conductor)', c: 'ok' as const };
  const oz = (t: number) => (t * 1e6).toFixed(1) + ' µm';

  return (
    <SimShell title="Skin effect" onReset={() => set(init)}
      tryThis={<>keep copper and raise the frequency from 1 kHz to 1 GHz: δ falls as 1/√f ({si(skinDepth(MATERIALS.cu.rho, 1e3), 'm')} → {si(skinDepth(MATERIALS.cu.rho, 1e9), 'm')}). A 1 mm round wire starts to feel it near {si(analyze({ ...s, shape: 'wire', diam: 1e-3, f: 1 }).fKnee, 'Hz')} and has Rac ≈ 10× Rdc by tens of MHz, while a 1 oz (35 µm) PCB trace stays at DC resistance until δ drops below half its thickness (≈ {si(analyze({ ...s, shape: 'trace', t: 35e-6, w: 1e-3, f: 1 }).fKnee, 'Hz')}). Switch the material to silver or aluminium and watch the plots shift.</>}
      controls={<>
        <Seg label="Material" value={s.material} onChange={upd('material')} options={MATS.map(m => ({ value: m, label: MATERIALS[m].name }))} />
        <Seg label="Conductor" value={s.shape} onChange={upd('shape')} options={[{ value: 'trace', label: 'PCB trace' }, { value: 'wire', label: 'Round wire' }]} />
        <Slider label="Frequency" value={s.f} min={10} max={1e10} log unit="Hz" onChange={upd('f')} />
        {s.shape === 'wire'
          ? <Slider label="Wire diameter" value={s.diam} min={50e-6} max={10e-3} log unit="m" onChange={upd('diam')} />
          : <>
            <Slider label="Trace width" value={s.w} min={0.05e-3} max={10e-3} log unit="m" onChange={upd('w')} />
            <Seg label="Copper weight" value={String(Math.round(s.t * 1e6))} onChange={v => upd('t')(Number(v) * 1e-6)} options={[{ value: '18', label: '½ oz' }, { value: '35', label: '1 oz' }, { value: '70', label: '2 oz' }, { value: '105', label: '3 oz' }]} />
          </>}
        <Slider label="Length" value={s.len} min={1e-3} max={10} log unit="m" onChange={upd('len')} />
        <Note>Trace model: isolated rectangular conductor with current on all four faces (a real microstrip also crowds toward the plane side, which raises R further). Wire model: exact Bessel solution up to a/δ = 7, asymptotic beyond.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><RegionBadge label={badge.l} color={badge.c} /><span className="faint" style={{ fontSize: 12.5 }}>{MATERIALS[s.material].name}, ρ = {si(MATERIALS[s.material].rho, 'Ω·m')}</span></div>
      <Readouts>
        <Readout k="Skin depth δ" v={si(a.delta, 'm')} hl />
        <Readout k={s.shape === 'wire' ? 'Radius / δ' : 'Half-thickness / δ'} v={a.x.toFixed(a.x < 10 ? 2 : 1)} />
        <Readout k="R_dc" v={si(a.rdc, 'Ω')} />
        <Readout k="R_ac" v={si(a.rac, 'Ω')} hl tone={heavy} />
        <Readout k="R_ac / R_dc" v={a.ratio.toFixed(a.ratio < 10 ? 3 : 1)} tone={heavy} />
        <Readout k="Skin onset (δ = half size)" v={si(a.fKnee, 'Hz')} />
      </Readouts>
      <EqBox>{String.raw`\delta=\sqrt{\frac{\rho}{\pi f\mu_0}}=${a.delta < 1e-3 ? (a.delta * 1e6).toPrecision(3) + String.raw`\,\mu\text{m}` : (a.delta * 1e3).toPrecision(3) + String.raw`\,\text{mm}`},\qquad ${s.shape === 'wire' ? String.raw`\frac{R_{ac}}{R_{dc}}\approx\frac{a}{2\delta}+\frac14\;(a\gg\delta)` : String.raw`R_{ac}=\frac{\rho\ell}{wt-(w-2\delta)(t-2\delta)}`}`}</EqBox>
      <div className="figure-body" style={{ padding: 8, display: 'block' }}>
        <svg viewBox={`0 0 ${cs.W + 150} ${cs.H}`} style={{ width: '100%', maxHeight: 260, display: 'block' }} role="img" aria-label={`Current density in the conductor cross-section, ${s.shape}, skin depth ${si(a.delta, 'm')}`}>
          <g transform="translate(0,0)">
            {cs.cells.map((c, i) => <rect key={'h' + i} x={c.x - 4.5} y={c.y - 4.5} width={9} height={9} fill="var(--d-accent)" opacity={0.08 + 0.55 * c.m} />)}
            {cs.cells.map((c, i) => { const v = c.m * Math.cos(ph + c.p); return <circle key={'d' + i} cx={c.x} cy={c.y} r={Math.min(3.4, 3.4 * Math.abs(v) ** 0.8)} fill={v >= 0 ? 'var(--d-ink)' : 'none'} stroke="var(--d-ink)" strokeWidth={0.9} opacity={0.9} />; })}
            {cs.shape === 'wire' ? <circle cx={cs.W / 2} cy={cs.H / 2} r={cs.R} fill="none" stroke="var(--d-ink)" strokeWidth={1.4} /> : <rect x={8} y={8} width={cs.wpx} height={cs.th} fill="none" stroke="var(--d-ink)" strokeWidth={1.4} />}
            {/* skin depth scale bar */}
            {(() => { const bx = cs.W + 12, by = 38, L = Math.min(a.delta * cs.px, 120); return <g><text x={bx} y={by - 12} fill="var(--d-ink)" style={{ fontSize: 9 }}>● into page</text><text x={bx} y={by + 4} fill="var(--d-ink)" style={{ fontSize: 9 }}>○ out of page</text>
              <line x1={bx} x2={bx + L} y1={by + 36} y2={by + 36} stroke="var(--d-red)" strokeWidth={3} /><text x={bx} y={by + 54} fill="var(--d-red)" style={{ fontSize: 9 }}>δ = {si(a.delta, 'm')}</text>
              <text x={bx} y={by + 72} fill="var(--d-muted)" style={{ fontSize: 8 }}>{cs.shape === 'wire' ? `⌀ ${si(s.diam, 'm')}` : `${si(s.w, 'm')} × ${oz(s.t)}${cs.cut ? ' (width cut)' : ''}`}</text></g>; })()}
          </g>
        </svg>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 4px' }}>
          <button className="btn btn-sm" onClick={() => setPlay(p => !p)} aria-pressed={play}>{play ? 'Pause' : 'Play'} AC cycle</button>
          <span className="faint" style={{ fontSize: 12.5 }}>Shading = current-density magnitude; dots oscillate with the AC phase and lag deeper inside.</span>
        </div>
      </div>
      <Plot series={MATS.map((m, i) => ({ x: fs, y: dCurves[i], label: MATERIALS[m].name, color: COL[m], width: m === s.material ? 2.6 : 1.2, dashed: m !== s.material }))}
        xLog yLog xUnit="Hz" yUnit="m" xLabel="Frequency" yLabel="Skin depth δ" height={220} hlines={[{ at: half, label: s.shape === 'wire' ? 'wire radius' : 'half thickness', color: 'red' }]}
        points={[{ x: s.f, y: a.delta, label: 'now', color: 'accent' }]} />
      <Plot series={[{ x: ratio.x, y: ratio.y, label: `R_ac / R_dc (${MATERIALS[s.material].name}, ${s.shape})`, color: 'accent' }]} xLog yLog xUnit="Hz" xLabel="Frequency" yLabel="R_ac / R_dc" height={210}
        yRange={[0.9, Math.max(10, ratio.y[ratio.y.length - 1] * 1.3)]} vlines={[{ at: a.fKnee, label: 'δ = half size', color: 'muted' }]} points={[{ x: s.f, y: a.ratio, color: 'accent' }]} />
      <Plot series={[{ x: prof.x, y: prof.y, label: 'current density |J| / J(surface)', color: 'accent' }, { x: prof.x, y: prof.ref, label: 'e^(−depth/δ)', color: 'muted', dashed: true }]} xUnit="m" xLabel="Depth below the surface" yLabel="|J|/J_s" height={190}
        xRange={[0, half]} yRange={[0, Math.max(1.05, Math.max(...prof.y) * 1.05)]} vlines={[{ at: Math.min(a.delta, half), label: 'δ', color: 'red' }]} />
    </SimShell>
  );
}
