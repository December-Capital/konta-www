"""Static Russian and English copies of every indexable page, written at package time.

Romanian is the source language and lives in the HTML. Russian and English live in
assets/ru.json and assets/en.json, keyed by the data-t attributes in the markup. In the browser
site.js could swap them in on the same address, but a search engine reads the HTML it is served,
so until 2026-10-15 only the Romanian was indexed. This writes, for every page in sitemap.xml:

    /ru/<page>/index.html   and   /en/<page>/index.html

with the catalogue's words in the markup, the page's own canonical, Open Graph locale and URL,
JSON-LD in its language (FAQPage word for word the page, as for the Romanian), hreflang alternates
on all three copies, links to the other indexable pages kept in the same language, and the
language control a link to the next language's copy. The sitemap is rewritten with all three and
their alternates.

Nothing here is committed: the copies exist only in the packaged folder, so a translation lives
in one place, the catalogue. A key missing from a catalogue stops the package rather than leaving
Romanian on a Russian page.

The inline theme script is left untouched, byte for byte, and checked afterwards against the hash
the CSP in .htaccess allows, on every page written, so a page that would lose its theme under the
CSP never reaches the server.

Called from package.build() on the folder it has just written, never on its own: the Romanian
pages it reads must be the ones copied from this checkout, without alternates yet.
"""

import base64
import hashlib
import html
import io
import json
import os
import re
import sys
from html.parser import HTMLParser

ORIGIN = 'https://konta.md'
SOURCE = 'ro'
COPIES = ['ru', 'en']
LANGS = [SOURCE] + COPIES

# Each language names itself, and never in translation (site.js has the same list).
NAMES = {'ro': 'Română', 'ru': 'Русский', 'en': 'English'}
LOCALES = {'ro': 'ro_MD', 'ru': 'ru_MD', 'en': 'en_US'}

# Names JSON-LD may carry untranslated: they are names, the same in every language.
PROPER = {'Konta', 'Moldova', 'December Capital'}

# Never in JSON-LD: Konta has no reviews to rate it by, and no published prices to offer. When
# prices are public, `offers` may come off this list; a rating needs real reviews first.
FORBIDDEN = {'aggregateRating', 'review', 'offers'}

# The Open Graph and Twitter texts repeat the page's title and description. They carry no data-t
# of their own, so they are translated by matching the Romanian of one that does.
REPEATED = {'og:title', 'og:description', 'twitter:title', 'twitter:description'}


class Refused(Exception):
    pass


def next_after(lang):
    return LANGS[(LANGS.index(lang) + 1) % len(LANGS)]


def address(lang, path):
    """The site-relative address of `path` ('/', '/e-factura/') in `lang`."""
    return path if lang == SOURCE else '/' + lang + path


def indexable_pages(site):
    """(path, lastmod) for each page in the sitemap, which is the list of indexable pages."""
    xml = io.open(os.path.join(site, 'sitemap.xml'), encoding='utf-8').read()
    pages = []
    for block in re.findall(r'<url>(.*?)</url>', xml, re.S):
        loc = re.search(r'<loc>(.*?)</loc>', block).group(1).strip()
        lastmod = re.search(r'<lastmod>(.*?)</lastmod>', block)
        if not loc.startswith(ORIGIN + '/') or not loc.endswith('/'):
            raise Refused('sitemap.xml: %s is not a page on %s ending in /' % (loc, ORIGIN))
        pages.append((loc[len(ORIGIN):], lastmod.group(1).strip() if lastmod else None))
    return pages


def source_file(site, path):
    return os.path.join(site, path.strip('/'), 'index.html') if path != '/' else os.path.join(site, 'index.html')


def squash(text):
    return ' '.join(text.split())


class Tags(HTMLParser):
    """Every start tag and every data-t element's text, with their offsets in the document.

    The page is never re-serialised: edits are spliced into the original text at these offsets,
    so everything the generator does not mean to change stays byte for byte as authored. That is
    what keeps the inline script's CSP hash valid.
    """

    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.text = text
        # Line starts as HTMLParser counts lines, by '\n' alone.
        self.lines = [0] + [m.end() for m in re.finditer('\n', text)]
        self.starts = []  # (offset, raw start tag, tag, attrs)
        self.texts = []  # (begin, end, key, tag), the inner text of each data-t element
        self.open = None  # (tag, key, offset just after its start tag)
        self.feed(text)
        self.close()
        if self.open:
            raise Refused('<%s data-t="%s"> is never closed' % (self.open[0], self.open[1]))

    def position(self):
        line, column = self.getpos()
        return self.lines[line - 1] + column

    def handle_starttag(self, tag, attrs):
        at = self.position()
        raw = self.get_starttag_text()
        attrs = dict(attrs)
        if self.open:
            # site.js swaps a data-t element's textContent, so anything inside one but text would
            # be destroyed in the browser anyway; here it would be silently dropped.
            raise Refused('<%s> inside <%s data-t="%s">' % (tag, self.open[0], self.open[1]))
        self.starts.append((at, raw, tag, attrs))
        if 'data-t' in attrs and tag != 'meta':
            self.open = (tag, attrs['data-t'], at + len(raw))

    def handle_startendtag(self, tag, attrs):
        at = self.position()
        if self.open:
            raise Refused('<%s /> inside <%s data-t="%s">' % (tag, self.open[0], self.open[1]))
        self.starts.append((at, self.get_starttag_text(), tag, dict(attrs)))

    def handle_endtag(self, tag):
        if self.open and tag == self.open[0]:
            self.texts.append((self.open[2], self.position(), self.open[1], tag))
            self.open = None


def set_attr(raw, name, value):
    """`raw` start tag with attribute `name` set to `value`, in place if it is there."""
    quoted = html.escape(value, quote=True)
    pattern = re.compile(r'(\s%s=)"[^"]*"' % re.escape(name))
    if pattern.search(raw):
        return pattern.sub(lambda m: '%s"%s"' % (m.group(1), quoted), raw, count=1)
    end = -2 if raw.endswith('/>') else -1
    return '%s %s="%s"%s' % (raw[:end].rstrip(), name, quoted, raw[end:] if end == -1 else ' />')


def splice(text, edits):
    for begin, end, replacement in sorted(edits, key=lambda e: e[0], reverse=True):
        text = text[:begin] + replacement + text[end:]
    return text


def romanian_words(tags):
    """Romanian text -> data-t key, for everything on the page that carries a key."""
    words = {}
    for begin, end, key, _tag in tags.texts:
        words.setdefault(squash(html.unescape(tags.text[begin:end])), key)
    for _at, _raw, tag, attrs in tags.starts:
        if 'data-t' in attrs and tag == 'meta':
            words.setdefault(squash(attrs.get('content', '')), attrs['data-t'])
    return words


class Page:
    def __init__(self, site, path, pages, catalogues):
        self.path = path
        self.pages = {p for p, _ in pages}
        self.catalogues = catalogues
        self.file = source_file(site, path)
        self.text = io.open(self.file, encoding='utf-8').read()
        if '<html lang="ro" data-lang="ro">' not in self.text:
            raise Refused('%s: not a Romanian page (<html lang="ro" data-lang="ro">)' % self.file)

    def word(self, lang, key):
        if lang == SOURCE:
            return None
        value = self.catalogues[lang].get(key)
        if not isinstance(value, str) or not value.strip():
            raise Refused('%s: %s has no %s in assets/%s.json' % (self.file, lang, key, lang))
        return value

    def next_label(self, lang):
        """"Switch to", which the control's accessible name begins with; Romanian is seeded."""
        if lang != SOURCE:
            return self.word(lang, 'lang.next')
        seed = re.search(r'<script type="application/json" data-seed>(.*?)</script>', self.text, re.S)
        label = json.loads(seed.group(1)).get('lang.next') if seed else None
        if not label:
            raise Refused('%s: no "lang.next" in its data-seed' % self.file)
        return label

    def link(self, lang, href):
        """An internal link in `lang`: same language for indexable pages, ?lang= for the rest."""
        if lang == SOURCE or not href.startswith('/') or href.startswith('//'):
            return href
        match = re.match(r'([^?#]*)(\?[^#]*)?(#.*)?$', href)
        path, query, fragment = match.group(1), match.group(2) or '', match.group(3) or ''
        if path in self.pages:
            return address(lang, path) + query + fragment
        if path.endswith('/') and not path.startswith('/assets/'):
            # A page with no copy of its own (the status page): site.js translates it in place.
            return path + (query + '&' if query else '?') + 'lang=' + lang + fragment
        return href

    def json_ld(self, lang, words, block):
        def walk(value, key=None):
            if isinstance(value, dict):
                banned = FORBIDDEN & set(value)
                if banned:
                    raise Refused('%s: JSON-LD carries %s' % (self.file, ', '.join(sorted(banned))))
                return {k: walk(v, k) for k, v in value.items()}
            if isinstance(value, list):
                # A list of languages (WebSite's inLanguage) is not the page's language.
                return [walk(v, key + '[]' if key else None) for v in value]
            if not isinstance(value, str):
                return value
            if key in ('name', 'text', 'description'):
                if squash(value) in words:
                    return self.word(lang, words[squash(value)])
                if value in PROPER:
                    return value
                raise Refused('%s: JSON-LD "%s" matches no data-t text on the page' % (self.file, value[:60]))
            if key in ('url', 'item', '@id') and value.startswith(ORIGIN + '/'):
                return ORIGIN + self.link(lang, value[len(ORIGIN):])
            if key == 'inLanguage':
                return lang
            return value

        data = walk(json.loads(block))
        dumped = json.dumps(data, ensure_ascii=False, indent=2).replace('</', '<\\/')
        # Indented as the hand-written blocks are, so the copies read like the source.
        return '\n' + dumped.replace('\n', '\n    ') + '\n    '

    def seed(self, lang, block):
        data = json.loads(block)
        return '\n      ' + json.dumps({k: self.word(lang, k) for k in data}, ensure_ascii=False) + '\n    '

    def alternates(self, indent):
        lines = ['<link rel="alternate" hreflang="%s" href="%s%s" />' % (l, ORIGIN, address(l, self.path)) for l in LANGS]
        lines.append('<link rel="alternate" hreflang="x-default" href="%s%s" />' % (ORIGIN, self.path))
        return ''.join('\n' + indent + line for line in lines)

    def render(self, lang):
        text = self.text
        nxt = next_after(lang)

        # Data blocks first, then tags; each pass parses the text the one before left.
        if lang != SOURCE:
            words = romanian_words(Tags(text))
            text = re.sub(
                r'(<script type="application/ld\+json">)(.*?)(</script>)',
                lambda m: m.group(1) + self.json_ld(lang, words, m.group(2)) + m.group(3),
                text, flags=re.S)
            text = re.sub(
                r'(<script type="application/json" data-seed>)(.*?)(</script>)',
                lambda m: m.group(1) + self.seed(lang, m.group(2)) + m.group(3),
                text, flags=re.S)

        tags = Tags(text)
        words = romanian_words(tags)
        edits = []
        cycler = None

        for begin, end, key, _tag in tags.texts:
            if lang != SOURCE:
                edits.append((begin, end, html.escape(self.word(lang, key), quote=False)))

        for at, raw, tag, attrs in tags.starts:
            new = raw
            prop = attrs.get('property') or attrs.get('name')

            if tag == 'html':
                new = set_attr(set_attr(raw, 'lang', lang), 'data-lang', lang)
            elif tag == 'link' and attrs.get('rel') == 'canonical':
                if attrs.get('href') != ORIGIN + self.path:
                    raise Refused('%s: canonical %s, expected %s' % (self.file, attrs.get('href'), ORIGIN + self.path))
                new = set_attr(raw, 'href', ORIGIN + address(lang, self.path))
                line_start = text.rfind('\n', 0, at) + 1
                new += self.alternates(text[line_start:at])
            elif tag == 'link' and attrs.get('rel') == 'alternate' and 'hreflang' in attrs:
                raise Refused('%s: hreflang alternates are written by the package, not by hand' % self.file)
            elif tag == 'meta' and prop == 'og:url':
                new = set_attr(raw, 'content', ORIGIN + address(lang, self.path))
            elif tag == 'meta' and prop == 'og:locale':
                line_start = text.rfind('\n', 0, at) + 1
                indent = text[line_start:at]
                new = set_attr(raw, 'content', LOCALES[lang]) + ''.join(
                    '\n%s<meta property="og:locale:alternate" content="%s" />' % (indent, LOCALES[l])
                    for l in LANGS if l != lang)
            elif tag == 'meta' and 'data-t' in attrs:
                if lang != SOURCE:
                    new = set_attr(raw, 'content', self.word(lang, attrs['data-t']))
            elif tag == 'meta' and prop in REPEATED:
                if lang != SOURCE:
                    content = squash(attrs.get('content', ''))
                    if content not in words:
                        raise Refused('%s: %s "%s" matches no data-t text' % (self.file, prop, content[:60]))
                    new = set_attr(raw, 'content', self.word(lang, words[content]))
            elif tag == 'input' and attrs.get('name') == 'lang' and attrs.get('type') == 'hidden':
                new = set_attr(raw, 'value', lang)
            elif tag == 'button' and 'data-lang-cycle' in attrs:
                cycler = at
                continue
            elif tag == 'a' and 'href' in attrs:
                new = set_attr(raw, 'href', self.link(lang, attrs['href']))

            if 'data-t-aria-label' in attrs and lang != SOURCE:
                new = set_attr(new, 'aria-label', self.word(lang, attrs['data-t-aria-label']))

            if new != raw:
                edits.append((at, at + len(raw), new))

        if cycler is None:
            raise Refused('%s: no <button data-lang-cycle>' % self.file)

        # The language control becomes a link to the next language's copy of this page, so it
        # works without script and a crawler follows it. site.js still writes the shared
        # konta_lang cookie on the click, before the browser follows it.
        close = text.index('</button>', cycler) + len('</button>')
        line_start = text.rfind('\n', 0, cycler) + 1
        indent = text[line_start:cycler]
        hint = '%s. %s %s' % (lang.upper(), self.next_label(lang), NAMES[nxt])
        anchor = (
            '<a\n{i}  class="control"\n{i}  href="{href}"\n{i}  hreflang="{nxt}"\n{i}  data-lang-cycle\n'
            '{i}  lang="{lang}"\n{i}  aria-label="{hint}"\n{i}  title="{title}"\n{i}>\n{i}  {code}\n{i}</a>'
        ).format(i=indent, href=address(nxt, self.path), nxt=nxt, lang=lang,
                 hint=html.escape(hint, quote=True), title=NAMES[nxt], code=lang.upper())
        edits.append((cycler, close, anchor))

        return splice(text, edits)


def sitemap(pages):
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<!-- Written by tools/languages.py from the repository\'s sitemap.xml. -->',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for path, lastmod in pages:
        for lang in LANGS:
            out.append('  <url>')
            out.append('    <loc>%s%s</loc>' % (ORIGIN, address(lang, path)))
            if lastmod:
                out.append('    <lastmod>%s</lastmod>' % lastmod)
            for alt in LANGS:
                out.append('    <xhtml:link rel="alternate" hreflang="%s" href="%s%s" />' % (alt, ORIGIN, address(alt, path)))
            out.append('    <xhtml:link rel="alternate" hreflang="x-default" href="%s%s" />' % (ORIGIN, path))
            out.append('  </url>')
    out.append('</urlset>')
    return '\n'.join(out) + '\n'


INLINE = re.compile(r'<script>(.*?)</script>', re.S)
SCRIPT = re.compile(r'<script\b([^>]*)>', re.S)


def check_csp(site):
    """Every inline script on every page written must be one the CSP in .htaccess allows."""
    htaccess = io.open(os.path.join(site, '.htaccess'), encoding='utf-8').read()
    allowed = set(re.findall(r"'sha256-([A-Za-z0-9+/=]+)'", htaccess))
    if not allowed:
        raise Refused('.htaccess: no script hash in the Content-Security-Policy')
    seen = set()
    pages = 0
    for root, dirs, names in os.walk(site):
        dirs[:] = [d for d in dirs if d != '.git']
        for name in names:
            if not name.endswith('.html'):
                continue
            pages += 1
            path = os.path.join(root, name)
            text = io.open(path, encoding='utf-8').read()
            for attrs in SCRIPT.findall(text):
                if attrs.strip() and not re.search(r'\bsrc=|type="application/(ld\+)?json"', attrs):
                    raise Refused('%s: <script%s> is neither a file nor data' % (path, attrs))
            for body in INLINE.findall(text):
                digest = base64.b64encode(hashlib.sha256(body.encode('utf-8')).digest()).decode()
                if digest not in allowed:
                    raise Refused('%s: inline script sha256-%s is not in the CSP in .htaccess' % (path, digest))
                seen.add(digest)
    return pages, seen


def build(site):
    """Write the copies and the sitemap into the packaged folder `site`. Returns pages written."""
    for lang in COPIES:
        if os.path.exists(os.path.join(site, lang)):
            raise Refused('%s/%s already exists: a source folder would collide with the copies' % (site, lang))

    catalogues = {}
    for lang in COPIES:
        catalogues[lang] = json.load(io.open(os.path.join(site, 'assets', lang + '.json'), encoding='utf-8'))

    pages = indexable_pages(site)
    written = 0
    rendered = {}
    for path, _lastmod in pages:
        page = Page(site, path, pages, catalogues)
        for lang in LANGS:
            rendered[(lang, path)] = page.render(lang)

    for (lang, path), text in rendered.items():
        target = source_file(os.path.join(site, lang) if lang != SOURCE else site, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with io.open(target, 'w', encoding='utf-8', newline='\n') as f:
            f.write(text)
        written += 1 if lang != SOURCE else 0

    with io.open(os.path.join(site, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(sitemap(pages))

    checked, hashes = check_csp(site)
    return len(pages), written, checked, hashes
