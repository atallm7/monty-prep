// H-bridge & half-bridge: click the switches, see the current path, direction, coast / brake / shoot-through, freewheeling and dead time.
import { useEffect, useMemo, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Readout, Readouts, EqBox, Note, RegionBadge, si } from '../kit';
import Plot from '../../components/Plot';
import { simulate, describe, shootThrough, leg, cfgH, steady, deadTime, type LegKind } from '../models/h-bridge-lab';

const RPM = 60 / (2 * Math.PI);
type Sw = { q1: boolean; q2: boolean; q3: boolean; q4: boolean };
const PRE: Record<string, Sw> = {
  fwd: { q1: true, q2: false, q3: false, q4: true }, rev: { q1: false, q2: true, q3: true, q4: false }, coast: { q1: false, q2: false, q3: false, q4: false },
  brake: { q1: false, q2: true, q3: false, q4: true }, shoot: { q1: true, q2: true, q3: false, q4: false },
};
const WINS = [{ value: '0.002', label: '2 ms' }, { value: '0.02', label: '20 ms' }, { value: '0.2', label: '200 ms' }];

export default function HBridgeLab({ params }: SimProps) {
  const half = params.mode === 'half';
  const init = { vbat: 12, tload: 0, win: '0.02', view: 'bridge' as 'bridge' | 'dead', fsw: 50e3, duty: 0.5, td: 200e-9, iload: 5 };
  const [s, set] = useState(init);
  const [sw, setSw] = useState<Sw>(half ? { q1: true, q2: false, q3: false, q4: false } : PRE.fwd);
  const [start, setStart] = useState({ i: 0, w: 0 });
  const [frac, setFrac] = useState(0.05);
  const upd = <K extends keyof typeof s>(k: K) => (v: (typeof s)[K]) => set(p => ({ ...p, [k]: v }));
  const tEnd = Number(s.win);
  const inp = { vbat: s.vbat, ...sw, half, tload: s.tload };
  const sim = useMemo(() => simulate(inp, tEnd, start.i, start.w, 500), [s.vbat, s.tload, s.win, sw, start, half]);
  const k = Math.min(sim.t.length - 1, Math.round(frac * (sim.t.length - 1)));
  const iNow = sim.i[k], wNow = sim.w[k];
  const q = cfgH(inp);
  const desc = describe(inp), st = shootThrough(q);
  const apply = (next: Sw) => { setStart({ i: iNow, w: wNow }); setSw(next); setFrac(0.02); };
  const toggle = (key: keyof Sw) => apply({ ...sw, [key]: !sw[key] });
  const preset = (name: string) => { const p = PRE[name]; apply(half ? { q1: p.q1, q2: p.q2, q3: false, q4: false } : p); };
  const reset = () => { set(init); setSw(half ? { q1: true, q2: false, q3: false, q4: false } : PRE.fwd); setStart({ i: 0, w: 0 }); setFrac(0.05); };

  const A = leg(sw.q1, sw.q2, iNow, q), B = half ? { kind: 'ls' as LegKind, v: 0 } : leg(sw.q3, sw.q4, -iNow, q);
  const ss = steady(inp);
  const dt = useMemo(() => deadTime({ vbat: s.vbat, fsw: s.fsw, duty: s.duty, td: s.td, iload: s.iload }), [s.vbat, s.fsw, s.duty, s.td, s.iload]);
  const T = 1 / s.fsw;

  // ---- drawing helpers -------------------------------------------------
  const mag = Math.abs(iNow) > 1e-3 * Math.max(1, s.vbat);
  const dir = (up: boolean) => (up ? -1 : 1);
  const Flow = ({ x1, y1, x2, y2, on, color }: { x1: number; y1: number; x2: number; y2: number; on: boolean; color: string }) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? color : 'var(--d-ink)'} strokeWidth={on ? 3.5 : 1.8} opacity={on ? 1 : 0.35} strokeDasharray={on ? '7 6' : undefined} strokeLinecap="round">
      {on && <animate attributeName="stroke-dashoffset" from="13" to="0" dur="0.6s" repeatCount="indefinite" />}
    </line>
  );
  const shootCol = 'var(--d-red)', cur = 'var(--d-accent)';
  // current through each rail segment, flow direction given by endpoints order (x1,y1)→(x2,y2)
  const aTopOn = A.kind === 'shoot' || ((A.kind === 'hs' || A.kind === 'diodeHigh') && mag), aBotOn = A.kind === 'shoot' || ((A.kind === 'ls' || A.kind === 'diodeLow') && mag);
  const bTopOn = B.kind === 'shoot' || ((B.kind === 'hs' || B.kind === 'diodeHigh') && mag), bBotOn = B.kind === 'shoot' || ((B.kind === 'ls' || B.kind === 'diodeLow') && mag);
  const ioA = iNow, ioB = -iNow;
  const colA = A.kind === 'shoot' ? shootCol : cur, colB = B.kind === 'shoot' ? shootCol : cur;
  const swBox = (key: keyof Sw, cx: number, cy: number, name: string, shootLeg: boolean) => {
    const on = sw[key];
    const fill = on ? (shootLeg ? 'var(--d-red)' : 'var(--d-green)') : 'var(--d-box)';
    return (
      <g role="button" tabIndex={0} aria-label={`${name} ${on ? 'on' : 'off'}: click to toggle`} aria-pressed={on} style={{ cursor: 'pointer' }}
        onClick={() => toggle(key)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(key); } }}>
        <rect x={cx - 26} y={cy - 22} width={52} height={44} rx={8} fill={fill} stroke="var(--d-ink)" strokeWidth={1.6} opacity={on ? 0.9 : 1} />
        <text x={cx} y={cy - 3} textAnchor="middle" fontSize={13} fontWeight={700} fill={on ? '#fff' : 'var(--d-ink)'}>{name}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={11} fill={on ? '#fff' : 'var(--d-muted)'}>{on ? 'ON' : 'off'}</text>
        <path d={`M ${cx + 36} ${cy + 8} l 8 -14 l 8 14 z M ${cx + 36} ${cy + 11} h 16`} fill="none" stroke="var(--d-muted)" strokeWidth={1.3} />
      </g>
    );
  };
  const XA = 120, XB = 300, YT = 24, YA = 150, YB = 276;
  const diodeNote = (kind: LegKind) => kind === 'diodeLow' ? 'low-side diode' : kind === 'diodeHigh' ? 'high-side diode' : '';

  return (
    <SimShell title={half ? 'Half-bridge' : 'H-bridge'} onReset={reset}
      tryThis={half ? <>Turn on the <b>high-side</b> switch to drive the motor from the supply, then switch to the <b>low-side</b> switch: the motor current freewheels and the motor brakes, since a half-bridge can only drive in one direction. Turn both on together to see shoot-through, I = V<sub>bat</sub>/(2R<sub>on</sub>). Then open the <b>Dead time</b> view.</> : <>Start with <b>Forward</b>, scrub the time slider to watch the inrush, then press <b>Coast</b>: with every switch off the inductive current keeps flowing through the <i>body diodes</i> (a dead-time-style freewheel against V<sub>bat</sub> + 2V<sub>f</sub>) and dies in about L·I/(V<sub>bat</sub>+2V<sub>f</sub>). Press <b>Brake</b> to short the motor through the low sides and watch it stop faster. Finally turn on Q1 and Q2 together: shoot-through, I = V<sub>bat</sub>/(2R<sub>on</sub>) amps. Then open the <b>Dead time</b> view and set the dead time negative.</>}
      controls={<>
        <Seg label="View" value={s.view} options={[{ value: 'bridge', label: half ? 'Half-bridge' : 'H-bridge' }, { value: 'dead', label: 'Dead time' }]} onChange={upd('view')} />
        <Slider label="Battery Vbat" value={s.vbat} min={3} max={48} step={0.5} unit="V" onChange={upd('vbat')} />
        {s.view === 'bridge' ? <>
          <div className="ctl"><span className="ctl-head"><span className="ctl-label">Command presets</span></span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(half ? [['fwd', 'High side'], ['rev', 'Low side'], ['coast', 'Both off'], ['shoot', 'Shoot-through']] : [['fwd', 'Forward'], ['rev', 'Reverse'], ['coast', 'Coast'], ['brake', 'Brake'], ['shoot', 'Shoot-through']]).map(([k2, l]) =>
                <button key={k2} className="btn btn-sm" onClick={() => preset(k2)}>{l}</button>)}
            </div></div>
          <Slider label="Load torque" value={s.tload} min={0} max={0.05} step={0.001} unit="N·m" onChange={upd('tload')} />
          <Seg label="Time window" value={s.win} options={WINS} onChange={v => { upd('win')(v); }} />
          <Slider label="Time since command (scrub)" value={frac * tEnd} min={0} max={tEnd} step={tEnd / 500} unit="s" onChange={v => setFrac(v / tEnd)} />
          <Note>Motor: R = {q.r} Ω, L = {q.l * 1e3} mH, K<sub>e</sub> = K<sub>t</sub> = {q.ke} V·s/rad, R<sub>on</sub> = {q.ron * 1e3} mΩ, V<sub>f</sub> = {q.vf} V. Click a switch or use the presets; the motor state carries over from the previous command.</Note>
        </> : <>
          <Slider label="Switching frequency" value={s.fsw} min={5e3} max={500e3} log unit="Hz" onChange={upd('fsw')} />
          <Slider label="Duty cycle" value={s.duty} min={0.1} max={0.9} step={0.01} onChange={upd('duty')} format={v => (v * 100).toFixed(0) + ' %'} />
          <Slider label="Dead time (negative = overlap)" value={s.td} min={-300e-9} max={1e-6} step={10e-9} unit="s" onChange={upd('td')} />
          <Slider label="Load current (out of switch node)" value={s.iload} min={-10} max={10} step={0.5} unit="A" onChange={upd('iload')} />
        </>}
      </>}>
      {s.view === 'bridge' ? <>
        <svg viewBox="0 0 420 310" width="100%" style={{ maxWidth: 520, display: 'block', margin: '0 auto' }} role="img" aria-label="H-bridge schematic">
          <text x={20} y={YT + 4} fontSize={13} fontWeight={700} fill="var(--d-red)">+{s.vbat} V</text>
          <line x1={XA - 30} y1={YT} x2={XB + 30} y2={YT} stroke="var(--d-ink)" strokeWidth={2} />
          <line x1={XA - 30} y1={YB} x2={XB + 30} y2={YB} stroke="var(--d-ink)" strokeWidth={2} />
          <text x={20} y={YB + 4} fontSize={13} fontWeight={700} fill="var(--d-muted)">GND</text>
          {/* left leg */}
          <Flow x1={XA} y1={YT} x2={XA} y2={YA} on={aTopOn} color={colA} />
          <Flow x1={XA} y1={YB} x2={XA} y2={YA} on={aBotOn} color={colA} />
          {/* flow direction: lines drawn from the rail toward the node; reversed ones are drawn node→rail by swapping */}
          {!half && <><Flow x1={XB} y1={YT} x2={XB} y2={YA} on={bTopOn} color={colB} /><Flow x1={XB} y1={YB} x2={XB} y2={YA} on={bBotOn} color={colB} /></>}
          {half && <><Flow x1={XB} y1={YA} x2={XB} y2={YB} on={mag} color={cur} /></>}
          {/* motor */}
          <Flow x1={iNow >= 0 ? XA : XB} y1={YA} x2={iNow >= 0 ? XB : XA} y2={YA} on={mag} color={cur} />
          <circle cx={(XA + XB) / 2} cy={YA} r={26} fill="var(--d-bg)" stroke="var(--d-ink)" strokeWidth={2} />
          <text x={(XA + XB) / 2} y={YA + 5} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--d-ink)">M</text>
          <text x={(XA + XB) / 2} y={YA - 34} textAnchor="middle" fontSize={11} fill="var(--d-muted)">{Math.abs(iNow) < 1e-4 ? 'i ≈ 0' : `i = ${si(iNow, 'A')} (${iNow > 0 ? 'A → B' : 'B → A'})`}</text>
          <text x={XA - 6} y={YA - 8} textAnchor="end" fontSize={11} fill="var(--d-ink)">A {isNaN(A.v) ? 'floating' : si(A.v, 'V')}</text>
          {!half && <text x={XB + 6} y={YA - 8} textAnchor="start" fontSize={11} fill="var(--d-ink)">B {isNaN(B.v) ? 'floating' : si(B.v, 'V')}</text>}
          <circle cx={XA} cy={YA} r={3.5} fill="var(--d-ink)" />{!half && <circle cx={XB} cy={YA} r={3.5} fill="var(--d-ink)" />}
          {swBox('q1', XA, 87, 'Q1', sw.q1 && sw.q2)}{swBox('q2', XA, 213, 'Q2', sw.q1 && sw.q2)}
          {!half && <>{swBox('q3', XB, 87, 'Q3', sw.q3 && sw.q4)}{swBox('q4', XB, 213, 'Q4', sw.q3 && sw.q4)}</>}
          {A.kind !== 'hs' && A.kind !== 'ls' && A.kind !== 'shoot' && mag && <text x={XA + 62} y={A.kind === 'diodeHigh' ? 120 : 190} fontSize={11} fill="var(--d-orange)" fontWeight={700}>{diodeNote(A.kind)}</text>}
          {!half && B.kind !== 'hs' && B.kind !== 'ls' && B.kind !== 'shoot' && mag && <text x={XB - 34} textAnchor="end" y={B.kind === 'diodeHigh' ? 120 : 190} fontSize={11} fill="var(--d-orange)" fontWeight={700}>{diodeNote(B.kind)}</text>}
        </svg>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
          <RegionBadge label={desc.name} color={desc.tone === 'ok' ? 'ok' : desc.tone === 'bad' ? 'bad' : desc.tone === 'warn' ? 'warn' : 'info'} />
          {st.n > 0 && <RegionBadge label={`FAULT: shoot-through ${si(st.i, 'A')} (${si(st.p, 'W')})`} color="bad" />}
          {(A.kind === 'diodeLow' || A.kind === 'diodeHigh' || B.kind === 'diodeLow' || B.kind === 'diodeHigh') && mag && <RegionBadge label="Freewheeling through body diodes" color="warn" />}
        </div>
        <Readouts>
          <Readout k="Motor current" v={si(iNow, 'A')} hl />
          <Readout k="Speed" v={`${(wNow * RPM).toFixed(0)} rpm`} />
          <Readout k="Back-EMF Ke·ω" v={si(q.ke * wNow, 'V')} />
          <Readout k="Motor terminal voltage A−B" v={si((isNaN(A.v) ? 0 : A.v) - (isNaN(B.v) ? 0 : B.v) || (mag ? 0 : q.ke * wNow), 'V')} />
          <Readout k="Supply current" v={st.n ? si(st.i, 'A') : si(Math.max(0, (sw.q1 ? iNow : 0) + (!half && sw.q3 ? -iNow : 0)), 'A')} tone={st.n ? 'bad' : undefined} />
          <Readout k="Steady state (this command)" v={`${si(ss.i, 'A')}, ${(ss.w * RPM).toFixed(0)} rpm`} />
        </Readouts>
        <EqBox>{String.raw`L\frac{di}{dt} = V_{AB} - Ri - K_e\omega,\qquad J\dot\omega = K_t i - B\omega - T_L \qquad (V_{AB}=${((isNaN(A.v) ? 0 : A.v) - (isNaN(B.v) ? 0 : B.v)).toFixed(2)}\,\text{V})`}</EqBox>
        <Plot series={[{ x: sim.t, y: sim.i, label: 'Motor current', color: 'accent' }]} xUnit="s" yUnit="A" xLabel="Time since command" yLabel="i" height={170} vlines={[{ at: frac * tEnd, label: 'now', color: 'orange' }]} />
        <Plot series={[{ x: sim.t, y: sim.w.map(w => w * RPM), label: 'Speed (rpm)', color: 'blue' }]} xUnit="s" xLabel="Time since command" yLabel="rpm" height={170} vlines={[{ at: frac * tEnd, label: 'now', color: 'orange' }]} />
      </> : <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
          {dt.shoot > 0 ? <RegionBadge label={`Shoot-through overlap ${si(dt.overlap, 's')}: peak ${si(dt.shoot, 'A')}`} color="bad" /> : dt.tDiode * 2 * s.fsw > 0.1 ? <RegionBadge label="Dead time eats >10 % of the period" color="warn" /> : <RegionBadge label={dt.tDiode > 0 ? 'Safe: dead time covers the transition' : 'No dead time (zero margin)'} color={dt.tDiode > 0 ? 'ok' : 'warn'} />}
        </div>
        <Plot series={[{ x: dt.t, y: dt.hs.map(v => v * 0.8 + 1.4), label: 'HS gate (Q1)', color: 'green', step: true }, { x: dt.t, y: dt.ls.map(v => v * 0.8), label: 'LS gate (Q2)', color: 'blue', step: true }]} xUnit="s" xLabel="Gate commands (two periods)" yLabel="" height={180} yRange={[-0.2, 2.4]} />
        <Plot series={[{ x: dt.t, y: dt.vsw, label: 'Switch node Vsw', color: 'red', step: true }]} xUnit="s" yUnit="V" xLabel="Switch-node voltage" yLabel="Vsw" height={190} hlines={[{ at: 0, label: 'GND', color: 'muted' }, { at: s.vbat, label: 'Vbat', color: 'muted' }]} />
        <Readouts>
          <Readout k="Dead time" v={si(s.td, 's')} tone={s.td < 0 ? 'bad' : undefined} />
          <Readout k="Diode conduction time / period" v={`${(dt.deadFrac * 100).toFixed(1)} %`} />
          <Readout k="Body-diode loss Vf·I·2·td·fsw" v={si(dt.pDiode, 'W')} />
          <Readout k="Shoot-through peak" v={dt.shoot ? si(dt.shoot, 'A') : 'none'} tone={dt.shoot ? 'bad' : 'ok'} />
          <Readout k="Shoot-through loss (upper bound)" v={dt.pShoot ? si(dt.pShoot, 'W') : '0 W'} />
          <Readout k="Period" v={si(T, 's')} />
        </Readouts>
        <EqBox>{String.raw`P_{diode} = V_f\,|I|\cdot 2\,t_d\,f_{sw} = ${si(dt.pDiode, 'W').replace(' ', '\\,')},\qquad I_{shoot}\approx\frac{V_{bat}}{R_{on,HS}+R_{on,LS}}`}</EqBox>
      </>}
    </SimShell>
  );
}
