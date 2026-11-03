// konta.md/instrumente's arithmetic (assets/instrumente.js) against Konta's own worked examples
// and the rulebook's calendar. tools/instrumente.py builds the rules the pages will carry and
// runs this before writing them; any difference and the site is not packaged.
//
//   node tools/test-instrumente.mjs < {"rules": {...}, "days": {...}}
//
// The average salary per calendar day and the employer's sick days are the product's
// (konta: backend/tests/Konta.Domain.Tests/AverageEarningsTests.cs, the three worked examples of
// contabilsef.md of 06.12.2010 with the product's exact amounts). The working days of 2026 are
// the year's working-time balance as published (tools.milek.md/calendar-anual, 2026) and
// recounted by hand. Prints a summary as JSON on success.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const t = require('../assets/instrumente.js');

const input = JSON.parse(readFileSync(0, 'utf8'));
const { rules, days } = input;
const wrong = [];
let checks = 0;

function same(what, actual, expected) {
  checks += 1;
  if (String(actual) !== String(expected)) wrong.push(`${what}: ${actual}, expected ${expected}`);
}

const bani = (text) => t.bani(text);
const lei = (amount) => t.format(amount, 'en').replace(/,/g, '');
const halfUp = t.rounding('half_away_from_zero', 2);

// --- The average salary per calendar day (AverageEarningsTests) -------------------------------

const month = (earnings, worked, scheduled, calendarDays) => ({ earnings: bani(earnings), worked, scheduled, calendarDays });
const whole = { n: 1n, d: 1n };

{
  const avg = t.average([month('1485.19', 19, 19, 28), month('1485.18', 20, 20, 28), month('1485.18', 22, 22, 30)]);
  same('fourteen days on three whole months, the average to 4 places', t.divide(avg.n * 100n, avg.d, 'half_away_from_zero'), 518087n);
  same('fourteen days on three whole months', lei(t.pay(avg, 1400, whole, halfUp)), '725.32');
}
{
  const avg = t.average([month('0', 0, 20, 28), month('3100', 21, 21, 31), month('3100', 22, 22, 30)]);
  same('a month without work stays in the coefficient', lei(t.pay(avg, 2000, whole, halfUp)), '2041.29');
}
{
  const avg = t.average([month('2200.50', 17, 20, 29), month('1987.26', 15, 22, 30), month('2059.18', 15, 20, 30)]);
  same('days away out of the days worked, not out of the period', lei(t.pay(avg, 1000, whole, halfUp)), '925.92');
}
same('nothing earned: no average', t.average([month('0', 0, 22, 30), month('0', 0, 20, 27), month('0', 0, 19, 29)]), null);
same('sick days keep 75%', lei(t.pay({ n: 50000n, d: 1n }, 1000, t.fraction('0.75'), halfUp)), '3750.00');
same('unused days in hundredths', lei(t.pay({ n: 50000n, d: 1n }, 933, whole, halfUp)), '4665.00');
same('days as the pages write them', `${t.hundredths(933, 'ro')} ${t.hundredths(1100, 'ro')} ${t.hundredths(933, 'en')}`, '9,33 11 9.33');

for (const [length, used, expected] of [[3, 0, 3], [12, 0, 5], [12, 13, 2], [12, 15, 0]]) {
  same(`employer's sick days of ${length}, ${used} used`, t.employerSickDays(length, used, 5, 15), expected);
}

// --- The rules as the pages carry them ---------------------------------------------------------

for (const tool of ['leave', 'sick']) {
  const r = rules[tool];
  same(`${tool}: periods cover ${r.from} to ${r.to}`, r.periods[0].from + '..' + r.periods[r.periods.length - 1].to, r.from + '..' + r.to);
  for (const p of r.periods) same(`${tool} ${p.from}: three reference months`, p.referenceMonths, 3);
}
for (const p of rules.sick.periods) {
  same(`sick ${p.from}: the employer's days`, `${p.perCase}/${p.perYear}/${p.share}`, '5/15/0.75');
}

// --- VAT -------------------------------------------------------------------------------------

const vatRounding = t.rounding(rules.vat.rounding, rules.vat.decimals);
const standard = rules.vat.periods[0].rates.find((r) => r.key === 'tax.vat.standard_rate');
same('the standard rate of 2026', standard.percent, '20%');
for (const [amount, mode, rate, net, vat, gross] of [
  ['10000', 'add', '0.20', '10000.00', '2000.00', '12000.00'],
  ['12000', 'extract', '0.20', '10000.00', '2000.00', '12000.00'],
  ['100', 'extract', '0.20', '83.33', '16.67', '100.00'],
  ['108', 'extract', '0.08', '100.00', '8.00', '108.00'],
  ['0.13', 'add', '0.20', '0.13', '0.03', '0.16'],
  ['0.10', 'add', '0.08', '0.10', '0.01', '0.11'],
  ['500', 'add', '0', '500.00', '0.00', '500.00'],
]) {
  const r = t.vat(bani(amount), t.fraction(rate), mode, vatRounding);
  same(`VAT ${mode} ${amount} at ${rate}`, `${lei(r.net)} ${lei(r.vat)} ${lei(r.gross)}`, `${net} ${vat} ${gross}`);
}
for (const p of rules.vat.periods) {
  checks += 1;
  if (p.rates.some((r) => r.key === 'tax.vat.higher_reduced_rate') && p.from < '2027-01-01') wrong.push(`a 12% rate before 2027 (${p.from})`);
}

// --- IT Park ---------------------------------------------------------------------------------

{
  const rate = t.fraction(rules.itpark.rate);
  const minimum = bani(rules.itpark.minimum);
  const low = t.itPark(bani('70000'), 2, rate, minimum, halfUp);
  same('IT Park, 70 000 lei and 2 employees', `${lei(low.share)} ${lei(low.floor)} ${lei(low.tax)} ${low.byFloor}`, '4900.00 10440.00 10440.00 true');
  const high = t.itPark(bani('200000'), 2, rate, minimum, halfUp);
  same('IT Park, 200 000 lei and 2 employees', `${lei(high.tax)} ${high.byFloor}`, '14000.00 false');
}

// --- Working days ----------------------------------------------------------------------------

const cal = t.calendar(rules.leave.calendar);
for (const [year, table] of Object.entries(days)) {
  table.months.forEach((row) => {
    const js = t.month(cal, Number(year), row.month, BigInt(table.daily), BigInt(table.reduction));
    same(`${year}-${row.month}: the page's table and the tools' calendar`, `${row.scheduled} ${row.hours} ${row.off}`, `${js.scheduled} ${js.hours} ${js.days - js.scheduled}`);
  });
}
if (days['2026']) {
  const published = [[19, 151], [20, 160], [22, 176], [20, 159], [20, 159], [21, 168], [23, 184], [19, 151], [22, 176], [22, 176], [21, 168], [22, 174]];
  days['2026'].months.forEach((row, i) => same(`2026-${row.month} as published`, `${row.scheduled} ${row.hours}`, published[i].join(' ')));
}

// A leave over a holiday: 14 days from 2026-01-01 hold New Year and both days of Christmas.
{
  const s = t.span(cal, '2026-01-01', '2026-01-14');
  same('fourteen days from 1 January 2026, holidays out', s.days - s.holidays, 11);
  const ref = t.referenceMonths('2026-01-15', 3).map((m) => `${m.year}-${m.month}`).join(' ');
  same('the reference months of 15 January 2026', ref, '2025-10 2025-11 2025-12');
}

if (wrong.length) {
  console.error(`The tools disagree with their checks (${wrong.length} of ${checks}):`);
  for (const line of wrong) console.error('  ' + line);
  process.exit(1);
}
console.log(JSON.stringify({ checks }));
