// Truth table -> K-map -> minimal SOP/POS. Click cells (table or map) to cycle 0 -> 1 -> X (don't care).
import { useMemo, useState, KeyboardEvent as RKE } from 'react';
import { SimShell, SimProps, Seg, Toggle, Readout, Readouts, EqBox, Note, RegionBadge } from '../kit';
import { Cell, Cube, VARS, minimise, layout, cubeRects, cellsFrom, covers } from '../models/kmap-lab';

const COLORS = ['var(--d-accent)', 'var(--d-red)', 'var(--d-green)', 'var(--d-orange)', 'var(--d-purple)', 'var(--d-blue)', 'var(--d-muted)', 'var(--d-ink)'];
const arr = (v: any): number[] => Array.isArray(v) ? v.map(Number).filter(n => Number.isInteger(n)) : typeof v === 'string' ? v.split(/[ ,;]+/).filter(Boolean).map(Number).filter(n => Number.isInteger(n)) : [];
const next = (v: Cell): Cell => v === 0 ? 1 : v === 1 ? 'X' : 0;

function texTerm(nv: number, c: Cube, pos: boolean) {
  const lits: string[] = [];
  for (let i = 0; i < nv; i++) { const bit = 1 << (nv - 1 - i); if (c.mask & bit) continue; const one = !!(c.value & bit); const comp = pos ? one : !one; lits.push(comp ? `\\overline{${VARS[i]}}` : VARS[i]); }
  if (!lits.length) return pos ? '0' : '1';
  return pos ? (lits.length > 1 ? `(${lits.join('+')})` : lits[0]) : lits.join('');
}

export default function KmapLab({ params }: SimProps) {
  const nv0 = Math.min(4, Math.max(2, Math.round(Number(params.vars ?? 3)) || 3));
  const hasM = params.minterms !== undefined;
  const init = () => cellsFrom(nv0, hasM ? arr(params.minterms) : nv0 === 3 ? [0, 2, 4, 5, 6] : nv0 === 2 ? [1, 2, 3] : [0, 2, 5, 7, 8, 10, 13, 15], arr(params.dontcares));
  const [nv, setNv] = useState(nv0);
  const [cells, setCells] = useState<Cell[]>(init);
  const [form, setForm] = useState<'sop' | 'pos'>('sop');
  const [allPrimes, setAllPrimes] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const changeVars = (s: string) => {
    const n = Number(s); setNv(n);
    // keep the function where it makes sense: extend by repeating (new MSB ignored), or truncate
    setCells(prev => Array.from({ length: 1 << n }, (_, i) => prev[i % prev.length] ?? 0));
  };
  const r = useMemo(() => minimise(nv, cells), [nv, cells]);
  const L = layout(nv);
  const groups = form === 'sop' ? (allPrimes ? r.primes : r.sop) : (allPrimes ? [] : r.posCubes);
  const essentialKeys = new Set(r.essential.map(c => `${c.value}/${c.mask}`));
  const toggle = (m: number) => setCells(p => p.map((v, i) => i === m ? next(v) : v));
  const kb = (fn: () => void) => (e: RKE) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

  // K-map geometry
  const CS = 58, X0 = 70, Y0 = 56; const W = X0 + L.cols.length * CS + 14, H = Y0 + L.rows.length * CS + 12;
  const gray = (v: number, bits: number) => bits === 0 ? '' : v.toString(2).padStart(bits, '0');

  const sopTex = r.on.length === 0 ? '0' : r.sop.map(c => texTerm(nv, c, false)).join(' + ');
  const posTex = r.off.length === 0 ? '1' : r.posCubes.map(c => texTerm(nv, c, true)).join('\\,');
  const fnTex = `F(${VARS.slice(0, nv).join(',')}) = \\textstyle\\sum m(${r.on.join(',') || '\\,'})${r.dc.length ? ` + d(${r.dc.join(',')})` : ''}`;
  const kind = r.on.length === 0 ? 'Constant 0' : r.off.length === 0 ? 'Constant 1' : `SOP: ${r.primes.length} prime implicant${r.primes.length > 1 ? 's' : ''}, ${r.essential.length} essential`;

  return (
    <SimShell title="Truth table → K-map → minimal logic" onReset={() => { setNv(nv0); setCells(init()); setForm('sop'); setAllPrimes(false); }}
      tryThis={<>with 4 variables, set the four corner cells (m0, m2, m8, m10) to 1: they form a single group B'D' because the map wraps around like a torus. Then turn a lone 1 next to a group into an <b>X</b> (don't care) and watch the SOP shrink. Switch to <b>POS</b> to group the 0s instead and compare literal counts.</>}
      controls={<>
        <Seg label="Variables" value={String(nv)} onChange={changeVars} options={[{ value: '2', label: '2 (A,B)' }, { value: '3', label: '3' }, { value: '4', label: '4' }]} />
        <Seg label="Group the" value={form} onChange={v => setForm(v)} options={[{ value: 'sop', label: '1s → SOP' }, { value: 'pos', label: '0s → POS' }]} />
        {form === 'sop' && <Toggle label="Show all prime implicants" checked={allPrimes} onChange={setAllPrimes} />}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setCells(Array(1 << nv).fill(0))}>All 0</button>
          <button className="btn btn-sm" onClick={() => setCells(p => p.map(v => v === 1 ? 0 : v === 0 ? 1 : v))}>Invert F</button>
          <button className="btn btn-sm" onClick={() => setCells(Array.from({ length: 1 << nv }, () => { const u = Math.random(); return u < 0.45 ? 1 : u < 0.85 ? 0 : 'X'; }))}>Random</button>
        </div>
        <Note>Click any truth-table output or K-map cell to cycle <b>0 → 1 → X</b>. X (don't care) may be grouped with 1s or 0s, whichever makes the groups bigger. Minimisation is exact (Quine–McCluskey prime implicants + minimum cover).</Note>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'row-reverse', justifyContent: 'flex-end', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* K-map */}
        <div style={{ flex: '1 1 260px', minWidth: 0, maxWidth: 380 }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="group" aria-label="Karnaugh map">
            <defs><clipPath id="km-clip"><rect x={X0 - 1} y={Y0 - 1} width={L.cols.length * CS + 2} height={L.rows.length * CS + 2} /></clipPath></defs>
            <line x1={X0 - 46} y1={Y0 - 40} x2={X0} y2={Y0} stroke="var(--d-muted)" strokeWidth={1} />
            <text x={X0 - 8} y={Y0 - 30} textAnchor="end" fontSize={13} fontWeight={600} fill="var(--d-ink)">{L.colVars}</text>
            <text x={X0 - 40} y={Y0 - 6} textAnchor="start" fontSize={13} fontWeight={600} fill="var(--d-ink)">{L.rowVars}</text>
            {L.cols.map((cv, k) => <text key={'c' + k} x={X0 + k * CS + CS / 2} y={Y0 - 10} textAnchor="middle" fontSize={13} fill="var(--d-muted)" fontFamily="var(--font-mono)">{gray(cv, L.colBits)}</text>)}
            {L.rows.map((rv, k) => <text key={'r' + k} x={X0 - 10} y={Y0 + k * CS + CS / 2 + 5} textAnchor="end" fontSize={13} fill="var(--d-muted)" fontFamily="var(--font-mono)">{gray(rv, L.rowBits)}</text>)}
            {L.rows.map((_, ri) => L.cols.map((_, ci) => {
              const m = L.minterm(ri, ci); const v = cells[m];
              return <g key={`${ri}-${ci}`} role="button" tabIndex={0} aria-label={`cell m${m} = ${v}; press to change`} onClick={() => toggle(m)} onKeyDown={kb(() => toggle(m))} style={{ cursor: 'pointer' }}>
                <rect x={X0 + ci * CS} y={Y0 + ri * CS} width={CS} height={CS} fill="var(--d-bg)" stroke="var(--d-ink)" strokeWidth={1.2} />
                <text x={X0 + ci * CS + 5} y={Y0 + ri * CS + 13} fontSize={10} fill="var(--d-muted)">{m}</text>
                <text x={X0 + ci * CS + CS / 2} y={Y0 + ri * CS + CS / 2 + 8} textAnchor="middle" fontSize={22} fontWeight={700} fontFamily="var(--font-mono)"
                  fill={v === 1 ? 'var(--d-accent)' : v === 'X' ? 'var(--d-orange)' : 'var(--d-muted)'} opacity={v === 0 ? 0.6 : 1}>{v}</text>
              </g>;
            }))}
            <g clipPath="url(#km-clip)" style={{ pointerEvents: 'none' }}>
              {groups.map((g, gi) => {
                const pieces = cubeRects(nv, g); const inset = 4 + (gi % 4) * 3; const col = COLORS[gi % COLORS.length]; const wraps = pieces.length > 1;
                return pieces.map((p, k) => {
                  let x0 = X0 + p.c0 * CS + inset, x1 = X0 + (p.c1 + 1) * CS - inset, y0 = Y0 + p.r0 * CS + inset, y1 = Y0 + (p.r1 + 1) * CS - inset;
                  // open the side that wraps around the map edge
                  if (wraps) { const fullC = p.c0 === 0 && p.c1 === L.cols.length - 1, fullR = p.r0 === 0 && p.r1 === L.rows.length - 1;
                    if (!fullC && p.c0 === 0 && pieces.some(q => q.c1 === L.cols.length - 1 && q.c0 !== 0)) x0 -= 30; if (!fullC && p.c1 === L.cols.length - 1 && pieces.some(q => q.c0 === 0 && q.c1 !== L.cols.length - 1)) x1 += 30;
                    if (!fullR && p.r0 === 0 && pieces.some(q => q.r1 === L.rows.length - 1 && q.r0 !== 0)) y0 -= 30; if (!fullR && p.r1 === L.rows.length - 1 && pieces.some(q => q.r0 === 0 && q.r1 !== L.rows.length - 1)) y1 += 30; }
                  return <rect key={gi + '-' + k} x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={14} fill={col} fillOpacity={hover === gi ? 0.22 : 0.08} stroke={col} strokeWidth={hover === gi ? 3.2 : 2.2}
                    strokeDasharray={allPrimes && !essentialKeys.has(`${g.value}/${g.mask}`) ? '6 4' : undefined} />;
                });
              })}
            </g>
          </svg>
        </div>
        {/* truth table */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', flex: '0 0 auto' }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13, textAlign: 'center' }}>
            <thead style={{ background: 'var(--surface-2)' }}><tr>
              <th style={{ padding: '3px 7px', color: 'var(--text-3)', fontWeight: 500 }}>m</th>
              {VARS.slice(0, nv).map(v => <th key={v} style={{ padding: '3px 7px' }}>{v}</th>)}
              <th style={{ padding: '3px 9px', color: 'var(--accent)', borderLeft: '2px solid var(--border)' }}>F</th>
            </tr></thead>
            <tbody>{cells.map((v, m) => {
              const inHover = hover !== null && groups[hover] && covers(groups[hover], m);
              return <tr key={m} style={{ background: inHover ? 'var(--accent-soft)' : undefined }}>
                <td style={{ padding: '1px 7px', color: 'var(--text-3)' }}>{m}</td>
                {VARS.slice(0, nv).map((_, i) => <td key={i} style={{ padding: '1px 7px' }}>{(m >> (nv - 1 - i)) & 1}</td>)}
                <td style={{ padding: '1px 9px', borderLeft: '2px solid var(--border)', cursor: 'pointer', fontWeight: 700, color: v === 1 ? 'var(--accent)' : v === 'X' ? 'var(--warn)' : 'var(--text-3)' }}
                  role="button" tabIndex={0} aria-label={`F at minterm ${m} is ${v}; press to change`} onClick={() => toggle(m)} onKeyDown={kb(() => toggle(m))}>{v}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <RegionBadge label={kind} color="info" />
        {form === 'sop' && allPrimes && <span className="small muted">Solid outline = essential prime, dashed = non-essential.</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {groups.map((g, gi) => <span key={gi} onPointerEnter={() => setHover(gi)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(gi)} onBlur={() => setHover(null)} tabIndex={0}
          style={{ border: `2px solid ${COLORS[gi % COLORS.length]}`, borderRadius: 8, padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 13.5, cursor: 'default', background: hover === gi ? 'var(--accent-soft)' : undefined }}>
          {form === 'sop' ? termText(nv, g, false) : termText(nv, g, true)}
          <span className="muted" style={{ fontSize: 11.5 }}> {g.mask ? `${1 << popc(g.mask & ((1 << nv) - 1))} cells` : '1 cell'}{form === 'sop' && essentialKeys.has(`${g.value}/${g.mask}`) ? ' · essential' : ''}</span>
        </span>)}
      </div>
      <EqBox>{`${fnTex}`}</EqBox>
      <EqBox>{form === 'sop' ? `F_{\\text{SOP}} = ${sopTex}` : `F_{\\text{POS}} = ${posTex}`}</EqBox>
      <Readouts>
        <Readout k="Minimal SOP" v={<span style={{ fontSize: 13 }}>{r.sopStr}</span>} hl={form === 'sop'} />
        <Readout k="Minimal POS" v={<span style={{ fontSize: 13 }}>{r.posStr}</span>} hl={form === 'pos'} />
        <Readout k="SOP: terms / literals" v={`${r.sop.length} / ${r.sopLiterals}`} />
        <Readout k="POS: terms / literals" v={`${r.posCubes.length} / ${r.posLiterals}`} />
        <Readout k="SOP gates (AND/OR/NOT)" v={`${r.sopGates.total} (${r.sopGates.and}/${r.sopGates.or}/${r.sopGates.not})`} tone={r.sopGates.total <= r.posGates.total ? 'ok' : undefined} />
        <Readout k="POS gates (OR/AND/NOT)" v={`${r.posGates.total} (${r.posGates.or}/${r.posGates.and}/${r.posGates.not})`} tone={r.posGates.total < r.sopGates.total ? 'ok' : undefined} />
      </Readouts>
      <Note>Gate count is for a two-level realisation with multi-input gates: one AND per product term (≥ 2 literals), one OR to combine them, and one inverter per complemented variable. Grouping rules: groups are rectangles of 1, 2, 4 or 8 cells (powers of two); bigger groups mean fewer literals; edges wrap.</Note>
    </SimShell>
  );
}

function popc(x: number) { let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; }
function termText(nv: number, c: Cube, pos: boolean) {
  const lits: string[] = [];
  for (let i = 0; i < nv; i++) { const bit = 1 << (nv - 1 - i); if (c.mask & bit) continue; const one = !!(c.value & bit); lits.push((pos ? one : !one) ? VARS[i] + "'" : VARS[i]); }
  if (!lits.length) return pos ? '0' : '1';
  return pos ? `(${lits.join(' + ')})` : lits.join('');
}
