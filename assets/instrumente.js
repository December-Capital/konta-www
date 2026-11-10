/*
 * konta.md/instrumente: VAT, leave pay and unused-leave compensation, the employer's sick days,
 * and the IT Park single tax. The salary calculator, the first tab, is assets/salary.js.
 *
 * Every amount is a BigInt of bani and every rate a fraction, so nothing passes through a
 * floating-point number. The average salary per calendar day and the employer's sick days are
 * Konta's own payroll's (Konta.Domain.Payroll.AverageEarnings and EmployerSickDays), written again
 * here. No figure is in this file: the package reads them from konta-rulebook, with the days off
 * from its calendar, and writes them into the page (<script type="application/json"
 * id="tool-rules">); tools/test-instrumente.mjs runs this file over the product's own worked
 * examples before anything is packaged.
 *
 * Loaded by the pages as a plain script, and by tools/test-instrumente.mjs through require().
 */
(function () {
  'use strict';

  var ZERO = BigInt(0);
  var ONE = BigInt(1);
  var TWO = BigInt(2);
  var TEN = BigInt(10);
  var HUNDRED = BigInt(100);

  // --- Numbers -------------------------------------------------------------------------------

  // A decimal string ("0.20", "29.4", "5220") as an exact fraction n / d.
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

  // n / d to a whole number, half away from zero or half to even; d > 0.
  function divide(n, d, mode) {
    var q = n / d; // BigInt division truncates toward zero
    var r = abs(n % d) * TWO;
    var away = n < ZERO ? -ONE : ONE;
    if (r > d || (r === d && (mode === 'half_away_from_zero' || abs(q) % TWO === ONE))) q += away;
    return q;
  }

  // A rounding as the rulebook names it: a mode, and how many decimals of a leu are kept.
  function rounding(mode, decimals) {
    if (mode !== 'half_away_from_zero' && mode !== 'half_to_even') throw new Error('Unknown rounding: ' + mode);
    var places = Number(decimals);
    if (!(places >= 0 && places <= 2)) throw new Error('Rounding to ' + decimals + ' decimals');
    return { mode: mode, unit: TEN ** BigInt(2 - places) };
  }

  // n / d bani, rounded as `r` rounds.
  function round(n, d, r) {
    return divide(n, d * r.unit, r.mode) * r.unit;
  }

  // What a person typed, in lei, as bani: the salary calculator's reading (assets/salary.js).
  // Spaces may group thousands; so may the language's own mark when every group has three
  // digits. One comma or point followed by one or two digits is the decimal mark. Anything else is
  // null: refused, never guessed.
  var GROUPED = {
    ro: /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/,
    en: /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/,
  };

  function parse(text, lang) {
    var clean = String(text).replace(/[\s  ]/g, '');
    var match = (lang === 'en' ? GROUPED.en : GROUPED.ro).exec(clean) || /^(\d+)(?:[.,](\d{1,2}))?$/.exec(clean);
    if (!match) return null;
    var whole = match[1].replace(/[.,]/g, '');
    if (whole.length > 12) return null;
    return BigInt(whole) * HUNDRED + BigInt(((match[2] || '') + '00').slice(0, 2));
  }

  // A whole number typed (days, people), or null.
  function count(text, most) {
    var clean = String(text).replace(/[\s  ]/g, '');
    if (!/^\d{1,6}$/.test(clean)) return null;
    var value = Number(clean);
    return most !== undefined && value > most ? null : value;
  }

  // Bani as the page's language writes lei: 8 305,00 in Romanian and Russian, 8,305.00 in English.
  function format(amount, lang) {
    var sign = amount < ZERO ? '-' : '';
    var whole = String(abs(amount) / HUNDRED);
    var cents = String(abs(amount) % HUNDRED).padStart(2, '0');
    var group = lang === 'en' ? ',' : ' ';
    return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, group) + (lang === 'en' ? '.' : ',') + cents;
  }

  // Hundredths (of a day) as the language writes them: 9 or 9,33 (9.33 in English).
  function hundredths(value, lang) {
    var v = BigInt(value);
    var whole = v / HUNDRED;
    var part = v % HUNDRED;
    return String(whole) + (part ? (lang === 'en' ? '.' : ',') + String(part).padStart(2, '0') : '');
  }

  // --- Days ----------------------------------------------------------------------------------

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function iso(year, month, day) {
    // Through UTC so a day past the end of a month rolls over the way the calendar does.
    var d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function parts(date) {
    var p = date.split('-').map(Number);
    return { year: p[0], month: p[1], day: p[2] };
  }

  function addDays(date, days) {
    var p = parts(date);
    return iso(p.year, p.month, p.day + days);
  }

  // 1 Monday ... 7 Sunday.
  function weekday(date) {
    var p = parts(date);
    return ((new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7) + 1;
  }

  function lastDay(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function validDate(text) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text))) return false;
    var p = parts(text);
    return p.month >= 1 && p.month <= 12 && p.day >= 1 && p.day <= lastDay(p.year, p.month);
  }

  /*
   * The working-day calendar of konta-rulebook (FiscalCalendar in the product): Saturday and
   * Sunday off, the Labour Code's holidays (art. 111) off whatever day they fall on, and a year's
   * transfers moving a rest day and the working day in its place. A transferred rest day is off
   * but is not a holiday.
   */
  function calendar(data) {
    var holidays = new Set(data.holidays);
    var rest = new Set(data.restDays);
    var worked = new Set(data.workedDays);
    var weekend = data.weekend;
    return {
      from: data.from,
      to: data.to,
      known: function (year) {
        return data.known.indexOf(year) >= 0;
      },
      isHoliday: function (date) {
        return holidays.has(date);
      },
      isWorkingDay: function (date) {
        if (worked.has(date)) return true;
        if (holidays.has(date) || rest.has(date)) return false;
        return weekend.indexOf(weekday(date)) < 0;
      },
    };
  }

  /*
   * A month as the average counts it: its working days by the calendar and its calendar days less
   * the holidays. The normal hours are 8 a working day, less the pre-holiday hour on the working
   * day before a holiday (Codul muncii art. 102), as the product's timesheets count them.
   */
  function month(cal, year, m, dailyHours, preHoliday) {
    var scheduled = 0;
    var holidays = 0;
    var hours = ZERO;
    var reduced = 0;
    var days = lastDay(year, m);
    for (var day = 1; day <= days; day += 1) {
      var date = iso(year, m, day);
      if (cal.isHoliday(date)) holidays += 1;
      if (cal.isWorkingDay(date)) {
        scheduled += 1;
        var short = cal.isHoliday(addDays(date, 1));
        if (short) reduced += 1;
        if (dailyHours) hours += dailyHours - (short ? preHoliday : ZERO);
      }
    }
    return { year: year, month: m, days: days, holidays: holidays, scheduled: scheduled, calendarDays: days - holidays, hours: hours, reduced: reduced };
  }

  // The `count` calendar months before the month of `date`, oldest first (HG 426/2004 anexa 1
  // pct. 5: "de la data de 1 pînă la data de 1").
  function referenceMonths(date, count) {
    var p = parts(date);
    var months = [];
    for (var i = count; i >= 1; i -= 1) {
      var first = parts(iso(p.year, p.month - i, 1));
      months.push({ year: first.year, month: first.month });
    }
    return months;
  }

  // The days of a span, both ends counted, and how many of them are holidays.
  function span(cal, from, to) {
    var days = 0;
    var holidays = 0;
    for (var date = from; date <= to; date = addDays(date, 1)) {
      days += 1;
      if (cal.isHoliday(date)) holidays += 1;
      if (days > 400) break;
    }
    return { days: days, holidays: holidays };
  }

  // --- The rules -----------------------------------------------------------------------------

  // The period of the rules covering a day, or null.
  function period(periods, date) {
    for (var i = 0; i < periods.length; i += 1) {
      if (periods[i].from <= date && date <= periods[i].to) return periods[i];
    }
    return null;
  }

  // --- VAT -----------------------------------------------------------------------------------

  /*
   * VAT added to an amount without it, or taken out of one that includes it, at rate n / d: the
   * VAT rounded as the rulebook rounds a line (tax.vat.line_rounding), the other amount the
   * difference, so the two always add up. Taken out, the VAT is the amount times n / (d + n).
   */
  function vat(amount, rate, mode, r) {
    if (amount < ZERO) throw new Error('A negative amount');
    if (mode === 'add') {
      var added = round(amount * rate.n, rate.d, r);
      return { net: amount, vat: added, gross: amount + added };
    }
    if (mode === 'extract') {
      var inside = round(amount * rate.n, rate.d + rate.n, r);
      return { net: amount - inside, vat: inside, gross: amount };
    }
    throw new Error('Unknown VAT mode: ' + mode);
  }

  // --- The average salary per calendar day ------------------------------------------------------

  /*
   * HG 426/2004 anexa 1 pct. 10, as AverageEarnings.PerCalendarDay: the earnings over the days
   * actually worked, times the period's working days over its calendar days less holidays. Days
   * not worked are out of the earnings and the days worked, but a month without work stays in the
   * period. Exact, as bani per day n / d; null when nothing was earned or worked.
   */
  function average(months) {
    var earnings = ZERO;
    var worked = ZERO;
    var scheduled = ZERO;
    var calendarDays = ZERO;
    months.forEach(function (m) {
      earnings += m.earnings;
      worked += BigInt(m.worked);
      scheduled += BigInt(m.scheduled);
      calendarDays += BigInt(m.calendarDays);
    });
    if (earnings <= ZERO || worked <= ZERO || calendarDays <= ZERO) return null;
    return { n: earnings * scheduled, d: worked * calendarDays };
  }

  // What some days are paid at an average, kept at a share of it, rounded once (AverageEarnings.Pay).
  // `days` is in hundredths of a day, so 9,33 unused days are paid exactly.
  function pay(avg, days, share, r) {
    return round(avg.n * BigInt(days) * share.n, avg.d * HUNDRED * share.d, r);
  }

  // The employer's days of an incapacity (EmployerSickDays.Count): its first ones, up to the
  // most for one incapacity and what is left of the most in a calendar year.
  function employerSickDays(length, used, perCase, perYear) {
    return Math.max(0, Math.min(Math.min(length, perCase), perYear - used));
  }

  // --- IT Park -------------------------------------------------------------------------------

  /*
   * Codul fiscal art. 370: the single tax is the rate of the month's sales revenue, but not less
   * than the minimum for each employee. Rounded to the ban, half up: our choice, no act read gives
   * a rounding for it.
   */
  function itPark(revenue, employees, rate, minimum, r) {
    if (revenue < ZERO || employees < 0) throw new Error('Negative revenue or employees');
    var share = round(revenue * rate.n, rate.d, r);
    var floor = minimum * BigInt(employees);
    return { share: share, floor: floor, tax: share > floor ? share : floor, byFloor: floor > share };
  }

  /*
   * The same month outside the park, in the general regime: the salaries taxed as Konta's payroll
   * taxes them (assets/salary.js's month(), passed in as `salary`), split evenly between the
   * employees, every one with or without the personal exemption, and the company's income tax,
   * either the rate of the profit (sales less the salaries, the employer's contribution and the
   * other deductible costs, nothing when that is a loss) or IVAO's rate of the sales revenue.
   *
   *   input: { revenue, salaries, costs: BigInt bani; employees: number; personal: boolean;
   *            regime: 'profit' | 'ivao' }
   *   rules: { profitRate, ivaoRate, ivaoCeiling: strings; payroll: salary.rules() of the page's }
   */
  function generalRegime(input, rules, salary, r) {
    var n = BigInt(input.employees);
    if (input.revenue < ZERO || input.salaries < ZERO || input.costs < ZERO || n < ZERO) {
      throw new Error('A negative amount or number of employees');
    }
    if (n === ZERO && input.salaries > ZERO) throw new Error('Salaries without employees');

    var social = ZERO;
    var medical = ZERO;
    var incomeTax = ZERO;
    var capped = false;
    if (n > ZERO) {
      // The bani that do not divide evenly go one each to the first employees.
      var each = input.salaries / n;
      var more = input.salaries % n;
      [[each, n - more], [each + ONE, more]].forEach(function (group) {
        if (group[1] === ZERO) return;
        var m = salary.month(group[0], input.personal, 0, rules.payroll);
        social += m.slip.social * group[1];
        medical += m.slip.medical * group[1];
        incomeTax += m.slip.incomeTax * group[1];
        capped = capped || m.capped;
      });
    }

    var profit = input.revenue - input.salaries - social - input.costs;
    var company;
    if (input.regime === 'ivao') {
      var ivao = fraction(rules.ivaoRate);
      company = round(input.revenue * ivao.n, ivao.d, r);
    } else {
      var rate = fraction(rules.profitRate);
      company = profit > ZERO ? round(profit * rate.n, rate.d, r) : ZERO;
    }
    return {
      social: social,
      medical: medical,
      incomeTax: incomeTax,
      profit: profit,
      company: company,
      total: social + medical + incomeTax + company,
      capped: capped,
      overIvao: input.revenue * BigInt(12) > bani(rules.ivaoCeiling),
    };
  }

  var api = {
    fraction: fraction,
    bani: bani,
    divide: divide,
    rounding: rounding,
    parse: parse,
    count: count,
    format: format,
    hundredths: hundredths,
    iso: iso,
    addDays: addDays,
    calendar: calendar,
    month: month,
    referenceMonths: referenceMonths,
    span: span,
    period: period,
    vat: vat,
    average: average,
    pay: pay,
    employerSickDays: employerSickDays,
    itPark: itPark,
    generalRegime: generalRegime,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }

  // --- The pages -----------------------------------------------------------------------------

  var data = document.getElementById('tool-rules');
  var root = document.querySelector('[data-tool]');
  if (!root) return;

  // The working days' page is written whole at package time and carries no rules.
  var rules = data ? JSON.parse(data.textContent) : {};
  var lang = document.documentElement.lang || 'ro';
  var tool = root.getAttribute('data-tool');

  // The page's own words for what script writes, from its hidden block (translated with the page).
  var words = {};
  var block = document.querySelector('[data-tool-words]');
  if (block) {
    block.querySelectorAll('[data-w]').forEach(function (el) {
      words[el.getAttribute('data-w')] = el.textContent;
    });
  }

  function word(key, values) {
    var text = words[key] || '';
    Object.keys(values || {}).forEach(function (name) {
      text = text.split('{' + name + '}').join(values[name]);
    });
    return text;
  }

  function el(name) {
    return root.querySelector('[data-el="' + name + '"]');
  }

  function out(name, text) {
    var cell = root.querySelector('[data-out="' + name + '"]');
    if (!cell) return;
    // The digits roll to the new figure where assets/roll.js is loaded (the tools' pages).
    if (window.kontaRoll) window.kontaRoll(cell, text);
    else cell.textContent = text;
  }

  function invalid(input, bad) {
    input.setAttribute('aria-invalid', bad ? 'true' : 'false');
    return bad;
  }

  function stale(on) {
    var table = root.querySelector('[data-results]');
    if (table) table.classList.toggle('calc__results--stale', on);
  }

  function say(name, on, text) {
    var note = el(name);
    if (!note) return;
    if (text !== undefined) note.textContent = text;
    note.hidden = !on;
  }

  function monthName(m) {
    return words['m' + m.month] + ' ' + m.year;
  }

  function today() {
    var now = new Date();
    return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  // A day inside the rules' range: today when it is, else the nearest end.
  function within(date) {
    if (date < rules.from) return rules.from;
    if (date > rules.to) return rules.to;
    return date;
  }

  function wire(form, show) {
    form.addEventListener('input', show);
    form.addEventListener('change', show);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      show();
    });
    show();
  }

  // --- VAT -----------------------------------------------------------------------------------

  function vatPage() {
    var form = root.querySelector('form');
    var amount = form.querySelector('[name="amount"]');
    var date = form.querySelector('[name="date"]');
    var rate = form.querySelector('[name="rate"]');
    var r = rounding(rules.rounding, rules.decimals);
    date.min = rules.from;
    date.max = rules.to;
    date.value = within(today());

    function options() {
      var p = period(rules.periods, date.value);
      var chosen = rate.value;
      rate.innerHTML = '';
      if (!p) return null;
      p.rates.forEach(function (one) {
        var option = document.createElement('option');
        option.value = one.key;
        option.textContent = word('rate.' + one.key, { rate: one.percent }) + (one.provisional ? ' · ' + word('provisional') : '');
        rate.appendChild(option);
      });
      if (p.rates.some(function (one) { return one.key === chosen; })) rate.value = chosen;
      return p;
    }

    var shownPeriod = null;

    function show() {
      var p = period(rules.periods, date.value);
      if (p !== shownPeriod) {
        options();
        shownPeriod = p;
      }
      var sum = parse(amount.value, lang);
      var badDate = invalid(date, !validDate(date.value) || !p);
      var badSum = invalid(amount, sum === null);
      say('amount-error', badSum);
      say('date-error', badDate);
      stale(badDate || badSum);
      if (badDate || badSum) return;

      var chosen = p.rates.filter(function (one) { return one.key === rate.value; })[0] || p.rates[0];
      var mode = form.querySelector('[name="mode"]:checked').value;
      var result = vat(sum, fraction(chosen.rate), mode, r);
      out('net', format(result.net, lang));
      out('vat', format(result.vat, lang));
      out('gross', format(result.gross, lang));
      out('rate', chosen.percent);
      say('provisional', chosen.provisional);
    }

    wire(form, show);
  }

  // --- The three months of the average, shared by leave and sick pay ------------------------

  function averageBlock(form, cal) {
    var rows = el('months');
    var built = null;

    function build(months) {
      var key = months.map(function (m) { return m.year + '-' + m.month; }).join(',');
      if (key === built) return;
      built = key;
      rows.innerHTML = '';
      months.forEach(function (m, i) {
        var info = month(cal, m.year, m.month);
        var row = document.createElement('div');
        row.className = 'tool__month';
        var id = 'm' + i;
        row.innerHTML =
          '<p class="tool__month-name"></p>' +
          '<div class="field"><label for="' + id + 'e"></label><input id="' + id + 'e" name="earnings' + i + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" /></div>' +
          '<div class="field"><label for="' + id + 'w"></label><input id="' + id + 'w" name="worked' + i + '" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" /></div>';
        row.querySelector('.tool__month-name').textContent = monthName(m);
        row.querySelector('[for="' + id + 'e"]').textContent = word('earnings');
        row.querySelector('[for="' + id + 'w"]').textContent = word('worked', { days: info.scheduled });
        row.querySelector('[name="worked' + i + '"]').value = String(info.scheduled);
        // An example, as the salary calculator starts at 10 000: the result shows before anything is typed.
        row.querySelector('[name="earnings' + i + '"]').value = '10000';
        rows.appendChild(row);
      });
    }

    // The months as the average takes them, or null with the inputs marked.
    function read(months) {
      build(months);
      var bad = false;
      var read = months.map(function (m, i) {
        var info = month(cal, m.year, m.month);
        var earnings = form.querySelector('[name="earnings' + i + '"]');
        var worked = form.querySelector('[name="worked' + i + '"]');
        var e = earnings.value.trim() === '' ? ZERO : parse(earnings.value, lang);
        var w = count(worked.value, info.scheduled);
        bad = invalid(earnings, e === null) || bad;
        bad = invalid(worked, w === null) || bad;
        return { earnings: e, worked: w, scheduled: info.scheduled, calendarDays: info.calendarDays };
      });
      return bad ? null : read;
    }

    return { read: read };
  }

  function averageOut(months, avg) {
    var earnings = ZERO;
    var worked = 0;
    var scheduled = 0;
    var calendarDays = 0;
    months.forEach(function (m) {
      earnings += m.earnings;
      worked += m.worked;
      scheduled += m.scheduled;
      calendarDays += m.calendarDays;
    });
    out('earnings', format(earnings, lang));
    out('worked', worked + ' / ' + scheduled);
    out('calendarDays', String(calendarDays));
    // Shown to the ban; the amount paid is computed from the exact average.
    out('average', format(divide(avg.n, avg.d, 'half_away_from_zero'), lang));
  }

  // --- Leave pay and unused-leave compensation -------------------------------------------------

  function leavePage() {
    var form = root.querySelector('form');
    var cal = calendar(rules.calendar);
    var block = averageBlock(form, cal);
    var start = form.querySelector('[name="start"]');
    var end = form.querySelector('[name="end"]');
    var left = form.querySelector('[name="left"]');
    var unused = form.querySelector('[name="unused"]');
    var first = within(today());
    start.value = first;
    end.value = addDays(first, 13);
    left.value = first;
    [start, end, left].forEach(function (input) {
      input.min = rules.from;
      input.max = rules.to;
    });

    function show() {
      var mode = form.querySelector('[name="mode"]:checked').value;
      root.querySelectorAll('[data-mode]').forEach(function (part) {
        part.hidden = part.getAttribute('data-mode') !== mode;
      });

      var event = mode === 'leave' ? start.value : left.value;
      var badEvent = invalid(mode === 'leave' ? start : left, !validDate(event) || event < rules.from || event > rules.to);
      var badEnd = mode === 'leave' && invalid(end, !validDate(end.value) || end.value < start.value || end.value > addDays(start.value, 365));
      var days = null;
      if (mode === 'compensation') {
        var typed = parse(unused.value, lang);
        days = typed !== null && typed <= BigInt(36600) ? Number(typed) : null;
        invalid(unused, days === null);
      }
      say('date-error', badEvent || badEnd);
      if (badEvent) {
        stale(true);
        return;
      }

      var p = period(rules.periods, event);
      var months = block.read(referenceMonths(event, p.referenceMonths));
      var bad = badEnd || months === null || (mode === 'compensation' && days === null);
      var avg = months && average(months);
      say('no-earnings', months !== null && !avg);
      say('unknown', !cal.known(Number(event.slice(0, 4))));
      stale(bad || !avg);
      if (bad || !avg) return;

      if (mode === 'leave') {
        var s = span(cal, start.value, end.value);
        days = (s.days - s.holidays) * 100;
        out('days', hundredths(days, lang) + ' ' + word('of', { days: s.days }));
      } else {
        out('days', hundredths(days, lang));
      }
      averageOut(months, avg);
      out('pay', format(pay(avg, days, { n: ONE, d: ONE }, rounding(p.rounding, p.decimals)), lang));
    }

    wire(form, show);
  }

  // --- The employer's sick days ----------------------------------------------------------------

  function sickPage() {
    var form = root.querySelector('form');
    var cal = calendar(rules.calendar);
    var block = averageBlock(form, cal);
    var start = form.querySelector('[name="start"]');
    var length = form.querySelector('[name="length"]');
    var used = form.querySelector('[name="used"]');
    var budget = form.querySelector('[name="budget"]');
    start.value = within(today());
    start.min = rules.from;
    start.max = rules.to;

    function show() {
      var badStart = invalid(start, !validDate(start.value) || start.value < rules.from || start.value > rules.to);
      say('date-error', badStart);
      if (badStart) {
        stale(true);
        return;
      }
      var p = period(rules.periods, start.value);
      var l = count(length.value, 366);
      var u = count(used.value, p.perYear);
      invalid(length, l === null || l === 0);
      invalid(used, u === null);
      var months = block.read(referenceMonths(start.value, p.referenceMonths));
      var avg = months && average(months);
      say('no-earnings', months !== null && !avg);
      say('unknown', !cal.known(Number(start.value.slice(0, 4))));
      var bad = l === null || l === 0 || u === null || months === null || !avg;
      stale(bad);
      if (bad) return;

      var days = budget.checked ? 0 : employerSickDays(l, u, p.perCase, p.perYear);
      averageOut(months, avg);
      out('days', String(days));
      out('budgetDays', String(l - days));
      out('pay', format(pay(avg, days * 100, fraction(p.share), rounding(p.rounding, p.decimals)), lang));
    }

    wire(form, show);
  }

  // --- IT Park -------------------------------------------------------------------------------

  function itParkPage() {
    var form = root.querySelector('form');
    var revenue = form.querySelector('[name="revenue"]');
    var employees = form.querySelector('[name="employees"]');
    var salaries = form.querySelector('[name="salaries"]');
    var costs = form.querySelector('[name="costs"]');
    var personal = form.querySelector('[name="personal"]');
    var r = rounding('half_away_from_zero', 2);
    var salary = window.KontaSalary;
    var general = { profitRate: rules.profitRate, ivaoRate: rules.ivaoRate, ivaoCeiling: rules.ivaoCeiling, payroll: salary.rules(rules.payroll) };

    function show() {
      var sum = parse(revenue.value, lang);
      var people = count(employees.value, 100000);
      var paid = parse(salaries.value, lang);
      var other = costs.value.trim() === '' ? ZERO : parse(costs.value, lang);
      invalid(revenue, sum === null);
      invalid(employees, people === null);
      invalid(salaries, paid === null || (people === 0 && paid > ZERO));
      invalid(costs, other === null);
      say('revenue-error', sum === null);
      say('salaries-error', paid === null);
      say('nobody-error', paid !== null && people === 0 && paid > ZERO);
      say('costs-error', other === null);
      var bad = sum === null || people === null || paid === null || other === null || (people === 0 && paid > ZERO);
      stale(bad);
      say('verdict', !bad);
      if (bad) return;

      var regime = form.querySelector('[name="regime"]:checked').value;
      var park = itPark(sum, people, fraction(rules.rate), bani(rules.minimum), r);
      var std = generalRegime({ revenue: sum, salaries: paid, costs: other, employees: people, personal: personal.checked, regime: regime }, general, salary, r);
      out('social', format(std.social, lang));
      out('medical', format(std.medical, lang));
      out('incomeTax', format(std.incomeTax, lang));
      out('company', format(std.company, lang));
      out('general', format(std.total, lang));
      out('share', format(park.share, lang));
      out('floor', format(park.floor, lang));
      out('tax', format(park.tax, lang));
      el('company-profit').hidden = regime !== 'profit';
      el('company-ivao').hidden = regime !== 'ivao';
      say('by-floor', park.byFloor);
      say('capped', std.capped);
      say('over-ivao', regime === 'ivao' && std.overIvao);
      say('loss', regime === 'profit' && std.profit < ZERO);

      var difference = std.total - park.tax;
      var key = difference > ZERO ? 'less' : difference < ZERO ? 'more' : 'same';
      say('verdict', true, word('verdict.' + key, {
        month: format(abs(difference), lang),
        year: format(abs(difference) * BigInt(12), lang),
      }));
      el('verdict').setAttribute('data-verdict', key);
    }

    wire(form, show);
  }

  // --- Working days: the year shown, the others a click away ----------------------------------

  function daysPage() {
    var buttons = root.querySelectorAll('[data-year-btn]');
    var years = root.querySelectorAll('[data-tool-year]');
    function pick(year) {
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-year-btn') === year ? 'true' : 'false');
      });
      years.forEach(function (y) {
        y.hidden = y.getAttribute('data-tool-year') !== year;
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        pick(b.getAttribute('data-year-btn'));
      });
    });
    var now = String(new Date().getFullYear());
    var has = Array.prototype.some.call(buttons, function (b) { return b.getAttribute('data-year-btn') === now; });
    root.querySelector('[data-year-pick]').hidden = false;
    pick(has ? now : buttons[0].getAttribute('data-year-btn'));
  }

  ({ vat: vatPage, leave: leavePage, sick: sickPage, itpark: itParkPage, days: daysPage })[tool]();
})();
