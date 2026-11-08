// Unit tests for parseNumericAnswer. Run: npx tsx scripts/test-numeric.mjs
import { parseNumericAnswer as p } from '../src/lib/units.ts';
let fail = 0;
const t = (inp, unit, exp) => {
  const got = p(inp, unit);
  const ok = Number.isNaN(exp) ? Number.isNaN(got) : Math.abs(got - exp) <= Math.abs(exp) * 1e-9 + 1e-15;
  if (!ok) { fail++; console.log('FAIL', JSON.stringify(inp), JSON.stringify(unit), 'expected', exp, 'got', got); }
};
t('1.59k', 'Hz', 1590); t('1.5915 kHz', 'Hz', 1591.5); t('1.59k', 'kHz', 1.59); t('1590', 'Hz', 1590);
t('−20', 'dB', -20); t('−2.5 V', 'V', -2.5); t('-20', 'dB', -20);
t('7500 Ω', 'kΩ', 7.5); t('7500 ohm', 'kΩ', 7.5); t('7.5k', 'kΩ', 7.5); t('7.5 kΩ', 'kΩ', 7.5); t('7.5', 'kΩ', 7.5);
t('7,5', 'V', 7.5); t('1,500', 'Hz', 1500); t('1.234,5', 'Hz', 1234.5); t('1,234.5', 'Hz', 1234.5); t('1,234,567', 'Hz', 1234567);
t('1e3', 'Hz', 1000); t('2.5E-3', 'A', 0.0025); t('1.5x10^3', 'Hz', 1500); t('1.5×10^-3', 'A', 0.0015);
t('10 mV', 'V', 0.01); t('10mV', 'mV', 10); t('2 V', 'mV', 2000); t('5 us', 'ns', 5000); t('5 µs', 'µs', 5); t('3 ms', 's', 0.003);
t('100 MHz', 'GHz', 0.1); t('50 %', '%', 50); t('25 °C', '°C', 25); t('25C', '°C', 25); t('5 m', 'mm', 5000); t('5 mm', 'm', 0.005);
t('2 A/µs', 'A/µs', 2);
t('5 A', 'V', NaN); t('abc', 'V', NaN); t('', 'V', NaN); t('1.2.3', 'V', NaN); t('5 V', '', NaN); t('5 k', '', 5000);
if (fail) { console.log(fail + ' failed'); process.exit(1); } else console.log('all numeric tests passed');
