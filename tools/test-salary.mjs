// The salary calculator against konta-rulebook's payroll vectors, the file Konta's own payroll
// tests read too (konta: backend/tests/Konta.Golden.Tests/PayrollVectorsTests.cs). If the site
// and the product disagree by a ban on any month, this fails and the site is not packaged.
//
//   node tools/test-salary.mjs <konta-rulebook>/vectors/payroll-md-2026.json < rules.json
//
// rules.json is what the package writes into the page, read from the rulebook as of the vectors'
// asOf; tools/salary_calculator.py builds it and runs this. Prints a summary as JSON on success.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const salary = require('../assets/salary.js');

const vectors = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const raw = JSON.parse(readFileSync(0, 'utf8'));
const rules = salary.rules(raw);
const FIELDS = ['medical', 'exemption', 'taxable', 'incomeTax', 'net', 'social'];

const wrong = [];
let months = 0;
const years = {};

for (const vector of vectors.cases) {
  let year = { ...salary.NOTHING };
  const total = { incomeTax: 0n, net: 0n };
  vector.months.forEach((month, index) => {
    months += 1;
    const slip = salary.compute(salary.bani(month.gross), year, month, rules);
    for (const field of FIELDS) {
      const expected = salary.bani(month.expect[field]);
      if (slip[field] !== expected) {
        wrong.push(`${vector.id}, month ${index + 1}: ${field} ${salary.format(slip[field], 'en')}, expected ${month.expect[field]}`);
      }
    }
    for (const field of ['gross', 'medical', 'exemption', 'taxable', 'incomeTax']) year[field] += slip[field];
    total.incomeTax += slip.incomeTax;
    total.net += slip.net;
  });
  years[vector.id] = { months: vector.months, total };
}

// The calculator's own month, one salary all year: below the cap every month the product
// computes is that month; above it, the product's twelve months come to twelve of it.
function steady(id, personal, dependants) {
  const vector = years[id];
  if (!vector) {
    wrong.push(`no vector ${id}, which the calculator's own month is checked against`);
    return;
  }
  if (vector.months.length !== 12 || new Set(vector.months.map((m) => m.gross)).size !== 1) {
    wrong.push(`${id} is not twelve months of one salary`);
    return;
  }
  const result = salary.month(salary.bani(vector.months[0].gross), personal, dependants, rules);
  if (result.slip.incomeTax * 12n !== vector.total.incomeTax || result.slip.net * 12n !== vector.total.net) {
    wrong.push(`${id}: the calculator's month times twelve is tax ${salary.format(result.slip.incomeTax * 12n, 'en')}, net ${salary.format(result.slip.net * 12n, 'en')}; the product's year is ${salary.format(vector.total.incomeTax, 'en')}, ${salary.format(vector.total.net, 'en')}`);
  }
  return result;
}

const atCap = steady('at-the-cap', true, 0);
const passing = steady('passing-the-cap', true, 0);
const withDependant = steady('cap-keeps-dependants', true, 1);
if (atCap && atCap.capped) wrong.push('at-the-cap: a year exactly at the cap keeps the exemption');
if (passing && !passing.capped) wrong.push('passing-the-cap: a year above the cap loses the exemption');
if (withDependant && withDependant.slip.exemption === 0n) wrong.push('cap-keeps-dependants: the dependant exemption is kept above the cap');

// Reading what a person types, and writing it back.
const parsed = [
  ['ro', '10000', 1000000n], ['ro', '10 000', 1000000n], ['ro', '10000,5', 1000050n], ['ro', '10000.50', 1000050n],
  ['ro', '12.345,50', 1234550n], ['ro', '10.000', 1000000n], ['ru', '1.234.567', 123456700n], ['ro', '0', 0n],
  ['en', '12,345.50', 1234550n], ['en', '10,000', 1000000n], ['en', '10000,5', 1000050n], ['en', '1,234,567.8', 123456780n],
  ['ro', '10,000', null], ['en', '10.000', null], ['ro', '12,345.50', null], ['en', '12.345,50', null], ['ro', '10.00.000', null],
  ['ro', '-5', null], ['ro', '1e4', null], ['ro', '', null], ['ro', '10,123', null], ['ro', '1234567890', null], ['ro', '10000,505', null],
];
for (const [lang, text, expected] of parsed) {
  if (salary.parse(text, lang) !== expected) wrong.push(`parse("${text}", ${lang}) is ${salary.parse(text, lang)}, expected ${expected}`);
}
const formatted = [[830500n, 'ro', '8 305,00'], [830500n, 'en', '8,305.00'], [-2227500n, 'ru', '-22 275,00'], [5n, 'ro', '0,05']];
for (const [amount, lang, expected] of formatted) {
  if (salary.format(amount, lang) !== expected) wrong.push(`format(${amount}, ${lang}) is "${salary.format(amount, lang)}"`);
}

// Rounding both ways at exactly half a ban, and never through a float.
if (salary.divide(5n, 2n, 'half_away_from_zero') !== 3n || salary.divide(-5n, 2n, 'half_away_from_zero') !== -3n) wrong.push('half away from zero');
if (salary.divide(5n, 2n, 'half_to_even') !== 2n || salary.divide(7n, 2n, 'half_to_even') !== 4n) wrong.push('half to even');

if (wrong.length || months === 0) {
  console.error(`The salary calculator disagrees with the payroll vectors (${wrong.length}):`);
  for (const line of wrong) console.error('  ' + line);
  process.exit(1);
}

console.log(JSON.stringify({ cases: vectors.cases.length, months }));
