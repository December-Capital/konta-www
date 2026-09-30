# konta-www, for developers

The technical notes that used to be the README. Marketing site and public documentation for [Konta](https://github.com/December-Capital/konta).

Separate from the product repository because it has a different deploy target, different
contributors (design and marketing, not only engineers), and a much faster release cadence.

## What is here

| Path | Serves |
| --- | --- |
| `index.html` | `konta.md` and `www.konta.md` |
| `e-factura/`, `fara-programator/`, `trecerea-de-la-1c/`, `parteneri/`, `transparenta/` | one topic each, reached from the header and the home page cards |
| `contact/index.html`, `contact/trimite.php` | the contact page and the handler its form posts to |
| `status/index.html` | `konta.md/status`, reachability of the app, checked from the visitor's browser (noindex) |
| `404.html` | served by `.htaccess` for any missing path, with a real 404 status (noindex) |
| `sitemap.xml`, `robots.txt` | for search engines; the sitemap lists the seven indexable pages |
| `assets/` | stylesheet, scripts, the three language catalogues, logo, fonts, `og.png` (the 1200x630 share image) |
| `tools/` | scripts that are run by hand, never served |

Every page repeats the same header and footer by hand. When the navigation changes, change it on
every page, and run `tools/check-catalogues.py`, which reads all of them.

No build step and no framework. Plain files, served from the repository root, so a change is a
commit and a deploy is a pull. Keep it that way until a page needs something a page cannot do.

## Search

Each indexable page carries its own title and description (both translated by `data-t`), a
canonical URL with a trailing slash, Open Graph and Twitter tags pointing at `assets/og.png`, and
JSON-LD: `Organization` and `WebSite` on the home page, `BreadcrumbList` on the others. One `h1`
per page. When a page is added, add it to `sitemap.xml` and to `SERVED` in `tools/package.py`.

Languages switch in the browser on the same URL, so search engines index the Romanian. There are
no `hreflang` alternates on purpose: `?lang=ru` serves the same HTML until the script runs.

## The contact form

`contact/trimite.php` mails the message to `mail@konta.md` through the host's own `mail()`, with
`Reply-To` set to the sender, so the file holds no secret. The subject reads
`[konta.md] <Name> from <Company> on <Topic>`; the body is multipart, a plain-text part and an HTML
part in Konta's mail layout (the same one as `/root/agent/konta_email_template.html` and the app's
invitation mail), with every typed value HTML-escaped. It refuses a post whose `Origin` is not
the host that served it, drops anything that fills the hidden `website` field, validates lengths
and the address, strips line breaks from everything that reaches a header, and accepts at most
five messages an hour from one IP (a file per hashed address in the system temp directory). With
JavaScript the page posts it in place (`assets/contact.js`); without, the handler redirects to
`/contact/#trimis` (or `#incomplet`, `#limitat`, `#eroare`) and CSS `:target` shows the message.

To try it locally with the mail captured to files instead of sent:

```bash
printf '#!/bin/sh\ncat > /tmp/mail-$(date +%%s%%N).eml\n' > /tmp/fake-sendmail && chmod +x /tmp/fake-sendmail
php -d sendmail_path=/tmp/fake-sendmail -S 127.0.0.1:8765
```

## Writing on this site

No long dashes anywhere, in any language: a comma, a colon, a full stop or a middle dot (`·`)
instead. Keep the sentences plain and specific, and keep every figure traceable to
`konta-rulebook`: the site says nothing about a rate or a law that the rulebook does not.

## Language

Romanian is the source language and lives in the HTML. Russian and English are fetched on demand
from `assets/ru.json` and `assets/en.json`, keyed by the `data-t` attributes in the markup, so a
Romanian visitor downloads no translation file at all and a crawler reads real text rather than an
empty shell. A key missing from a catalogue leaves the Romanian on screen, visible, rather than
silently wrong.

`?lang=ru` and `?lang=en` work as links. The chosen language is remembered per browser.

The header carries one round control per choice rather than a row of options, and each shows
the state you would get by pressing it: `RU` while you are reading Romanian, a sun while you
are in the dark. Language cycles ro to ru to en, so every language is at most two presses away.

```bash
python tools/check-catalogues.py   # every data-t key present in ru and en, nothing empty
```

Run it before every commit that touches copy. It also lists unused keys, which is how stale
strings get found.

## Theme

Light and dark, following the system by default and overridable from the header. The
choice is stored per browser and applied before first paint, so an explicit choice never flashes
the other theme. The logo swaps too: the aubergine in the mark disappears against a dark ground,
so `assets/logo-dark.png` is the same file with that colour lifted.

The control is one drawing, a sun that turns into a moon, after Skiper UI's second theme toggle
(skiper4); CSS picks its state from the same selectors as the colours, so no script draws it.
Pressing it sweeps the new theme across the page on a diagonal, after Skiper UI's polygon theme
transition from the top left (skiper26), through the View Transitions API. Browsers without it,
and visitors who ask for reduced motion, get the instant switch.

## Fonts

Literata for headings, IBM Plex Sans for everything else. Both cover Latin Extended and Cyrillic,
which is the actual constraint, Romanian needs `ș ț ă î â` and Russian needs the whole alphabet,
at parity, in the same two families.

They are **self-hosted**. The transparency section promises that no request from the visitor's
browser goes anywhere but `konta.md`, and a linked webfont would make that false. Regenerate with:

```bash
python tools/fetch-fonts.py        # rewrites assets/fonts.css and assets/fonts/
```

Greek and Vietnamese subsets are dropped; they are a third of the bytes and nothing uses them.

## Looking at it before it ships

```bash
python tools/shots.py     # renders eight variants to shots/ with headless Firefox
```

Both languages, both themes, desktop and phone, and the status page. Two bugs reached `main`
before this existed and neither was visible in the source: the theme control rendered both its
icons, because the `hidden` attribute does nothing to an SVG, and the hero comparison sized its
two label columns independently so the descriptions did not line up. Reading the code found
neither. Look at the pictures.

`shots/` is not committed.

## Deploying

This repository is not the website. It also holds this README and `tools/`, none of which should
ever be readable over HTTP. What is served is listed in `tools/package.py` (SERVED): `index.html`, `robots.txt`,
`.htaccess`, `status/` and `assets/`.

Those are copied into `../kontamd-deploy/`, which is its own git repository
(`systematiq-one/kontamd-deploy`) and is what Hostinger pulls. Nothing needs building, so what is
committed here is what is served there.

```bash
python tools/publish.py                        # package, commit, push - Hostinger pulls
python tools/publish.py "Fix the price note"   # with your own message
python tools/publish.py --dry-run              # package and show the diff, push nothing
```

The deploy folder is emptied and rewritten on every publish, so it mirrors this repository
instead of accumulating: a file deleted here disappears there. **Never edit anything in it**:
the next publish silently discards it. Its `.git` is the one thing preserved.

`tools/package.py` does the copy on its own if you want the folder without publishing, and takes
`--zip` for the file manager's upload-and-extract route.

### Two accounts, on purpose

This repository pushes over `gh-alex` as `AlexBraguta` (December-Capital); the deploy repository
pushes over `gh-system` as `systematiq-one`. The identity lives in each repository's own git
config rather than in `publish.py`, so a publish cannot be authored by the wrong person because
somebody passed the wrong flag. `publish.py` refuses to run if the deploy folder is not a git
repository pointing at the expected remote.

`.htaccess` is a dotfile and the file manager hides it by default, check it actually arrived,
because it carries the canonical redirect, the woff2 media type, and the cache headers.

**Caching is the thing that will waste an afternoon.** This host defaults css and js to a week,
so a visitor who has loaded the site once keeps the old stylesheet and script while getting the
new HTML, the page looks half-updated and nothing on the server is wrong. The `.htaccess` now
revalidates html, json, css and js on every visit, and the asset links carry `?v=2` to break the
copies cached before that rule existed. Bump that token only if long caching is ever
reintroduced; with revalidation it is not needed again.

`konta.md` is canonical and `www.konta.md` redirects to it.

Where the site sits relative to the app, and why the app is not served from this host, is in the
product repository: [`docs/architecture/deployment-topology.md`](https://github.com/December-Capital/konta/blob/main/docs/architecture/deployment-topology.md).

## What the site still has to do

Ordered by how much each one matters for the sale. Items 2 to 4 are on the page today.

1. **A published price list, in lei, per month.** Deliberately absent: the tiers in the plan are
   indicative and not decided, and a number that moves after launch costs more trust than no
   number costs interest. Publish it the day it is settled, it is still the strongest single
   thing this site could say.
2. ~~Romanian and Russian at parity, English third.~~ Done, hand-written, not machine translated.
3. ~~The migration promise, stated plainly.~~ On the page.
4. ~~The transparency page.~~ A section rather than a page, which is enough at this size. It does
   not yet state where customer data is hosted, because that is not decided, see the deployment
   topology. Say it the day it is true.
5. **The e-Factura landing page.** Today the mandate is a section on the home page. A company
   arriving because of the mandate deserves its own page to arrive at.
6. **Named references per regime**, quotable, with the accountant's permission.
7. **Public documentation and training material**, RO and RU, including the accountant
   certification programme.

## Constraints

- Fast on a 4G connection in a rural area. Static output, no client framework.
- Accessible: real contrast, keyboard navigation, visible focus, sensible headings.
- No third-party trackers, and no third-party requests at all. This is checkable by opening the
  network tab, which is the point.

## Licence

Proprietary content. © 2026 December Capital.
