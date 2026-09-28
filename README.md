# konta-www

Marketing site and public documentation for [Konta](https://github.com/December-Capital/konta).

Separate from the product repository because it has a different deploy target, different
contributors (design and marketing, not only engineers), and a much faster release cadence.

## What is here

| Path | Serves |
| --- | --- |
| `index.html` | `konta.md` and `www.konta.md` |
| `status/index.html` | `konta.md/status` — reachability of the app, checked from the visitor's browser |
| `assets/` | one stylesheet, two small scripts, the three language catalogues, the logo, the fonts |
| `tools/` | two scripts that are run by hand, never served |

No build step and no framework. Plain files, served from the repository root, so a change is a
commit and a deploy is a pull. Keep it that way until a page needs something a page cannot do.

## Language

Romanian is the source language and lives in the HTML. Russian and English are fetched on demand
from `assets/ru.json` and `assets/en.json`, keyed by the `data-t` attributes in the markup, so a
Romanian visitor downloads no translation file at all and a crawler reads real text rather than an
empty shell. A key missing from a catalogue leaves the Romanian on screen — visible, rather than
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

## Fonts

Literata for headings, IBM Plex Sans for everything else. Both cover Latin Extended and Cyrillic,
which is the actual constraint — Romanian needs `ș ț ă î â` and Russian needs the whole alphabet,
at parity, in the same two families.

They are **self-hosted**. The transparency section promises that no request from the visitor's
browser goes anywhere but `konta.md`, and a linked webfont would make that false. Regenerate with:

```bash
python tools/fetch-fonts.py        # rewrites assets/fonts.css and assets/fonts/
```

Greek and Vietnamese subsets are dropped; they are a third of the bytes and nothing uses them.

## Deploying

Hostinger's git integration serves this repository at the domain root. `konta.md` is canonical;
`www.konta.md` redirects to it. Nothing here needs building, so what is committed is what is
served.

Where the site sits relative to the app, and why the app is not served from this host, is in the
product repository: [`docs/architecture/deployment-topology.md`](https://github.com/December-Capital/konta/blob/main/docs/architecture/deployment-topology.md).

## What the site still has to do

Ordered by how much each one matters for the sale. Items 2 to 4 are on the page today.

1. **A published price list, in lei, per month.** Deliberately absent: the tiers in the plan are
   indicative and not decided, and a number that moves after launch costs more trust than no
   number costs interest. Publish it the day it is settled — it is still the strongest single
   thing this site could say.
2. ~~Romanian and Russian at parity, English third.~~ Done, hand-written, not machine translated.
3. ~~The migration promise, stated plainly.~~ On the page.
4. ~~The transparency page.~~ A section rather than a page, which is enough at this size. It does
   not yet state where customer data is hosted, because that is not decided — see the deployment
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

Proprietary content. © December Capital.
