import assert from 'node:assert/strict';
import { encode, decode, encodeGeneric, fields, exactDecimal, parseRational, roundingError, ulpOf, maxFinite, minNormal, minSubnormal, toFixed, toHex, neighbours } from '../../src/sims/models/float-explorer.ts';
// half precision known values
assert.equal(encode(65504, 'f16'), 0x7BFF); assert.equal(decode(0x7BFF, 'f16'), 65504); assert.equal(maxFinite('f16'), 65504);
assert.equal(encode(2 ** -14, 'f16'), 0x0400); assert.ok(Math.abs(decode(0x0400, 'f16') - 6.1035e-5) < 1e-9); assert.equal(minNormal('f16'), 2 ** -14);
assert.equal(encode(2 ** -24, 'f16'), 0x0001); assert.equal(minSubnormal('f16'), 5.960464477539063e-8);
assert.equal(encode(1, 'f16'), 0x3C00); assert.equal(encode(-2, 'f16'), 0xC000); assert.equal(encode(0.5, 'f16'), 0x3800);
assert.equal(decode(encode(0.1, 'f16'), 'f16'), 0.0999755859375); assert.equal(exactDecimal(encode(0.1, 'f16'), 'f16'), '0.0999755859375');
assert.equal(encode(65520, 'f16'), 0x7C00); assert.equal(encode(65519, 'f16'), 0x7BFF); // overflow threshold, round to nearest even
assert.equal(encode(1e6, 'f16'), 0x7C00); assert.equal(encode(-Infinity, 'f16'), 0xFC00); assert.equal(fields(encode(NaN, 'f16'), 'f16').cls, 'nan');
assert.equal(encode(-0, 'f16'), 0x8000); assert.equal(encode(1e-9, 'f16'), 0); // underflow
assert.equal(encode(2049, 'f16'), 0x6800); // 2049 is a tie between 2048 and 2050 -> even mantissa
assert.equal(decode(0x03FF, 'f16'), 1023 * 2 ** -24); // largest subnormal
assert.equal(encode(1023.75 * 2 ** -24 , 'f16'), 0x0400); // rounds up into the smallest normal
// every f16 pattern round-trips
for (let b = 0; b < 65536; b++) { const f = fields(b, 'f16'); if (f.cls === 'nan') continue; assert.equal(encode(decode(b, 'f16'), 'f16'), b); }
// f32 against Float32Array & generic encoder
assert.equal(encode(0.1, 'f32'), 0x3DCCCCCD); assert.equal(toHex(encode(1, 'f32'), 'f32'), '0x3F800000'); assert.equal(encode(-0, 'f32'), 0x80000000);
assert.equal(exactDecimal(0x3DCCCCCD, 'f32'), '0.100000001490116119384765625');
assert.equal(decode(0x7F7FFFFF, 'f32'), 3.4028234663852886e38); assert.equal(decode(1, 'f32'), 2 ** -149);
{ const s = exactDecimal(1, 'f32'); assert.equal(s.length - 2, 149); assert.ok(s.endsWith('5') && s.startsWith('0.' + '0'.repeat(44) + '14012984643248170709')); }
const f32 = new Float32Array(1); const u = new Uint32Array(f32.buffer);
let seed = 12345; const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
for (let i = 0; i < 3000; i++) {
  const x = (rnd() - 0.5) * 10 ** Math.floor(rnd() * 80 - 40); f32[0] = x;
  assert.equal(encode(x, 'f32'), u[0], String(x)); assert.equal(encodeGeneric(x, 8, 23), u[0], 'generic ' + x);
}
// 2^24 + 1 is not representable in f32
assert.equal(decode(encode(16777217, 'f32'), 'f32'), 16777216); assert.equal(ulpOf(encode(16777216, 'f32'), 'f32'), 2);
assert.equal(ulpOf(encode(1, 'f32'), 'f32'), 2 ** -23); assert.equal(ulpOf(encode(1, 'f16'), 'f16'), 2 ** -10); assert.equal(ulpOf(encode(65504, 'f16'), 'f16'), 32);
assert.equal(ulpOf(0, 'f32'), 2 ** -149); assert.equal(neighbours(encode(1, 'f32'), 'f32').larger, 1 + 2 ** -23);
// rounding error of 0.1 as binary32 is +1.4901161193847656e-9, exactly
const e = roundingError(parseRational('0.1')!, encode(0.1, 'f32'), 'f32'); assert.ok(Math.abs(e.abs - 1.490116119384765625e-9) < 1e-18); assert.ok(!e.exact);
assert.ok(roundingError(parseRational('0.5')!, encode(0.5, 'f32'), 'f32').exact);
assert.ok(parseRational('abc') === null && parseRational('1e-5') !== null);
// fixed point Q16.15 (32 bit, q = 15)
const q = toFixed(0.1, 32, 15); assert.equal(q.raw, 3277); assert.equal(q.value, 3277 / 32768); assert.equal(q.step, 2 ** -15); assert.equal(q.max, 65536 - 2 ** -15);
assert.equal(toFixed(1e9, 32, 15).sat, true); assert.equal(toFixed(-0.5, 16, 15).raw, -16384); assert.equal(toFixed(0.5, 16, 15).raw, 16384);
console.log('float-explorer model: all tests passed');
