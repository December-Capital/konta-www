"""konta.md/instrumente's tools, filled in from konta-rulebook at package time.

The salary calculator, the first tab (instrumente/index.html), is tools/salary_calculator.py's.
This fills the other tabs, each an ordinary page with its words under data-t like any other, so
tools/languages.py writes their Russian and English copies first:

    instrumente/tva/              VAT added or taken out, at the rates in force on a day
    instrumente/concediu/         leave pay and the compensation for unused leave
    instrumente/boala/            the employer's days of a sick leave
    instrumente/zile-lucratoare/  working days and hours, month by month
    instrumente/it-park/          the IT Park single tax

No rate, day count or rounding is typed into this repository. Each page gets the rules it needs in
<script type="application/json" id="tool-rules">, where assets/instrumente.js reads them, as
periods: the days between two changes of any of its keys, resolved the way the product's rulebook
resolves them (tools/salary_calculator.py's lookup). The days off come from konta-rulebook's
tools/calendar.mjs, as konta.md/calendar's do. Its words carry placeholders this fills in each
language:

    {val:<year>:<key>}    the value, as the language writes it (20%, 5 220, 29,4)
    {act:<year>:<key>}    the act and article the rulebook cites
    {prov:<year>:<key>}   a "provisional" mark when the rulebook says the value is
    {commit}              the rulebook commit the page was built from

and a key's value must be the same all year for <year> to stand for it. The working days' tables
are written in place of <!-- tool:days -->, from the words of the page's hidden data-tool-words
block, which is translated with the page.

Before anything is written, tools/test-instrumente.mjs runs assets/instrumente.js over the
product's own worked examples (the average salary, sick days, VAT, the IT Park minimum) and over
the tables written here. One ban or one day of difference and nothing is packaged.

Called from package.build() after the salary calculator, never on its own. `python
tools/instrumente.py --check` runs the tests alone.
"""

import datetime
import html
import io
import json
import os
import re
import subprocess
import sys

import fiscal_calendar
import languages
import salary_calculator as salary

PAGES = {
    'vat': '/instrumente/tva/',
    'leave': '/instrumente/concediu/',
    'sick': '/instrumente/boala/',
    'days': '/instrumente/zile-lucratoare/',
    'itpark': '/instrumente/it-park/',
}

# The days the tools answer for: from the first rule set the site shows to the last one the
# rulebook holds. The average looks three months back, so the calendar starts a year earlier.
FIRST, LAST = datetime.date(2026, 1, 1), datetime.date(2027, 12, 31)
CALENDAR_FROM = datetime.date(2025, 1, 1)
DAYS_YEARS = (2026, 2027)

RULES_MARK = '<!-- tool:rules -->'
DAYS_MARK = '<!-- tool:days -->'
WORDS = re.compile(r'<div hidden data-tool-words>(.*?)</div>', re.S)
PLACEHOLDER = re.compile(r'\{(val|act|prov):(\d{4}):([A-Za-z0-9_.]+)\}|\{commit\}')

VAT_RATES = ['tax.vat.standard_rate', 'tax.vat.higher_reduced_rate', 'tax.vat.reduced_rate', 'tax.vat.zero_rate']
VAT_ROUNDING = ['tax.vat.line_rounding', 'tax.vat.line_rounding_decimals']
AVERAGE = [
    'payroll.average_earnings.method', 'payroll.average_earnings.reference_months',
    'payroll.rounding', 'payroll.rounding_decimals',
]
LEAVE = AVERAGE + ['payroll.leave.days_basis', 'payroll.leave.compensation.method', 'labour.leave.annual_minimum_days']
SICK = AVERAGE + [
    'payroll.sick.employer_days_per_case', 'payroll.sick.employer_days_per_year', 'payroll.sick.employer_share',
    'payroll.sick.income_tax', 'payroll.sick.medical_premium', 'payroll.sick.social_contribution',
]
WORKING_TIME = ['labour.working_time.daily_hours', 'labour.working_time.pre_holiday_reduction_hours']
ITPARK = ['itpark.single_tax.rate', 'itpark.single_tax.min_per_employee_monthly', 'payroll.average_wage.forecast_monthly']


class Refused(Exception):
    pass


def iso(day):
    return day.isoformat()


# --- The rules, by period ------------------------------------------------------------------

def change_days(sets, start, end):
    days = {start}
    for s in sets:
        for d in (s['from'], s['to'] + datetime.timedelta(days=1) if s['to'] else None):
            if d and start < d <= end:
                days.add(d)
    return sorted(days)


def value_on(sets, key, on):
    """(set, value) covering a day, or None when no set has the key then."""
    try:
        return salary.lookup(sets, key, on)
    except salary.Refused:
        return None


def periods(sets, keys, required, start=FIRST, end=LAST):
    """[(from, to, {key: (set, value)})], a new period wherever any key's value changes."""
    days = change_days(sets, start, end)
    out = []
    for i, first in enumerate(days):
        last = days[i + 1] - datetime.timedelta(days=1) if i + 1 < len(days) else end
        found = {}
        for key in keys:
            hit = value_on(sets, key, first)
            if hit is None and key in required:
                raise Refused('konta-rulebook has no %s for %s' % (key, iso(first)))
            if hit is not None:
                found[key] = hit
        same = out and {k: json.dumps(v[1], sort_keys=True) for k, v in out[-1][2].items()} == {k: json.dumps(v[1], sort_keys=True) for k, v in found.items()}
        if same:
            out[-1] = (out[-1][0], last, out[-1][2])
        else:
            out.append((first, last, found))
    return out


def number(key, value):
    if 'number' not in value:
        raise Refused('%s is not a number in the rulebook' % key)
    return value['number']


def text(key, value):
    if 'text' not in value:
        raise Refused('%s is not a text in the rulebook' % key)
    return value['text']


def expect(key, value, wanted):
    if text(key, value) != wanted:
        raise Refused('the page says %s is "%s"; the rulebook says "%s"' % (key, wanted, text(key, value)))


def unverified(found):
    """The pages say "în verificare": refuse a value that has come to be anything else."""
    for key, (s, value) in found.items():
        if s['status'] == 'approved' or value.get('confidence') not in (None, 'unverified'):
            raise Refused('%s is no longer "unverified" in %s: change the page\'s "în verificare" first' % (key, s['id']))


def vat_rules(sets):
    out = []
    rounding = set()
    for first, last, found in periods(sets, VAT_RATES + VAT_ROUNDING, ['tax.vat.standard_rate'] + VAT_ROUNDING):
        unverified(found)
        rates = []
        for key in VAT_RATES:
            if key in found:
                value = found[key][1]
                rates.append({'key': key, 'rate': number(key, value), 'percent': salary.percent(number(key, value)), 'provisional': bool(value.get('provisional'))})
        rounding.add((text(VAT_ROUNDING[0], found[VAT_ROUNDING[0]][1]), int(number(VAT_ROUNDING[1], found[VAT_ROUNDING[1]][1]))))
        out.append({'from': iso(first), 'to': iso(last), 'rates': rates})
    if len(rounding) != 1:
        raise Refused('the VAT rounding changes between %s and %s; the page says one' % (iso(FIRST), iso(LAST)))
    mode, decimals = rounding.pop()
    if mode != 'half_away_from_zero' or decimals != 2:
        raise Refused('the page says VAT is rounded to the ban, half up; the rulebook says %s to %d decimals' % (mode, decimals))
    return {'from': iso(FIRST), 'to': iso(LAST), 'periods': out, 'rounding': mode, 'decimals': decimals}


def average_period(key_values):
    expect('payroll.average_earnings.method', key_values['payroll.average_earnings.method'][1], 'three_months')
    rounding = text('payroll.rounding', key_values['payroll.rounding'][1])
    decimals = int(number('payroll.rounding_decimals', key_values['payroll.rounding_decimals'][1]))
    if rounding != 'half_away_from_zero' or decimals != 2:
        raise Refused('the pages say "to the ban, half a ban up"; the rulebook says %s to %d decimals' % (rounding, decimals))
    return {
        'referenceMonths': int(number('payroll.average_earnings.reference_months', key_values['payroll.average_earnings.reference_months'][1])),
        'rounding': rounding,
        'decimals': decimals,
    }


def leave_rules(sets, cal):
    out = []
    for first, last, found in periods(sets, LEAVE, LEAVE):
        unverified(found)
        expect('payroll.leave.days_basis', found['payroll.leave.days_basis'][1], 'calendar_days_excluding_holidays')
        expect('payroll.leave.compensation.method', found['payroll.leave.compensation.method'][1], 'average_per_calendar_day')
        out.append(dict(average_period(found), **{'from': iso(first), 'to': iso(last)}))
    return {'from': iso(FIRST), 'to': iso(LAST), 'periods': out, 'calendar': cal['js']}


def sick_rules(sets, cal):
    out = []
    for first, last, found in periods(sets, SICK, SICK):
        unverified(found)
        # The page says the employer's days are taxed, carry the premium and no social contribution.
        expect('payroll.sick.income_tax', found['payroll.sick.income_tax'][1], 'yes')
        expect('payroll.sick.medical_premium', found['payroll.sick.medical_premium'][1], 'yes')
        expect('payroll.sick.social_contribution', found['payroll.sick.social_contribution'][1], 'no')
        out.append(dict(
            average_period(found),
            **{
                'from': iso(first), 'to': iso(last),
                'perCase': int(number('payroll.sick.employer_days_per_case', found['payroll.sick.employer_days_per_case'][1])),
                'perYear': int(number('payroll.sick.employer_days_per_year', found['payroll.sick.employer_days_per_year'][1])),
                'share': number('payroll.sick.employer_share', found['payroll.sick.employer_share'][1]),
            }))
    return {'from': iso(FIRST), 'to': iso(LAST), 'periods': out, 'calendar': cal['js']}


def itpark_rules(sets):
    """One year: the page shows the tax for 2026, the only year the rulebook has the minimum for."""
    year = year_values(sets, ITPARK, 2026)
    rate = number(ITPARK[0], year[ITPARK[0]][1])
    minimum = number(ITPARK[1], year[ITPARK[1]][1])
    wage = number(ITPARK[2], year[ITPARK[2]][1])
    # Art. 370 alin. (2): the minimum is 30% of the forecast average wage. The page says so.
    if salary.cents(minimum) * 10 != salary.cents(wage) * 3:
        raise Refused('the page says the IT Park minimum is 30%% of the forecast average wage; the rulebook has %s and %s' % (minimum, wage))
    return {'year': 2026, 'rate': rate, 'minimum': minimum}


def year_values(sets, keys, year):
    """{key: (set, value)} for a whole year, refusing a key that changes or is missing inside it."""
    start, end = datetime.date(year, 1, 1), datetime.date(year, 12, 31)
    found = periods(sets, keys, keys, start, end)
    if len(found) != 1:
        raise Refused('%s changes inside %d' % (', '.join(sorted(set(k for p in found for k in p[2]))), year))
    unverified(found[0][2])
    return found[0][2]


# --- The calendar --------------------------------------------------------------------------

def working_calendar(rulebook):
    data = fiscal_calendar.expand(rulebook, iso(CALENDAR_FROM), iso(LAST))
    holidays, rest, names = [], [], {}
    for entry in data['days']:
        for off in entry.get('off', []):
            if off['kind'] == 'holiday':
                holidays.append(entry['date'])
                names.setdefault(entry['date'], []).append(off['name'])
            elif off['kind'] == 'transfer':
                rest.append(entry['date'])
    worked = [t['workDay'] for y in data['years'].values() for t in y.get('transfers', [])]
    weekend = data['files']['md-holidays.json']['weekend']['days']
    known = sorted(int(y) for y, v in data['years'].items() if v.get('transfersKnown'))
    js = {
        'from': iso(CALENDAR_FROM), 'to': iso(LAST), 'weekend': weekend,
        'holidays': sorted(set(holidays)), 'restDays': sorted(set(rest)), 'workedDays': sorted(set(worked)), 'known': known,
    }
    return {'js': js, 'names': names, 'known': known}


class Days:
    """The calendar as the product counts it (FiscalCalendar), for the working days' tables."""

    def __init__(self, js):
        self.holidays = set(js['holidays'])
        self.rest = set(js['restDays'])
        self.worked = set(js['workedDays'])
        self.weekend = js['weekend']

    def holiday(self, d):
        return iso(d) in self.holidays

    def working(self, d):
        if iso(d) in self.worked:
            return True
        if iso(d) in self.holidays or iso(d) in self.rest:
            return False
        return d.isoweekday() not in self.weekend

    def month(self, year, month, daily, reduction):
        first = datetime.date(year, month, 1)
        last = (first.replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - datetime.timedelta(days=1)
        row = {'month': month, 'days': last.day, 'off': 0, 'scheduled': 0, 'hours': 0, 'reduced': []}
        d = first
        while d <= last:
            if self.working(d):
                row['scheduled'] += 1
                short = self.holiday(d + datetime.timedelta(days=1))
                row['hours'] += daily - (reduction if short else 0)
                if short:
                    row['reduced'].append(iso(d))
            else:
                row['off'] += 1
            d += datetime.timedelta(days=1)
        return row


def hours(value):
    whole = int(value)
    if whole != value:
        raise Refused('%s hours is not a whole number of hours' % value)
    return whole


def days_tables(sets, cal):
    days = Days(cal['js'])
    years = {}
    for year in DAYS_YEARS:
        time = year_values(sets, WORKING_TIME, year)
        daily = hours(float(number(WORKING_TIME[0], time[WORKING_TIME[0]][1])))
        reduction = hours(float(number(WORKING_TIME[1], time[WORKING_TIME[1]][1])))
        years[year] = {
            'daily': daily, 'reduction': reduction, 'known': year in cal['known'],
            'months': [days.month(year, m, daily, reduction) for m in range(1, 13)],
            'holidays': sorted((d, n) for d, n in cal['names'].items() if d.startswith(str(year))),
        }
    return years


# --- Words and writing ---------------------------------------------------------------------

class Words:
    def __init__(self, page, where):
        block = WORDS.search(page)
        if not block:
            raise Refused('%s: no <div hidden data-tool-words>' % where)
        self.words = {k: html.unescape(v).strip() for k, v in re.findall(r'<span data-w="([^"]+)"[^>]*>(.*?)</span>', block.group(1), re.S)}
        self.where = where

    def __call__(self, key, **values):
        if key not in self.words:
            raise Refused('%s: no word %s in data-tool-words' % (self.where, key))
        out = self.words[key]
        for name, value in values.items():
            out = out.replace('{%s}' % name, str(value))
        return out


def esc(value):
    return html.escape(str(value), quote=True)


def written_number(value, lang):
    """A decimal string as the language writes it: 29,4 in Romanian and Russian, 29.4 in English."""
    return value if lang == 'en' else value.replace('.', ',')


def show_value(key, value, lang):
    unit = value.get('unit', '')
    if 'number' not in value:
        raise Refused('%s is not a number; the page cannot show it as one' % key)
    n = value['number']
    if unit == 'ratio':
        return salary.percent(n)
    if unit.startswith('MDL'):
        return salary.lei(salary.cents(n), lang, False)
    return written_number(n, lang)


def day_month(w, date):
    d = datetime.date(*map(int, date.split('-')))
    return w('daymonth', day=d.day, month=w('mg%d' % d.month))


def render_days(tables, lang, w):
    years = sorted(tables)
    out = ['<div class="tool__years" data-year-pick hidden role="group" aria-label="%s">' % esc(w('years'))]
    for y in years:
        out.append('<button type="button" class="tool__year-btn" data-year-btn="%d" aria-pressed="false">%d</button>' % (y, y))
    out.append('</div>')
    for y in years:
        t = tables[y]
        out.append('<section class="tool__year" data-tool-year="%d" aria-labelledby="year-%d">' % (y, y))
        out.append('<h2 id="year-%d">%s</h2>' % (y, esc(w('year', year=y))))
        if not t['known']:
            out.append('<p class="calc__capped">%s</p>' % esc(w('unknown', year=y)))
        out.append('<div class="tool__scroll"><table class="calc__results tool__table">')
        out.append('<caption>%s</caption>' % esc(w('caption', hours=t['daily'])))
        out.append('<thead><tr><th scope="col">%s</th><th scope="col">%s</th><th scope="col">%s</th><th scope="col">%s</th><th scope="col">%s</th></tr></thead><tbody>' % tuple(
            esc(w(k)) for k in ('h.month', 'h.days', 'h.off', 'h.working', 'h.hours')))
        total = {'days': 0, 'off': 0, 'scheduled': 0, 'hours': 0}
        for row in t['months']:
            for k in total:
                total[k] += row[k]
            out.append('<tr><th scope="row" class="tool__mname">%s</th><td>%d</td><td>%d</td><td>%d</td><td>%d</td></tr>' % (
                esc(w('m%d' % row['month'])), row['days'], row['off'], row['scheduled'], row['hours']))
        out.append('<tr class="calc__total"><th scope="row">%s</th><td>%d</td><td>%d</td><td>%d</td><td>%d</td></tr>' % (
            esc(w('total')), total['days'], total['off'], total['scheduled'], total['hours']))
        out.append('</tbody></table></div>')
        out.append('<h3>%s</h3><ul class="tool__holidays">' % esc(w('holidays')))
        for date, names in t['holidays']:
            d = datetime.date(*map(int, date.split('-')))
            label = ' · '.join(esc(n[lang]) for n in names)
            weekend = ' <span class="tool__weekend">%s</span>' % esc(w('onweekend', day=w('wdl%d' % d.isoweekday()))) if d.isoweekday() in (6, 7) else ''
            out.append('<li><span class="tool__hdate">%s</span> %s%s</li>' % (esc(day_month(w, date)), label, weekend))
        out.append('</ul>')
        reduced = [d for row in t['months'] for d in row['reduced']]
        if reduced:
            out.append('<p class="tool__reduced">%s</p>' % esc(w('reduced', hours=t['reduction'], days=', '.join(day_month(w, d) for d in reduced))))
        out.append('</section>')
    return '\n'.join(out)


def citation(s, value):
    """The act a value cites, with its article when that is a reference: some sources' article
    field is a whole reading note (Law 247/2026's runs to a page), which the table leaves to the
    rulebook, one click away."""
    sources = s['sources']
    index = value.get('sourceIndex')
    if index is None or not 0 <= index < len(sources):
        raise Refused('a value in %s cites no source' % s['id'])
    source = sources[index]
    article = source.get('article') or ''
    text = source['act'] + (', ' + article if article and len(article) <= 240 else '')
    return '<span lang="ro">%s</span>' % html.escape(text, quote=False)


def fill(page, lang, sets, commit, w, where):
    def one(match):
        if match.group(0) == '{commit}':
            return commit
        kind, year, key = match.group(1), int(match.group(2)), match.group(3)
        s, value = year_values(sets, [key], year)[key]
        if kind == 'val':
            return show_value(key, value, lang)
        if kind == 'act':
            return citation(s, value)
        return '<span class="tool__prov">%s</span>' % esc(w('provisional')) if value.get('provisional') else ''

    page = PLACEHOLDER.sub(one, page)
    left = re.search(r'\{(?:val|act|prov):[^}]*\}|\{commit\}', page)
    if left:
        raise Refused('%s: %s left unfilled' % (where, left.group(0)))
    return page


# --- The tests -----------------------------------------------------------------------------

def run_tests(all_rules, tables):
    result = subprocess.run(
        ['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test-instrumente.mjs')],
        input=json.dumps({'rules': all_rules, 'days': {str(y): t for y, t in tables.items()}}), capture_output=True, text=True)
    if result.returncode != 0:
        raise Refused('the tools do not pass their tests, so they are not published:\n%s' % (result.stderr.strip() or result.stdout.strip()))
    return json.loads(result.stdout)


def gather(rulebook):
    sets = salary.rule_sets(rulebook)
    cal = working_calendar(rulebook)
    all_rules = {
        'vat': vat_rules(sets),
        'leave': leave_rules(sets, cal),
        'sick': sick_rules(sets, cal),
        'itpark': itpark_rules(sets),
    }
    tables = days_tables(sets, cal)
    return sets, all_rules, tables


def build(site):
    try:
        rulebook = salary.rulebook_dir()
        commit, dirty = salary.rulebook_state(rulebook)
        fiscal_calendar.rulebook_state(rulebook)
        sets, all_rules, tables = gather(rulebook)
    except (salary.Refused, fiscal_calendar.Refused) as refusal:
        raise Refused(str(refusal))
    passed = run_tests(all_rules, tables)

    pages = 0
    for tool, path in PAGES.items():
        for lang in languages.LANGS:
            where = languages.source_file(os.path.join(site, lang) if lang != languages.SOURCE else site, path)
            page = io.open(where, encoding='utf-8').read()
            w = Words(page, where)
            if tool in all_rules:
                if RULES_MARK not in page:
                    raise Refused('%s: no %s' % (where, RULES_MARK))
                page = page.replace(RULES_MARK, json.dumps(all_rules[tool], ensure_ascii=False))
            if tool == 'days':
                if DAYS_MARK not in page:
                    raise Refused('%s: no %s' % (where, DAYS_MARK))
                page = page.replace(DAYS_MARK, render_days(tables, lang, w))
            page = fill(page, lang, sets, commit, w, where)
            with io.open(where, 'w', encoding='utf-8', newline='\n') as f:
                f.write(page)
            pages += 1

    return {'commit': commit[:7], 'dirty': dirty, 'pages': pages, 'checks': passed['checks']}


def main():
    try:
        rulebook = salary.rulebook_dir()
        _, all_rules, tables = gather(rulebook)
    except (salary.Refused, fiscal_calendar.Refused) as refusal:
        raise Refused(str(refusal))
    passed = run_tests(all_rules, tables)
    print('assets/instrumente.js passes %d checks against the product\'s examples and the rulebook\'s calendar' % passed['checks'])


if __name__ == '__main__':
    if sys.argv[1:] != ['--check']:
        sys.exit(__doc__)
    try:
        main()
    except Refused as refusal:
        sys.exit('Refused: %s' % refusal)
