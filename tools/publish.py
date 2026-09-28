"""Package the site and push it to the deploy repository, which Hostinger pulls.

Run from the repository root:
    python tools/publish.py                      # message names the source commit
    python tools/publish.py "Fix the price note" # your own message
    python tools/publish.py --dry-run            # package and show the diff, push nothing

The deploy repository holds only what belongs in public_html, so Hostinger can be pointed at it
without serving this repository's README, tools/ or .git. It is generated output: this script
empties it and rewrites it every time, so nothing may be edited there.

Identity is deliberately not set here. The deploy repository carries its own git config
(systematiq-one over the gh-system key), because it belongs to a different account from this one.
If a publish is ever authored by the wrong person, fix it with `git config user.name` in the
deploy repository rather than by passing anything through this script.
"""

import os
import subprocess
import sys

import package

EXPECTED_REMOTE = 'systematiq-one/kontamd-deploy'


def git(*args, **kwargs):
    return subprocess.run(['git'] + list(args), capture_output=True, text=True, **kwargs)


def here(*args):
    return git(*args).stdout.strip()


def main():
    argv = [a for a in sys.argv[1:] if a != '--dry-run']
    dry = '--dry-run' in sys.argv[1:]

    if not os.path.exists('index.html'):
        sys.exit('Run this from the konta-www repository root.')

    source = here('rev-parse', '--short', 'HEAD') or 'unknown'
    dirty = here('status', '--porcelain')

    out = os.path.abspath(package.DEFAULT)
    if not os.path.isdir(os.path.join(out, '.git')):
        sys.exit('%s is not a git repository. Clone the deploy repository there first.' % out)

    remote = git('-C', out, 'remote', 'get-url', 'origin').stdout.strip()
    if EXPECTED_REMOTE not in remote:
        sys.exit('%s points at %s, not %s.' % (out, remote or '(nothing)', EXPECTED_REMOTE))

    package.build(out)

    git('-C', out, 'add', '-A')
    staged = git('-C', out, 'diff', '--cached', '--stat').stdout.strip()

    if not staged:
        print('\nNothing changed. The deploy repository already matches this checkout.')
        return 0

    print('\n' + staged)

    if dirty:
        # Publishing from a dirty tree means the deployed files do not correspond to any commit,
        # and the message below would name the wrong one.
        print('\nThis checkout has uncommitted changes. The message will name %s, which is not\n'
              'what is being published. Commit here first, or accept that the trail is broken.'
              % source)

    if dry:
        print('\n--dry-run: nothing pushed. The packaged folder is left as it is.')
        return 0

    message = argv[0] if argv else 'Publish konta-www %s' % source
    body = 'Generated from konta-www %s by tools/publish.py. Do not edit this tree.' % source

    commit = git('-C', out, 'commit', '-m', message, '-m', body)
    if commit.returncode != 0:
        sys.exit(commit.stdout + commit.stderr)

    push = git('-C', out, 'push', 'origin', 'HEAD')
    if push.returncode != 0:
        sys.exit(push.stdout + push.stderr)

    print('\nPushed. Hostinger pulls from %s.' % EXPECTED_REMOTE)
    print(git('-C', out, 'log', '-1', '--format=%h %an: %s').stdout.strip())
    return 0


if __name__ == '__main__':
    # `python tools/publish.py` already puts tools/ on sys.path, which is how `import package`
    # above resolves. Running it any other way will not find it, and should not silently try.
    sys.exit(main())
