// Classic 5-stage in-order RISC pipeline (IF ID EX MEM WB), Hennessy & Patterson,
// "Computer Organization and Design", ch. 4.5-4.8.
//
// Timing rules used (cycle numbers start at 1):
//  * One instruction is fetched per cycle; stalls hold the instruction in ID (and the
//    next one in IF), inserting a bubble into EX.
//  * Register file is written in the first half of WB and read in the second half of ID,
//    so a consumer's (last) ID cycle may coincide with the producer's WB cycle.
//  * With forwarding: EX/MEM -> EX and MEM/WB -> EX bypasses. An ALU result is usable by
//    the next instruction's EX (no stall); a load result exists only after MEM, so a
//    dependent instruction directly behind a load stalls 1 cycle (load-use hazard).
//  * Without forwarding: the consumer must read the value from the register file in ID,
//    i.e. its last ID cycle >= producer WB  ->  up to 2 stall cycles.
//  * Branches use predict-not-taken. Resolved in EX: a taken branch flushes 2 wrong-path
//    instructions (2-cycle penalty). Resolved in ID (early compare): 1-cycle penalty, but
//    the comparator needs its operands in ID (an extra stall behind an ALU producer,
//    2 behind a load, with forwarding into ID).
//  CPI = cycles_to_complete_steady_state / N = 1 + (stall + flush cycles)/N;
//  total cycles = N + 4 (fill) + stalls + flushes.

export type Op = 'add' | 'sub' | 'and' | 'or' | 'xor' | 'addi' | 'lw' | 'sw' | 'beq' | 'bne';
export type Instr = { op: Op; rd?: number; rs1?: number; rs2?: number; imm?: number; label?: string; target?: string; text: string };
export type ProgramId = 'alu' | 'load-use' | 'branch';

const R = (n: number) => `x${n}`;
function mk(op: Op, a: number[], extra: Partial<Instr> = {}): Instr {
  let text = '', rd: number | undefined, rs1: number | undefined, rs2: number | undefined, imm: number | undefined;
  if (op === 'lw') { [rd, imm, rs1] = a; text = `lw   ${R(rd)}, ${imm}(${R(rs1)})`; }
  else if (op === 'sw') { [rs2, imm, rs1] = a; text = `sw   ${R(rs2)}, ${imm}(${R(rs1)})`; }
  else if (op === 'addi') { [rd, rs1, imm] = a; text = `addi ${R(rd)}, ${R(rs1)}, ${imm}`; }
  else if (op === 'beq' || op === 'bne') { [rs1, rs2] = a; text = `${op}  ${R(rs1)}, ${R(rs2)}, ${extra.target}`; }
  else { [rd, rs1, rs2] = a; text = `${op.padEnd(4)} ${R(rd)}, ${R(rs1)}, ${R(rs2)}`; }
  return { op, rd, rs1, rs2, imm, text, ...extra };
}

export function program(id: ProgramId, reorder = false): Instr[] {
  if (id === 'alu') return [
    mk('sub', [2, 1, 3]), mk('and', [12, 2, 5]), mk('or', [13, 6, 2]), mk('add', [14, 2, 2]), mk('sw', [15, 100, 2]),
  ]; // H&P Fig. 4.52 dependence chain on x2
  if (id === 'load-use') {
    // H&P §4.7 example: A = B + E; C = B + F. Reordering hides both load-use stalls (13 -> 11 cycles).
    const lb = mk('lw', [1, 0, 31]), le = mk('lw', [2, 8, 31]), a1 = mk('add', [3, 1, 2]), s1 = mk('sw', [3, 24, 31]),
      lf = mk('lw', [4, 16, 31]), a2 = mk('add', [5, 1, 4]), s2 = mk('sw', [5, 32, 31]);
    return reorder ? [lb, le, lf, a1, s1, a2, s2] : [lb, le, a1, s1, lf, a2, s2];
  }
  // branch: count x1 down from 3, accumulating x2 += x1; 'sub' after loop is on the fall-through path.
  return [
    mk('addi', [1, 0, 3]),
    mk('addi', [1, 1, -1], { label: 'loop' }),
    mk('add', [2, 2, 1]),
    mk('bne', [1, 0], { target: 'loop' }),
    mk('sub', [5, 2, 1]),
    mk('or', [6, 5, 2]),
  ];
}

/** Functional execution: returns the dynamic instruction stream with branch outcomes. */
export type Dyn = { idx: number; ins: Instr; taken?: boolean };
export function execute(prog: Instr[], maxSteps = 200): { trace: Dyn[]; regs: number[] } {
  const x = new Array(32).fill(0); const mem = new Map<number, number>();
  for (let a = 0; a < 64; a += 4) mem.set(a, a + 10); // some memory contents
  const labels = new Map<string, number>(); prog.forEach((p, i) => p.label && labels.set(p.label, i));
  const trace: Dyn[] = []; let pc = 0;
  while (pc >= 0 && pc < prog.length && trace.length < maxSteps) {
    const I = prog[pc]; const a = x[I.rs1 ?? 0], b = x[I.rs2 ?? 0]; let next = pc + 1; let res: number | undefined; let taken: boolean | undefined;
    switch (I.op) {
      case 'add': res = a + b; break; case 'sub': res = a - b; break; case 'and': res = a & b; break;
      case 'or': res = a | b; break; case 'xor': res = a ^ b; break; case 'addi': res = a + (I.imm ?? 0); break;
      case 'lw': res = mem.get(a + (I.imm ?? 0)) ?? 0; break;
      case 'sw': mem.set(a + (I.imm ?? 0), b); break;
      case 'beq': case 'bne': taken = I.op === 'beq' ? a === b : a !== b; if (taken) next = labels.get(I.target!) ?? prog.length; break;
    }
    if (res !== undefined && I.rd) x[I.rd] = res | 0;
    trace.push({ idx: pc, ins: I, taken }); pc = next;
  }
  return { trace, regs: x };
}

export type Stage = 'IF' | 'ID' | 'EX' | 'MEM' | 'WB';
export type Cell = { cycle: number; stage: Stage; stall?: boolean };
export type Fwd = { from: number; to: number; reg: number; kind: 'EX/MEM→EX' | 'MEM/WB→EX' | 'EX/MEM→ID' | 'MEM/WB→ID' | 'RF' };
export type Row = {
  ins: Instr; flushed: boolean; cells: Cell[]; ifStart: number; idStart: number; ex: number; stalls: number;
  taken?: boolean; hazard?: string; fwd: Fwd[];
};
export type PipeOpts = { forwarding: boolean; branchIn: 'EX' | 'ID' };
export type PipeResult = {
  rows: Row[]; n: number; cycles: number; stallCycles: number; flushCycles: number; cpi: number;
  loadUse: number; rawStalls: number; branchStalls: number; takenBranches: number;
};

const writes = (I: Instr) => I.rd !== undefined && I.rd !== 0 && I.op !== 'sw' && I.op !== 'beq' && I.op !== 'bne';
const reads = (I: Instr) => [I.rs1, I.rs2].filter((r): r is number => r !== undefined && r !== 0);

export function schedule(trace: Dyn[], opt: PipeOpts): PipeResult {
  const rows: Row[] = [];
  let ifStart = 1, idStart = 2, prevEx = 0;
  const lastWriter = new Map<number, Row>();
  let stallCycles = 0, flushCycles = 0, loadUse = 0, rawStalls = 0, branchStalls = 0, taken = 0;
  for (let k = 0; k < trace.length; k++) {
    const { ins, taken: tk } = trace[k];
    const isBranch = ins.op === 'beq' || ins.op === 'bne';
    const idConsumer = isBranch && opt.branchIn === 'ID';
    let ex = Math.max(idStart + 1, prevEx + 1);
    let why = '';
    const fwd: Fwd[] = [];
    for (const r of new Set(reads(ins))) {
      const p = lastWriter.get(r); if (!p) continue;
      const isLoad = p.ins.op === 'lw';
      // earliest EX cycle allowed by this operand
      let need: number;
      if (!opt.forwarding) need = p.ex + 3; // last ID >= WB(p) = ex_p + 2
      else if (idConsumer) need = p.ex + (isLoad ? 3 : 2);
      else need = p.ex + (isLoad ? 2 : 1);
      if (need > ex) { ex = need; why = isLoad && opt.forwarding ? 'load-use' : isBranch && idConsumer ? 'branch operand' : 'RAW'; }
      fwd.push({ from: rows.indexOf(p), to: rows.length, reg: r, kind: 'RF' });
    }
    // classify the operand source at the final timing
    for (const f of fwd) {
      const p = rows[f.from]; const isLoad = p.ins.op === 'lw';
      if (!opt.forwarding) { f.kind = 'RF'; continue; }
      if (idConsumer) { const c = ex - 1; f.kind = !isLoad && c === p.ex + 1 ? 'EX/MEM→ID' : 'RF'; }
      else if (!isLoad && ex === p.ex + 1) f.kind = 'EX/MEM→EX';
      else if (ex === p.ex + 2) f.kind = 'MEM/WB→EX';
      else f.kind = 'RF';
    }
    const stalls = ex - idStart - 1;
    if (stalls > 0) { stallCycles += stalls; if (why === 'load-use') loadUse += stalls; else if (why === 'branch operand') branchStalls += stalls; else rawStalls += stalls; }
    const cells: Cell[] = [];
    for (let c = ifStart; c < idStart; c++) cells.push({ cycle: c, stage: 'IF', stall: c > ifStart });
    for (let c = idStart; c < ex; c++) cells.push({ cycle: c, stage: 'ID', stall: c > idStart });
    cells.push({ cycle: ex, stage: 'EX' }, { cycle: ex + 1, stage: 'MEM' }, { cycle: ex + 2, stage: 'WB' });
    const row: Row = { ins, flushed: false, cells, ifStart, idStart, ex, stalls, taken: tk, hazard: stalls ? `${why} stall ×${stalls}` : undefined, fwd };
    rows.push(row);
    if (writes(ins)) lastWriter.set(ins.rd!, row);
    prevEx = ex;
    // next sequential instruction enters IF when this one enters ID, and ID when this one enters EX
    ifStart = idStart; idStart = ex;
    if (isBranch && tk) {
      taken++;
      const resolve = opt.branchIn === 'EX' ? ex : ex - 1; // end of the resolving cycle
      // wrong-path instructions fetched before the redirect are squashed
      const nWrong = opt.branchIn === 'EX' ? 2 : 1;
      let wIf = ifStart, wId = idStart;
      for (let w = 0; w < nWrong; w++) {
        const wc: Cell[] = [];
        const ifEnd = w === 0 ? Math.min(wId, resolve + 1) : resolve + 1;
        for (let c = wIf; c < ifEnd; c++) wc.push({ cycle: c, stage: 'IF', stall: c > wIf });
        if (w === 0 && nWrong === 2) wc.push({ cycle: wId, stage: 'ID' });
        rows.push({ ins: { op: 'add', text: '(wrong path)' }, flushed: true, cells: wc, ifStart: wIf, idStart: wId, ex: 0, stalls: 0, fwd: [] });
        wIf = wId; wId = wId + 1;
      }
      flushCycles += nWrong;
      ifStart = resolve + 1; idStart = resolve + 2;
    }
  }
  const real = rows.filter(r => !r.flushed);
  const cycles = real.length ? real[real.length - 1].ex + 2 : 0;
  const n = real.length;
  return { rows, n, cycles, stallCycles, flushCycles, cpi: n ? (cycles - 4) / n : 0, loadUse, rawStalls, branchStalls, takenBranches: taken };
}

/** Name wrong-path rows with the static instructions sequentially after the branch. */
export function labelWrongPath(res: PipeResult, prog: Instr[], trace: Dyn[]) {
  let t = -1;
  for (let r = 0; r < res.rows.length; r++) {
    const row = res.rows[r];
    if (!row.flushed) { t++; continue; }
    const bIdx = trace[t].idx; let off = 1; let q = r - 1; while (q >= 0 && res.rows[q].flushed) { off++; q--; }
    const s = prog[bIdx + off];
    row.ins = { ...(s ?? { op: 'add' as Op }), text: s ? s.text : 'nop' };
  }
  return res;
}

export function simulate(id: ProgramId, opt: PipeOpts & { reorder?: boolean }) {
  const prog = program(id, !!opt.reorder);
  const { trace, regs } = execute(prog);
  const res = labelWrongPath(schedule(trace, opt), prog, trace);
  return { prog, trace, regs, ...res };
}

/** Unpipelined (single-cycle) vs pipelined execution time. tStage = slowest stage delay, tReg = pipeline-register overhead. */
export function compareTiming(n: number, cycles: number, tStage: number, tReg: number, stages = 5) {
  const tUnpiped = n * (stages * tStage + tReg); // one long clock per instruction
  const tClk = tStage + tReg;
  const tPiped = cycles * tClk;
  return { tUnpiped, tPiped, tClk, speedup: tUnpiped / tPiped, ideal: (stages * tStage + tReg) / tClk };
}

/** Which instruction (row index) occupies each stage at a given cycle. */
export function occupancy(rows: Row[], cycle: number): Record<Stage, number | null> {
  const o: Record<Stage, number | null> = { IF: null, ID: null, EX: null, MEM: null, WB: null };
  rows.forEach((r, i) => { for (const c of r.cells) if (c.cycle === cycle) o[c.stage] = i; });
  return o;
}
