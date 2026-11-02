// Register map decoding with mask/shift arithmetic.
//   width w = msb − lsb + 1,  mask = (2^w − 1) << lsb
//   field   = (reg & mask) >> lsb
//   write   : reg' = (reg & ~mask) | ((field << lsb) & mask)      (read-modify-write)
// Plain Number arithmetic (no JS 32-bit bitwise ops) so bit 31 never turns values negative.

export type Field = { name: string; msb: number; lsb: number; access?: 'RW' | 'RO' | 'W1C' | 'RSVD'; desc?: string; enums?: Record<number, string> };
export type RegDef = { name: string; width: 8 | 16 | 32; addr: number; reset: number; fields: Field[] };

const P2 = (n: number) => 2 ** n;
export const fieldWidth = (f: Field) => f.msb - f.lsb + 1;
export const fieldMask = (f: Field) => (P2(fieldWidth(f)) - 1) * P2(f.lsb);
export const getField = (reg: number, f: Field) => Math.floor(reg / P2(f.lsb)) % P2(fieldWidth(f));
export function setField(reg: number, f: Field, v: number) {
  const w = fieldWidth(f); const vv = ((Math.floor(v) % P2(w)) + P2(w)) % P2(w);
  const old = getField(reg, f);
  return reg - old * P2(f.lsb) + vv * P2(f.lsb);
}
export const bitOf = (reg: number, k: number) => Math.floor(reg / P2(k)) % 2;

export function hex(v: number, width: number) { return '0x' + v.toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0'); }

export type Check = { overlaps: [string, string][]; outOfRange: string[]; unassigned: number[] };
export function checkFields(fields: Field[], width: number): Check {
  const owner: (string | null)[] = Array(width).fill(null); const overlaps: [string, string][] = []; const outOfRange: string[] = [];
  for (const f of fields) {
    if (f.lsb < 0 || f.msb >= width || f.msb < f.lsb) { outOfRange.push(f.name); continue; }
    for (let k = f.lsb; k <= f.msb; k++) { const o = owner[k]; if (o && !overlaps.some(p => p[0] === o && p[1] === f.name)) overlaps.push([o, f.name]); owner[k] = f.name; }
  }
  return { overlaps, outOfRange, unassigned: owner.map((o, k) => (o ? -1 : k)).filter(k => k >= 0) };
}

/** C expression for a read-modify-write of one field. */
export function cWrite(regName: string, f: Field, v: number, width: number) {
  const w = fieldWidth(f); const m = hex(P2(w) - 1, Math.max(4, w)); const sfx = width === 32 ? 'u' : '';
  const NAME = f.name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return {
    defines: `#define ${NAME}_Pos  ${f.lsb}${sfx ? 'u' : ''}\n#define ${NAME}_Msk  (${m}${sfx} << ${NAME}_Pos)`,
    write: `${regName} = (${regName} & ~${NAME}_Msk) | ((${v}${sfx} << ${NAME}_Pos) & ${NAME}_Msk);`,
    read: `uint${width}_t ${f.name.toLowerCase()} = (${regName} & ${NAME}_Msk) >> ${NAME}_Pos;`,
    inline: `${regName} = (${regName} & ~(${m}${sfx} << ${f.lsb})) | ((${v}${sfx} & ${m}${sfx}) << ${f.lsb});`,
  };
}

// ---- presets ----
export const PRESETS: Record<string, RegDef> = {
  ctrl: { name: 'TIMx_CTRL', width: 32, addr: 0x40001000, reset: 0x00000000, fields: [
    { name: 'EN', msb: 0, lsb: 0, access: 'RW', desc: 'Peripheral enable', enums: { 0: 'disabled', 1: 'enabled' } },
    { name: 'MODE', msb: 2, lsb: 1, access: 'RW', desc: 'Operating mode', enums: { 0: 'one-shot', 1: 'continuous', 2: 'PWM', 3: 'capture' } },
    { name: 'IRQ_EN', msb: 3, lsb: 3, access: 'RW', desc: 'Interrupt enable' },
    { name: 'PRESCALE', msb: 7, lsb: 4, access: 'RW', desc: 'Clock prescaler = 2^PRESCALE' },
    { name: 'RSVD', msb: 15, lsb: 8, access: 'RSVD', desc: 'Reserved: write 0, preserve on RMW' },
    { name: 'RELOAD', msb: 31, lsb: 16, access: 'RW', desc: 'Auto-reload value (counts)' },
  ] },
  status: { name: 'UART_SR', width: 16, addr: 0x40004400, reset: 0x00C0, fields: [
    { name: 'PE', msb: 0, lsb: 0, access: 'W1C', desc: 'Parity error' },
    { name: 'FE', msb: 1, lsb: 1, access: 'W1C', desc: 'Framing error' },
    { name: 'ORE', msb: 3, lsb: 3, access: 'W1C', desc: 'Overrun error' },
    { name: 'RXNE', msb: 5, lsb: 5, access: 'RO', desc: 'RX data register not empty' },
    { name: 'TC', msb: 6, lsb: 6, access: 'RO', desc: 'Transmission complete' },
    { name: 'TXE', msb: 7, lsb: 7, access: 'RO', desc: 'TX data register empty' },
    { name: 'RXLVL', msb: 12, lsb: 8, access: 'RO', desc: 'RX FIFO fill level (0-16)' },
    { name: 'BUSY', msb: 15, lsb: 15, access: 'RO', desc: 'Transfer in progress' },
  ] },
  'imu-config': { name: 'ACCEL_CONFIG', width: 8, addr: 0x1C, reset: 0x00, fields: [
    { name: 'XA_ST', msb: 7, lsb: 7, access: 'RW', desc: 'X-axis self-test' },
    { name: 'YA_ST', msb: 6, lsb: 6, access: 'RW', desc: 'Y-axis self-test' },
    { name: 'ZA_ST', msb: 5, lsb: 5, access: 'RW', desc: 'Z-axis self-test' },
    { name: 'AFS_SEL', msb: 4, lsb: 3, access: 'RW', desc: 'Full-scale range', enums: { 0: '±2 g', 1: '±4 g', 2: '±8 g', 3: '±16 g' } },
    { name: 'RSVD', msb: 2, lsb: 0, access: 'RSVD', desc: 'Reserved' },
  ] },
};
export const DEFAULT_VALUE: Record<string, string> = { ctrl: '0x03E80035', status: '0x03E2', 'imu-config': '0x18' };

export function parseHex(s: string): number | null {
  const t = String(s ?? '').trim().replace(/[_\s]/g, '').replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(t)) return null; const v = parseInt(t, 16); return Number.isSafeInteger(v) ? v : null;
}
