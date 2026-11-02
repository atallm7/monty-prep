// Assembly stepper: RISC-V-style programs executed instruction by instruction.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SimShell, SimProps, Slider, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge } from '../kit';
import Plot from '../../components/Plot';
import { assemble, run, source, cycleEstimate, ABI, ProgramId, Asm } from '../models/asm-stepper';

const PROGS: { value: ProgramId; label: string }[] = [{ value: 'sum-loop', label: 'Sum loop' }, { value: 'nested-loop', label: 'Nested loop' }, { value: 'subroutine', label: 'Subroutine' }];
const WATCH: Record<ProgramId, string[]> = { 'sum-loop': ['a0', 't0', 't1'], 'nested-loop': ['a0', 't0', 't1'], subroutine: ['s0', 's1', 'a0', 'ra'] };
const RESULT: Record<ProgramId, string> = { 'sum-loop': 'a0', 'nested-loop': 'a0', subroutine: 's0' };

function useRaf(on: boolean, period: number, tick: () => void) {
  const ref = useRef(tick); ref.current = tick;
  useEffect(() => {
    if (!on) return;
    let id = 0, last = performance.now(), acc = 0;
    const loop = (t: number) => { acc += t - last; last = t; if (acc >= period) { acc = 0; ref.current(); } id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id);
  }, [on, period]);
}

export default function AsmStepper({ params }: SimProps) {
  const p0 = String(params.program ?? 'sum-loop');
  const init = { program: (PROGS.some(p => p.value === p0) ? p0 : 'sum-loop') as ProgramId, n: Number(params.n ?? 5), m: Number(params.m ?? 3), penalty: 2, speed: 3 };
  const [s, set] = useState(init);
  const [k, setK] = useState(0);
  const [play, setPlay] = useState(false);
  const [edit, setEdit] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const upd = <K extends keyof typeof s>(key: K) => (v: (typeof s)[K]) => { set(q => ({ ...q, [key]: v })); setK(0); setCode(null); };

  const text = code ?? source(s.program, s.n, s.m);
  const res = useMemo(() => {
    try { const asm = assemble(text); return { asm, r: run(asm, 3000) }; }
    catch (e) { return { err: (e as Error).message }; }
  }, [text]);
  const asm = 'asm' in res ? res.asm as Asm : null; const r = 'r' in res ? res.r! : null;
  const count = r?.count ?? 0;
  const kk = Math.min(k, count);
  useRaf(play && kk < count, 900 / s.speed, () => setK(v => Math.min(count, v + 1)));
  useEffect(() => { if (kk >= count) setPlay(false); }, [kk, count]);

  const regs = r ? (kk > 0 ? r.steps[kk - 1].regs : (() => { const x = new Array(32).fill(0); x[2] = 0x1000; return x; })()) : new Array(32).fill(0);
  const last = r && kk > 0 ? r.steps[kk - 1] : null;
  const nextPc = r ? (kk < count ? r.steps[kk].pc : null) : null;
  const execSoFar = useMemo(() => { const c = new Array(asm?.ins.length ?? 0).fill(0); if (r) for (let i = 0; i < kk; i++) c[r.steps[i].pc]++; return c; }, [r, kk, asm]);
  const partial = useMemo(() => { if (!r) return { taken: 0, jumps: 0, loadUse: 0, calls: 0, count: 0 }; let taken = 0, jumps = 0, calls = 0; for (let i = 0; i < kk; i++) { const st = r.steps[i]; if (st.branch?.taken) taken++; if (st.jump) jumps++; if (st.jump === 'call') calls++; } return { taken, jumps, calls, loadUse: 0, count: kk }; }, [r, kk]);
  const ce = r ? cycleEstimate(r, s.penalty) : { cycles: 0, cpi: 0, unpipelined: 0 };
  const watch = code === null ? WATCH[s.program] : ['a0', 't0', 't1', 's0', 's1', 'ra'];
  const used = useMemo(() => { const set_ = new Set<number>(); asm?.ins.forEach(I => { [I.rd, I.rs1, I.rs2].forEach(x => x && set_.add(x)); }); return [...set_].sort((a, b) => a - b); }, [asm]);
  const resReg = RESULT[s.program]; const resVal = r ? r.final[ABI.indexOf(resReg)] : 0;
  const expected = s.program === 'sum-loop' ? s.n * (s.n + 1) / 2 : s.program === 'nested-loop' ? s.n * s.m : s.n * (s.n + 1) * (2 * s.n + 1) / 6;
  const formula = s.program === 'sum-loop' ? String.raw`N = 3 + 3n = 3 + 3\cdot${s.n} = ${3 + 3 * s.n}` : s.program === 'nested-loop' ? String.raw`N = 4 + N_o(3M + 3) = 4 + ${s.n}(3\cdot${s.m}+3) = ${4 + s.n * (3 * s.m + 3)}` : String.raw`N = 4 + 7n = 4 + 7\cdot${s.n} = ${4 + 7 * s.n}`;

  const series = useMemo(() => {
    if (!r) return [];
    const cols = ['accent', 'orange', 'green', 'purple'];
    return watch.slice(0, 4).map((nm, j) => { const ri = ABI.indexOf(nm); return { x: [0, ...r.steps.map((_, i) => i + 1)], y: [nm === 'sp' ? 0x1000 : 0, ...r.steps.map(st => st.regs[ri])], label: nm, color: cols[j], step: true }; });
  }, [r, watch.join()]);

  return (
    <SimShell title="Assembly stepper" layout="stacked" onReset={() => { set(init); setK(0); setPlay(false); setCode(null); setEdit(false); }}
      tryThis={<>step the <b>Subroutine</b> program and watch <code>jal</code> load <code>ra</code> with the return address, then <code>ret</code> jump back to it. Count how many times <code>square</code> runs as you change n (it equals n). On <b>Nested loop</b>, predict the instruction count 4 + N(3M+3) before pressing Run.</>}
      controls={<>
        <Seg label="Program" value={s.program} options={PROGS} onChange={upd('program')} />
        <Slider label={s.program === 'nested-loop' ? 'Outer count N' : 'Loop bound n'} value={s.n} min={1} max={20} step={1} format={v => String(v)} onChange={upd('n')} />
        {s.program === 'nested-loop' && <Slider label="Inner count M" value={s.m} min={1} max={10} step={1} format={v => String(v)} onChange={upd('m')} />}
        <Slider label="Taken branch / jump penalty" value={s.penalty} min={0} max={4} step={1} format={v => `${v} cycles`} onChange={v => set(q => ({ ...q, penalty: v }))} />
        <Slider label="Run speed" value={s.speed} min={1} max={20} step={1} format={v => `${(v / 0.9).toFixed(1)} instr/s`} onChange={v => set(q => ({ ...q, speed: v }))} />
        <Toggle label="Edit the source" checked={edit} onChange={setEdit} />
        <Note>Supported: add sub mul and or xor slt addi slli srli li mv lw sw beq bne blt bge ble bgt j jal jalr call ret nop. Registers use ABI names (a0, t0, s0, ra, sp...) or x0–x31.</Note>
      </>}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-sm" onClick={() => { setPlay(false); setK(0); }} disabled={kk === 0}>⏮ Restart</button>
        <button className="btn btn-sm" onClick={() => { setPlay(false); setK(v => Math.max(0, v - 1)); }} disabled={kk === 0}>◀ Back</button>
        <button className="btn btn-sm" onClick={() => { setPlay(false); setK(v => Math.min(count, v + 1)); }} disabled={kk >= count}>Step ▶</button>
        <button className="btn btn-sm" onClick={() => setPlay(v => !v)} disabled={kk >= count}>{play ? '❚❚ Pause' : '▶ Run'}</button>
        <button className="btn btn-sm" onClick={() => { setPlay(false); setK(count); }} disabled={kk >= count}>⏭ To end</button>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>executed {kk} / {count}</span>
        {r && (kk >= count ? <RegionBadge label={r.halted ? 'Halted (PC past end)' : 'Step limit'} color={r.halted ? 'ok' : 'warn'} /> : <RegionBadge label={`PC = 0x${((nextPc ?? 0) * 4).toString(16).padStart(3, '0')}`} color="accent" />)}
        {last && last.depth > 0 && <RegionBadge label={`in subroutine (depth ${last.depth})`} color="info" />}
      </div>
      {'err' in res && <Note><span style={{ color: 'var(--bad)' }}>Assembler error: {res.err}</span></Note>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12 }}>
        <div>
          {edit ? <textarea className="input" spellCheck={false} rows={14} value={text} onChange={e => { setCode(e.target.value); setK(0); setPlay(false); }}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: 8, lineHeight: 1.5 }} aria-label="Assembly source" /> :
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 9, padding: '6px 0', background: 'var(--d-bg)', overflowX: 'auto' }} role="list" aria-label="Program listing">
              {asm?.lines.map((ln, i) => {
                const isNext = ln.pc !== null && ln.pc === nextPc; const isLast = ln.pc !== null && last?.pc === ln.pc;
                return <div key={i} role="listitem" style={{ display: 'flex', gap: 8, padding: '1px 8px', whiteSpace: 'pre', background: isNext ? 'var(--accent-soft)' : undefined, borderLeft: `3px solid ${isNext ? 'var(--accent)' : isLast ? 'var(--d-orange)' : 'transparent'}` }}>
                  <span style={{ width: 34, color: 'var(--text-3)', flex: 'none' }}>{ln.pc !== null ? (ln.pc * 4).toString(16).padStart(3, '0') : ''}</span>
                  <span style={{ width: 26, textAlign: 'right', flex: 'none', color: ln.pc !== null && execSoFar[ln.pc] ? 'var(--d-orange)' : 'var(--text-3)' }} title="times executed so far">{ln.pc !== null ? `${execSoFar[ln.pc]}×` : ''}</span>
                  {(() => { const m = /^\s*([A-Za-z_]\w*:)?\s*(.*)$/.exec(ln.text)!; const isC = m[2].startsWith('#'); const ci = m[2].indexOf('#');
                    return <><span style={{ width: '7.5ch', flex: 'none', color: 'var(--d-purple)' }}>{m[1] ?? ''}</span>
                      <span style={{ color: isC ? 'var(--text-3)' : 'var(--text)' }}>{isC || ci < 0 ? m[2] : m[2].slice(0, ci)}{!isC && ci >= 0 && <span style={{ color: 'var(--text-3)' }}>{m[2].slice(ci)}</span>}</span></>; })()}
                </div>;
              })}
            </div>}
          <div style={{ fontSize: 13, marginTop: 8, color: 'var(--text-2)', minHeight: 40 }}>
            {!last ? <>Ready: the next instruction is highlighted. Press <b>Step</b>.</> : <>
              Last: <code>{last.ins.src}</code>{last.changed.length > 0 && <> → {last.changed.map(c => `${ABI[c]} = ${last.regs[c]}`).join(', ')}</>}
              {last.branch && <> · branch <b style={{ color: last.branch.taken ? 'var(--d-orange)' : 'var(--text)' }}>{last.branch.taken ? 'TAKEN' : 'not taken'}</b> since {last.branch.cond} is {String(last.branch.taken)}</>}
              {last.jump === 'call' && <> · <b>call</b>: ra = 0x{last.regs[1].toString(16)}, jump to {last.ins.label}</>}
              {last.jump === 'ret' && <> · <b>return</b> to 0x{(last.nextPc * 4).toString(16)}</>}
            </>}
          </div>
        </div>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} aria-label="Registers">
            {[0, 1, 2, ...used.filter(x => x > 2)].map(ri => {
              const ch = last?.changed.includes(ri);
              return <div key={ri} style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '4px 8px', background: ch ? 'var(--warn-soft)' : 'var(--surface)', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ color: 'var(--text-2)' }}>{ABI[ri]}<span style={{ color: 'var(--text-3)', fontSize: 10.5 }}> x{ri}</span></span>
                <b style={{ color: ch ? 'var(--warn)' : 'var(--text)' }}>{ri === 1 || ri === 2 ? '0x' + regs[ri].toString(16) : regs[ri]}</b>
              </div>;
            })}
          </div>
          <Readouts>
            <Readout k="Instructions (total)" v={count} hl />
            <Readout k="Branches T / NT" v={r ? `${r.taken} / ${r.notTaken}` : '-'} />
            <Readout k={s.program === 'subroutine' ? 'Calls to square' : 'Jumps / calls'} v={r ? (s.program === 'subroutine' ? `${partial.calls} / ${r.calls}` : `${r.jumps} / ${r.calls}`) : '-'} />
            <Readout k="Cycles (5-stage est.)" v={ce.cycles} />
            <Readout k="CPI" v={ce.cpi.toFixed(2)} tone={ce.cpi > 1.5 ? 'warn' : 'ok'} />
            {code === null && <Readout k={`Result ${resReg}`} v={`${resVal}`} tone={resVal === expected ? 'ok' : 'bad'} />}
          </Readouts>
        </div>
      </div>
      <EqBox>{String.raw`\begin{gathered}${code === null ? formula + String.raw`\ \text{instructions}` : String.raw`N = ${count}\ \text{instructions}`} \\ \text{cycles} \approx N + 4 + P\,(\text{taken} + \text{jumps}) + \text{load-use} \\ = ${count} + 4 + ${s.penalty}\cdot(${r?.taken ?? 0} + ${r?.jumps ?? 0}) + ${r?.loadUse ?? 0} = ${ce.cycles}\end{gathered}`}</EqBox>
      {r && r.count > 0 && <Plot height={200} xLabel="Instructions executed" yLabel="Register value" series={series} vlines={[{ at: kk, label: `step ${kk}`, color: 'muted' }]} />}
    </SimShell>
  );
}
