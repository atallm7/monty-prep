// Power sequencing timeline: enable chains, soft-start, PG, power-down order and rule checking.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Select, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { simulate, PRESETS, MASTER, OFF_FRAC, FAULT_FRAC, Rail, DownMode } from '../models/power-sequencing';

type PresetKey = 'soc' | 'fpga';
const COLORS = ['accent', 'blue', 'green', 'orange'];
const ms = (t: number) => (isFinite(t) ? `${(t * 1e3).toFixed(2)} ms` : '—');

function initState(preset: PresetKey) {
  const P = PRESETS[preset];
  return { preset, rails: P.rails.map(r => ({ ...r })), down: 'reverse' as DownMode, tOff: P.tOff, sel: 0 };
}

export default function PowerSequencing({ params }: SimProps) {
  const p0: PresetKey = params.preset === 'fpga' ? 'fpga' : 'soc';
  const [s, set] = useState(() => initState(p0));
  const P = PRESETS[s.preset];
  const rules = P.rules;
  const tEnd = s.down === 'none' ? s.tOff : s.tOff + 28e-3;
  const r = useMemo(() => simulate({ rails: s.rails, rules, down: s.down, tOff: s.tOff, tEnd, dt: tEnd / 5000 }), [s.rails, rules, s.down, s.tOff, tEnd]);
  const sel = s.rails[s.sel];
  const updRail = (k: keyof Rail) => (v: any) => set(p => ({ ...p, rails: p.rails.map((x, i) => (i === p.sel ? { ...x, [k]: v } : x)) }));
  const nBad = r.rules.filter(x => !x.ok).length;

  const vSeries = s.rails.map((rail, i) => ({ x: r.t, y: r.v[i], label: rail.name, color: COLORS[i % 4] }));
  const pgSeries = s.rails.map((rail, i) => ({ x: r.t, y: r.pg[i].map(b => (s.rails.length - 1 - i) * 2 + (b ? 1.2 : 0)), label: 'PG_' + rail.name.replace(/^V(DD_|CC)?/, ''), color: COLORS[i % 4], step: true }));
  const badSpans = r.rules.flatMap(x => x.intervals.map(iv => ({ from: iv.from, to: Math.max(iv.to, iv.from + tEnd / 400), color: 'red' })));
  const vmax = Math.max(...s.rails.map(x => x.vnom)) * 1.12;
  const marks = [{ at: 0, label: 'EN↑', color: 'muted' }, ...(s.down !== 'none' ? [{ at: s.tOff, label: 'EN↓', color: 'muted' }] : [])];

  const srcOptions = [{ value: String(MASTER), label: 'Master EN' }, ...s.rails.map((x, i) => ({ value: String(i), label: `PG of ${x.name}` })).filter((_, i) => i !== s.sel)];
  const tEnSel = r.tEn[s.sel];
  const srcName = sel.src === MASTER ? 't_{EN}' : `t_{PG,${s.rails[sel.src]?.name.replace(/_/g, '\\_')}}`;
  const eq = String.raw`t_{PG} = ${srcName} + t_{delay} + th\cdot t_{ss} = ${isFinite(tEnSel) ? (tEnSel * 1e3 - sel.delay * 1e3).toFixed(2) : '?'} + ${(sel.delay * 1e3).toFixed(2)} + ${sel.th.toFixed(2)}\cdot${(sel.tss * 1e3).toFixed(2)} = ${isFinite(r.tPg[s.sel]) ? (r.tPg[s.sel] * 1e3).toFixed(2) + '\\,\\text{ms}' : '\\text{never}'}\qquad V(t)=V_0e^{-t/\tau_{off}}`;

  return (
    <SimShell title="Power sequencing timeline" onReset={() => set(initState(p0))}
      tryThis={<>pick {s.preset === 'soc' ? 'VDD_IO' : 'VCCO'} and change its enable source to "Master EN" with zero delay: the I/O rail now rises before the core is good and the "before" and voltage-difference rules turn red. Then restore the chain and switch power-down to "All at once": the big I/O bulk capacitor (long τ<sub>off</sub>) keeps I/O up after the core collapses, which is exactly why designs sequence down in reverse or add active discharge. Inject a fault on a middle rail and watch the PG chain stop every rail after it.</>}
      controls={<>
        <Seg label="Preset" value={s.preset} options={[{ value: 'soc', label: 'SoC' }, { value: 'fpga', label: 'FPGA' }]} onChange={v => set(initState(v))} />
        <Seg label="Power-down" value={s.down} options={[{ value: 'none', label: 'Up only' }, { value: 'reverse', label: 'Reverse seq.' }, { value: 'simultaneous', label: 'All at once' }]} onChange={v => set(p => ({ ...p, down: v }))} />
        {s.down !== 'none' && <Slider label="Master EN falls at" value={s.tOff} min={8e-3} max={40e-3} step={0.5e-3} unit="s" onChange={v => set(p => ({ ...p, tOff: v }))} />}
        <Select label="Edit rail" value={String(s.sel)} options={s.rails.map((x, i) => ({ value: String(i), label: `${x.name} (${x.vnom} V)` }))} onChange={v => set(p => ({ ...p, sel: Number(v) }))} />
        <Select label="Enabled by" value={String(sel.src)} options={srcOptions} onChange={v => updRail('src')(Number(v))} />
        <Slider label="Enable delay" value={sel.delay} min={0} max={10e-3} step={0.1e-3} unit="s" onChange={updRail('delay')} />
        <Slider label="Soft-start time tss" value={sel.tss} min={0.1e-3} max={10e-3} log unit="s" onChange={updRail('tss')} />
        <Slider label="PG threshold" value={sel.th} min={0.7} max={0.98} step={0.01} format={v => (v * 100).toFixed(0) + '% of Vnom'} onChange={updRail('th')} />
        <Slider label="Discharge τoff (C·R load)" value={sel.tau} min={0.1e-3} max={20e-3} log unit="s" onChange={updRail('tau')} />
        <Toggle label={`Fault: ${sel.name} stalls at ${FAULT_FRAC * 100}%`} checked={!!sel.fault} onChange={updRail('fault')} />
        <Note>Each rail ramps linearly over t<sub>ss</sub> once enabled; PG asserts at the threshold and is pulled low when the rail is disabled. In reverse power-down a rail turns off only after every rail it enabled has fallen below {OFF_FRAC * 100}% (plus its delay).</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <RegionBadge label={nBad ? `${nBad} rule${nBad > 1 ? 's' : ''} violated` : 'All sequencing rules met'} color={nBad ? 'bad' : 'ok'} />
        <RegionBadge label={P.label} color="info" />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', fontSize: 12.5, marginBottom: 8 }} aria-label="enable chain">
        {chainOrder(s.rails).map((i, k) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'var(--d-muted)' }}>{s.rails[i].src === MASTER ? 'EN' : `PG(${s.rails[s.rails[i].src]?.name})`}{s.rails[i].delay > 0 ? ` +${(s.rails[i].delay * 1e3).toFixed(1)} ms` : ''} →</span>
            <span style={{ border: '1px solid var(--d-' + COLORS[i % 4] + ')', color: 'var(--d-' + COLORS[i % 4] + ')', borderRadius: 6, padding: '1px 6px', fontWeight: 600 }}>{s.rails[i].name}{s.rails[i].fault ? ' ⚠' : ''}</span>
            <span style={{ color: 'var(--d-muted)', margin: '0 6px' }}>{k < s.rails.length - 1 ? '|' : ''}</span>
          </span>
        ))}
      </div>
      <Plot series={vSeries} xUnit="s" yUnit="V" xLabel="time" yLabel="rail voltage" height={250} yRange={[0, vmax]} xRange={[0, tEnd]}
        xspans={badSpans} vlines={marks}
        hlines={[{ at: sel.th * sel.vnom, label: `PG th ${sel.name}`, color: 'muted' }]} />
      <Plot series={pgSeries} xUnit="s" xLabel="power-good signals (high = good); red bands = rule violated" height={150} xRange={[0, tEnd]}
        yRange={[-0.3, s.rails.length * 2 - 0.5]} yTickFormat={() => ''} xspans={badSpans} vlines={marks} />
      <div className="rules" style={{ display: 'grid', gap: 6, margin: '8px 0' }}>
        {rules.map((ru, q) => {
          const res = r.rules[q];
          return (
            <div key={q} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
              <RegionBadge label={res.ok ? 'PASS' : 'FAIL'} color={res.ok ? 'ok' : 'bad'} />
              <span>{ru.label}</span>
              {!res.ok && <span style={{ color: 'var(--d-red)' }}>
                first at {ms(res.first)}{ru.kind === 'maxdiff' ? `, exceeds limit by ${si(res.worst, 'V')}` : `, ${s.rails[ru.b].name} reached ${si(res.worst, 'V')} without PG`}
              </span>}
            </div>
          );
        })}
      </div>
      <Readouts>
        {s.rails.map((x, i) => (
          <Readout key={i} k={`${x.name} EN / PG`} v={`${ms(r.tEn[i])} / ${ms(r.tPg[i])}`} hl={i === s.sel} tone={isNaN(r.tPg[i]) ? 'bad' : undefined} />
        ))}
        <Readout k="All rails good at" v={ms(r.allPg)} tone={isNaN(r.allPg) ? 'bad' : 'ok'} />
        {s.down !== 'none' && <Readout k={`Last rail < ${OFF_FRAC * 100}% at`} v={r.tOffReached.some(isNaN) ? 'not yet' : ms(Math.max(...r.tOffReached))} />}
      </Readouts>
      <EqBox>{eq}</EqBox>
    </SimShell>
  );
}

/** Rails ordered by their position in the enable chain (master-enabled first). */
function chainOrder(rails: Rail[]) {
  const out: number[] = []; const seen = new Set<number>();
  const visit = (src: number) => rails.forEach((r, i) => { if (r.src === src && !seen.has(i)) { seen.add(i); out.push(i); visit(i); } });
  visit(MASTER);
  rails.forEach((_, i) => { if (!seen.has(i)) out.push(i); });   // cyclic / orphan chains
  return out;
}
