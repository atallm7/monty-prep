import assert from 'node:assert/strict';
import { parseValue, encode, divisionSteps, expansion, twosSteps, memoryLayout } from '../../src/sims/models/base-converter.ts';

const p = (s: string) => { const r = parseValue(s); assert.ok(r.ok, s); return r.value; };
assert.equal(p('0xBEEF'), 48879); assert.equal(p('0b1010'), 10); assert.equal(p('0o17'), 15); assert.equal(p('175'), 175); assert.equal(p('-1'), -1); assert.equal(p('FFh'), 255);
assert.equal(parseValue('0x1G').ok, false); assert.equal(parseValue('').ok, false);

// 0xBEEF in 16 bits: unsigned 48879, signed 48879 − 65536 = −16657
{ const e = encode(0xBEEF, 16); assert.equal(e.u, 48879); assert.equal(e.signed, -16657); assert.equal(e.bin, '1011111011101111'); assert.equal(e.oct, '137357'); assert.equal(e.hex, 'BEEF'); assert.equal(e.msb, 1); }
// Two's complement: −1 is all ones; −128 is 0x80 in 8 bits; 128 does not fit signed 8-bit
assert.equal(encode(-1, 8).hex, 'FF'); assert.equal(encode(-1, 32).hex, 'FFFFFFFF'); assert.equal(encode(-1, 32).u, 4294967295);
assert.equal(encode(-128, 8).hex, '80'); assert.equal(encode(-128, 8).fitsSigned, true); assert.equal(encode(128, 8).fitsSigned, false); assert.equal(encode(128, 8).signed, -128);
assert.equal(encode(-5, 8).bin, '11111011');
{ const t = twosSteps(-5, 8); assert.equal(t.magBin, '00000101'); assert.equal(t.inv, '11111010'); assert.equal(t.plusOne, '11111011'); }
assert.equal(encode(256, 8).fitsUnsigned, false); assert.equal(encode(256, 8).u, 0);
// Repeated division: 175 -> binary 10101111 (remainders bottom-up), hex AF
assert.equal(divisionSteps(175, 2).map(s => s.r).reverse().join(''), '10101111');
assert.equal(divisionSteps(175, 16).map(s => s.r.toString(16)).reverse().join('').toUpperCase(), 'AF');
// Positional expansion sums back to the value
assert.equal(expansion('BEEF', 16).reduce((a, t) => a + t.term, 0), 48879);
// Endianness of 0x12345678 at 0x1000: BE 12 34 56 78, LE 78 56 34 12
{ const m = memoryLayout(0x12345678, 32, 0x1000); assert.deepEqual(m.map(x => x.big), [0x12, 0x34, 0x56, 0x78]); assert.deepEqual(m.map(x => x.little), [0x78, 0x56, 0x34, 0x12]); assert.equal(m[3].addr, 0x1003); }
console.log('base-converter model: all tests passed');
