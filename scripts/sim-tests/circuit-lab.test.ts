import assert from 'node:assert/strict';
import { solve, reqBetween, transient, timeConstants } from '../../src/sims/models/circuit-lab.ts';
import type { Circuit, Part, Pt } from '../../src/sims/models/circuit-lab.ts';
const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1e-3, Math.abs(b)), `${a} != ${b}`);
let n = 0;
const P = (kind: Part['kind'], a: Pt, b: Pt, value = 0, closed?: boolean): Part => ({ id: kind + (++n), kind, a, b, value, closed });
const W = (pts: Pt[]) => pts.slice(1).map((p, k) => P('wire', pts[k], p));

// 1) Ohm: 5 V across 1 kΩ -> 5 mA; source power −25 mW, resistor +25 mW (Tellegen: ΣP = 0)
{
  const V = P('V', [0, 1], [0, 2], 5), R = P('R', [3, 1], [3, 2], 1000);
  const c: Circuit = { parts: [V, R, ...W([[0, 1], [0, 0], [3, 0], [3, 1]]), ...W([[3, 2], [3, 3], [0, 3], [0, 2]])], grounds: [[0, 3]] };
  const s = solve(c); assert.ok(s.ok, s.errors.join());
  close(s.i.get(R.id)!, 5e-3); close(s.v.get(R.id)!, 5); close(s.p.get(V.id)!, -25e-3); close(s.p.get(R.id)!, 25e-3);
  let sum = 0; for (const v of s.p.values()) sum += v; close(sum, 0, 1e-6); // only the 1 pS gmin leakage remains
  // wire currents equal the loop current everywhere (series circuit)
  for (const p of c.parts) if (p.kind === 'wire') close(Math.abs(s.i.get(p.id)!), 5e-3);
  close(reqBetween(c, [3, 1], [3, 2]), 0); // source shorted when zeroed -> R in parallel with a short
}
// 2) Divider + Thevenin: 12 V, 10k / 4.7k -> 3.837 V; Rth = 10k‖4.7k = 3.197 kΩ
{
  const V = P('V', [0, 1], [0, 2], 12), R1 = P('R', [3, 0], [3, 1], 10000), R2 = P('R', [3, 1], [3, 2], 4700);
  const c: Circuit = { parts: [V, R1, R2, ...W([[0, 1], [0, 0], [3, 0]]), ...W([[3, 2], [3, 3], [0, 3], [0, 2]])], grounds: [[0, 3]] };
  const s = solve(c); close(s.pointV([3, 1])!, 12 * 4700 / 14700);
  close(reqBetween(c, [3, 1], [3, 3]), 10000 * 4700 / 14700);
}
// 3) KCL node: 10 V -> 1k -> node with 2k, 3k, 6k to ground: node = 5 V, branch currents 2.5/1.667/0.833 mA
{
  const V = P('V', [0, 1], [0, 2], 10), R1 = P('R', [1, 0], [2, 0], 1000);
  const Rs = [P('R', [2, 1], [2, 2], 2000), P('R', [4, 1], [4, 2], 3000), P('R', [6, 1], [6, 2], 6000)];
  const c: Circuit = { parts: [V, R1, ...Rs, ...W([[0, 1], [0, 0], [1, 0]]), ...W([[2, 0], [3, 0], [4, 0], [5, 0], [6, 0]]),
    ...[2, 4, 6].flatMap(x => [P('wire', [x, 0], [x, 1]), P('wire', [x, 2], [x, 3])]), ...W([[0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3]])], grounds: [[0, 3]] };
  const s = solve(c);
  close(s.pointV([2, 1])!, 5); close(s.i.get(Rs[0].id)!, 2.5e-3); close(s.i.get(Rs[1].id)!, 5 / 3000); close(s.i.get(Rs[2].id)!, 5 / 6000);
  // KCL on the top rail: wire (2,0)-(3,0) carries I1 − I(2k) = 2.5 mA
  const w = c.parts.find(p => p.kind === 'wire' && p.a[0] === 2 && p.a[1] === 0 && p.b[0] === 3)!;
  close(s.i.get(w.id)!, 2.5e-3);
}
// 4) Superposition: V1 = 12 V, V2 = 5 V, R1 = R2 = 1k, R3 = 2k in the middle. Node voltage = (12/1k + 5/1k)/(1/1k+1/1k+1/2k) = 6.8 V
{
  const V1 = P('V', [0, 1], [0, 2], 12), V2 = P('V', [6, 1], [6, 2], 5);
  const R1 = P('R', [1, 0], [2, 0], 1000), R2 = P('R', [4, 0], [5, 0], 1000), R3 = P('R', [3, 1], [3, 2], 2000);
  const parts = [V1, V2, R1, R2, R3, ...W([[0, 1], [0, 0], [1, 0]]), ...W([[2, 0], [3, 0], [4, 0]]), P('wire', [3, 0], [3, 1]), ...W([[5, 0], [6, 0], [6, 1]]), P('wire', [3, 2], [3, 3]), ...W([[0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [6, 2]])];
  const s = solve({ parts, grounds: [[0, 3]] });
  close(s.pointV([3, 0])!, 6.8);
  const s1 = solve({ parts: parts.map(p => p.id === V2.id ? { ...p, value: 0 } : p), grounds: [[0, 3]] });
  const s2 = solve({ parts: parts.map(p => p.id === V1.id ? { ...p, value: 0 } : p), grounds: [[0, 3]] });
  close(s1.pointV([3, 0])! + s2.pointV([3, 0])!, 6.8);
}
// 5) Wheatstone bridge balanced -> zero bridge current
{
  const V = P('V', [0, 1], [0, 2], 10);
  const R1 = P('R', [2, 1], [2, 2], 1000), R3 = P('R', [2, 2], [2, 3], 2000), R2 = P('R', [5, 1], [5, 2], 1500), R4 = P('R', [5, 2], [5, 3], 3000), R5 = P('R', [3, 2], [4, 2], 100);
  const parts = [V, R1, R2, R3, R4, R5, ...W([[0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]), P('wire', [2, 0], [2, 1]), P('wire', [5, 0], [5, 1]), P('wire', [2, 2], [3, 2]), P('wire', [4, 2], [5, 2]),
    ...W([[0, 2], [0, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4]]), P('wire', [2, 3], [2, 4]), P('wire', [5, 3], [5, 4])];
  const s = solve({ parts, grounds: [[0, 4]] });
  close(s.i.get(R5.id)!, 0, 1e-6); // < 1 nA (gmin leakage only)
  const u = solve({ parts: parts.map(p => p.id === R4.id ? { ...p, value: 3300 } : p), grounds: [[0, 4]] });
  assert.ok(Math.abs(u.i.get(R5.id)!) > 1e-6);
}
// 6) Series-parallel Req: 1k + 2k‖(1k+1k) = 2 kΩ seen by the source
{
  const V = P('V', [0, 1], [0, 2], 10);
  const parts = [V, P('R', [1, 0], [2, 0], 1000), P('R', [2, 1], [2, 2], 2000), P('R', [3, 0], [4, 0], 1000), P('R', [4, 1], [4, 2], 1000),
    ...W([[0, 1], [0, 0], [1, 0]]), P('wire', [2, 0], [3, 0]), P('wire', [2, 0], [2, 1]), P('wire', [4, 0], [4, 1]), P('wire', [2, 2], [2, 3]), P('wire', [4, 2], [4, 3]), ...W([[0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3]])];
  const s = solve({ parts, grounds: [[0, 3]] });
  close(-s.i.get(V.id)!, 5e-3);
  const noSrc = parts.filter(p => p.id !== V.id);
  close(reqBetween({ parts: noSrc, grounds: [] }, [0, 1], [0, 2]), 2000);
}
// 7) Diode: 5 V, 1 kΩ, Si diode -> Vd ≈ 0.62..0.72 V, KVL holds; LED ≈ 1.9..2.1 V at ~ 10–15 mA
{
  for (const [kind, lo, hi] of [['D', 0.6, 0.75], ['LED', 1.85, 2.15]] as const) {
    const V = P('V', [0, 1], [0, 2], 5), R = P('R', [1, 0], [2, 0], kind === 'D' ? 1000 : 220), D = P(kind, [3, 1], [3, 2]);
    const parts = [V, R, D, ...W([[0, 1], [0, 0], [1, 0]]), ...W([[2, 0], [3, 0], [3, 1]]), ...W([[3, 2], [3, 3], [0, 3], [0, 2]])];
    const s = solve({ parts, grounds: [[0, 3]] }); assert.ok(s.ok);
    const vd = s.v.get(D.id)!; assert.ok(vd > lo && vd < hi, `${kind} vd=${vd}`);
    close(s.v.get(R.id)! + vd, 5, 1e-7); close(s.i.get(R.id)!, s.i.get(D.id)!, 1e-6);
    // reverse biased: ~zero current
    const r = solve({ parts: parts.map(p => p.id === D.id ? { ...p, a: p.b, b: p.a } : p), grounds: [[0, 3]] });
    assert.ok(Math.abs(r.i.get(D.id)!) < 1e-9);
  }
}
// 8) RC transient (backward Euler): τ = 1 ms, vC(τ) = 63.2 % within 0.5 %, vC(5τ) ≈ 99.3 %
{
  const V = P('V', [0, 1], [0, 2], 5), S = P('SW', [1, 0], [2, 0], 0, true), R = P('R', [3, 0], [4, 0], 1000), C = P('C', [5, 1], [5, 2], 1e-6);
  const c: Circuit = { parts: [V, S, R, C, ...W([[0, 1], [0, 0], [1, 0]]), P('wire', [2, 0], [3, 0]), ...W([[4, 0], [5, 0], [5, 1]]), ...W([[5, 2], [5, 3], [0, 3], [0, 2]])], grounds: [[0, 3]] };
  const taus = timeConstants(c); close(taus[0].tau, 1e-3, 1e-9);
  const tr = transient(c, 5e-3, 1000);
  assert.ok(!tr.error);
  const k1 = 200; close(tr.t[k1], 1e-3); close(tr.frames[k1].v.get(C.id)!, 5 * (1 - Math.exp(-1)), 5e-3);
  close(tr.frames[1000].v.get(C.id)!, 5 * (1 - Math.exp(-5)), 2e-3);
  close(tr.frames[0].v.get(C.id)!, 0, 1e-6); close(tr.frames[0].i.get(R.id)!, 5e-3, 1e-4); // vC continuous, iC jumps to Vs/R
  // discharge: switch was closed long ago, opens at t=0 → nothing changes (no discharge path) ; with init 'dc' and switch open now
  const open = { ...c, parts: c.parts.map(p => p.id === S.id ? { ...p, closed: false } : p) };
  const d = transient(open, 5e-3, 200, 'dc'); close(d.frames[0].v.get(C.id)!, 5, 1e-6); close(d.frames[200].v.get(C.id)!, 5, 1e-3);
}
// 9) RL transient: τ = L/R = 1 ms, iL(τ) = 63.2 % of 50 mA; vL jumps to Vs
{
  const V = P('V', [0, 1], [0, 2], 5), R = P('R', [1, 0], [2, 0], 100), L = P('L', [3, 1], [3, 2], 0.1);
  const c: Circuit = { parts: [V, R, L, ...W([[0, 1], [0, 0], [1, 0]]), ...W([[2, 0], [3, 0], [3, 1]]), ...W([[3, 2], [3, 3], [0, 3], [0, 2]])], grounds: [[0, 3]] };
  close(timeConstants(c)[0].tau, 1e-3, 1e-9);
  const tr = transient(c, 5e-3, 1000);
  close(tr.frames[200].i.get(L.id)!, 0.05 * (1 - Math.exp(-1)), 5e-3);
  close(tr.frames[0].v.get(L.id)!, 5, 1e-6); close(tr.frames[0].i.get(L.id)!, 0, 1e-6);
  const dc = solve(c); close(dc.i.get(L.id)!, 0.05); close(dc.v.get(L.id)!, 0);
}
// 10) Errors: shorted source and parallel sources are reported, not NaN
{
  const V = P('V', [0, 1], [0, 2], 5);
  const s = solve({ parts: [V, P('wire', [0, 1], [0, 2])], grounds: [[0, 2]] }); assert.ok(!s.ok && /short/.test(s.errors[0]));
  const V2 = P('V', [1, 1], [1, 2], 3);
  const p = solve({ parts: [V, V2, P('wire', [0, 1], [1, 1]), P('wire', [0, 2], [1, 2])], grounds: [[0, 2]] }); assert.ok(!p.ok);
  // floating current source -> warning
  const f = solve({ parts: [P('I', [0, 1], [0, 2], 1e-3), P('C', [1, 1], [1, 2], 1e-6), P('wire', [0, 1], [1, 1]), P('wire', [0, 2], [1, 2])], grounds: [[0, 2]] });
  assert.ok(f.warnings.some(w => /floating/.test(w)));
}
// 11) Current source into resistor: 2 mA into 1k = 2 V; pull-up with switch closed pulls node to 0
{
  const I = P('I', [0, 2], [0, 1], 2e-3), R = P('R', [1, 1], [1, 2], 1000);
  const s = solve({ parts: [I, R, P('wire', [0, 1], [1, 1]), P('wire', [0, 2], [1, 2])], grounds: [[0, 2]] });
  close(s.pointV([0, 1])!, 2);
  const V = P('V', [0, 1], [0, 2], 3.3), Rp = P('R', [2, 0], [2, 1], 10000), SW = P('SW', [2, 2], [2, 3], 0, true);
  const parts = [V, Rp, SW, ...W([[0, 1], [0, 0], [1, 0], [2, 0]]), P('wire', [2, 1], [2, 2]), ...W([[2, 3], [2, 4], [1, 4], [0, 4], [0, 3], [0, 2]])];
  close(solve({ parts, grounds: [[0, 4]] }).pointV([2, 1])!, 0, 1e-9);
  close(solve({ parts: parts.map(p => p.id === SW.id ? { ...p, closed: false } : p), grounds: [[0, 4]] }).pointV([2, 1])!, 3.3, 1e-6);
  close(Math.abs(solve({ parts, grounds: [[0, 4]] }).i.get(SW.id)!), 0.33e-3);
}
console.log('circuit-lab model: all tests passed');
