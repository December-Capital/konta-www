"""Copy exactly what belongs on the web server into a folder you can drag into public_html.

Run from the repository root:
    python tools/package.py            # writes ../konta.md-upload/
    python tools/package.py --zip      # also writes ../konta.md-upload.zip
    python tools/package.py <path>     # somewhere else

This repository is not the same thing as the website. It also holds the README and tools/ — the
font fetcher, the catalogue checker, the screenshot renderer — none of which should ever be
readable over HTTP. The site is the five entries in SERVED below, and nothing else.

The destination is emptied first, so it is a mirror rather than an accumulation: a file deleted
here disappears there, and you never upload something that was removed three commits ago.

The folder is the useful shape for a partial upload, which is the normal case — a copy edit is
index.html and two JSON files. Use --zip when you want the file manager's upload-and-extract
route instead, for a first deploy or after a lot has changed.
"""

import os
import shutil
import sys
import zipfile

# Everything here is served. Everything not here is not.
SERVED = ['index.html', 'robots.txt', '.htaccess', 'status', 'assets']

DEFAULT = os.path.join('..', 'konta.md-upload')


def main():
    args = [a for a in sys.argv[1:] if a != '--zip']
    make_zip = '--zip' in sys.argv[1:]
    out = os.path.abspath(args[0] if args else DEFAULT)

    if not os.path.exists('index.html') or not os.path.isdir('assets'):
        sys.exit('Run this from the repository root.')

    missing = [name for name in SERVED if not os.path.exists(name)]
    if missing:
        sys.exit('Missing from the repository: %s' % ', '.join(missing))

    # Refuse to empty something that is not ours to empty.
    if os.path.isdir(out) and not os.path.exists(os.path.join(out, 'index.html')):
        if os.listdir(out):
            sys.exit('%s exists, is not empty, and does not look like a previous package.' % out)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)

    files = 0
    for name in SERVED:
        target = os.path.join(out, name)
        if os.path.isdir(name):
            shutil.copytree(name, target)
            files += sum(len(f) for _r, _d, f in os.walk(name))
        else:
            shutil.copy2(name, target)
            files += 1

    total = sum(os.path.getsize(os.path.join(r, f))
                for r, _d, fs in os.walk(out) for f in fs)
    print('%s\n  %d files, %.0f KB' % (out, files, total / 1024))
    print('  contents go to public_html, keeping this structure:')
    for name in SERVED:
        print('    %s%s' % (name, '/' if os.path.isdir(name) else ''))
    # Plain ASCII: the Windows console encoding mangles anything else.
    print('\n  .htaccess is a dotfile. The file manager hides it - check it arrived.')

    if make_zip:
        archive = out + '.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for root, _dirs, names in os.walk(out):
                for name in sorted(names):
                    full = os.path.join(root, name)
                    z.write(full, os.path.relpath(full, out).replace(os.sep, '/'))
        print('\n%s\n  %.0f KB zipped' % (archive, os.path.getsize(archive) / 1024))


if __name__ == '__main__':
    sys.exit(main())
