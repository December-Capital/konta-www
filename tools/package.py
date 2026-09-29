"""Copy exactly what belongs on the web server into a folder you can drag into public_html.

Run from the repository root:
    python tools/package.py            # writes ../kontamd-deploy/
    python tools/package.py --zip      # also writes ../kontamd-deploy.zip
    python tools/package.py <path>     # somewhere else

This repository is not the same thing as the website. It also holds the README and tools/, the
font fetcher, the catalogue checker, the screenshot renderer, none of which should ever be
readable over HTTP. The site is the entries in SERVED below, and nothing else.

The destination is emptied first, so it is a mirror rather than an accumulation: a file deleted
here disappears there, and you never upload something that was removed three commits ago.

The folder is the useful shape for a partial upload, which is the normal case, a copy edit is
index.html and two JSON files. Use --zip when you want the file manager's upload-and-extract
route instead, for a first deploy or after a lot has changed.
"""

import os
import shutil
import sys
import zipfile

# Everything here is served. Everything not here is not.
SERVED = [
    'index.html', '404.html', 'robots.txt', 'sitemap.xml', '.htaccess', 'assets', 'status',
    'e-factura', 'fara-programator', 'trecerea-de-la-1c', 'parteneri', 'transparenta', 'contact',
]

DEFAULT = os.path.join('..', 'kontamd-deploy')


def build(out, make_zip=False):
    """Mirror the served files into `out`.

    Separate from main() so tools/publish.py can call it without its own flags being read as a
    destination path, which is exactly what happened, and left a folder named --dry-run.
    """
    if not os.path.exists('index.html') or not os.path.isdir('assets'):
        sys.exit('Run this from the repository root.')

    missing = [name for name in SERVED if not os.path.exists(name)]
    if missing:
        sys.exit('Missing from the repository: %s' % ', '.join(missing))

    # Refuse to empty something that is not ours to empty. A bare git repository counts as ours:
    # that is what the destination looks like the first time it is packaged after being cloned.
    if os.path.isdir(out):
        stray = [n for n in os.listdir(out) if n != '.git']
        if stray and not os.path.exists(os.path.join(out, 'index.html')):
            sys.exit('%s exists, is not empty, and does not look like a previous package.' % out)

    # Everything except .git: the destination is usually a git repository, and deleting its
    # history to publish a copy of the site would be a memorable way to lose the deploy remote.
    for name in os.listdir(out) if os.path.isdir(out) else []:
        if name == '.git':
            continue
        path = os.path.join(out, name)
        shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)

    os.makedirs(out, exist_ok=True)

    files = 0
    for name in SERVED:
        target = os.path.join(out, name)
        if os.path.isdir(name):
            shutil.copytree(name, target)
            files += sum(len(f) for _r, _d, f in os.walk(name))
        else:
            shutil.copy2(name, target)
            files += 1

    total = 0
    for root, dirs, names in os.walk(out):
        dirs[:] = [d for d in dirs if d != '.git']
        total += sum(os.path.getsize(os.path.join(root, n)) for n in names)
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


def main():
    args = [a for a in sys.argv[1:] if a != '--zip']
    return build(os.path.abspath(args[0] if args else DEFAULT), '--zip' in sys.argv[1:])


if __name__ == '__main__':
    sys.exit(main())
