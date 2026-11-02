// LDO vs buck efficiency comparison, plus V·I·η and Pin/Pout/η calculators.
import { useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { logspace, linspace } from '../../lib/units';
import { ldo, buck, crossovers, solveViio, solveEff, LDO_DEF, BUCK_DEF, ViioKey, EffKey } from '../models/regulator-compare';

type Mode = 'compare' | 'viio' | 'eff';
const tx = (s: string) => String.raw`\text{${s}}`;
const pct = (x: number) => isFinite(x) ? (x * 100).toFixed(1) + '%' : '—';

function NumField(p: { label: string; value: number; unit: string; onChange: (v: number) => void; solved?: boolean; display?: string }) {
  return <label className="ctl">
    <span className="ctl-head"><span className="ctl-label">{p.label}</span>{p.solved && <span className="ctl-val" style={{ color: 'var(--accent)' }}>solved</span>}</span>
    {p.solved ? <div className="input" style={{ height: 32, display: 'flex', alignItems: 'center', fontWeight: 650, background: 'var(--accent-soft)' }}>{p.display}</div>
      : <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input className="input" type="number" step="any" style={{ height: 32, fontSize: 13, minWidth: 0, flex: 1 }} value={p.value}
        onChange={e => { const v = parseFloat(e.target.value); if (isFinite(v)) p.onChange(v); }} aria-label={p.label} /><span className="faint" style={{ fontSize: 13, width: 18 }}>{p.unit}</span></span>}
  </label>;
}

export default function RegulatorCompare({ params }: SimProps) {
  const init = {
    mode: (['compare', 'viio', 'eff'].includes(params.mode) ? params.mode : 'compare') as Mode,
    vin: Number(params.vin ?? 5), vout: Number(params.vout ?? 3.3), iout: Number(params.iout ?? 0.1),
    ldoIq: LDO_DEF.iq, vdo: LDO_DEF.vdo, fsw: BUCK_DEF.fsw, rcond: BUCK_DEF.rcond, buckIq: BUCK_DEF.iq, pfm: false, theta: 60, ta: 25,
    vUnknown: 'iin' as ViioKey, vv: { vin: Number(params.vin ?? 12), iin: 1, vout: Number(params.vout ?? 5), iout: Number(params.iout ?? 2), eff: 0.9 },
    eUnknown: 'pin' as EffKey, ev: { pin: 10, pout: 9, eff: 0.9 },
  };
  const [s, set] = useState(init);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));

  const lp = { iq: s.ldoIq, vdo: s.vdo };
  const bp = { ...BUCK_DEF, fsw: s.fsw, rcond: s.rcond, iq: s.buckIq, pfm: s.pfm };
  const L = ldo(s.vin, s.vout, s.iout, lp), B = buck(s.vin, s.vout, s.iout, bp);
  const curves = useMemo(() => {
    const I = logspace(1e-5, 3, 220);
    const vmin = s.vout + s.vdo, V = linspace(Math.max(0.5, s.vout * 0.8), Math.max(vmin + 1, s.vout * 4), 160);
    return {
      I, lI: I.map(i => ldo(s.vin, s.vout, i, lp).eff * 100), bI: I.map(i => buck(s.vin, s.vout, i, bp).eff * 100),
      V, lV: V.map(v => { const r = ldo(v, s.vout, s.iout, lp); return r.inReg ? r.eff * 100 : NaN; }), bV: V.map(v => v > s.vout ? buck(v, s.vout, s.iout, bp).eff * 100 : NaN),
      x: crossovers(s.vin, s.vout, lp, bp, 1e-5, 3),
    };
  }, [s.vin, s.vout, s.iout, s.ldoIq, s.vdo, s.fsw, s.rcond, s.buckIq, s.pfm]);
  const tj = s.ta + s.theta * L.pdiss;
  const winner = L.inReg ? (L.eff >= B.eff ? 'LDO' : 'Buck') : 'Buck';

  const V = useMemo(() => solveViio(s.vUnknown, s.vv), [s.vUnknown, s.vv]);
  const E = useMemo(() => solveEff(s.eUnknown, s.ev), [s.eUnknown, s.ev]);
  const setVV = (k: ViioKey) => (v: number) => set(p => ({ ...p, vv: { ...p.vv, [k]: k === 'eff' ? v / 100 : v } }));
  const setEV = (k: EffKey) => (v: number) => set(p => ({ ...p, ev: { ...p.ev, [k]: k === 'eff' ? v / 100 : v } }));

  const modeSeg = <Seg label="Mode" value={s.mode} onChange={upd('mode')} options={[{ value: 'compare', label: 'LDO vs buck' }, { value: 'viio', label: 'V·I·η' }, { value: 'eff', label: 'Pin/Pout/η' }]} />;

  if (s.mode === 'viio') {
    const fields: { k: ViioKey; label: string; unit: string; fmt: (v: number) => string }[] = [
      { k: 'vin', label: 'Input voltage Vin', unit: 'V', fmt: v => si(v, 'V', 4) }, { k: 'iin', label: 'Input current Iin', unit: 'A', fmt: v => si(v, 'A', 4) },
      { k: 'vout', label: 'Output voltage Vout', unit: 'V', fmt: v => si(v, 'V', 4) }, { k: 'iout', label: 'Output current Iout', unit: 'A', fmt: v => si(v, 'A', 4) },
      { k: 'eff', label: 'Efficiency η', unit: '%', fmt: v => pct(v) }];
    return (
      <SimShell title="Power-conversion calculator: V·I·η" onReset={() => set(init)}
        tryThis={<>A 3.7 V battery feeding a 5 V, 2 A boost at 90%: solve for I<sub>in</sub> (about 3 A). Then solve for η given a measured input current: if you get above 100%, one of your measurements is wrong.</>}
        controls={<>{modeSeg}
          <Seg label="Solve for" value={s.vUnknown} onChange={upd('vUnknown')} options={fields.map(f => ({ value: f.k, label: f.k === 'eff' ? 'η' : f.label.split(' ').pop()! }))} />
          {fields.map(f => <NumField key={f.k} label={f.label} unit={f.unit} value={f.k === 'eff' ? +(s.vv.eff * 100).toFixed(4) : s.vv[f.k]} onChange={setVV(f.k)} solved={f.k === s.vUnknown} display={f.fmt(V[f.k])} />)}
        </>}>
        <Readouts>
          {fields.map(f => <Readout key={f.k} k={f.label} v={f.fmt(V[f.k])} hl={f.k === s.vUnknown} tone={f.k === s.vUnknown && !V.valid ? 'bad' : undefined} />)}
          <Readout k="Pin" v={si(V.pin, 'W')} /><Readout k="Pout" v={si(V.pout, 'W')} /><Readout k="Loss (heat)" v={si(V.ploss, 'W')} tone={V.ploss < 0 ? 'bad' : undefined} />
        </Readouts>
        {!V.valid && <RegionBadge label="Not physical: η > 100% or a non-positive result. Check the inputs." color="bad" />}
        <EqBox>{String.raw`V_{in}\,I_{in}\,\eta = V_{out}\,I_{out}\;\Rightarrow\; ${tx(si(V.vin, 'V'))}\cdot ${tx(si(V.iin, 'A'))}\cdot ${(V.eff).toFixed(3)} = ${tx(si(V.vout, 'V'))}\cdot ${tx(si(V.iout, 'A'))} = ${tx(si(V.pout, 'W'))}`}</EqBox>
        <Note>Energy is conserved: P<sub>in</sub> = P<sub>out</sub> + P<sub>loss</sub>. A switching converter trades voltage for current (a buck has I<sub>in</sub> &lt; I<sub>out</sub>); a linear regulator cannot, so its I<sub>in</sub> ≥ I<sub>out</sub> and η ≤ V<sub>out</sub>/V<sub>in</sub>.</Note>
      </SimShell>
    );
  }

  if (s.mode === 'eff') {
    const fields: { k: EffKey; label: string; unit: string; fmt: (v: number) => string }[] = [
      { k: 'pin', label: 'Input power Pin', unit: 'W', fmt: v => si(v, 'W', 4) }, { k: 'pout', label: 'Output power Pout', unit: 'W', fmt: v => si(v, 'W', 4) }, { k: 'eff', label: 'Efficiency η', unit: '%', fmt: pct }];
    return (
      <SimShell title="Efficiency calculator: Pin, Pout, η" onReset={() => set(init)}
        tryThis={<>A 10 W load at 90% vs 95%: the loss halves from 1.11 W to 0.53 W. Thermal design cares about the loss, not η, so 5 points of efficiency can halve a heatsink.</>}
        controls={<>{modeSeg}
          <Seg label="Solve for" value={s.eUnknown} onChange={upd('eUnknown')} options={[{ value: 'pin', label: 'Pin' }, { value: 'pout', label: 'Pout' }, { value: 'eff', label: 'η' }]} />
          {fields.map(f => <NumField key={f.k} label={f.label} unit={f.unit} value={f.k === 'eff' ? +(s.ev.eff * 100).toFixed(4) : s.ev[f.k]} onChange={setEV(f.k)} solved={f.k === s.eUnknown} display={f.fmt(E[f.k])} />)}
        </>}>
        <Readouts>
          {fields.map(f => <Readout key={f.k} k={f.label} v={f.fmt(E[f.k])} hl={f.k === s.eUnknown} tone={f.k === s.eUnknown && !E.valid ? 'bad' : undefined} />)}
          <Readout k="Loss Pin − Pout" v={si(E.ploss, 'W')} hl tone={E.ploss < 0 ? 'bad' : undefined} />
          <Readout k="Loss / Pout" v={pct(E.ploss / E.pout)} />
        </Readouts>
        {!E.valid && <RegionBadge label="Not physical: η > 100% or a non-positive result" color="bad" />}
        <EqBox>{String.raw`\eta=\frac{P_{out}}{P_{in}}=\frac{${tx(si(E.pout, 'W'))}}{${tx(si(E.pin, 'W'))}}=${(E.eff * 100).toFixed(2)}\%,\qquad P_{loss}=P_{in}-P_{out}=P_{out}\frac{1-\eta}{\eta}=${tx(si(E.ploss, 'W'))}`}</EqBox>
        <Plot xLabel="efficiency η (%)" yUnit="W" yLabel="loss" height={210} series={[{ x: linspace(50, 99.5, 120), y: linspace(50, 99.5, 120).map(e => E.pout * (1 - e / 100) / (e / 100)), label: `loss for Pout = ${si(E.pout, 'W')}`, color: 'red' }]}
          points={E.valid ? [{ x: E.eff * 100, y: E.ploss, label: 'now', color: 'accent' }] : []} />
      </SimShell>
    );
  }

  return (
    <SimShell title="LDO vs buck efficiency" onReset={() => set(init)}
      tryThis={<>(1) Set V<sub>in</sub> = 3.6 V, V<sub>out</sub> = 3.3 V: the LDO is ~92% efficient at most loads and wins below the crossover. (2) Set V<sub>in</sub> = 12 V at 1 A: the LDO burns {si((12 - s.vout) * 1, 'W')} and its junction would reach {Math.round(s.ta + s.theta * (12 - s.vout))} °C. Then drop the load to 100 µA and toggle PFM to see why bucks skip pulses at light load.</>}
      controls={<>{modeSeg}
        <Slider label="Input voltage Vin" value={s.vin} min={1} max={24} step={0.05} unit="V" onChange={upd('vin')} />
        <Slider label="Output voltage Vout" value={s.vout} min={0.6} max={12} step={0.05} unit="V" onChange={upd('vout')} />
        <Slider label="Load current Iout" value={s.iout} min={1e-5} max={3} log unit="A" onChange={upd('iout')} />
        <Slider label="LDO quiescent Iq" value={s.ldoIq} min={1e-7} max={5e-3} log unit="A" onChange={upd('ldoIq')} />
        <Slider label="LDO dropout voltage" value={s.vdo} min={0.05} max={1.5} step={0.01} unit="V" onChange={upd('vdo')} />
        <Slider label="Buck fsw" value={s.fsw} min={100e3} max={5e6} log unit="Hz" onChange={upd('fsw')} />
        <Slider label="Buck conduction R (Rds + DCR)" value={s.rcond} min={0.005} max={1} log unit="Ω" onChange={upd('rcond')} />
        <Slider label="Buck controller Iq" value={s.buckIq} min={1e-6} max={5e-3} log unit="A" onChange={upd('buckIq')} />
        <Toggle label="Buck PFM / pulse skipping at light load" checked={s.pfm} onChange={upd('pfm')} />
        <Slider label="LDO θJA" value={s.theta} min={10} max={250} step={1} unit="°C/W" format={v => v.toFixed(0) + ' °C/W'} onChange={upd('theta')} />
        <Note>Buck gate charge 3 nC at 5 V, Coss 100 pF, t<sub>r</sub> = t<sub>f</sub> = 5 ns, L = 2.2 µH (sets the PFM threshold).</Note>
      </>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!L.inReg ? <RegionBadge label={`LDO in dropout: Vout = ${si(L.vo, 'V')}`} color="bad" /> : <RegionBadge label={`${winner} wins at this point`} color={winner === 'LDO' ? 'info' : 'accent'} />}
        {s.vout >= s.vin && <RegionBadge label="Buck cannot step up" color="bad" />}
        {B.pfmActive && <RegionBadge label="Buck in PFM (bursting)" color="info" />}
        {L.inReg && tj > 125 && <RegionBadge label={`LDO Tj ≈ ${tj.toFixed(0)} °C: overheats`} color="bad" />}
      </div>
      <Readouts>
        <Readout k="LDO η" v={pct(L.eff)} hl />
        <Readout k="Buck η" v={s.vout < s.vin ? pct(B.eff) : '—'} hl />
        <Readout k="LDO max η = Vout/Vin" v={pct(s.vout / s.vin)} />
        <Readout k="LDO heat (Vin−Vout)·I" v={si(L.pdiss, 'W')} tone={tj > 125 ? 'bad' : tj > 85 ? 'warn' : undefined} />
        <Readout k="LDO Tj (Ta = 25 °C)" v={L.inReg ? tj.toFixed(0) + ' °C' : '—'} tone={tj > 125 ? 'bad' : tj > 85 ? 'warn' : 'ok'} />
        <Readout k="Buck loss" v={si(B.ploss, 'W')} />
        <Readout k="Buck peak-η current" v={si(B.iPeak, 'A')} />
        <Readout k="Crossover load" v={curves.x.length ? curves.x.map(x => si(x, 'A')).join(', ') : 'none'} />
      </Readouts>
      <EqBox>{String.raw`\begin{gathered}\eta_{LDO}=\frac{V_{out}I_{out}}{V_{in}(I_{out}+I_q)}=${pct(L.eff).replace('%', '\\%')}\\ \eta_{buck}=\frac{P_{out}}{P_{out}+\underbrace{V_{in}I_q+Q_gV_{dr}f+\tfrac12C_{oss}V_{in}^2f}_{\text{fixed}}+I^2R+\tfrac12V_{in}I(t_r+t_f)f}=${pct(B.eff).replace('%', '\\%')}\end{gathered}`}</EqBox>
      <Plot xLog xUnit="A" xLabel="load current I_out" yLabel="efficiency (%)" yRange={[0, 100]} height={240}
        series={[{ x: curves.I, y: curves.lI, label: 'LDO', color: 'green', width: 2.2 }, { x: curves.I, y: curves.bI, label: s.pfm ? 'buck (PFM at light load)' : 'buck (fixed-frequency PWM)', color: 'accent', width: 2.2 }]}
        hlines={[{ at: 100 * s.vout / s.vin, label: 'Vout/Vin (LDO ceiling)', color: 'muted' }]}
        vlines={[...curves.x.map(x => ({ at: x, label: 'crossover ' + si(x, 'A'), color: 'orange' })), { at: s.iout, color: 'red' }]}
        points={[{ x: s.iout, y: L.eff * 100, color: 'green' }, { x: s.iout, y: B.eff * 100, color: 'accent' }]} />
      <Plot xUnit="V" xLabel={`input voltage V_in (at I_out = ${si(s.iout, 'A')})`} yLabel="efficiency (%)" yRange={[0, 100]} height={220}
        series={[{ x: curves.V, y: curves.lV, label: 'LDO', color: 'green', width: 2.2 }, { x: curves.V, y: curves.bV, label: 'buck', color: 'accent', width: 2.2 }]}
        vlines={[{ at: s.vout + s.vdo, label: 'dropout', color: 'red' }, { at: s.vin, label: 'now', color: 'muted' }]} />
      <Note>Rule of thumb: an LDO&apos;s efficiency is set by the voltage ratio, a buck&apos;s by its loss budget. LDOs win at small headroom, very light load (tiny I<sub>q</sub>, no switching loss) and when noise matters; bucks win whenever V<sub>in</sub>/V<sub>out</sub> is large and the current is significant.</Note>
    </SimShell>
  );
}
