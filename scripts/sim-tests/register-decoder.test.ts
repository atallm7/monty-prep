import assert from 'node:assert/strict';
import { PRESETS, DEFAULT_VALUE, getField, setField, fieldMask, checkFields, parseHex, cWrite, hex } from '../../src/sims/models/register-decoder.ts';

const ctrl = PRESETS.ctrl; const f = (n: string) => ctrl.fields.find(x => x.name === n)!;
const v = parseHex(DEFAULT_VALUE.ctrl)!; assert.equal(v, 0x03E80035);
assert.equal(getField(v, f('EN')), 1); assert.equal(getField(v, f('MODE')), 2); assert.equal(getField(v, f('IRQ_EN')), 0);
assert.equal(getField(v, f('PRESCALE')), 3); assert.equal(getField(v, f('RELOAD')), 1000);
// masks: MODE [2:1] -> 0x6, PRESCALE [7:4] -> 0xF0, RELOAD [31:16] -> 0xFFFF0000 (no sign problems at bit 31)
assert.equal(fieldMask(f('MODE')), 0x6); assert.equal(fieldMask(f('PRESCALE')), 0xF0); assert.equal(fieldMask(f('RELOAD')), 0xFFFF0000);
// read-modify-write leaves other fields untouched: reg' = (reg & ~mask) | (val << lsb)
const v2 = setField(v, f('PRESCALE'), 0xA); assert.equal(v2, 0x03E800A5);
const v3 = setField(0xFFFFFFFF, f('RELOAD'), 0); assert.equal(v3, 0x0000FFFF);
assert.equal(setField(0, f('RELOAD'), 0xFFFF), 0xFFFF0000);
assert.equal(setField(0, f('MODE'), 5), 0x2, 'value wraps to field width (5 mod 4 = 1 -> bits 2:1 = 0b01)');
// imu: 0x18 -> AFS_SEL = 3 (±16 g)
const imu = PRESETS['imu-config']; assert.equal(getField(0x18, imu.fields.find(x => x.name === 'AFS_SEL')!), 3);
// status preset: RXLVL [12:8] of 0x03E2 = 3
assert.equal(getField(0x03E2, PRESETS.status.fields.find(x => x.name === 'RXLVL')!), 3);
// field checks
for (const k of Object.keys(PRESETS)) { const c = checkFields(PRESETS[k].fields, PRESETS[k].width); assert.equal(c.overlaps.length, 0, k); assert.equal(c.outOfRange.length, 0, k); }
assert.deepEqual(checkFields([{ name: 'a', msb: 3, lsb: 0 }, { name: 'b', msb: 5, lsb: 3 }], 8).overlaps, [['a', 'b']]);
assert.equal(checkFields([{ name: 'a', msb: 9, lsb: 0 }], 8).outOfRange[0], 'a');
assert.ok(cWrite('REG', f('PRESCALE'), 10, 32).inline.includes('(0xFu << 4)'));
assert.equal(hex(0xFFFF0000, 32), '0xFFFF0000');
assert.equal(parseHex('zz'), null);
console.log('register-decoder model: all tests passed');
