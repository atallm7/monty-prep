// Return current & plane splits. Pure model in ../models/return-path.ts
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { logspace } from '../../lib/units';
import { Fix, returnPath, returnShape, widthForFraction, slotImpedance, fractionWithin } from '../models/return-path';

export default function ReturnPath({ params }: SimProps) {
  const init = {
    h: Number(params.h ?? 0.2), slot: Boolean(params.slot ?? false), slotLen: Number(params.slotLen ?? 20),
    fix: (['stitch-cap', 'via-bridge'].includes(params.fix) ? params.fix : 'none') as Fix, f: Number(params.f ?? 100),
  };
  const [s, set] = useState(init);
  const up = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const preset = (k: 'solid' | 'split' | 'stitched') => set(p => ({ ...p, slot: k !== 'solid', fix: k === 'stitched' ? 'stitch-cap' : 'none', slotLen: k === 'solid' ? p.slotLen : Math.max(p.slotLen, 20) }));

  const r = useMemo(() => returnPath({ h: s.h, slot: s.slot, slotLen: s.slotLen, fix: s.fix, fMHz: s.f }), [s]);
  const solid = useMemo(() => returnPath({ h: s.h, slot: false, slotLen: s.slotLen, fix: 'none', fMHz: s.f }), [s.h, s.slotLen, s.f]);
  const fs = useMemo(() => logspace(1e6, 1e9, 80), []);
  const zc = useMemo(() => (['none', 'stitch-cap', 'via-bridge'] as Fix[]).map(fix => fs.map(f => slotImpedance({ h: s.h, slot: true, slotLen: s.slotLen, fix, fMHz: 0 }, f))), [fs, s.h, s.slotLen]);

  // ---------- cross-section (cut perpendicular to the trace, through the slot) ----------
  const W = 340;
  const half = Math.max(4 * r.r90, s.slot ? (s.slotLen / 2) * 1.25 : 0, 1.5);
  const X = (mm: number) => W / 2 + (mm / half) * (W / 2 - 14);
  const yTr = 28, yPl = 98, planeH = 10;
  const slotHalf = s.slot ? s.slotLen / 2 : 0;
  // current density bars in the plane: sampled at 1 px resolution; zero inside slot
  const bars: { x: number; hgt: number }[] = [];
  const peak = 1; // normalised J·πh/I (peak = 1)
  for (let px = 14; px <= W - 14; px += 2) {
    const mm = ((px - W / 2) / (W / 2 - 14)) * half;
    if (Math.abs(mm) < slotHalf) continue;
    bars.push({ x: px, hgt: returnShape(mm, s.h) * 46 * peak });
  }
  // redistributed density: current blocked by the slot piles up at the slot edges (draw as a bright edge marker)
  const blockedPct = Math.round(r.blocked * 100);

  // ---------- top view: streamlines with equal current each ----------
  const TW = 340, TH = 170, tcy = TH / 2, Hlat = Math.max(Math.min(s.slot ? (s.slotLen / 2) * 1.35 : 0, 40), 1.2 * r.r90, 2);
  const LY = (mm: number) => (mm / Hlat) * 66;
  const nSide = 8;
  const quant = Array.from({ length: nSide }, (_, i) => widthForFraction((i + 0.5) / nSide, s.h));
  const slotX = 170, slotW = 10;
  const streams = useMemo(() => {
    const out: { d: string; det: boolean; k: number }[] = [];
    quant.forEach((q, k) => [-1, 1].forEach(sgn => {
      const off = sgn * q; const y0 = tcy + LY(off);
      const clip = Math.abs(LY(off)) > 62;
      const yy = tcy + Math.sign(off) * Math.min(Math.abs(LY(off)), 62);
      if (clip) { out.push({ d: `M${TW - 14},${yy} L14,${yy}`, det: false, k }); return; }
      if (s.slot && Math.abs(off) < slotHalf) {
        const yEnd = tcy + sgn * (LY(slotHalf) + 7 + k * 0.8);
        const xr = slotX + slotW / 2 + 8, xl = slotX - slotW / 2 - 8;
        out.push({ d: `M${TW - 14},${y0} L${xr + 26},${y0} C${xr + 8},${y0} ${xr + 6},${yEnd} ${slotX},${yEnd} C${xl - 6},${yEnd} ${xl - 8},${y0} ${xl - 26},${y0} L14,${y0}`, det: true, k });
      } else out.push({ d: `M${TW - 14},${y0} L14,${y0}`, det: false, k });
    }));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.h, s.slot, s.slotLen, Hlat]);
  const fixX = slotX - 18;
  const fixY = tcy;

  const Lnh = (v: number) => (v * 1e9).toFixed(1) + ' nH';
  const penTone = r.emiPenaltyDb > 6 ? 'bad' : r.emiPenaltyDb > 2 ? 'warn' : 'ok';

  return (
    <SimShell title="Return current & plane splits" onReset={() => set(init)}
      tryThis={<>start with the solid plane and drag the trace height h from 0.1 to 1 mm: the return current is a Lorentzian, 50% of it flows within ±h and 90% within ±6.3h, so a low trace pulls its return tight under it. Turn the <b>slot</b> on: the currents inside ±slot/2 detour around the slot end, loop inductance and the emission penalty jump. Now pick <b>Stitching cap</b> or <b>Via bridge</b> and watch the extra impedance collapse at 100 MHz.</>}
      controls={<>
        <Seg label="Presets" value={!s.slot ? 'solid' : s.fix === 'stitch-cap' ? 'stitched' : 'split'} options={[{ value: 'solid', label: 'Solid' }, { value: 'split', label: 'Split' }, { value: 'stitched', label: 'Stitched' }]} onChange={preset} />
        <Slider label="Trace height h above plane" value={s.h} min={0.05} max={2} log format={v => v.toFixed(2) + ' mm'} onChange={up('h')} />
        <Toggle label="Slot / split in the plane under the trace" checked={s.slot} onChange={up('slot')} />
        <Slider label="Slot length (across the trace)" value={s.slotLen} min={1} max={60} step={1} format={v => v.toFixed(0) + ' mm'} disabled={!s.slot} onChange={up('slotLen')} />
        <Seg label="Fix across the slot" value={s.fix} options={[{ value: 'none', label: 'None' }, { value: 'stitch-cap', label: 'Stitch cap' }, { value: 'via-bridge', label: 'Via bridge' }]} onChange={up('fix')} />
        <Slider label="Signal frequency" value={s.f} min={1} max={1000} log format={v => si(v * 1e6, 'Hz')} onChange={up('f')} />
        <Note>Model assumes a 0.3 mm trace, 50 mm long, ±10 mA edges, a 100 nF stitching cap with 1.5 nH ESL placed at the crossing, and a ~1.2 nH via bridge. Estimates are first-order, to show trends.</Note>
      </>}>
      <style>{`@keyframes rp-flow{to{stroke-dashoffset:-14}}.rp-flow{animation:rp-flow 0.9s linear infinite}@media (prefers-reduced-motion:reduce){.rp-flow{animation:none}}`}</style>
      {/* cross-section */}
      <svg viewBox={`0 0 ${W} 152`} width="100%" role="img" aria-label="Cross-section: trace over plane with return current density" style={{ display: 'block', maxWidth: 440, margin: '0 auto' }}>
        <text x={8} y={12} fontSize={11} fill="var(--d-muted)">Cross-section (cut across the trace{s.slot ? ', through the slot' : ''})</text>
        <rect x={6} y={yTr + 10} width={W - 12} height={yPl - yTr - 10} fill="var(--d-box)" opacity={0.7} />
        {/* plane */}
        {s.slot
          ? <>
            <rect x={6} y={yPl} width={Math.max(0, X(-slotHalf) - 6)} height={planeH} fill="var(--d-orange)" />
            <rect x={X(slotHalf)} y={yPl} width={Math.max(0, W - 6 - X(slotHalf))} height={planeH} fill="var(--d-orange)" />
            <text x={W / 2} y={yPl + 8} fontSize={10} textAnchor="middle" fill="var(--d-red)">slot {s.slotLen} mm</text>
          </>
          : <rect x={6} y={yPl} width={W - 12} height={planeH} fill="var(--d-orange)" />}
        <text x={W - 8} y={yPl + planeH + 12} fontSize={10} textAnchor="end" fill="var(--d-muted)">reference plane</text>
        {/* current density */}
        {bars.map(b => <rect key={b.x} x={b.x - 1} y={yPl - b.hgt} width={2} height={b.hgt} fill="var(--d-blue)" opacity={0.55} />)}
        {/* trace */}
        <rect x={W / 2 - 4} y={yTr} width={8} height={5} fill="var(--d-orange)" stroke="var(--d-ink)" strokeWidth={0.8} />
        <text x={W / 2 + 10} y={yTr + 5} fontSize={10} fill="var(--d-ink)">signal ⊙</text>
        {/* h dimension */}
        <line x1={W / 2 - 10} x2={W / 2 - 10} y1={yTr + 5} y2={yPl} stroke="var(--d-accent)" strokeWidth={1} />
        <text x={W / 2 - 14} y={(yTr + yPl) / 2 + 8} fontSize={10} textAnchor="end" fill="var(--d-accent)">h = {s.h.toFixed(2)} mm</text>
        {/* r50 / r90 markers */}
        {([[r.r50, '50%'], [r.r90, '90%']] as [number, string][]).map(([w, l]) => [-1, 1].map(sg => {
          const x = X(sg * w); if (x < 8 || x > W - 8) return null;
          return <g key={l + sg}><line x1={x} x2={x} y1={yPl + planeH} y2={yPl + planeH + 8} stroke="var(--d-green)" strokeWidth={1.5} /></g>;
        }))}
        <text x={8} y={134} fontSize={10} fill="var(--d-blue)">▮ return-current density J(x) ∝ 1/(1+(x/h)²)</text><text x={8} y={146} fontSize={10} fill="var(--d-green)">| ticks: 50% within ±{r.r50.toFixed(2)} mm, 90% within ±{r.r90.toFixed(2)} mm</text>
      </svg>

      {/* top view */}
      <svg viewBox={`0 0 ${TW} ${TH}`} width="100%" role="img" aria-label="Top view: return current streamlines detouring around a slot" style={{ display: 'block', maxWidth: 440, margin: '0 auto' }}>
        <rect x={6} y={6} width={TW - 12} height={TH - 12} rx={4} fill="var(--d-box)" opacity={0.55} stroke="var(--d-muted)" />
        <text x={12} y={20} fontSize={11} fill="var(--d-muted)">Top view: ground plane, return paths (blue, equal current each)</text>
        {s.slot && <>
          <rect x={slotX - slotW / 2} y={tcy - LY(slotHalf)} width={slotW} height={2 * LY(slotHalf)} fill="var(--d-bg)" stroke="var(--d-red)" strokeWidth={1.2} strokeDasharray="4 3" />
          <text x={slotX} y={Math.max(30, tcy - LY(slotHalf) - 4)} fontSize={10} textAnchor="middle" fill="var(--d-red)">slot</text>
        </>}
        {streams.map((st, i) => <path key={i} d={st.d} fill="none" stroke={st.det ? 'var(--d-red)' : 'var(--d-blue)'} strokeWidth={1.8} strokeLinecap="round" strokeDasharray="8 6" className="rp-flow" opacity={0.85} />)}
        {/* signal trace on top (current flows left -> right) */}
        <line x1={14} x2={TW - 14} y1={tcy} y2={tcy} stroke="var(--d-orange)" strokeWidth={4} />
        <path d={`M${60},${tcy - 7} l10,7 l-10,7`} fill="none" stroke="var(--d-ink)" strokeWidth={1.5} />
        <text x={18} y={tcy - 9} fontSize={10} fill="var(--d-ink)">signal →</text>
        <text x={TW - 18} y={tcy + 18} fontSize={10} textAnchor="end" fill="var(--d-blue)">← return</text>
        {s.slot && s.fix === 'stitch-cap' && <g><line x1={fixX} y1={fixY - 9} x2={fixX} y2={fixY + 9} stroke="var(--d-green)" strokeWidth={2} /><rect x={fixX - 3} y={fixY - 10} width={14} height={20} fill="none" stroke="var(--d-green)" /><text x={fixX + 4} y={fixY + 26} fontSize={10} fill="var(--d-green)">cap</text></g>}
        {s.slot && s.fix === 'via-bridge' && <g><line x1={fixX} y1={fixY - 9} x2={fixX + 18} y2={fixY - 9} stroke="var(--d-green)" strokeWidth={3} /><circle cx={fixX} cy={fixY - 9} r={3} fill="var(--d-green)" /><circle cx={fixX + 18} cy={fixY - 9} r={3} fill="var(--d-green)" /><text x={fixX} y={fixY + 26} fontSize={10} fill="var(--d-green)">bridge</text></g>}
        <text x={12} y={TH - 12} fontSize={10} fill="var(--d-muted)">lateral scale ±{Hlat.toFixed(1)} mm{s.slot && s.fix !== 'none' ? '; fix gives a short local return path' : ''}</text>
      </svg>

      <div style={{ margin: '6px 0' }}>
        <RegionBadge label={!s.slot ? 'Solid plane: tight return' : s.fix === 'none' ? `Slot: ${blockedPct}% of return detours` : s.fix === 'stitch-cap' ? 'Stitch cap: HF bypass' : 'Via bridge: local return'} color={!s.slot ? 'ok' : s.fix === 'none' ? 'bad' : 'info'} />
      </div>
      <Readouts>
        <Readout k="Return within ±h (50%)" v={`${r.r50.toFixed(2)} mm`} />
        <Readout k="90% of return within" v={`±${r.r90.toFixed(2)} mm`} />
        <Readout k="Loop inductance" v={`${Lnh(solid.Ltot)} → ${Lnh(r.Ltot)}`} hl />
        <Readout k="Loop area vs solid" v={`${r.loopAreaRel.toFixed(2)}×`} />
        <Readout k="Emission penalty" v={`${r.emiPenaltyDb >= 0 ? '+' : ''}${r.emiPenaltyDb.toFixed(1)} dB`} tone={penTone} hl />
        <Readout k={`Slot noise (±10 mA, ${si(s.f * 1e6, 'Hz')})`} v={si(r.noiseV, 'V')} tone={r.noiseV > 0.05 ? 'bad' : r.noiseV > 0.01 ? 'warn' : 'ok'} />
        <Readout k="Extra Z across slot" v={si(r.zmag, 'Ω')} />
        <Readout k="Current blocked by slot" v={`${blockedPct}%`} />
      </Readouts>
      <EqBox>{String.raw`J(x)=\frac{I}{\pi h}\frac{1}{1+(x/h)^2},\quad F(\pm a)=\tfrac{2}{\pi}\tan^{-1}\!\frac{a}{h} \;\Rightarrow\; F(\pm ${(Math.min(s.slot ? s.slotLen / 2 : s.h, 99)).toFixed(1)}\,\text{mm})=${(fractionWithin(s.slot ? s.slotLen / 2 : s.h, s.h) * 100).toFixed(0)}\%`}</EqBox>
      <Plot series={[
        { x: fs, y: zc[0], label: 'Slot, no fix', color: 'red' },
        { x: fs, y: zc[1], label: 'Stitch cap', color: 'green' },
        { x: fs, y: zc[2], label: 'Via bridge', color: 'blue' },
      ]} xLog yLog xUnit="Hz" yUnit="Ω" xLabel="Frequency" yLabel="Extra return impedance across slot" height={220}
        vlines={[{ at: s.f * 1e6, label: 'f', color: 'orange' }]}
        points={s.slot ? [{ x: s.f * 1e6, y: Math.max(r.zmag, 1e-4), label: 'now', color: 'accent' }] : []} />
    </SimShell>
  );
}
