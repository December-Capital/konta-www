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
| `calendar/index.html` | the fiscal calendar's page: header, footer, filters and words only; its months, feeds and RSS are written from `konta-rulebook` when the site is packaged (see "The calendar"); header nav |
| `calculator-salariu/index.html` | the 2026 salary calculator: the form, the result and the words, with placeholders the package fills from `konta-rulebook` (see "The salary calculator"); footer |
| `ghid/index.html` | the guide for accountants: the e-Factura API user, opening balances from 1C, the first month, closing the month, the bank statement; each step true to `HANDOFF.md`; footer |
| `llms.txt` | a plain summary for language models: what Konta is, the pages, the public repositories, what works and what does not yet, matching the home page's "Ce funcționează azi" |
| `intrebari/index.html` | ten questions to put to any accounting software vendor, each with Konta's answer and where it stands (FAQPage JSON-LD); footer |
| `securitate/index.html` | security facts, each "done", "before the first pilot" or "later", who processes data, how to report a problem; footer |
| `privacy/index.html` | what the form collects, why, for how long, and the visitor's rights; linked from the form and every footer |
| `.well-known/security.txt` | where to report a security problem (RFC 9116); renew its `Expires` before 2027-10-14 |
| `status/index.html` | `konta.md/status`, reachability of the app, checked from the visitor's browser (noindex) |
| `404.html` | served by `.htaccess` for any missing path, with a real 404 status (noindex) |
| `sitemap.xml`, `robots.txt` | for search engines; the sitemap lists the thirteen indexable pages, and the package rewrites it with their `/ru/` and `/en/` copies |
| `assets/` | stylesheet, scripts, the three language catalogues, logo, fonts, `og.png` (the 1200x630 share image) |
| `tools/` | scripts that are run by hand, never served; `languages.py` writes the `/ru/` and `/en/` copies when the site is packaged, `fiscal_calendar.py` the calendar, `salary_calculator.py` the salary calculator's figures, after `test-salary.mjs` has run the payroll vectors |

Every page repeats the same header and footer by hand. When the navigation changes, change it on
every page, and run `tools/check-catalogues.py`, which reads all of them.

No build step and no framework. Plain files, served from the repository root, so a change is a
commit and a deploy is a pull. Keep it that way until a page needs something a page cannot do.

## Search

Each indexable page carries its own title and description (both translated by `data-t`), a
canonical URL with a trailing slash, Open Graph and Twitter tags pointing at `assets/og.png`, and
JSON-LD: `Organization`, `WebSite` and `SoftwareApplication` (BusinessApplication, Web, ro/ru/en) on the home page, `BreadcrumbList` on the others, and `FAQPage` on `intrebari/`, whose text must stay word for word the Romanian on the page. One `h1`
per page. When a page is added, add it to `sitemap.xml` and to `SERVED` in `tools/package.py`:
the sitemap is also the list of pages that get Russian and English copies.

Every page in the sitemap is indexable in all three languages, each at its own address:
`konta.md/e-factura/`, `konta.md/ru/e-factura/`, `konta.md/en/e-factura/`. The Russian and English
pages are written when the site is packaged (`tools/languages.py`, called by `tools/package.py`),
from the Romanian page and the catalogues, and are never committed. Each copy has:

- `lang` and `data-lang` on `<html>`, and every `data-t` text, `content` and `aria-label` in its
  language;
- its own canonical and `og:url`, `og:locale` (`ro_MD`, `ru_MD`, `en_US`) with the other two as
  `og:locale:alternate`, and the Open Graph and Twitter title and description in its language;
- `hreflang` alternates for `ro`, `ru`, `en` and `x-default` (the Romanian address), on the
  Romanian page too;
- JSON-LD in its language: breadcrumbs pointing at the copies, `FAQPage` word for word the
  translated page, the same rule as the Romanian;
- links to the other indexable pages in the same language, and `?lang=` on the ones without copies
  (the status page), which translate in place.

JSON-LD never carries `aggregateRating`, `review` or `offers`: Konta has no reviews and no
public prices, and the package refuses a page that tries. Take `offers` off `FORBIDDEN` in
`tools/languages.py` the day prices are published; a rating needs real reviews first. A
`description` in JSON-LD is translated like a `name`, so it must be a `data-t` text on the page.

The packaged `sitemap.xml` lists all thirty-nine addresses, each with its alternates. The package
refuses to write anything when a catalogue lacks a key a page uses, when JSON-LD carries a name or
text that is not on the page, or when a page's inline script is not the one whose hash the CSP
allows. `status/` and `404.html` have no copies: they are noindex.

## The calendar

`konta.md/calendar` shows, month by month from the reader's own month, the filing and payment
deadlines, the non-working days and the changes in the law, each with its act and article. None of
it is in this repository. `tools/fiscal_calendar.py`, called by `package.py` after the language
copies are written, runs `konta-rulebook`'s own gate (`tools/validate.mjs`) and its
`tools/calendar.mjs`, which expands `calendar/` into dated items (a deadline on a day off already
moved by the rule its act gives), and writes into the package:

- the months, the changes table and the feeds list into `calendar/index.html` and its `/ru/` and
  `/en/` copies, in each language's words: the page's own words are under `data-t` like any page,
  the generated part's in the hidden `data-cal-words` block, which the generator reads from each
  copy and removes;
- `calendar.ics` (everything) and `calendar/<profile>.ics` (one kind of taxpayer), RFC 5545,
  all-day events, a stable UID per deadline and period, under `/ru/` and `/en/` too;
- `calendar/schimbari.xml`, RSS 2.0 of the changes, with the value before and after.

The rulebook is `../konta-rulebook`, or `KONTA_RULEBOOK`. The page prints its commit, so a reader
can open the data it was built from; a rulebook with uncommitted calendar data refuses to package
unless `KONTA_CALENDAR_DIRTY=1` is set for a local look, and the page then says so. Publish only
from a pushed rulebook. Node 22 is needed at package time.

The page is the month: a grid across the content width, each day with its deadlines, days off and
laws as short labels (a busy day shows four and "încă N"), and under it every date of the month in
full with its acts. The package holds the months from three before the one it was built in to the
end of next year. `assets/calendar.js` shows one at a time, the reader's own month first, with
steps three months back and forward to the last. The month stays on top; under it go the entries
of the day clicked (the day, its number or one of its labels, whose entry is outlined) or, with
"Toată luna", of the whole month, as a grid of cards ("Grilă") or a list ("Listă"), copied from the
month's own list. An address naming a day (`#d-2026-10-26`, as the .ics events link) opens its
month and that day. It also filters by kind of taxpayer, from a small menu. The filter and the
grid-or-list choice are remembered in this browser only, in `localStorage`, and forgotten
silently where storage is refused. Without script the page is complete, every month in
order with its grid and its list. Local days off (a town's patron saint's day, from the
rulebook's `localDays`) are shown hatched and never move a deadline. On a phone the grid
shows the days with a dot where something is due. `assets/calendar.css` holds the page's look and
its print layout, the shown month's grid and then its list, with each act's address after its name. No Event JSON-LD: a filing deadline is not
an event anybody attends, and search engines' rules for events say so; the page carries the usual
BreadcrumbList.

To check it the way it is served: package to a scratch folder, serve it with `php -S` and a
router that sends the `.htaccess` headers, and drive it in headless Chromium in all three languages,
both themes, desktop and phone, with the CSP reports in view; parse the `.ics` with two
independent readers (Python `icalendar`, `ical.js`).

## The salary calculator

`konta.md/calculator-salariu` computes one month of 2026 from the gross salary: the medical
premium, the personal and dependant exemptions with the income ceiling, income tax, the net, the
employer's social contribution and cost. It is the product's payroll arithmetic
(`Konta.Domain.Payroll.PayrollArithmetic`, the cumulative method) written again in
`assets/salary.js` over BigInt bani and exact fractions, never a JS number for an amount. The month
it shows is January of a year paid the same salary every month, which is every month below the
ceiling; above it the personal exemption is not taken, and twelve such months make the product's
year.

No figure is in this repository. `tools/salary_calculator.py`, called by `package.py` after the
calendar:

- reads the payroll keys the product's `PayrollService` reads from `konta-rulebook`, resolved as
  its `InMemoryRulebook` does (publication order, then effective date), and refuses a year in which
  any of them changes, a rounding other than to the ban, or a value no longer "unverified" (the
  page says "în verificare");
- runs `node tools/test-salary.mjs` over `konta-rulebook/vectors/payroll-md-2026.json`, the file
  konta's `PayrollVectorsTests` runs the product's arithmetic over. One ban of difference on any
  month and nothing is packaged. `python tools/salary_calculator.py --check` runs it alone;
- writes the rules into the page's `<script type="application/json" id="salary-rules">` and fills
  the words' placeholders in each language: `{rate:cnam}`, `{amount:cap}`, `{act:<key>}` (the act
  and article the rulebook cites, in Romanian), `{out:net}` (SFS's worked example, from the
  vectors, shown before any script runs), `{count:cases}`, `{commit}`. A placeholder left unfilled
  stops the package.

The rulebook must be committed (`data/`, `vectors/`) or the package refuses, unless
`KONTA_RULEBOOK_DIRTY=1` is set for a local look. What it leaves out is on the page: one month
only, no major or spouse exemption, no other CNAS categories, no other income.

## The contact form

`contact/trimite.php` mails the message to `mail@konta.md` through the host's own `mail()`, with
`Reply-To` set to the sender. The subject reads
`[konta.md] <Name> from <Company> on <Topic>`; the body is multipart, a plain-text part and an HTML
part in Konta's mail layout (the same one as `/root/agent/konta_email_template.html` and the app's
invitation mail), with every typed value HTML-escaped. It refuses a post whose `Origin` is not exactly
`https://konta.md` (a missing one included), counts every attempt before sending and allows five
an hour from one IP, drops anything that fills the hidden `website` field, validates lengths and
the address, and strips line breaks from everything that reaches a header. With
JavaScript the page posts it in place (`assets/contact.js`); without, the handler redirects to
`/contact/#trimis` (or `#incomplet`, `#limitat`, `#eroare`) and CSS `:target` shows the message.

It keeps state in `konta-private/`, beside `public_html` rather than in it (on Hostinger,
`domains/konta.md/konta-private/`), so no URL reaches it and no publish overwrites it:

- `contact-throttle/`: one file per hashed address, created `0700` on first use, read and
  rewritten under `flock`. If it cannot be created the form refuses every message (and logs why),
  because an uncounted form is an unlimited relay into the inbox; the failure note gives the
  visitor `mail@konta.md`.
- `lead-key`: placed by hand, never in git. With it, each lead posted to
  `app.konta.md/api/v1/leads` carries `X-Konta-Lead-Timestamp`, `X-Konta-Lead-For` (the visitor's
  address) and `X-Konta-Lead-Signature`, the hex HMAC-SHA256 of `timestamp \n for \n body` under
  that key. A `KONTA_LEAD_KEY` environment variable takes precedence. With neither, leads go
  unsigned. The same key goes into the app's configuration.

To try it locally with the mail captured to files instead of sent:

```bash
printf '#!/bin/sh\ncat > /tmp/mail-$(date +%%s%%N).eml\n' > /tmp/fake-sendmail && chmod +x /tmp/fake-sendmail
php -d sendmail_path=/tmp/fake-sendmail -S 127.0.0.1:8765
```

Under the built-in server the page's own origin is accepted too, so the form works from
`http://127.0.0.1:8765/contact/`. The throttle lands in `konta-private/` beside the checkout.

## Writing on this site

No long dashes anywhere, in any language: a comma, a colon, a full stop or a middle dot (`·`)
instead. Keep the sentences plain and specific, and keep every figure traceable to
`konta-rulebook`: the site says nothing about a rate or a law that the rulebook does not.

Three places say where the product stands, each dated: the home page's "Ce funcționează azi",
`intrebari/` and `securitate/`. Each line there must match `HANDOFF.md` in the product
repository, with "will" for anything not built. When something lands or a plan changes, move the
line and change the date on all three, in all three languages.

## Language

Romanian is the source language and lives in the HTML. Russian and English live in
`assets/ru.json` and `assets/en.json`, keyed by the `data-t` attributes in the markup, and reach
the indexable pages as the static `/ru/` and `/en/` copies above. Write a page in Romanian only; its
copies follow from the catalogues at the next package. A `data-t` element holds text alone, no
markup, because the copies and `site.js` both replace its text whole.

The chosen language is remembered in the `konta_lang` cookie shared with app.konta.md (and the
older `konta.lang` in localStorage). The header's language control is a link to the next
language's copy of the same page, ro to ru to en, so every language is at most two presses away;
`site.js` writes the cookie on the click and the browser follows the link, which also works without
script. The inline script in every page's head reads the cookie before first paint: on an address
without `/ru/` or `/en/` it moves to the remembered language's copy (or the one `?lang=ru` or
`?lang=en` names, which old links use, without remembering it), keeping the fragment. An address
with `/ru/` or `/en/` is never moved: it was asked for. Crawlers carry no cookie and stay where
they are.

`status/` and `404.html` have no copies, so `site.js` translates them in place as every page used
to be: from `?lang=`, from a `/ru/` or `/en/` address the 404 page answers, or from the cookie,
fetching the catalogue on demand. A key missing from a catalogue leaves the Romanian on screen,
visible, rather than silently wrong.

The theme control shows the state you would get by pressing it, a sun while you are in the dark;
the language control shows the language you are reading.

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

`shots.py` renders the source pages. The `/ru/` and `/en/` copies, the redirect to the remembered
language and the headers exist only once packaged, so check those on a package: write one to a
scratch folder (`python tools/package.py /tmp/site`), serve it with `php -S` and a router that
sends the `Header always set` lines of `.htaccess` (without `upgrade-insecure-requests` on plain
http), and open it in a browser with the console's CSP reports in view.

## Deploying

This repository is not the website. It also holds this README and `tools/`, none of which should
ever be readable over HTTP. What is served is listed in `tools/package.py` (SERVED): `index.html`, `robots.txt`,
`.htaccess`, `.well-known/`, `status/`, `assets/` and one folder per page, plus the `ru/` and `en/`
copies, the sitemap and the calendar's months and feeds the package writes.

Those are copied into `../kontamd-deploy/`, which is its own git repository
(`systematiq-one/kontamd-deploy`) and is what Hostinger pulls. Nothing is built but the language copies
and the calendar, so what is committed here, plus those, is what is served there.

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
because it carries the canonical redirect, the woff2 media type, the cache headers and the
security headers (HSTS, Content-Security-Policy, Permissions-Policy). The CSP allows the one inline
script, the theme and the remembered language set before first paint, by its hash: change that
script on the pages and the hash in `.htaccess` has to change with it, or the theme flashes and
the remembered language is ignored. The command that prints it is in the comment above the
header, and `tools/package.py` refuses to package a page, copies included, whose inline script
the hash does not allow.

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
