"""konta.md/calculator-salariu, filled in from konta-rulebook at package time.

No rate, exemption, cap or rounding rule is typed into this repository. The page is an ordinary
page, calculator-salariu/index.html, with its words under data-t like any other, so
tools/languages.py writes its Russian and English copies. Its words carry placeholders this fills
in each language, after the copies are written:

    {rate:cnam} {rate:tax} {rate:cnas}                 the rates, as 9%
    {amount:personal} {amount:personalMonth} {amount:dependant} {amount:dependantMonth}
    {amount:cap} {amount:capMonth}                     lei, written as the language writes them
    {act:<rulebook key>}                               the act and article the rulebook cites
    {out:<field>}                                      the worked example SFS publishes, from the vectors
    {count:cases} {count:months}                       how many vectors the arithmetic passed
    {commit}                                           the rulebook commit the page was built from

and the rules themselves go into <script type="application/json" id="salary-rules">, where
assets/salary.js reads them.

Before anything is written, tools/test-salary.mjs runs assets/salary.js over konta-rulebook's
vectors/payroll-md-2026.json, the same file Konta's payroll tests run Konta.Domain's arithmetic
over. If the site and the product disagree by a ban, nothing is packaged.

The rules are read for every day of 2026 that any rule set starts or ends on, the way the
product's rulebook resolves them (publication order, then effective date). A year whose payroll
figures change inside it is refused: the page computes one month that stands for every month.

Called from package.build() after languages.build(), never on its own. `python
tools/salary_calculator.py --check` runs the vectors alone.
"""

import datetime
import glob
import html
import io
import json
import os
import re
import subprocess
import sys

import languages

PAGE = '/calculator-salariu/'
YEAR = 2026
VECTORS = os.path.join('vectors', 'payroll-md-2026.json')
RULES_MARK = '<!-- salary:rules -->'
PLACEHOLDER = re.compile(r'\{(rate|amount|act|out|count|commit)(?::([A-Za-z0-9_.]+))?\}')

# What the product reads (PayrollService.Rules), and what the page calls each one.
KEYS = {
    'incomeTaxRate': 'payroll.income_tax.rate',
    'medicalRate': 'payroll.cnam.employee_rate',
    'socialRate': 'payroll.cnas.employer_rate',
    'personalAnnual': 'payroll.income_tax.personal_deduction_annual',
    'personalIncomeCap': 'payroll.income_tax.personal_deduction_income_cap',
    'dependantAnnual': 'payroll.income_tax.dependant_deduction_annual',
    'premiumDeductible': 'payroll.income_tax.medical_premium_deductible',
    'method': 'payroll.income_tax.withholding_method',
    'rounding': 'payroll.rounding',
    'decimals': 'payroll.rounding_decimals',
}


class Refused(Exception):
    pass


def rulebook_dir():
    path = os.path.abspath(os.environ.get('KONTA_RULEBOOK') or os.path.join('..', 'konta-rulebook'))
    if not os.path.exists(os.path.join(path, VECTORS)):
        raise Refused('no konta-rulebook with %s at %s (set KONTA_RULEBOOK)' % (VECTORS, path))
    return path


def git(rulebook, *args):
    return subprocess.run(['git', '-C', rulebook] + list(args), capture_output=True, text=True, check=True).stdout.strip()


def rulebook_state(rulebook):
    commit = git(rulebook, 'rev-parse', 'HEAD')
    dirty = git(rulebook, 'status', '--porcelain', '--', 'data', 'vectors')
    if dirty and os.environ.get('KONTA_RULEBOOK_DIRTY') != '1':
        raise Refused('konta-rulebook has uncommitted rules or vectors; commit them, or set KONTA_RULEBOOK_DIRTY=1 for a local look:\n%s' % dirty)
    return commit, bool(dirty)


# --- The rules, resolved as the product's InMemoryRulebook resolves them ------------------------

def day(text):
    return datetime.date(*map(int, text.split('-')))


def rule_sets(rulebook):
    sets = []
    for path in sorted(glob.glob(os.path.join(rulebook, 'data', '*', '*.json'))):
        data = json.load(io.open(path, encoding='utf-8'))
        sets.append({
            'id': data['id'],
            'status': data.get('status'),
            'from': day(data['effectiveFrom']),
            'to': day(data['effectiveTo']) if data.get('effectiveTo') else None,
            'published': data.get('publishedOn') or '',
            'values': data['values'],
            'sources': data.get('sources', []),
        })
    # Publication descending, then effective date descending: the first set covering a day that
    # has a key decides it.
    sets.sort(key=lambda s: (s['published'], s['from']), reverse=True)
    return sets


def lookup(sets, key, on):
    for s in sets:
        if s['from'] <= on and (s['to'] is None or on <= s['to']) and key in s['values']:
            return s, s['values'][key]
    raise Refused('konta-rulebook has no %s for %s' % (key, on.isoformat()))


def year_rules(rulebook):
    """The payroll figures for the year, refusing a year in which any of them changes."""
    sets = rule_sets(rulebook)
    start, end = datetime.date(YEAR, 1, 1), datetime.date(YEAR, 12, 31)
    days = {start, end}
    for s in sets:
        for d in (s['from'], s['to'] + datetime.timedelta(days=1) if s['to'] else None):
            if d and start <= d <= end:
                days.add(d)

    resolved = {}
    for name, key in KEYS.items():
        seen = {}
        for on in sorted(days):
            s, value = lookup(sets, key, on)
            seen[json.dumps(value, sort_keys=True)] = (s, value)
        if len(seen) != 1:
            raise Refused('%s changes inside %d; the calculator computes one month for the whole year' % (key, YEAR))
        resolved[name] = next(iter(seen.values()))
    return resolved


def raw_rules(resolved):
    def number(name):
        value = resolved[name][1]
        if 'number' not in value:
            raise Refused('%s is not a number in the rulebook' % KEYS[name])
        return value['number']

    def text(name):
        value = resolved[name][1]
        if 'text' not in value:
            raise Refused('%s is not a text in the rulebook' % KEYS[name])
        return value['text']

    deductible = text('premiumDeductible')
    if deductible not in ('yes', 'no'):
        raise Refused('%s is "%s"' % (KEYS['premiumDeductible'], deductible))
    return {
        'year': YEAR,
        'incomeTaxRate': number('incomeTaxRate'),
        'medicalRate': number('medicalRate'),
        'socialRate': number('socialRate'),
        'personalAnnual': number('personalAnnual'),
        'personalIncomeCap': number('personalIncomeCap'),
        'dependantAnnual': number('dependantAnnual'),
        'premiumDeductible': deductible == 'yes',
        'method': text('method'),
        'rounding': text('rounding'),
        'decimals': int(number('decimals')),
    }


def check_page_words(resolved, raw):
    """The page says these in words; refuse a rulebook that has come to say otherwise."""
    if raw['method'] != 'cumulative':
        raise Refused('the page says the tax is cumulative; the rulebook says %s' % raw['method'])
    if raw['rounding'] != 'half_away_from_zero' or raw['decimals'] != 2:
        raise Refused('the page says "to the ban, half a ban up"; the rulebook says %s to %d decimals' % (raw['rounding'], raw['decimals']))
    if not raw['premiumDeductible']:
        raise Refused('the page says the premium is deducted before tax; the rulebook says no')
    for name, (s, value) in resolved.items():
        if s['status'] == 'approved' or value.get('confidence') not in (None, 'unverified'):
            raise Refused('%s is no longer "unverified" in %s: change the page\'s "în verificare" first' % (KEYS[name], s['id']))


# --- The vectors ---------------------------------------------------------------------------------

def run_vectors(rulebook, raw):
    result = subprocess.run(
        ['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'test-salary.mjs'), os.path.join(rulebook, VECTORS)],
        input=json.dumps(raw), capture_output=True, text=True)
    if result.returncode != 0:
        raise Refused('the salary calculator does not agree with the payroll vectors, so it is not published:\n%s' % (result.stderr.strip() or result.stdout.strip()))
    return json.loads(result.stdout)


def worked_example(rulebook):
    vectors = json.load(io.open(os.path.join(rulebook, VECTORS), encoding='utf-8'))
    case = next((c for c in vectors['cases'] if c['id'] == 'sfs-worked-example'), None)
    if not case or len(case['months']) != 1 or case['months'][0]['personalMonths'] != 1 or case['months'][0]['dependantMonths'] != 0:
        raise Refused('%s has no one-month sfs-worked-example with the personal exemption, which the page shows' % VECTORS)
    month = case['months'][0]
    example = {field: cents(amount) for field, amount in month['expect'].items()}
    example['gross'] = cents(month['gross'])
    example['cost'] = example['gross'] + example['social']
    return example


# --- Writing it ----------------------------------------------------------------------------------

def cents(text):
    match = re.match(r'^(-?)(\d+)(?:\.(\d{1,2}))?$', text)
    if not match:
        raise Refused('not an amount in lei: %s' % text)
    value = int(match.group(2)) * 100 + int((match.group(3) or '').ljust(2, '0'))
    return -value if match.group(1) else value


def lei(amount, lang, decimals):
    """Bani as the language writes lei: 8 305,00 or 29 700 in Romanian and Russian, 8,305.00 in English."""
    sign = '-' if amount < 0 else ''
    whole, part = divmod(abs(amount), 100)
    group = ',' if lang == 'en' else ' '
    text = '{:,}'.format(whole).replace(',', group)
    if decimals or part:
        text += ('.' if lang == 'en' else ',') + '%02d' % part
    return sign + text


def percent(ratio):
    match = re.match(r'^(\d+)(?:\.(\d+))?$', ratio)
    if not match:
        raise Refused('not a ratio: %s' % ratio)
    digits = match.group(1) + (match.group(2) or '')
    scale = len(match.group(2) or '')
    value = int(digits) * 100
    whole, rest = divmod(value, 10 ** scale)
    if rest:
        raise Refused('%s is not a whole percentage; the page writes whole ones' % ratio)
    return '%d%%' % whole


def citation(s, value):
    sources = s['sources']
    index = value.get('sourceIndex')
    if index is None or not 0 <= index < len(sources):
        raise Refused('a value in %s cites no source' % s['id'])
    source = sources[index]
    text = source['act'] + (', ' + source['article'] if source.get('article') else '')
    return '<span lang="ro">%s</span>' % html.escape(text, quote=False)


def fill(text, lang, values, where):
    def one(match):
        kind, name = match.group(1), match.group(2)
        key = kind if name is None else kind + ':' + name
        if key not in values:
            raise Refused('%s: no value for {%s}' % (where, key))
        value = values[key]
        return value(lang) if callable(value) else value

    text = PLACEHOLDER.sub(one, text)
    left = re.search(r'\{(?:rate|amount|act|out|count|commit)[^}]*\}', text)
    if left:
        raise Refused('%s: %s left unfilled' % (where, left.group(0)))
    return text


def build(site):
    rulebook = rulebook_dir()
    commit, dirty = rulebook_state(rulebook)
    resolved = year_rules(rulebook)
    raw = raw_rules(resolved)
    check_page_words(resolved, raw)
    passed = run_vectors(rulebook, raw)
    example = worked_example(rulebook)

    personal, cap = cents(raw['personalAnnual']), cents(raw['personalIncomeCap'])
    dependant = cents(raw['dependantAnnual'])
    for name, amount in (('personal', personal), ('dependant', dependant), ('cap', cap)):
        if amount % 12:
            raise Refused('%s a year is not a whole number of bani a month' % name)

    values = {
        'rate:cnam': percent(raw['medicalRate']),
        'rate:tax': percent(raw['incomeTaxRate']),
        'rate:cnas': percent(raw['socialRate']),
        'amount:personal': lambda lang: lei(personal, lang, False),
        'amount:personalMonth': lambda lang: lei(personal // 12, lang, False),
        'amount:dependant': lambda lang: lei(dependant, lang, False),
        'amount:dependantMonth': lambda lang: lei(dependant // 12, lang, False),
        'amount:cap': lambda lang: lei(cap, lang, False),
        'amount:capMonth': lambda lang: lei(cap // 12, lang, False),
        'count:cases': str(passed['cases']),
        'count:months': str(passed['months']),
        'commit': commit,
    }
    for name, key in KEYS.items():
        s, value = resolved[name]
        values['act:' + key] = citation(s, value)
    for field, amount in example.items():
        values['out:' + field] = (lambda a: lambda lang: lei(a, lang, True))(amount)

    data = '\n      ' + json.dumps(raw, ensure_ascii=False) + '\n    '
    pages = 0
    for lang in languages.LANGS:
        path = languages.source_file(os.path.join(site, lang) if lang != languages.SOURCE else site, PAGE)
        text = io.open(path, encoding='utf-8').read()
        if RULES_MARK not in text:
            raise Refused('%s: no %s' % (path, RULES_MARK))
        text = text.replace('\n      ' + RULES_MARK + '\n    ', data)
        if RULES_MARK in text:
            raise Refused('%s: %s is not on a line of its own' % (path, RULES_MARK))
        text = fill(text, lang, values, path)
        with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        pages += 1

    return {'commit': commit[:7], 'dirty': dirty, 'cases': passed['cases'], 'months': passed['months'], 'pages': pages}


def main():
    rulebook = rulebook_dir()
    resolved = year_rules(rulebook)
    raw = raw_rules(resolved)
    check_page_words(resolved, raw)
    passed = run_vectors(rulebook, raw)
    print('assets/salary.js agrees with %s: %d cases, %d months, to the ban' % (VECTORS, passed['cases'], passed['months']))


if __name__ == '__main__':
    if sys.argv[1:] != ['--check']:
        sys.exit(__doc__)
    try:
        main()
    except Refused as refusal:
        sys.exit('Refused: %s' % refusal)
