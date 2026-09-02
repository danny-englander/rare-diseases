# Rare Disease Index (prototype)

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
| `en_product9_ages.xml` (natural history) | Type of inheritance (can be more than one per disease) |
| `en_product9_prev.xml` (epidemiology) | Prevalence estimates |
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
muscle disease with myasthenia gravis (206575), and Myasthenia gravis (589).
Add more codes there as needed.

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

## Design

A custom daisyUI theme (not a default preset) — warm paper background,
muted teal primary, Source Serif 4 for headings + Inter for UI. See
`src/styles/global.css` for the token values.

## Known gotcha already fixed

Astro/Vite's bundler broke a dynamic `import("/pagefind/pagefind.js")`
call with a `__VITE_PRELOAD__` reference error. Fixed by marking that
`<script>` `is:inline` in `index.astro`, which tells Astro to leave it
completely unprocessed (plain JS, no TypeScript in that block as a
result). If you add more logic there, keep it framework-free JS.

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
- Collapse the facet sidebar into a `<details>`/drawer on mobile — right
  now it's always expanded, which pushes results down on small screens
- Cite Orphadata per their citation guidelines if this goes further
  ("Orphadata: Free access data from Orphanet. © INSERM 1999. Available
  on https://www.orphadata.com. Data version [XML data version].")
