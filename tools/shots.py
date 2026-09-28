"""Render the site to PNG with headless Firefox, so a change can be looked at before it ships.

Run from the repository root:  python tools/shots.py
Output lands in shots/, which is not committed.

Two bugs reached main before this existed, and neither was visible in the source: the theme
control rendered both its icons because the hidden attribute does nothing to an SVG, and the hero
comparison sized its two label columns independently so the descriptions did not line up. Reading
the code found neither. Look at the pictures.

Firefox takes the screenshot on the load event, which is before site.js has fetched a translation
catalogue and before the status probe has answered. So the variants are pre-rendered here: the
Russian and English pages by applying the catalogue the way site.js does (every [data-t] element
holds leaf text), the themes by stamping data-theme on <html>, which is exactly what the toggle
writes. The theme is always stamped, because a headless profile reports its own colour preference
and would otherwise decide for us.
"""

import glob
import io
import json
import os
import re
import shutil
import subprocess
import sys

OUT = 'shots'
WORK = os.path.join(OUT, '.pages')

ELEMENT = re.compile(r'(<(\w+)(?:\s[^>]*?)?\sdata-t="([^"]+)"(?:\s[^>]*?)?>)(.*?)(</\2>)', re.S)
META = re.compile(r'(<meta\b[^>]*?data-t="([^"]+)"[^>]*?>)', re.S)
NEXT_LANG = {'ro': 'ru', 'ru': 'en', 'en': 'ro'}

VARIANTS = [
    ('index.html', 'ro-light', 'ro', 'light', None, 1280),
    ('index.html', 'ro-dark', 'ro', 'dark', None, 1280),
    ('index.html', 'ru-light', 'ru', 'light', None, 1280),
    ('index.html', 'en-dark', 'en', 'dark', None, 1280),
    ('index.html', 'ro-phone', 'ro', 'light', None, 400),
    ('index.html', 'ru-phone', 'ru', 'dark', None, 400),
    ('status/index.html', 'status-light', 'ro', 'light', 'down', 1280),
    ('status/index.html', 'status-dark', 'ru', 'dark', 'down', 1280),
]

FIREFOX_CANDIDATES = [
    r'C:\Program Files\Mozilla Firefox\firefox.exe',
    r'C:\Program Files (x86)\Mozilla Firefox\firefox.exe',
    '/usr/bin/firefox',
    '/Applications/Firefox.app/Contents/MacOS/firefox',
]


def firefox():
    for path in FIREFOX_CANDIDATES:
        if os.path.exists(path):
            return path
    found = shutil.which('firefox')
    if found:
        return found
    sys.exit('Firefox not found. Install it, or add its path to FIREFOX_CANDIDATES.')


def translate(html, words):
    def swap(m):
        value = words.get(m.group(3))
        return m.group(1) + value + m.group(5) if value else m.group(0)

    def swap_meta(m):
        value = words.get(m.group(2))
        if not value:
            return m.group(0)
        return re.sub(r'content="[^"]*"', 'content="%s"' % value.replace('"', '&quot;'), m.group(1))

    return META.sub(swap_meta, ELEMENT.sub(swap, html))


def build(page, name, lang, theme, state):
    html = io.open(page, encoding='utf-8').read()

    if lang != 'ro':
        words = json.load(io.open('assets/%s.json' % lang, encoding='utf-8'))
        html = translate(html, words)
        html = html.replace('<html lang="ro" data-lang="ro">',
                            '<html lang="%s" data-lang="%s">' % (lang, lang))
        html = re.sub(r'(data-lang-cycle[^>]*>)[A-Z]{2}(</button>)',
                      r'\g<1>%s\g<2>' % NEXT_LANG[lang].upper(), html)

    html = html.replace('<html lang=', '<html data-theme="%s" lang=' % theme)

    if theme == 'dark':
        html = html.replace('src="assets/logo.png"', 'src="assets/logo-dark.png"')
        html = html.replace('src="../assets/logo.png"', 'src="../assets/logo-dark.png"')
        # In the dark the control offers the sun; the markup is authored light-default.
        html = html.replace('data-theme-icon="dark">', 'data-theme-icon="dark" hidden>')
        html = html.replace('data-theme-icon="light" hidden>', 'data-theme-icon="light">')

    if state == 'down':
        html = html.replace('data-state="checking"', 'data-state="down"')
        for checking, down in (('Se verific\u0103', 'Nu r\u0103spunde'),
                               ('\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c', '\u041d\u0435 \u043e\u0442\u0432\u0435\u0447\u0430\u0435\u0442'),
                               ('Checking', 'Not responding')):
            html = html.replace('data-t="st.checking">' + checking, 'data-t="st.down">' + down)

    # The scripts would undo the pre-render: site.js re-applies Romanian, status.js re-probes.
    html = re.sub(r'\s*<script src="[^"]*(site|status)\.js"></script>', '', html)

    # Keep the file at the same depth as the page it came from, so relative asset paths hold.
    out = os.path.join(WORK, os.path.dirname(page), name + '.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    io.open(out, 'w', encoding='utf-8', newline='\n').write(html)
    return out


def main():
    if not os.path.exists('index.html'):
        sys.exit('Run this from the repository root.')

    binary = firefox()
    if os.path.isdir(WORK):
        shutil.rmtree(WORK)
    for stale in glob.glob(os.path.join(OUT, '*.png')):
        os.remove(stale)
    os.makedirs(OUT, exist_ok=True)

    # Firefox resolves relative asset paths against the page, so the variants are rendered from a
    # copy of the site rather than from a scratch directory next to it.
    shutil.copytree('.', WORK, ignore=shutil.ignore_patterns('.git', 'tools', 'shots', '*.md'))

    profile = os.path.join(OUT, '.profile')
    os.makedirs(profile, exist_ok=True)

    env = dict(os.environ, MOZ_HEADLESS='1')
    for page, name, lang, theme, state, width in VARIANTS:
        path = build(page, name, lang, theme, state)
        png = os.path.abspath(os.path.join(OUT, name + '.png'))
        subprocess.run(
            [binary, '-no-remote', '-profile', os.path.abspath(profile), '--headless',
             '--screenshot', png, '--window-size=%d' % width,
             'file:///' + os.path.abspath(path).replace('\\', '/')],
            env=env, check=False, capture_output=True, timeout=180,
        )
        print('%-14s %s' % (name, 'ok' if os.path.exists(png) else 'FAILED'))

    shutil.rmtree(WORK, ignore_errors=True)
    print('\nOpen %s/ and look at every one before deploying.' % OUT)


if __name__ == '__main__':
    sys.exit(main())
