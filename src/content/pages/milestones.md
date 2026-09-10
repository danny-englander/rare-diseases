---
title: Milestones
description: What's shipped in Rare Zebra, and what's planned next.
---

This page tracks where the project stands and what's coming next. It's a
static list for now; the plan is to wire it up to this project's
[GitHub Issues](https://github.com/danny-englander/rare-zebra/issues)
so it reflects real, open work automatically instead of a hand-maintained
list.

## Shipped

- Faceted search across body system, inheritance pattern, age of onset,
  and rarity class, with symptom matching in free-text search
- Real-time search and filtering powered by Pagefind, with no backend
- Light and dark themes, with an automated accessibility test suite
  (axe-core + Playwright) checked in CI
- About, Privacy Policy, Contact, and Milestones pages
- A Netlify Forms-backed contact form
- A modern SVG zebra logo, replacing the original hexagon mark

## Planned

- **Expand disease coverage toward the full Orphadata catalogue.** The
  site currently covers a sample of 921 of the real 10,101 diseases in
  Orphadata's dataset.
- **Broader body-system coverage** by pulling in more classifications
  than the current sample covers.
- **Typo-tolerant search**, so a misspelled disease or symptom name still
  finds a match.
- **Symptom (phenotype) filtering** as an additional search facet.
- **Live GitHub Issues integration for this page**, so it reflects real
  open work automatically instead of this static list.

Have an idea, or want to see something added? [Get in touch](/contact/).
