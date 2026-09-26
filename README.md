# konta-www

Marketing site and public documentation for [Konta](https://github.com/December-Capital/konta).

Separate from the product repository because it has a different deploy target, different
contributors (design and marketing, not only engineers), and a much faster release cadence.

## Status

Not built yet. Phase 1 alongside the first design partner, because the site should describe a
product that exists rather than one we intend.

## What it has to do

Ordered by how much each one matters for the sale.

1. **A published price list, in lei, per month.** The incumbent's real cost is opaque: a licence, a
   contractor, a support contract, a fee per legal change. Publishing a plain number is itself a
   competitive act in this market.
2. **Romanian and Russian at parity**, English third. Not an afterthought and not machine
   translated. A large share of Moldovan accountants work in Russian; shipping Romanian-only halves
   the market and reads as a political statement rather than a better tool.
3. **The migration promise, stated plainly.** Send us your 1C backup Monday, work in Konta
   Wednesday.
4. **The transparency page.** Links to the public [rulebook](https://github.com/December-Capital/konta-rulebook)
   and [e-Factura client](https://github.com/December-Capital/konta-efactura), the security posture,
   where data is hosted, and the one-click export guarantee. This is the answer to "how do we know
   there is nothing fishy in here", and it should be a real page, not a paragraph.
5. **Named references per regime**, quotable, with the accountant's permission.
6. **The e-Factura landing page** — the wedge. A company arriving because of the B2B mandate should
   find a page about the mandate, not a page about double-entry bookkeeping.
7. **Public documentation and training material**, RO and RU, including the accountant
   certification programme.
8. **Contact that reaches a human by phone.** This market does not run on chat widgets.

## Constraints

- Fast on a 4G connection in a rural area. Static output, no heavy client framework needed.
- Accessible: real contrast, keyboard navigation, sensible headings.
- No third-party trackers that would put visitor data somewhere we cannot account for. We are about
  to ask accountants to trust us with payroll data; the marketing site should not undermine that on
  day one.

## Stack

Undecided. Astro or plain Vite with static output are both fine. Pick when someone starts building,
and prefer whatever the person doing the design work is fastest in.

## Licence

Proprietary content. © December Capital.
