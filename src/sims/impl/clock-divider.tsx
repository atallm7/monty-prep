// Counter-based clock divider. Model: models/clock-divider.ts
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import { Mode, simulate, duty, effectiveN } from '../models/clock-divider';

const VW = 760, X0 = 78, RH = 46, AMP = 24;

type Row = { name: string; kind: 'bit' | 'bus'; v: number[]; color: string };
function Waves({ rows, cycles, outRow, nOut }: { rows: Row[]; cycles: number; outRow: number; nOut: number }) {
  const cw = (VW - X0 - 10) / cycles, hw = cw / 2;
  const H = rows.length * RH + 44;
  const tx = (i: number) => X0 + i * hw;
  const out = rows[outRow].v; const edges: number[] = [];
  for (let i = 1; i < out.length; i++) if (out[i] && !out[i - 1]) edges.push(i);
  return (
    <svg viewBox={`0 0 ${VW} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Clock divider waveforms">
      {Array.from({ length: cycles + 1 }, (_, k) => <line key={k} x1={tx(2 * k)} x2={tx(2 * k)} y1={14} y2={H - 8} stroke="var(--d-muted)" strokeOpacity={0.22} strokeDasharray="2 4" />)}
      {Array.from({ length: Math.min(cycles, 40) }, (_, k) => cw >= 15 && <text key={k} x={tx(2 * k + 1)} y={10} textAnchor="middle" fontSize={9} fill="var(--d-muted)">{k}</text>)}
      {rows.map((r, ri) => {
        const y0 = 20 + ri * RH + RH / 2, yH = y0 - AMP / 2, yL = y0 + AMP / 2;
        const col = r.color; let d = '';
        const body = r.kind === 'bit' ? (() => {
          r.v.forEach((v, i) => { const y = v ? yH : yL; if (i === 0) d += `M${tx(0)},${y}`; else if (v !== r.v[i - 1]) d += `L${tx(i)},${r.v[i - 1] ? yH : yL}L${tx(i)},${y}`; d += `L${tx(i + 1)},${y}`; });
          return <path d={d} fill="none" stroke={col} strokeWidth={ri === outRow ? 2.6 : 1.8} strokeLinejoin="round" />;
        })() : (() => {
          const cells = []; for (let k = 0; k < cycles; k++) { const xa = tx(2 * k) + 1.5, xb = tx(2 * k + 2) - 1.5;
            cells.push(<g key={k}><path d={`M${xa + 3},${yH} H${xb - 3} L${xb},${y0} L${xb - 3},${yL} H${xa + 3} L${xa},${y0} Z`} fill="var(--d-box)" stroke={col} strokeWidth={1.4} />
              {cw >= 14 && <text x={(xa + xb) / 2} y={y0 + 3.5} textAnchor="middle" fontSize={cw >= 24 ? 11 : 9} fill="var(--d-ink)">{r.v[2 * k]}</text>}</g>); }
          return <>{cells}</>;
        })();
        return <g key={ri}><text x={X0 - 8} y={y0 + 4} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--d-ink)">{r.name}</text>{body}</g>;
      })}
      {edges.slice(0, 6).map((e, i) => <line key={i} x1={tx(e)} x2={tx(e)} y1={14} y2={H - 24} stroke="var(--d-accent)" strokeWidth={1.2} strokeDasharray="5 3" />)}
      {edges.length >= 2 && (() => { const a = tx(edges[0]), b = tx(edges[1]), y = H - 8; return <g><path d={`M${a},${y} H${b}`} stroke="var(--d-accent)" strokeWidth={2} /><text x={(a + b) / 2} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--d-accent)" stroke="var(--d-bg)" strokeWidth={3} paintOrder="stroke">T_out = {nOut} T_clk</text></g>; })()}
    </svg>
  );
}

export default function ClockDivider({ params }: SimProps) {
  const n0 = Math.min(32, Math.max(1, Math.round(Number(params.n ?? 3))));
  const init = { n: n0, mode: 'symmetric' as Mode, fin: 10e6 };
  const [s, set] = useState(init);
  const eN = effectiveN(s.n, s.mode);
  const cycles = Math.min(40, Math.max(10, 2 * eN + 3));
  const sim = useMemo(() => simulate(eN, s.mode, cycles), [eN, s.mode, cycles]);
  const d = useMemo(() => duty(eN, s.mode), [eN, s.mode]);
  const odd = eN % 2 === 1;

  const rows: Row[] = [{ name: 'CLK', kind: 'bit', v: sim.clk, color: 'var(--d-ink)' }];
  if (s.mode === 'ripple') sim.stages.forEach((q, i) => rows.push({ name: `Q${i}`, kind: 'bit', v: q, color: i === sim.stages.length - 1 ? 'var(--d-accent)' : 'var(--d-blue)' }));
  else {
    rows.push({ name: 'count', kind: 'bus', v: sim.count, color: 'var(--d-blue)' });
    if (s.mode === 'symmetric' && odd && sim.a && sim.b) { rows.push({ name: 'A (clk↑)', kind: 'bit', v: sim.a, color: 'var(--d-purple)' }); rows.push({ name: 'B (clk↓)', kind: 'bit', v: sim.b, color: 'var(--d-orange)' }); }
    rows.push({ name: 'OUT', kind: 'bit', v: sim.out, color: 'var(--d-accent)' });
  }
  const outRow = rows.length - 1;
  const ff = s.mode === 'ripple' ? Math.round(Math.log2(eN)) : Math.max(1, Math.ceil(Math.log2(eN))) + (s.mode === 'symmetric' && odd ? 2 : s.mode === 'symmetric' ? 1 : 0);
  const note = s.mode === 'symmetric' ? (eN === 1 ? 'N = 1 passes the clock through.' : odd ? `Odd N: A (rising-edge counter) is high ${(eN + 1) / 2} cycles, B is A re-sampled on the falling edge (half a cycle later); OUT = A AND B is high ${eN}/2 cycles = 50 %.` : `Even N: toggle OUT every ${eN / 2} rising edges, so duty is exactly 50 %.`)
    : s.mode === 'single' ? (odd ? `Single-edge counter, odd N: high ${(eN + 1) / 2} of ${eN} cycles, so the duty is ${(d * 100).toFixed(1)} %, not 50 %.` : 'Even N: a single-edge counter can still be 50 %.')
    : s.mode === 'pulse' ? 'Terminal-count strobe: one clock wide every N cycles. Good as a clock-enable, not as a 50 % clock.'
    : `Toggle flip-flop chain: each stage halves the frequency, so only powers of two (N = ${eN}${eN !== Math.round(s.n) ? `, rounded from ${Math.round(s.n)}` : ''}). Every Q_i is 50 %.`;
  const dutyTone = Math.abs(d - 0.5) < 1e-9 ? 'ok' : s.mode === 'pulse' ? undefined : 'warn';

  return (
    <SimShell title="Clock divider" onReset={() => set(init)}
      tryThis={<>set <b>N = 3</b> and switch between <b>Single edge</b> (duty 2/3) and <b>50 % (both edges)</b>: output edges now land on falling clock edges. Then try <b>Toggle chain</b> and read each Q<sub>i</sub> = f<sub>in</sub>/2<sup>i+1</sup>.</>}
      controls={<>
        <Slider label="Divide ratio N" value={s.n} min={1} max={32} step={1} format={v => String(Math.round(v))} onChange={v => set(p => ({ ...p, n: Math.round(v) }))} />
        <Seg label="Divider type" value={s.mode} onChange={m => set(p => ({ ...p, mode: m }))} options={[{ value: 'symmetric', label: '50 % (both edges)' }, { value: 'single', label: 'Single edge' }, { value: 'pulse', label: '1-cycle pulse' }, { value: 'ripple', label: 'Toggle chain' }]} />
        <Slider label="Input clock fin" value={s.fin} min={1e3} max={1e9} log unit="Hz" onChange={v => set(p => ({ ...p, fin: v }))} />
        <Note>{note}</Note>
      </>}>
      <div className="figure-body" style={{ padding: 6, display: 'block' }}><Waves rows={rows} cycles={cycles} outRow={outRow} nOut={eN} /></div>
      <Readouts>
        <Readout k="f_out" v={si(s.fin / eN, 'Hz')} hl />
        <Readout k="T_out" v={si(eN / s.fin, 's')} />
        <Readout k="Duty cycle" v={(d * 100).toFixed(1) + ' %'} tone={dutyTone as any} />
        <Readout k="Counter" v={s.mode === 'ripple' ? `${ff} T flip-flops` : `${Math.max(1, Math.ceil(Math.log2(eN)))}-bit, counts 0..${eN - 1}`} />
        <Readout k="Flip-flops (approx.)" v={String(ff)} />
        <Readout k="Edges used" v={s.mode === 'symmetric' && odd ? 'rising + falling' : 'rising'} />
      </Readouts>
      <div style={{ marginTop: 6 }}><RegionBadge label={Math.abs(d - 0.5) < 1e-9 ? '50 % duty' : s.mode === 'pulse' ? 'strobe' : `duty ${(d * 100).toFixed(0)} %`} color={Math.abs(d - 0.5) < 1e-9 ? 'ok' : s.mode === 'pulse' ? 'info' : 'warn'} /></div>
      <EqBox>{String.raw`f_{out}=\frac{f_{in}}{N}=\frac{\text{${si(s.fin, 'Hz')}}}{${eN}}=\text{${si(s.fin / eN, 'Hz')}},\qquad D=${(d * 100).toFixed(1)}\%`}</EqBox>
    </SimShell>
  );
}
