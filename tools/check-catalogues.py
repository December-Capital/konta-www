"""Check that every translatable string on the site exists in Russian and English.

Run from the repository root:  python tools/check-catalogues.py

Romanian is the source language and lives in the HTML, so it cannot go missing. Russian and
English are separate files, and a key that is present in the markup but absent from a catalogue
silently leaves Romanian on screen. This makes that visible, and fails loudly enough for CI.
"""

import glob
import io
import json
import re
import sys

PAGES = glob.glob('*.html') + glob.glob('*/index.html')
CATALOGUES = {'ru': 'assets/ru.json', 'en': 'assets/en.json'}

KEY = re.compile(r'data-t(?:-aria-label)?="([^"]+)"')
SEED = re.compile(r'<script type="application/json" data-seed>(.*?)</script>', re.S)


def keys_in(path):
    html = io.open(path, encoding='utf-8').read()
    found = set(KEY.findall(html))
    for block in SEED.findall(html):
        found |= set(json.loads(block).keys())
    return found


def main():
    used = set()
    for page in PAGES:
        used |= keys_in(page)

    problems = 0
    for lang, path in CATALOGUES.items():
        words = json.load(io.open(path, encoding='utf-8'))
        missing = sorted(used - set(words))
        unused = sorted(set(words) - used)
        blank = sorted(k for k, v in words.items() if not str(v).strip())

        for key in missing:
            print('%s: missing %s' % (lang, key))
        for key in blank:
            print('%s: empty %s' % (lang, key))
        for key in unused:
            print('%s: unused %s' % (lang, key))

        problems += len(missing) + len(blank)

    print('%d keys used across %d pages' % (len(used), len(PAGES)))
    if problems:
        print('%d problems' % problems)
        return 1

    print('ro, ru, en at parity')
    return 0


if __name__ == '__main__':
    sys.exit(main())
