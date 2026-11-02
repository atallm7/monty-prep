// Tiny RV32I(+M)-style assembler and interpreter for stepping small programs.
// Semantics follow the RISC-V unprivileged ISA spec (RV32I/RV32M): x0 hard-wired to 0,
// branches compare signed 32-bit values, jal rd,label writes rd = pc+4, jalr rd,off(rs) jumps to rs+off.
// Pseudo-instructions expand as in the spec: li -> addi rd,x0,imm; mv -> addi rd,rs,0;
// j -> jal x0; ret -> jalr x0,0(ra); ble a,b -> bge b,a; bgt a,b -> blt b,a; call f -> jal ra,f.
// Cycle estimate for a classic 5-stage in-order pipeline (H&P ch. 4):
//   cycles = N + 4 (fill) + P_taken·(taken branches + jumps) + 1·(load-use pairs)
// where P_taken = 2 for predict-not-taken with branches resolved in EX.

export const ABI = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6'];
export function regNum(name: string): number {
  const n = name.trim().toLowerCase();
  if (n === 'fp') return 8;
  const i = ABI.indexOf(n); if (i >= 0) return i;
  const m = /^x(\d+)$/.exec(n); if (m && +m[1] < 32) return +m[1];
  throw new Error(`unknown register ${name}`);
}

export type Ins = { line: number; op: string; rd: number; rs1: number; rs2: number; imm: number; label?: string; src: string };
export type Asm = { ins: Ins[]; labels: Record<string, number>; lines: { text: string; pc: number | null }[] };

/** Two-pass assembler. pc is counted in instructions (index); addresses shown as 4·index. */
export function assemble(text: string): Asm {
  const raw = text.split('\n'); const labels: Record<string, number> = {}; const pending: { line: number; body: string }[] = [];
  const lines: Asm['lines'] = [];
  raw.forEach((t, ln) => {
    let body = t.replace(/#.*$/, '').trim();
    const lm = /^([A-Za-z_]\w*):\s*(.*)$/.exec(body);
    if (lm) { labels[lm[1]] = pending.length; body = lm[2].trim(); }
    lines.push({ text: t, pc: body ? pending.length : null });
    if (body) pending.push({ line: ln, body });
  });
  const ins: Ins[] = pending.map(({ line, body }) => {
    const sp = body.indexOf(' '); const op0 = (sp < 0 ? body : body.slice(0, sp)).toLowerCase();
    const args = sp < 0 ? [] : body.slice(sp + 1).split(',').map(s => s.trim()).filter(Boolean);
    const I: Ins = { line, op: op0, rd: 0, rs1: 0, rs2: 0, imm: 0, src: body };
    const mem = (s: string) => { const m = /^(-?\w+)\((\w+)\)$/.exec(s); if (!m) throw new Error(`bad operand ${s}`); return { imm: parseInt(m[1]), rs: regNum(m[2]) }; };
    switch (op0) {
      case 'add': case 'sub': case 'mul': case 'and': case 'or': case 'xor': case 'slt': case 'sll': case 'srl':
        I.rd = regNum(args[0]); I.rs1 = regNum(args[1]); I.rs2 = regNum(args[2]); break;
      case 'addi': case 'slli': case 'srli': case 'andi': case 'ori': case 'xori': case 'slti':
        I.rd = regNum(args[0]); I.rs1 = regNum(args[1]); I.imm = parseInt(args[2]); break;
      case 'li': I.op = 'addi'; I.rd = regNum(args[0]); I.imm = parseInt(args[1]); break;
      case 'mv': I.op = 'addi'; I.rd = regNum(args[0]); I.rs1 = regNum(args[1]); break;
      case 'lw': { I.rd = regNum(args[0]); const m = mem(args[1]); I.rs1 = m.rs; I.imm = m.imm; break; }
      case 'sw': { I.rs2 = regNum(args[0]); const m = mem(args[1]); I.rs1 = m.rs; I.imm = m.imm; break; }
      case 'beq': case 'bne': case 'blt': case 'bge': I.rs1 = regNum(args[0]); I.rs2 = regNum(args[1]); I.label = args[2]; break;
      case 'ble': I.op = 'bge'; I.rs1 = regNum(args[1]); I.rs2 = regNum(args[0]); I.label = args[2]; break;
      case 'bgt': I.op = 'blt'; I.rs1 = regNum(args[1]); I.rs2 = regNum(args[0]); I.label = args[2]; break;
      case 'j': I.op = 'jal'; I.rd = 0; I.label = args[0]; break;
      case 'call': I.op = 'jal'; I.rd = 1; I.label = args[0]; break;
      case 'jal': if (args.length === 1) { I.rd = 1; I.label = args[0]; } else { I.rd = regNum(args[0]); I.label = args[1]; } break;
      case 'ret': I.op = 'jalr'; I.rd = 0; I.rs1 = 1; break;
      case 'jalr': { I.rd = regNum(args[0]); const m = mem(args[1]); I.rs1 = m.rs; I.imm = m.imm; break; }
      case 'nop': I.op = 'addi'; break;
      default: throw new Error(`unknown instruction ${op0}`);
    }
    if (I.label !== undefined && !(I.label in labels)) throw new Error(`unknown label ${I.label}`);
    return I;
  });
  return { ins, labels, lines };
}

export type Step = {
  pc: number; ins: Ins; regs: number[]; changed: number[]; nextPc: number;
  branch?: { taken: boolean; cond: string }; jump?: 'call' | 'ret' | 'jump'; depth: number; mem?: { addr: number; val: number; store: boolean };
};
export type RunResult = {
  steps: Step[]; final: number[]; halted: boolean; count: number; taken: number; notTaken: number; jumps: number; calls: number;
  loadUse: number; execCount: number[]; error?: string;
};

const s32 = (v: number) => v | 0;
export function run(asm: Asm, maxSteps = 5000, sp0 = 0x1000): RunResult {
  const x = new Array(32).fill(0); x[2] = sp0; const mem = new Map<number, number>();
  const steps: Step[] = []; let pc = 0; let taken = 0, notTaken = 0, jumps = 0, calls = 0, depth = 0, loadUse = 0;
  const execCount = new Array(asm.ins.length).fill(0);
  let prevLoadRd = -1;
  while (pc >= 0 && pc < asm.ins.length && steps.length < maxSteps) {
    const I = asm.ins[pc]; execCount[pc]++;
    const a = x[I.rs1], b = x[I.rs2]; const before = x.slice(); let next = pc + 1; let res: number | undefined;
    let branch: Step['branch']; let jump: Step['jump']; let memAcc: Step['mem'];
    // load-use: previous instruction was a load whose rd is a source here
    const usesRs2 = ['add', 'sub', 'mul', 'and', 'or', 'xor', 'slt', 'sll', 'srl', 'sw', 'beq', 'bne', 'blt', 'bge'].includes(I.op);
    if (prevLoadRd > 0 && (I.rs1 === prevLoadRd || (usesRs2 && I.rs2 === prevLoadRd))) loadUse++;
    prevLoadRd = -1;
    switch (I.op) {
      case 'add': res = a + b; break; case 'sub': res = a - b; break; case 'mul': res = Math.imul(a, b); break;
      case 'and': res = a & b; break; case 'or': res = a | b; break; case 'xor': res = a ^ b; break;
      case 'slt': res = a < b ? 1 : 0; break; case 'sll': res = a << (b & 31); break; case 'srl': res = a >>> (b & 31); break;
      case 'addi': res = a + I.imm; break; case 'andi': res = a & I.imm; break; case 'ori': res = a | I.imm; break; case 'xori': res = a ^ I.imm; break;
      case 'slti': res = a < I.imm ? 1 : 0; break; case 'slli': res = a << (I.imm & 31); break; case 'srli': res = a >>> (I.imm & 31); break;
      case 'lw': { const ad = s32(a + I.imm); res = mem.get(ad) ?? 0; memAcc = { addr: ad, val: res, store: false }; prevLoadRd = I.rd; break; }
      case 'sw': { const ad = s32(a + I.imm); mem.set(ad, b); memAcc = { addr: ad, val: b, store: true }; break; }
      case 'beq': case 'bne': case 'blt': case 'bge': {
        const t = I.op === 'beq' ? a === b : I.op === 'bne' ? a !== b : I.op === 'blt' ? a < b : a >= b;
        const sym = { beq: '==', bne: '≠', blt: '<', bge: '≥' }[I.op];
        branch = { taken: t, cond: `${ABI[I.rs1]} (${a}) ${sym} ${ABI[I.rs2]} (${b})` };
        if (t) { next = asm.labels[I.label!]; taken++; } else notTaken++;
        break;
      }
      case 'jal': res = (pc + 1) * 4; next = asm.labels[I.label!]; jumps++; if (I.rd === 1) { calls++; depth++; jump = 'call'; } else jump = 'jump'; break;
      case 'jalr': res = (pc + 1) * 4; next = Math.floor(s32(a + I.imm) / 4); jumps++; if (I.rd === 0 && I.rs1 === 1) { depth = Math.max(0, depth - 1); jump = 'ret'; } else jump = 'jump'; break;
    }
    if (res !== undefined && I.rd !== 0) x[I.rd] = s32(res);
    const changed: number[] = []; for (let k = 1; k < 32; k++) if (x[k] !== before[k]) changed.push(k);
    steps.push({ pc, ins: I, regs: x.slice(), changed, nextPc: next, branch, jump, depth, mem: memAcc });
    pc = next;
  }
  const halted = pc >= asm.ins.length || pc < 0;
  return { steps, final: x.slice(), halted, count: steps.length, taken, notTaken, jumps, calls, loadUse, execCount, error: halted ? undefined : `stopped after ${maxSteps} steps` };
}

export function cycleEstimate(r: { count: number; taken: number; jumps: number; loadUse: number }, takenPenalty = 2) {
  const cycles = r.count + (r.count ? 4 : 0) + takenPenalty * (r.taken + r.jumps) + r.loadUse;
  return { cycles, cpi: r.count ? cycles / r.count : 0, unpipelined: r.count * 5 };
}

export type ProgramId = 'sum-loop' | 'nested-loop' | 'subroutine';
export function source(id: ProgramId, n: number, m = 4): string {
  n = Math.max(1, Math.round(n)); m = Math.max(1, Math.round(m));
  if (id === 'sum-loop') return `# sum = 1 + 2 + ... + n
        li   a0, 0          # sum = 0
        li   t0, 1          # i = 1
        li   t1, ${n}${' '.repeat(Math.max(1, 11 - String(n).length))}# n
loop:   add  a0, a0, t0     # sum += i
        addi t0, t0, 1      # i++
        ble  t0, t1, loop   # repeat while i <= n
done:`;
  if (id === 'nested-loop') return `# count the inner-loop body executions
        li   a0, 0          # count = 0
        li   t0, 0          # i = 0
        li   t2, ${n}${' '.repeat(Math.max(1, 11 - String(n).length))}# N (outer)
        li   t3, ${m}${' '.repeat(Math.max(1, 11 - String(m).length))}# M (inner)
outer:  li   t1, 0          # j = 0
inner:  addi a0, a0, 1      # count++
        addi t1, t1, 1      # j++
        blt  t1, t3, inner  # inner loop
        addi t0, t0, 1      # i++
        blt  t0, t2, outer  # outer loop
done:`;
  return `# sum of squares via a subroutine
main:   li   s0, 0          # sum = 0
        li   s1, 1          # i = 1
        li   s2, ${n}${' '.repeat(Math.max(1, 11 - String(n).length))}# n
loop:   mv   a0, s1         # argument a0 = i
        jal  ra, square     # call square(i)
        add  s0, s0, a0     # sum += result
        addi s1, s1, 1      # i++
        ble  s1, s2, loop   # repeat while i <= n
        j    done           # skip over the function
square: mul  a0, a0, a0     # a0 = a0 * a0
        ret                 # jalr x0, 0(ra)
done:`;
}
