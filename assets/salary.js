/*
 * konta.md/calculator-salariu: a month's salary in 2026, from the gross to the net and the
 * employer's cost.
 *
 * The arithmetic is Konta's own payroll's (Konta.Domain.Payroll.PayrollArithmetic, the cumulative
 * method of HG 697/2014), written again here over exact integers: every amount is a BigInt of
 * bani and every rate a fraction, so nothing ever passes through a floating-point number. The
 * figures are not in this file. The package reads them from konta-rulebook and writes them into
 * the page (<script type="application/json" id="salary-rules">), and refuses to package unless
 * this file and the product both pass konta-rulebook's vectors/payroll-md-2026.json to the ban
 * (tools/test-salary.mjs).
 *
 * Loaded by the page as a plain script, and by tools/test-salary.mjs through require().
 */
(function () {
  'use strict';

  var ZERO = BigInt(0);
  var ONE = BigInt(1);
  var TWO = BigInt(2);
  var TEN = BigInt(10);
  var TWELVE = BigInt(12);
  var HUNDRED = BigInt(100);

  // A decimal string ("0.09", "29700", "-22275.00") as an exact fraction n / d.
  function fraction(text) {
    var match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(text));
    if (!match) throw new Error('Not a decimal: ' + text);
    var decimals = match[3] || '';
    var n = BigInt(match[2] + decimals);
    return { n: match[1] ? -n : n, d: TEN ** BigInt(decimals.length) };
  }

  // A decimal string of lei as bani, exactly; refuses anything finer than a ban.
  function bani(text) {
    var f = fraction(text);
    if ((f.n * HUNDRED) % f.d !== ZERO) throw new Error('Finer than a ban: ' + text);
    return (f.n * HUNDRED) / f.d;
  }

  function abs(x) {
    return x < ZERO ? -x : x;
  }

  function max(a, b) {
    return a > b ? a : b;
  }

  // n / d to a whole number, half away from zero or half to even; d > 0.
  function divide(n, d, mode) {
    var q = n / d; // BigInt division truncates toward zero
    var r = abs(n % d) * TWO;
    var away = n < ZERO ? -ONE : ONE;
    if (r > d || (r === d && (mode === 'half_away_from_zero' || abs(q) % TWO === ONE))) q += away;
    return q;
  }

  // The rules as the page carries them, made exact. Mirrors PayrollService.Rules.
  function rules(raw) {
    if (raw.method !== 'cumulative') throw new Error('Unknown withholding method: ' + raw.method);
    if (raw.rounding !== 'half_away_from_zero' && raw.rounding !== 'half_to_even') {
      throw new Error('Unknown rounding: ' + raw.rounding);
    }
    var decimals = Number(raw.decimals);
    if (!(decimals >= 0 && decimals <= 2)) throw new Error('Rounding to ' + raw.decimals + ' decimals');
    return {
      incomeTax: fraction(raw.incomeTaxRate),
      medical: fraction(raw.medicalRate),
      social: fraction(raw.socialRate),
      personalAnnual: bani(raw.personalAnnual),
      cap: bani(raw.personalIncomeCap),
      dependantAnnual: bani(raw.dependantAnnual),
      premiumDeductible: raw.premiumDeductible === true,
      unit: TEN ** BigInt(2 - decimals),
      mode: raw.rounding,
    };
  }

  // n / d bani, rounded as the rules round.
  function round(n, d, r) {
    return divide(n, d * r.unit, r.mode) * r.unit;
  }

  var NOTHING = { gross: ZERO, medical: ZERO, exemption: ZERO, taxable: ZERO, incomeTax: ZERO };

  /*
   * One employee's month, as PayrollArithmetic.Compute: the year's salary less the year's premiums
   * and the exemptions owed so far is taxed at the rate, and this month withholds that less what
   * earlier months withheld, never less than nothing. Once the year's salary passes the cap the
   * personal exemption is owed for none of it. Amounts are BigInt bani.
   */
  function compute(gross, before, entitlement, r) {
    if (gross < ZERO) throw new Error('A negative salary');
    var personalMonths = BigInt(entitlement.personalMonths);
    var dependantMonths = BigInt(entitlement.dependantMonths);
    if (personalMonths < ZERO || dependantMonths < ZERO) throw new Error('Negative months');

    var medical = round(gross * r.medical.n, r.medical.d, r);
    var social = round(gross * r.social.n, r.social.d, r);

    var yearGross = before.gross + gross;
    var yearMedical = before.medical + medical;

    var personal = yearGross > r.cap ? ZERO : r.personalAnnual * personalMonths;
    var yearExemption = round(personal + r.dependantAnnual * dependantMonths, TWELVE, r);

    var deducted = r.premiumDeductible ? yearMedical : ZERO;
    var yearTaxable = max(ZERO, yearGross - deducted - yearExemption);
    var yearTax = round(yearTaxable * r.incomeTax.n, r.incomeTax.d, r);
    var tax = max(ZERO, yearTax - before.incomeTax);

    return {
      gross: gross,
      medical: medical,
      exemption: yearExemption - before.exemption,
      taxable: yearTaxable - before.taxable,
      incomeTax: tax,
      net: gross - medical - tax,
      social: social,
    };
  }

  /*
   * The calculator's month: the same salary every month of the year from January, at one
   * employer, and no other income. Every such month comes out the same, so it is January's. When
   * twelve of them pass the cap the personal exemption is not owed for the year, and the month is
   * computed without it; the year's tax is then what the product's months add up to.
   */
  function month(gross, personal, dependants, r) {
    var capped = personal && gross * TWELVE > r.cap;
    var slip = compute(gross, NOTHING, { personalMonths: personal && !capped ? 1 : 0, dependantMonths: dependants }, r);
    return { slip: slip, capped: capped, cost: gross + slip.social };
  }

  // What a person typed, in lei, as bani. Spaces may group thousands; so may the language's own
  // mark (a point in Romanian and Russian, a comma in English) when every group has three digits.
  // One comma or point followed by one or two digits is the decimal mark in any language. Anything
  // else, "10,000" on a Romanian page among them, is null: refused, never guessed.
  var GROUPED = {
    ro: /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/,
    en: /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/,
  };

  function parse(text, lang) {
    var clean = String(text).replace(/[\s  ]/g, '');
    var match = (lang === 'en' ? GROUPED.en : GROUPED.ro).exec(clean) || /^(\d+)(?:[.,](\d{1,2}))?$/.exec(clean);
    if (!match) return null;
    var whole = match[1].replace(/[.,]/g, '');
    if (whole.length > 9) return null;
    return BigInt(whole) * HUNDRED + BigInt(((match[2] || '') + '00').slice(0, 2));
  }

  // Bani as the page's language writes lei: 8 305,00 in Romanian and Russian, 8,305.00 in English.
  function format(amount, lang) {
    var sign = amount < ZERO ? '-' : '';
    var whole = String(abs(amount) / HUNDRED);
    var cents = String(abs(amount) % HUNDRED).padStart(2, '0');
    var group = lang === 'en' ? ',' : ' ';
    return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (lang === 'en' ? '.' : ',') + cents;
  }

  var api = { fraction: fraction, bani: bani, divide: divide, rules: rules, compute: compute, month: month, parse: parse, format: format, NOTHING: NOTHING };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }

  // --- The page ------------------------------------------------------------------------------

  var form = document.querySelector('form[data-salary]');
  var data = document.getElementById('salary-rules');
  if (!form || !data) return;

  var r = rules(JSON.parse(data.textContent));
  var lang = document.documentElement.lang || 'ro';
  var input = form.querySelector('[name="gross"]');
  var personal = form.querySelector('[name="personal"]');
  var dependants = form.querySelector('[name="dependants"]');
  var error = form.querySelector('[data-salary-error]');
  var capped = document.querySelector('[data-salary-capped]');
  var results = document.querySelector('[data-salary-results]');

  function out(name, amount) {
    var cell = document.querySelector('[data-out="' + name + '"]');
    if (cell) cell.textContent = format(amount, lang);
  }

  function show() {
    var gross = parse(input.value, lang);
    var bad = gross === null;
    error.hidden = !bad;
    input.setAttribute('aria-invalid', bad ? 'true' : 'false');
    results.classList.toggle('calc__results--stale', bad);
    if (bad) return;

    var result = month(gross, personal.checked, Number(dependants.value), r);
    var slip = result.slip;
    out('gross', slip.gross);
    out('medical', slip.medical);
    out('exemption', slip.exemption);
    out('taxable', slip.taxable);
    out('incomeTax', slip.incomeTax);
    out('net', slip.net);
    out('social', slip.social);
    out('cost', result.cost);
    capped.hidden = !result.capped;
  }

  form.addEventListener('input', show);
  form.addEventListener('change', show);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    show();
  });
  show();
})();
