// Real data, fetched from Orphadata (free, no API key — see README) via
// `npm run fetch-data`, which runs scripts/fetch-orphadata.mjs and writes
// diseases.generated.json. Don't hand-edit the generated file; re-run the
// script instead (e.g. after changing which classifications/caps it pulls).
//
// Orphadata's free bulk products don't include prose definitions, so
// `note` is a short factual line built from real structured data rather
// than an invented medical description — see buildNote() in the script.
//
// `inheritance` is an array because a disease can have more than one
// documented inheritance pattern (e.g. some cases autosomal dominant,
// others sporadic) — each is its own facet value, not one composite string.

import generated from "./diseases.generated.json";

export interface Disease {
  slug: string;
  name: string;
  synonyms: string[];
  orphaCode: string;
  system: string;
  inheritance: string[];
  prevalence: string;
  note: string;
  symptoms: string[];
}

export const diseases: Disease[] = generated as Disease[];

export const systems: string[] = Array.from(new Set(diseases.map((d) => d.system))).sort();

export const inheritancePatterns: string[] = Array.from(
  new Set(diseases.flatMap((d) => d.inheritance))
).sort();
