# Rare Disease Index (prototype)

[![CI](https://github.com/danny-englander/rare-diseases/actions/workflows/ci.yml/badge.svg)](https://github.com/danny-englander/rare-diseases/actions/workflows/ci.yml)

A fast, static search tool for rare diseases — Astro + Tailwind 4 + daisyUI +
Pagefind, with real-time faceted filtering, real data from Orphadata, and no
backend.

## Stack

- **Astro** (static output) — every disease gets its own pre-rendered page
- **Tailwind 4** via `@tailwindcss/vite`
- **daisyUI 5** — custom "reflib" light/dark theme (see `src/styles/global.css`)
- **Pagefind** — indexes the built HTML after `astro build`; a plain-JS
  script in `src/pages/index.astro` calls Pagefind's JS API directly for
  instant search + facet counts (no Choices.js, no PagefindUI widget)
- **theme-change** — small helper for the dark mode toggle, persists to
  `localStorage`

## The data is real

`src/data/diseases.generated.json` is built by `scripts/fetch-orphadata.mjs`,
which downloads real Orphadata products (free, no API key — see
[orphadata.com](https://www.orphadata.com/)) and cross-references them by
ORPHAcode:

| Source file | What it provides |
|---|---|
| `en_product3_<id>.xml` (classifications) | Real disease names + ORPHAcodes, grouped by body-system classification |
| `en_product1.json` (alignments) | Synonyms |
| `en_product9_ages.xml` (natural history) | Type of inheritance + average age of onset (both live in this one file; parsed together) |
| `en_product9_prev.xml` (epidemiology) | Prevalence estimates + rarity class |
| `en_product4.xml` (phenotypes) | HPO-coded clinical signs, filtered to "Very frequent" / "Frequent" / "Occasional" |

**One honest gap:** Orphadata's free bulk products don't include prose
definitions — that text only lives on the Orphanet website. Rather than
inventing medical description text, each disease's `note` field is a short
factual line built from the real structured data instead
(`ORPHA:<code> is classified under "<system>"...`).

**Eligibility is based on `DisorderType`, not tree position.** An earlier
version of this script only included "leaf" nodes (no children) in the
classification tree, on the assumption that a node with children was just
an organizational category. That assumption was wrong: real, well-known
diseases can have clinical subtypes listed beneath them in the tree while
still being a named, diagnosable entity in their own right — Myasthenia
gravis is a concrete example (it has 3 subtypes as children, so the
leaf-only rule silently excluded it in favor of only its subtypes). The
script now includes any node whose own `DisorderType` isn't `"Category"`
(Orphanet's label for a pure organizational grouping), regardless of
whether it has children.

**Pinning specific diseases.** The classification tree's document order
isn't alphabetical or clinically meaningful, so a capped sample can easily
miss a specific disease you want included. `PINNED_CODES` in
`fetch-orphadata.mjs` is a set of ORPHAcodes that are always pulled in
regardless of the cap — currently Rippling muscle disease (97238), Rippling
muscle disease with myasthenia gravis (206575), Myasthenia gravis (589), and
Adult-onset cervical dystonia, DYT23 type (420492). Add more codes there as
needed.

To refresh the dataset (Orphadata itself only updates twice a year, so this
doesn't need to run often):

```sh
npm run fetch-data
```

This caches downloaded files in `.orphadata-cache/` (gitignored) so re-runs
after a script change don't re-download tens of MB. Delete that folder to
force a fresh pull. Which classifications are included, and how many
diseases per classification, are configured at the top of
`scripts/fetch-orphadata.mjs` (`CLASSIFICATIONS`, `MAX_PER_CLASSIFICATION`)
— currently capped at 200 per classification (~920 diseases total across the
5 classifications in use) as a middle ground between the original 73-disease
prototype sample and Orphadata's full 10,101-disease catalogue (see "Next
steps" below for pulling everything).

**No API key needed.** Orphadata's live REST API is request-access only
(their FAQ says to contact them), but the bulk XML/JSON files used here are
freely downloadable under CC BY 4.0 with a plain HTTP GET.

## The prototype says so, on the page

Because the dataset is a sample (920 of 10,101 real diseases), the search
page itself says so — a short note under the intro states the sample size
against the real total, and a missing search result explains that the gap
reflects the sample, not whether the disease is real. This matters more
here than on a typical demo: someone searching for a health condition and
getting zero results could otherwise reasonably read that as "this isn't
real," which isn't a message worth risking even in a prototype.

## Five facets, not two

Body system and inheritance pattern were the original two. Two more were
added later, both from data that was already being pulled but sitting
unused:

- **Typical age of onset** — Antenatal / Neonatal / Infancy / Childhood /
  Adolescent / Adult / Elderly / All ages, from the same `product9_ages.xml`
  file inheritance already comes from. Ordered chronologically, not
  alphabetically — `orderByReference()` in `diseases.ts` handles this
  generically for any facet that needs a meaningful (non-alphabetical) order.
- **Rarity class** — Orphanet's own prevalence-class buckets (`>1/1,000`
  down to `<1/1,000,000`), ordered most-common-to-rarest, same mechanism.

Both are wired the same way the original two are: multi-value Pagefind
filter tags on the detail page (`data-pagefind-filter="AgeOfOnset:..."` /
`"Rarity:..."`), generic checkbox handling in `index.astro` (no per-facet
JS needed — `getActiveFilters()` reads any `[data-facet-group]` element),
and the same dev-mode fallback filtering for `npm run dev`.

A fifth candidate — **associated gene** — was considered but not built.
The data exists (`en_product6.xml`, real gene symbols like `KIF7` with
association type), but it's a poor fit for a checkbox facet since most
diseases map to just one or two genes; it'd be a search/display field
rather than a filter.

## Pagination: "Show more," not infinite scroll or numbered pages

With the dataset capped in the hundreds per facet, hundreds of results can
come back from a single search. Infinite scroll was considered and
rejected — it loses any sense of how much more there is, breaks the
footer, and loses scroll position on back-navigation, all of which matter
more on a search tool than a passive feed. Numbered pages were also
rejected — clicking to page 2 would fight the instant, live-updating feel
of everything else on the page.

Instead: 20 results render at a time, with a "Show 20 more (N left)"
button underneath that extends the visible slice without re-running the
search. `visibleCount` resets to 20 whenever the query or any facet
changes — the logic lives in `renderPage()` in `index.astro`, separated
from `runSearch()` (which computes the full match set once per
query/facet change; `renderPage()` just decides how much of it to show).

## Attribution (CC BY 4.0)

Orphadata's data is licensed CC BY 4.0, which requires attribution, not
just a mention in this README. The site's footer (in `Layout.astro`, so
it's on every page) carries Orphadata's own citation format, with the
release date pulled dynamically from the source XML rather than
hardcoded:

> Orphadata: Free access data from Orphanet. https://www.orphadata.com.
> Data release 2026-06-23. Licensed CC BY 4.0 — this site's code is a
> separate, independently built interface over that data, not an Orphanet
> product.

If you fork this and publish it, add a `LICENSE` file for the *code*
(MIT is the common default) — that's a separate concern from the data's
CC BY 4.0 terms, and worth being explicit that they're different.

## Running it

```sh
npm install
npm run fetch-data  # optional — a generated dataset is already checked in
npm run dev         # http://localhost:4321 — search falls back to an
                     # in-memory demo search here, since Pagefind's index
                     # only exists after a build (see note below)

npm run build        # astro build && pagefind --site dist
npm run preview      # build + serve the real thing at http://localhost:4321
```

**Important:** Pagefind indexes the *built* HTML output, so real faceted
search with live counts only works after `npm run build` (or `npm run
preview`). Under `npm run dev`, the page detects that `/pagefind/pagefind.js`
doesn't exist yet and falls back to a simple client-side filter over the
generated dataset — good enough to develop against, but not representative
of real search relevance/ranking.

## Accessibility testing

```sh
npm run test:a11y
```

Runs [`tests/a11y.spec.ts`](tests/a11y.spec.ts) via Playwright +
`@axe-core/playwright`: an automated scan of the search page and one
representative disease detail page, in both the light and dark theme,
against WCAG 2.0/2.1 **A and AA** rules (not AAA — that tier's 7:1 contrast
requirement, vs. AA's 4.5:1, is generally treated as an aspirational
stretch goal rather than a blanket target). `playwright.config.ts` starts
(or reuses) the dev server automatically, so no separate setup is needed
beyond `npm install` and `npx playwright install chromium` once.

This only covers what axe can check automatically — real contrast ratios,
missing labels/alt text, ARIA misuse, and similar. It's not a substitute
for manual checks like keyboard navigation, screen reader testing, or
reduced-motion/zoom behavior.

**Currently green** (4/4). The suite initially caught a real issue: the
light theme's muted secondary text (result counts, per-result metadata,
footer, detail-page labels) used `text-base-content/60`, which resolves to
a 3.97:1 contrast ratio against the light theme's background — under the
4.5:1 AA minimum for normal-size text. Fixed by moving those to `/70`
(already used elsewhere for excerpt/intro text), which clears AA with
real margin (5.39:1). The dark theme had no violations under this rule
set to begin with.

## Design

A custom daisyUI theme (not a default preset) — warm paper background,
muted teal primary, Source Serif 4 for headings + Inter for UI. See
`src/styles/global.css` for the token values.

## Known gotchas already fixed

**Dynamic Pagefind import breaks under Astro/Vite's bundler.** A dynamic
`import("/pagefind/pagefind.js")` call failed with a `__VITE_PRELOAD__`
reference error. Fixed by marking that `<script>` `is:inline` in
`index.astro`, which tells Astro to leave it completely unprocessed
(plain JS, no TypeScript in that block as a result). If you add more
logic there, keep it framework-free JS.

**Whitespace between text and an inline element/expression can silently
collapse to nothing** when they're split across a line break in an Astro
template — hit this twice (the "Orphadata's{ORPHADATA_TOTAL}" disclaimer,
then the footer's two links). Both times the fix was the same: keep text
and the adjacent `{expression}` or `<a>` on the same source line rather
than relying on the newline-to-space collapsing every other whitespace
run gets. Worth checking for visually (not just in the template source)
any time inline text sits next to a tag or expression here.

## Next steps to consider

- Remove or raise `MAX_PER_CLASSIFICATION` to pull the full real dataset.
  A better foundation for "give me everything" than looping over
  classification files: `en_product7.xml` ("linearisation") is a single
  flat file that assigns all 10,101 diseases to exactly one canonical
  specialty each, out of 33 real specialties — no cross-listing dedup
  needed. Worth switching to for a full-dataset build; the current
  classification-file approach is better suited to a curated subset.
- Add more classifications to the `CLASSIFICATIONS` list in
  `fetch-orphadata.mjs` for broader body-system coverage
- If typo tolerance matters (patients often misspell disease/symptom
  names), consider swapping Pagefind for **Orama** — same zero-backend,
  free approach, but with real fuzzy/Levenshtein matching
- **Phenotype (symptom) filtering as a sixth facet.** The data already
  exists — `symptoms: string[]` on each `Disease`, sourced from
  `en_product4.xml` — but it's only used for free-text search matching
  today. Checked in the current 920-disease sample: 1,277 unique symptom
  terms, and 729 of those appear on exactly one disease — far too
  high-cardinality for a flat pill list like the other four facets. A
  version of this would need a searchable/typeahead facet (e.g. the top
  20–30 most-common terms as pills by default, with a search-within-facet
  input to reach the rest) rather than the "show all values" pattern the
  existing facets use.
- Cite Orphadata per their citation guidelines if this goes further
  ("Orphadata: Free access data from Orphanet. © INSERM 1999. Available
  on https://www.orphadata.com. Data version [XML data version].")
