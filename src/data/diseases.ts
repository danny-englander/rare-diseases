// Real data, fetched from Orphadata (free, no API key — see README) via
// `npm run fetch-data`, which runs scripts/fetch-orphadata.mjs and writes
// diseases.generated.json. Don't hand-edit the generated file; re-run the
// script instead (e.g. after changing which classifications/caps it pulls).
//
// Orphadata's free bulk products don't include prose definitions, so
// `note` is a short factual line built from real structured data rather
// than an invented medical description — see buildNote() in the script.
//
// `inheritance` and `ageOfOnset` are arrays because a disease can have
// more than one documented value (e.g. onset varies by case) — each is
// its own facet value, not one composite string.

import generated from "./diseases.generated.json";

export interface Disease {
  slug: string;
  name: string;
  synonyms: string[];
  orphaCode: string;
  system: string;
  inheritance: string[];
  ageOfOnset: string[];
  prevalence: string;
  rarity: string;
  note: string;
  symptoms: string[];
}

export const dataVersion: string = (generated as { dataVersion: string }).dataVersion;
export const diseases: Disease[] = (generated as { diseases: Disease[] }).diseases;

// Orders a facet's present values by a preferred reference order (e.g.
// chronological for age of onset, common-to-rare for rarity) instead of
// alphabetically, which would be meaningless for these fields. Anything
// present in the data but not in the reference list — shouldn't happen,
// but data changes — sorts alphabetically after the known values rather
// than silently disappearing.
function orderByReference(present: Set<string>, reference: string[]): string[] {
  const known = reference.filter((v) => present.has(v));
  const unknown = Array.from(present)
    .filter((v) => !reference.includes(v))
    .sort();
  return [...known, ...unknown];
}

export const systems: string[] = Array.from(new Set(diseases.map((d) => d.system))).sort();

export const inheritancePatterns: string[] = Array.from(
  new Set(diseases.flatMap((d) => d.inheritance))
).sort();

const AGE_OF_ONSET_ORDER = [
  "Antenatal",
  "Neonatal",
  "Infancy",
  "Childhood",
  "Adolescent",
  "Adult",
  "Elderly",
  "All ages",
  "No data available",
  "Not documented in Orphadata",
];
export const ageOfOnsetOptions: string[] = orderByReference(
  new Set(diseases.flatMap((d) => d.ageOfOnset)),
  AGE_OF_ONSET_ORDER
);

// Most common → rarest, matching Orphanet's own prevalence classes.
const RARITY_ORDER = [
  ">1 / 1000",
  "1-5 / 10 000",
  "6-9 / 10 000",
  "1-9 / 100 000",
  "1-9 / 1 000 000",
  "<1 / 1 000 000",
  "Unknown",
  "Not documented in Orphadata",
];
export const rarityOptions: string[] = orderByReference(
  new Set(diseases.map((d) => d.rarity)),
  RARITY_ORDER
);
