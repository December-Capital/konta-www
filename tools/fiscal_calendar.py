"""konta.md/calendar, its .ics feeds and the RSS of changes in the law, written at package time.

Nothing on the calendar is typed into this repository. The dates come from konta-rulebook
(../konta-rulebook, or KONTA_RULEBOOK): its calendar/ folder holds the deadlines with their acts
and articles, the non-working days and the changes in the law, and its tools/calendar.mjs expands
them into dated items, moving a deadline off a non-working day by the rule its act gives. This
reads that output and writes, into the packaged folder:

    calendar/index.html, ru/calendar/index.html, en/calendar/index.html   the page
    calendar.ics, ru/calendar.ics, en/calendar.ics                         everything, to subscribe to
    calendar/<profile>.ics (and under ru/, en/)                            one feed per kind of taxpayer
    calendar/schimbari.xml (and under ru/, en/)                            RSS of changes in the law

The page itself is calendar/index.html in this repository, an ordinary page with its header,
footer and words under data-t, so tools/languages.py writes its Russian and English copies like
every other page. It holds two markers this fills in each language: <!-- calendar:months --> and
<!-- calendar:changes -->, plus a hidden block of words (data-cal-words) the generated part is
written in, read from each language's copy and removed.

Called from package.build() after languages.build(), never on its own.

The rulebook's commit is printed on the page, so anybody can check the data it was built from.
A rulebook with uncommitted calendar data refuses to package, unless KONTA_CALENDAR_DIRTY=1 is
set for a local look, and then the page says so.
"""

import datetime
import hashlib
import html
import io
import json
import os
import re
import subprocess

import languages

ORIGIN = languages.ORIGIN
LANGS = languages.LANGS
SOURCE = languages.SOURCE
PAGE = '/calendar/'

MONTHS_MARK = '<!-- calendar:months -->'
CHANGES_MARK = '<!-- calendar:changes -->'
WORDS = re.compile(r'\s*<div hidden data-cal-words>(.*?)</div>\n?', re.S)

# Chișinău's own date, so a build at 23:30 UTC on the last of the month starts the right month.
try:
    from zoneinfo import ZoneInfo
    CHISINAU = ZoneInfo('Europe/Chisinau')
except Exception:  # pragma: no cover - a Windows Python without tzdata
    CHISINAU = datetime.timezone(datetime.timedelta(hours=3))


class Refused(Exception):
    pass


def esc(text):
    return html.escape(text, quote=True)


# --- The rulebook ------------------------------------------------------------------------------

def rulebook_dir():
    path = os.environ.get('KONTA_RULEBOOK') or os.path.join('..', 'konta-rulebook')
    path = os.path.abspath(path)
    if not os.path.exists(os.path.join(path, 'tools', 'calendar.mjs')):
        raise Refused('no konta-rulebook with tools/calendar.mjs at %s (set KONTA_RULEBOOK)' % path)
    return path


def git(rulebook, *args):
    return subprocess.run(['git', '-C', rulebook] + list(args), capture_output=True, text=True, check=True).stdout.strip()


def rulebook_state(rulebook):
    commit = git(rulebook, 'rev-parse', 'HEAD')
    dirty = git(rulebook, 'status', '--porcelain', '--', 'calendar', 'data', 'tools/calendar.mjs')
    if dirty and os.environ.get('KONTA_CALENDAR_DIRTY') != '1':
        raise Refused('konta-rulebook has uncommitted calendar data; commit it, or set KONTA_CALENDAR_DIRTY=1 for a local look:\n%s' % dirty)
    return commit, bool(dirty)


def expand(rulebook, start, end):
    result = subprocess.run(
        ['node', os.path.join(rulebook, 'tools', 'calendar.mjs'), '--from', start, '--to', end],
        capture_output=True, text=True)
    if result.returncode != 0:
        raise Refused('konta-rulebook/tools/calendar.mjs failed:\n%s' % result.stderr.strip())
    return json.loads(result.stdout)


def validate(rulebook):
    """The rulebook's own gate: nothing that fails it reaches the page."""
    result = subprocess.run(['node', os.path.join(rulebook, 'tools', 'validate.mjs')], capture_output=True, text=True)
    if result.returncode != 0:
        raise Refused('konta-rulebook does not validate:\n%s' % (result.stderr.strip() or result.stdout.strip()))


# --- Words -------------------------------------------------------------------------------------

class Words:
    """The generated part's words in one language, read from that language's copy of the page."""

    def __init__(self, page_text, where):
        block = WORDS.search(page_text)
        if not block:
            raise Refused('%s: no <div hidden data-cal-words>' % where)
        self.words = {}
        for key, text in re.findall(r'<span data-t="([^"]+)">(.*?)</span>', block.group(1), re.S):
            self.words[key] = html.unescape(text).strip()
        self.where = where

    def __call__(self, key, **values):
        if key not in self.words:
            raise Refused('%s: no word %s in data-cal-words' % (self.where, key))
        text = self.words[key]
        for name, value in values.items():
            text = text.replace('{%s}' % name, str(value))
        return text


def pick(words, lang):
    return words[lang]


# --- Dates -------------------------------------------------------------------------------------

def parse(date):
    return datetime.date(*map(int, date.split('-')))


def day_month(w, date):
    d = parse(date)
    return w('cal.daymonth', day=d.day, month=w('cal.mg%d' % d.month))


def full_date(w, date):
    d = parse(date)
    return w('cal.fulldate', day=d.day, month=w('cal.mg%d' % d.month), year=d.year)


def period_text(w, item):
    p = item['period']
    if p['kind'] == 'month':
        text = w('cal.period.month', month=w('cal.m%d' % p['month']), year=p['year'])
    elif p['kind'] == 'quarter':
        text = w('cal.period.quarter', quarter=w('cal.q%d' % p['quarter']), year=p['year'])
    elif p['kind'] == 'half':
        text = w('cal.period.half', half=w('cal.h%d' % p['half']), year=p['year'])
    else:
        text = w('cal.period.year', year=p['year'])
    if item.get('installment'):
        text += ' · ' + w('cal.installment', n=item['installment'], of=item['of'])
    return text


def money(value, unit, lang):
    """A value as the rulebook stores it, printed for a reader: 1 700 000 MDL, 12%."""
    if unit == 'ratio':
        pct = (float(value) * 100)
        shown = ('%g' % pct).replace('.', ',' if lang != 'en' else '.')
        return shown + '%'
    number = int(float(value)) if float(value).is_integer() else float(value)
    grouped = '{:,}'.format(number)
    grouped = grouped.replace(',', '\u00a0' if lang != 'en' else ',')
    suffix = {'MDL': 'MDL', 'MDL/month': 'MDL', 'MDL/year': 'MDL'}[unit]
    return grouped + '\u00a0' + suffix


# --- The model ---------------------------------------------------------------------------------

class Calendar:
    def __init__(self, data):
        self.data = data
        files = data['files']
        self.holidays = next(f for f in files.values() if f['kind'] == 'holidays')
        self.deadline_files = {name: f for name, f in files.items() if f['kind'] == 'deadlines'}
        self.changes_files = [f for f in files.values() if f['kind'] == 'changes']
        self.rules = {}
        self.order = {}
        self.profiles = []
        for name, f in sorted(self.deadline_files.items()):
            for rule in f['deadlines']:
                self.rules[rule['id']] = (f, rule)
                self.order[rule['id']] = len(self.order)
            for p in f['profiles']:
                if p['id'] not in [q['id'] for q in self.profiles]:
                    self.profiles.append(p)
        self.shift = next(iter(self.deadline_files.values()))['shift'] if self.deadline_files else None

    def published(self, item):
        """Dated on the site only when read in the act or the authority's own text."""
        f, rule = self.rules[item['id']]
        return rule['confidence'] != 'secondary'

    def source(self, f, index):
        return f['sources'][index]

    def changes(self):
        out = []
        for f in self.changes_files:
            for c in f['changes']:
                out.append((f, c))
        return sorted(out, key=lambda fc: (fc[1]['effectiveFrom'], fc[1]['id']))

    def secondary_rules(self):
        return [(f, r) for f, r in self.rules.values() if r['confidence'] == 'secondary']


def cite_link(source, lang, w):
    label = source['cite'][lang]
    if source.get('url'):
        return '<a href="%s" rel="noopener">%s</a>' % (esc(source['url']), esc(label))
    return esc(label)


# --- The page ----------------------------------------------------------------------------------

def months_between(first, last):
    y, m = first.year, first.month
    while (y, m) <= (last.year, last.month):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def render_months(cal, lang, w, today, first, last):
    by_day = {}
    for item in cal.data['deadlines']:
        if cal.published(item):
            by_day.setdefault(item['date'], []).append(('deadline', item))
    for day in cal.data['days']:
        if 'off' in day:
            by_day.setdefault(day['date'], []).append(('off', day))
        if 'worked' in day:
            by_day.setdefault(day['date'], []).append(('worked', day))
        if 'local' in day:
            by_day.setdefault(day['date'], []).append(('local', day))
    for f, c in cal.changes():
        if c['state'] == 'law':
            by_day.setdefault(c['effectiveFrom'], []).append(('law', (f, c)))

    # In order; calendar.js shows one month at a time from the reader's own, with three behind it.
    return '\n'.join(render_month(cal, lang, w, today, y, m, by_day) for y, m in months_between(first, last))


def weekday_name(w, date, short=True):
    return w(('cal.wd%d' if short else 'cal.wdl%d') % (parse(date).isoweekday()))


def render_month(cal, lang, w, today, y, m, by_day):
    ident = '%04d-%02d' % (y, m)
    title = w('cal.monthyear', month=w('cal.m%d' % m), year=y)
    first = datetime.date(y, m, 1)
    days = (datetime.date(y + (m == 12), m % 12 + 1, 1) - first).days

    # The month as a grid: a deadline is a link to its day in the list.
    cells = ['<td></td>'] * (first.isoweekday() - 1)
    rows = []
    for d in range(1, days + 1):
        date = '%s-%02d' % (ident, d)
        entries = by_day.get(date, [])
        off = any(k == 'off' for k, _ in entries) or (
            parse(date).isoweekday() in cal.holidays['weekend']['days'] and not any(k == 'worked' for k, _ in entries))
        deadlines = [e for k, e in entries if k == 'deadline']
        classes = ['cal-day']
        if off:
            classes.append('cal-day--off')
        if any(k == 'worked' for k, _ in entries):
            classes.append('cal-day--worked')
        if any(k == 'local' for k, _ in entries):
            classes.append('cal-day--local')
        if date == today.isoformat():
            classes.append('cal-day--today')
        profiles = sorted({p for e in deadlines for p in cal.rules[e['id']][1]['appliesTo']})
        label = '<span class="cal-day__n">%d</span>' % d
        if entries:
            label = '<a class="cal-day__n" href="#d-%s">%d</a>' % (date, d)
        mark = ''
        if deadlines:
            mark = '<span class="cal-dot" data-profiles="%s" aria-hidden="true"></span>' % ' '.join(profiles)
        # What the day holds, at a glance: the list under the grid says it in full, so the labels
        # are for the eye only.
        labels = ''.join(grid_label(cal, lang, w, k, e) for k, e in ordered(cal, entries))
        if labels:
            labels = '<ul class="cal-labels" aria-hidden="true">%s</ul>' % labels
        cells.append('<td class="%s" data-date="%s">%s%s%s</td>' % (' '.join(classes), date, label, labels, mark))
        if len(cells) == 7:
            rows.append('<tr>%s</tr>' % ''.join(cells))
            cells = []
    if cells:
        cells += ['<td></td>'] * (7 - len(cells))
        rows.append('<tr>%s</tr>' % ''.join(cells))
    head = ''.join('<th scope="col"><abbr title="%s"><span class="cal-wd-short">%s</span><span class="cal-wd-long" aria-hidden="true">%s</span></abbr></th>' % (
        esc(w('cal.wdl%d' % i)), esc(w('cal.wd%d' % i)), esc(w('cal.wdl%d' % i))) for i in range(1, 8))
    grid = (
        '<table class="cal-grid">\n<caption>%s</caption>\n<thead><tr>%s</tr></thead>\n<tbody>\n%s\n</tbody>\n</table>' %
        (esc(title), head, '\n'.join(rows)))

    items = []
    for d in range(1, days + 1):
        date = '%s-%02d' % (ident, d)
        entries = by_day.get(date, [])
        if not entries:
            continue
        entries = ordered(cal, entries)
        # A deadline moved here from a day off says so once, under the date, when every moved
        # deadline of the day came from the same day.
        moved = {e['nominal'] for k, e in entries if k == 'deadline' and e.get('moved')}
        once = None
        if len(moved) == 1:
            nominal = moved.pop()
            first = next(e for k, e in entries if k == 'deadline' and e.get('moved'))
            once = render_moved(cal, lang, w, first)
        rendered = [render_item(cal, lang, w, kind, e, moved_said=once is not None) for kind, e in entries]
        items.append(
            '<li class="cal-date" id="d-%s">\n<h3><time datetime="%s">%s</time> <span class="cal-wd">%s</span></h3>\n%s<ul class="cal-items">\n%s\n</ul>\n</li>' %
            (date, date, esc(day_month(w, date)), esc(weekday_name(w, date, short=False)),
             ('<p class="cal-moved cal-moved--day">%s</p>\n' % once) if once else '', '\n'.join(rendered)))

    # Said once a year, at its first month on the page, rather than under every month.
    notes = []
    if m == 1 or (y, m) == (today.year, today.month):
        known = cal.holidays['years'].get(str(y))
        if known and known.get('note'):
            notes.append('<p class="cal-note">%s</p>' % esc(known['note'][lang]))
        elif not known:
            notes.append('<p class="cal-note">%s</p>' % esc(w('cal.transfers.unknown', year=y)))
        if y > today.year:
            notes.append('<p class="cal-note">%s</p>' % esc(w('cal.nextyear', year=y)))

    body = ('<ol class="cal-dates">\n%s\n</ol>' % '\n'.join(items)) if items else '<p class="cal-empty">%s</p>' % esc(w('cal.empty'))
    return (
        '<section class="cal-month" id="m-%s" data-month="%s" aria-labelledby="t-%s">\n'
        '<div class="cal-month__head"><h2 id="t-%s">%s</h2></div>\n'
        '<div class="cal-month__grid">%s%s</div>\n'
        '<div class="cal-month__list">%s</div>\n'
        '</section>' % (ident, ident, ident, ident, esc(title), grid, ''.join(notes), body))


def item_id(kind, e, sub=None):
    """The id of an entry in the month's list, which the grid's labels and the day panel use."""
    if kind == 'deadline':
        p = e['period']
        tail = '%d-%s' % (p['year'], p.get('month') or p.get('quarter') or p.get('half') or 0)
        return 'i-%s-%s-%s%s' % (e['date'], e['id'], tail, '-%d' % e['installment'] if e.get('installment') else '')
    if kind == 'law':
        return 'i-%s-law-%s' % (e[1]['effectiveFrom'], e[1]['id'])
    return 'i-%s-%s%s' % (e['date'], kind, '-' + sub if sub else '')


def ordered(cal, entries):
    """Days off and laws first, then deadlines in the order the rulebook lists them, which is
    roughly how many companies each one concerns."""
    rank = {'off': 0, 'worked': 0, 'local': 0, 'law': 1, 'deadline': 2}
    return sorted(entries, key=lambda ke: (rank[ke[0]], cal.order.get(ke[1].get('id'), 0) if ke[0] == 'deadline' else 0))


def grid_label(cal, lang, w, kind, e):
    if kind == 'deadline':
        _f, rule = cal.rules[e['id']]
        return '<li class="cal-label cal-label--deadline" data-target="%s" data-profiles="%s" title="%s">%s</li>' % (
            item_id(kind, e), ' '.join(rule['appliesTo']), esc('%s · %s' % (rule['name'][lang], period_text(w, e))),
            esc(rule.get('form') or rule['name'][lang]))
    if kind == 'off':
        return ''.join('<li class="cal-label cal-label--off" data-target="%s" title="%s">%s</li>' % (
            item_id('off', e, x['id']), esc(x['name'][lang]), esc(x['name'][lang])) for x in e['off'] if x.get('name'))
    if kind == 'worked':
        return '<li class="cal-label cal-label--worked" data-target="%s">%s</li>' % (item_id(kind, e), esc(w('cal.workday')))
    if kind == 'local':
        return ''.join('<li class="cal-label cal-label--local" data-target="%s" title="%s">%s</li>' % (
            item_id('local', e, str(i)), esc(w('cal.local', places=x['places'][lang])), esc(x['name'][lang]))
            for i, x in enumerate(e['local']))
    if kind == 'law':
        _f, c = e
        return '<li class="cal-label cal-label--law" data-target="%s" title="%s">%s</li>' % (
            item_id(kind, e), esc('%s: %s' % (w('cal.inforce'), c['title'][lang])), esc(c['title'][lang]))
    return ''


def render_moved(cal, lang, w, e):
    """'25 October is a Sunday, so the deadline moves to the next working day. Legal basis: ...'"""
    f, _rule = cal.rules[e['id']]
    reason = e['moved'][0]
    if reason['kind'] == 'weekend':
        why = weekday_name(w, e['nominal'], short=False)
    else:
        why = reason['name'][lang] if reason.get('name') else w('cal.holiday')
    shift_src = f['sources'][f['shift']['sourceIndex']]
    return esc(w('cal.moved', date=day_month(w, e['nominal']), why=why)) + ' ' + cite_link(shift_src, lang, w)


def render_item(cal, lang, w, kind, e, moved_said=False):
    if kind == 'deadline':
        f, rule = cal.rules[e['id']]
        source = f['sources'][rule['sourceIndex']]
        what = w('cal.what.' + rule['what'])
        meta = [period_text(w, e), what, w('cal.auth.' + rule['authority'])]
        lines = [
            '<h4>%s%s</h4>' % (
                '<span class="cal-form">%s</span> ' % esc(rule['form']) if rule.get('form') else '',
                esc(rule['name'][lang])),
            '<p class="cal-meta">%s</p>' % esc(' · '.join(meta)),
        ]
        if rule.get('who'):
            lines.append('<p class="cal-who">%s</p>' % esc(rule['who'][lang]))
        if e.get('moved') and not moved_said:
            lines.append('<p class="cal-moved">%s</p>' % render_moved(cal, lang, w, e))
        if e.get('unmovedOnDayOff'):
            reason = e['unmovedOnDayOff'][0]
            why = weekday_name(w, e['nominal'], short=False) if reason['kind'] == 'weekend' else (
                reason['name'][lang] if reason.get('name') else w('cal.holiday'))
            lines.append('<p class="cal-moved">%s</p>' % esc(w('cal.unmoved', date=day_month(w, e['nominal']), why=why)))
        also = [cite_link(f['sources'][i], lang, w) for i in rule.get('alsoSourceIndexes', [])]
        lines.append('<p class="cal-act">%s %s%s · <span class="cal-state">%s</span></p>' % (
            esc(w('cal.basis')), cite_link(source, lang, w),
            (' · ' + esc(w('cal.also')) + ' ' + ', '.join(also)) if also else '',
            esc(w('cal.state.' + rule['confidence']))))
        return '<li class="cal-item cal-item--deadline" id="%s" data-profiles="%s">\n%s\n</li>' % (
            item_id(kind, e), ' '.join(rule['appliesTo']), '\n'.join(lines))

    if kind == 'off':
        parts = []
        for entry in e['off']:
            source = cal.holidays['sources'][entry['sourceIndex']]
            if entry['kind'] == 'transfer':
                title = w('cal.transfer.rest', date=day_month(w, entry['workDay']))
            else:
                title = entry['name'][lang]
            parts.append(
                '<li class="cal-item cal-item--off" id="%s">\n<h4>%s</h4>\n<p class="cal-meta">%s</p>\n'
                '<p class="cal-act">%s %s · <span class="cal-state">%s</span></p>\n</li>' % (
                    item_id('off', e, entry['id']), esc(title), esc(w('cal.offday')), esc(w('cal.basis')), cite_link(source, lang, w),
                    esc(w('cal.state.' + ('verified' if source.get('verified') else 'unverified')))))
        return '\n'.join(parts)

    if kind == 'worked':
        t = e['worked']
        source = cal.holidays['sources'][t['sourceIndex']]
        return (
            '<li class="cal-item cal-item--worked" id="%s">\n<h4>%s</h4>\n'
            '<p class="cal-act">%s %s · <span class="cal-state">%s</span></p>\n</li>' % (
                item_id(kind, e), esc(w('cal.transfer.work', date=day_month(w, t['restDay']))), esc(w('cal.basis')),
                cite_link(source, lang, w),
                esc(w('cal.state.' + ('verified' if source.get('verified') else 'unverified')))))

    if kind == 'law':
        f, c = e
        source = f['sources'][c['sourceIndex']]
        lines = ['<h4>%s</h4>' % esc(c['title'][lang])]
        if c.get('after') is not None:
            lines.append('<p class="cal-meta">%s</p>' % esc(change_values(c, lang, w)))
        lines.append('<p class="cal-act">%s %s · <span class="cal-state">%s</span></p>' % (
            esc(w('cal.basis')), cite_link(source, lang, w),
            esc(w('cal.state.' + ('verified' if source.get('verified') else 'unverified')))))
        return '<li class="cal-item cal-item--law" id="%s">\n<p class="cal-kind">%s</p>\n%s\n</li>' % (
            item_id(kind, e), esc(w('cal.inforce')), '\n'.join(lines))

    if kind == 'local':
        parts = []
        for i, x in enumerate(e['local']):
            basis = cal.holidays['sources'][x['basisIndex']]
            source = cal.holidays['sources'][x['sourceIndex']]
            parts.append(
                '<li class="cal-item cal-item--local" id="%s">\n<h4>%s</h4>\n<p class="cal-meta">%s</p>\n'
                '<p class="cal-act">%s %s · %s %s · <span class="cal-state">%s</span></p>\n</li>' % (
                    item_id('local', e, str(i)), esc(x['name'][lang]), esc(w('cal.local', places=x['places'][lang])),
                    esc(w('cal.basis')), cite_link(basis, lang, w), esc(w('cal.also')), cite_link(source, lang, w),
                    esc(w('cal.state.unverified'))))
        return '\n'.join(parts)
    raise Refused('unknown item kind %s' % kind)


def change_values(c, lang, w):
    after = money(c['after'], c['unit'], lang)
    if c.get('before') is not None:
        return w('cal.change.fromto', before=money(c['before'], c['unit'], lang), after=after)
    return after


def render_changes(cal, lang, w):
    rows = []
    for f, c in sorted(cal.changes(), key=lambda fc: fc[1]['effectiveFrom'], reverse=True):
        source = f['sources'][c['sourceIndex']]
        values = esc(change_values(c, lang, w)) if c.get('after') is not None else ''
        detail = '<p>%s</p>' % esc(c['detail'][lang]) if c.get('detail') else ''
        state = w('cal.change.bill') if c['state'] == 'bill' else w('cal.change.law')
        rows.append(
            '<tr id="c-%s">\n<td><time datetime="%s">%s</time></td>\n<td><strong>%s</strong>%s</td>\n'
            '<td class="cal-values">%s</td>\n<td>%s<br /><span class="cal-state">%s</span></td>\n</tr>' % (
                c['id'], c['effectiveFrom'], esc(full_date(w, c['effectiveFrom'])), esc(c['title'][lang]), detail,
                values, cite_link(source, lang, w), esc(state)))
    head = ''.join('<th scope="col">%s</th>' % esc(w(k)) for k in ('cal.col.date', 'cal.col.what', 'cal.col.values', 'cal.col.act'))
    table = '<div class="cal-scroll"><table class="cal-changes">\n<thead><tr>%s</tr></thead>\n<tbody>\n%s\n</tbody>\n</table></div>' % (head, '\n'.join(rows))

    pending = cal.secondary_rules()
    if pending:
        items = ''.join('<li>%s%s</li>' % (
            ('<strong>%s</strong> ' % esc(r['form'])) if r.get('form') else '', esc(r['name'][lang])) for _f, r in pending)
        table += '\n<div class="cal-pending">\n<h3>%s</h3>\n<p>%s</p>\n<ul>%s</ul>\n</div>' % (
            esc(w('cal.pending.title')), esc(w('cal.pending.text')), items)
    return table


def render_events(cal, lang, w):
    """Terms counted from something that happens: never dated, listed with their acts."""
    items = []
    for f, rule in [cal.rules[i] for i in cal.rules]:
        s = rule['schedule']
        if s['every'] != 'event' or rule['confidence'] == 'secondary':
            continue
        within = s['within']
        term = w('cal.within.workingDays', n=within['workingDays']) if 'workingDays' in within else w('cal.within.days', n=within['days'])
        source = f['sources'][rule['sourceIndex']]
        items.append(
            '<li class="cal-item cal-item--deadline" data-profiles="%s">\n<h4>%s%s</h4>\n<p class="cal-meta">%s</p>\n'
            '<p class="cal-who">%s</p>\n<p class="cal-act">%s %s · <span class="cal-state">%s</span></p>\n</li>' % (
                ' '.join(rule['appliesTo']),
                '<span class="cal-form">%s</span> ' % esc(rule['form']) if rule.get('form') else '',
                esc(rule['name'][lang]),
                esc('%s %s · %s · %s' % (term, s['event'][lang], w('cal.what.' + rule['what']), w('cal.auth.' + rule['authority']))),
                esc(rule['who'][lang]), esc(w('cal.basis')), cite_link(source, lang, w),
                esc(w('cal.state.' + rule['confidence']))))
    return '<ul class="cal-items cal-events">\n%s\n</ul>' % '\n'.join(items)


def render_filters(cal, lang, w):
    boxes = []
    for p in cal.profiles:
        note = ' title="%s"' % esc(p['note'][lang]) if p.get('note') else ''
        boxes.append(
            '<label class="cal-chip"%s><input type="checkbox" name="profile" value="%s" data-cal-profile /> %s</label>' %
            (note, p['id'], esc(p['name'][lang])))
    return '\n'.join(boxes)


def feeds_list(cal, lang, w):
    """Each feed as a webcal: link, which a calendar application subscribes to on a click, and its
    https address to paste into one that asks for a URL (Google Calendar)."""
    prefix = '' if lang == SOURCE else '/' + lang
    feeds = [('%s/calendar.ics' % prefix, w('cal.feed.all'))]
    feeds += [('%s/calendar/%s.ics' % (prefix, p['id']), p['name'][lang]) for p in cal.profiles]
    return '\n'.join(
        '<li><a href="webcal://konta.md%s">%s</a><code>%s%s</code></li>' % (path, esc(name), ORIGIN, path)
        for path, name in feeds)


# --- iCalendar ---------------------------------------------------------------------------------

def ics_escape(text):
    return text.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')


def fold(line):
    """RFC 5545 3.1: lines of at most 75 octets, continued with CRLF and a space."""
    data = line.encode('utf-8')
    if len(data) <= 75:
        return line
    out = []
    current = b''
    limit = 75
    for ch in line:
        b = ch.encode('utf-8')
        if len(current) + len(b) > limit:
            out.append(current.decode('utf-8'))
            current = b''
            limit = 74  # the leading space counts
        current += b
    out.append(current.decode('utf-8'))
    return '\r\n '.join(out)


def ics(cal, lang, w, stamp, name, profile=None):
    prefix = '' if lang == SOURCE else '/' + lang
    page = ORIGIN + prefix + PAGE
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Konta//Calendar fiscal %s//%s' % (lang.upper(), lang.upper()),
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:' + ics_escape(name),
        'X-WR-CALDESC:' + ics_escape(w('cal.ics.desc')),
        'REFRESH-INTERVAL;VALUE=DURATION:P1D',
        'X-PUBLISHED-TTL:P1D',
    ]

    def event(uid, date, summary, description, url, categories, transparent):
        end = (parse(date) + datetime.timedelta(days=1)).strftime('%Y%m%d')
        lines.extend([
            'BEGIN:VEVENT',
            'UID:%s@konta.md' % uid,
            'DTSTAMP:' + stamp,
            'DTSTART;VALUE=DATE:' + date.replace('-', ''),
            'DTEND;VALUE=DATE:' + end,
            'SUMMARY:' + ics_escape(summary),
            'DESCRIPTION:' + ics_escape(description),
            'URL:' + url,
            'CATEGORIES:' + ','.join(ics_escape(c) for c in categories),
            'TRANSP:' + ('TRANSPARENT' if transparent else 'OPAQUE'),
            'END:VEVENT',
        ])

    for item in cal.data['deadlines']:
        if not cal.published(item):
            continue
        f, rule = cal.rules[item['id']]
        if profile and profile not in rule['appliesTo']:
            continue
        source = f['sources'][rule['sourceIndex']]
        summary = '%s%s · %s' % ((rule['form'] + ' · ') if rule.get('form') else '', rule['name'][lang], period_text(w, item))
        text = [w('cal.what.' + rule['what']) + ' · ' + w('cal.auth.' + rule['authority'])]
        if rule.get('who'):
            text.append(rule['who'][lang])
        if item.get('moved'):
            text.append(w('cal.moved.plain', date=day_month(w, item['nominal'])))
        if item.get('unmovedOnDayOff'):
            text.append(w('cal.unmoved.plain'))
        text.append('%s %s%s' % (w('cal.basis'), source['cite'][lang], (' ' + source['url']) if source.get('url') else ''))
        text.append(w('cal.state.' + rule['confidence']) + '. ' + w('cal.ics.check'))
        p = item['period']
        uid = '%s-%s' % (item['id'], '%d-%02d' % (p['year'], p['month']) if p['kind'] == 'month' else
                         '%d-q%d' % (p['year'], p['quarter']) if p['kind'] == 'quarter' else
                         '%d-h%d' % (p['year'], p['half']) if p['kind'] == 'half' else str(p['year']))
        if item.get('installment'):
            uid += '-%d' % item['installment']
        names = {q['id']: q['name'][lang] for q in cal.profiles}
        event('%s-%s' % (uid, lang), item['date'], summary, '\n'.join(text), '%s#d-%s' % (page, item['date']),
              [names[x] for x in rule['appliesTo']], False)

    for day in cal.data['days']:
        for entry in day.get('off', []):
            source = cal.holidays['sources'][entry['sourceIndex']]
            title = w('cal.transfer.rest', date=day_month(w, entry['workDay'])) if entry['kind'] == 'transfer' else entry['name'][lang]
            event('off-%s-%s-%s' % (day['date'], entry['id'], lang), day['date'], '%s · %s' % (title, w('cal.offday')),
                  '%s %s%s' % (w('cal.basis'), source['cite'][lang], (' ' + source['url']) if source.get('url') else ''),
                  '%s#d-%s' % (page, day['date']), [w('cal.offday')], True)
        for i, x in enumerate(day.get('local', [])):
            source = cal.holidays['sources'][x['sourceIndex']]
            basis = cal.holidays['sources'][x['basisIndex']]
            event('local-%s-%d-%s' % (day['date'], i, lang), day['date'], '%s · %s' % (x['name'][lang], w('cal.local', places=x['places'][lang])),
                  '%s %s %s; %s %s' % (w('cal.basis'), basis['cite'][lang], basis.get('url', ''), source['cite'][lang], source.get('url', '')),
                  '%s#d-%s' % (page, day['date']), [w('cal.offday')], True)
        if 'worked' in day:
            t = day['worked']
            source = cal.holidays['sources'][t['sourceIndex']]
            event('work-%s-%s' % (day['date'], lang), day['date'], w('cal.transfer.work', date=day_month(w, t['restDay'])),
                  '%s %s%s' % (w('cal.basis'), source['cite'][lang], (' ' + source['url']) if source.get('url') else ''),
                  '%s#d-%s' % (page, day['date']), [w('cal.workday')], True)

    lines.append('END:VCALENDAR')
    return '\r\n'.join(fold(line) for line in lines) + '\r\n'


# --- RSS ---------------------------------------------------------------------------------------

def rfc822(date):
    d = parse(date)
    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return '%s, %02d %s %d 00:00:00 +0300' % (days[d.weekday()], d.day, months[d.month - 1], d.year)


def rss(cal, lang, w, built):
    prefix = '' if lang == SOURCE else '/' + lang
    page = ORIGIN + prefix + PAGE
    feed = ORIGIN + prefix + PAGE + 'schimbari.xml'
    items = []
    for f, c in sorted(cal.changes(), key=lambda fc: (fc[1]['recordedOn'], fc[1]['effectiveFrom']), reverse=True):
        source = f['sources'][c['sourceIndex']]
        parts = [w('cal.rss.from', date=full_date(w, c['effectiveFrom']))]
        if c.get('after') is not None:
            parts.append(change_values(c, lang, w))
        if c.get('detail'):
            parts.append(c['detail'][lang])
        parts.append('%s %s' % (w('cal.basis'), source['cite'][lang]))
        parts.append(w('cal.change.bill') if c['state'] == 'bill' else w('cal.change.law'))
        items.append(
            '    <item>\n      <title>%s</title>\n      <link>%s#c-%s</link>\n      <guid isPermaLink="false">konta-rulebook:%s:%s</guid>\n'
            '      <pubDate>%s</pubDate>\n      <description>%s</description>\n%s    </item>' % (
                esc(c['title'][lang]), page, c['id'], c['id'], lang, rfc822(c['recordedOn']), esc('\n'.join(parts)), ''))
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n'
        '    <title>%s</title>\n    <link>%s#schimbari</link>\n    <description>%s</description>\n'
        '    <language>%s</language>\n    <lastBuildDate>%s</lastBuildDate>\n'
        '    <atom:link href="%s" rel="self" type="application/rss+xml" />\n%s\n  </channel>\n</rss>\n' % (
            esc(w('cal.rss.title')), page, esc(w('cal.rss.desc')), {'ro': 'ro-MD', 'ru': 'ru-MD', 'en': 'en'}[lang],
            built.strftime('%a, %d %b %Y %H:%M:%S +0000'), feed, '\n'.join(items)))


# --- Build -------------------------------------------------------------------------------------

def page_file(site, lang):
    base = site if lang == SOURCE else os.path.join(site, lang)
    return os.path.join(base, 'calendar', 'index.html')


def build(site, today=None):
    """Fill the calendar into every language's copy of the page, and write the feeds."""
    rulebook = rulebook_dir()
    validate(rulebook)
    commit, dirty = rulebook_state(rulebook)

    now = datetime.datetime.now(datetime.timezone.utc)
    today = today or now.astimezone(CHISINAU).date()
    # Three months back, to check what was due, through the end of next year: as far as anybody
    # plans, and no further than the law in force can be read. The page is built on one day and
    # read on later ones, so calendar.js counts the three months from the reader's own month.
    back = today.year * 12 + today.month - 1 - 3
    first = datetime.date(back // 12, back % 12 + 1, 1)
    last = datetime.date(today.year + 1, 12, 31)
    data = expand(rulebook, first.isoformat(), last.isoformat())
    cal = Calendar(data)

    stamp = now.strftime('%Y%m%dT%H%M%SZ')
    written = 0
    for lang in LANGS:
        path = page_file(site, lang)
        if not os.path.exists(path):
            raise Refused('%s is missing: is /calendar/ in sitemap.xml?' % path)
        text = io.open(path, encoding='utf-8').read()
        w = Words(text, path)
        for mark in (MONTHS_MARK, CHANGES_MARK, '<!-- calendar:filters -->', '<!-- calendar:feeds -->', '<!-- calendar:built -->', '<!-- calendar:events -->'):
            if mark not in text:
                raise Refused('%s: no %s' % (path, mark))

        built = w('cal.built', date=full_date(w, today.isoformat()), commit=commit[:7])
        if dirty:
            built += ' ' + w('cal.dirty')
        built_html = esc(built).replace(esc(commit[:7]), '<a href="https://github.com/December-Capital/konta-rulebook/tree/%s/calendar" rel="noopener"><code>%s</code></a>' % (commit, commit[:7]))

        text = WORDS.sub('\n', text, count=1)
        text = text.replace(MONTHS_MARK, render_months(cal, lang, w, today, first, last))
        text = text.replace(CHANGES_MARK, render_changes(cal, lang, w))
        text = text.replace('<!-- calendar:filters -->', render_filters(cal, lang, w))
        text = text.replace('<!-- calendar:events -->', render_events(cal, lang, w))
        text = text.replace('<!-- calendar:feeds -->', feeds_list(cal, lang, w))
        text = text.replace('<!-- calendar:built -->', built_html)
        # The RSS links, in the head and in the changes section, to this language's feed.
        feed = ('' if lang == SOURCE else '/' + lang) + PAGE + 'schimbari.xml'
        text = text.replace('href="%sschimbari.xml"' % PAGE, 'href="%s"' % feed)
        text = re.sub(r'(<link rel="alternate" type="application/rss\+xml" href="[^"]*" title=")[^"]*"',
                      lambda m: m.group(1) + esc(w('cal.rss.title')) + '"', text)
        io.open(path, 'w', encoding='utf-8', newline='\n').write(text)

        base = site if lang == SOURCE else os.path.join(site, lang)
        with io.open(os.path.join(base, 'calendar.ics'), 'w', encoding='utf-8', newline='') as out:
            out.write(ics(cal, lang, w, stamp, w('cal.ics.name')))
        for p in cal.profiles:
            with io.open(os.path.join(base, 'calendar', p['id'] + '.ics'), 'w', encoding='utf-8', newline='') as out:
                out.write(ics(cal, lang, w, stamp, '%s · %s' % (w('cal.ics.name'), p['name'][lang]), p['id']))
        with io.open(os.path.join(base, 'calendar', 'schimbari.xml'), 'w', encoding='utf-8', newline='\n') as out:
            out.write(rss(cal, lang, w, now))
        written += 3 + len(cal.profiles)

    # The page's scripts are files; nothing written here may add an inline one.
    languages.check_csp(site)
    dated = sum(1 for item in data['deadlines'] if cal.published(item))
    return {'commit': commit[:7], 'dirty': dirty, 'files': written, 'deadlines': dated,
            'days': len(data['days']), 'changes': len(cal.changes())}
