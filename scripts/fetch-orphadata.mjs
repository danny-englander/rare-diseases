// scripts/fetch-orphadata.mjs
//
// Downloads real Orphadata products (free, no API key — see README) and
// builds src/data/diseases.generated.json from them.
//
// Run manually with `npm run fetch-data` when you want to refresh the
// dataset (Orphadata itself only updates twice a year, so there's no need
// to run this on every build).
//
// Sources used:
//   - Classification files (product3_<id>.xml) — disease name, ORPHAcode,
//     and which body-system classification it belongs to
//   - product1 (JSON)                          — synonyms
//   - product9_ages.xml ("natural history")     — type of inheritance
//   - product9_prev.xml ("epidemiology")        — prevalence
//   - product4.xml ("phenotypes")               — HPO-coded clinical signs
//
// Orphadata's free bulk products do NOT include prose definitions/summaries
// — that text only exists on the Orphanet website. Rather than inventing
// medical description text, this script builds a short factual line from
// the structured data instead (see `buildNote` below).

import { XMLParser } from "fast-xml-parser";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = path.join(ROOT, ".orphadata-cache");
const OUT_FILE = path.join(ROOT, "src", "data", "diseases.generated.json");

// Real Orphanet classifications used as the "System" facet. Add/remove
// entries here to change which specialties are covered — the id is the
// product3_<id>.xml suffix from https://sciences.orphadata.com/classifications/
const CLASSIFICATIONS = [
  { id: "181", system: "Neurological diseases" },
  { id: "150", system: "Inborn errors of metabolism" },
  { id: "199", system: "Bone diseases" },
  { id: "195", system: "Immunological diseases" },
  { id: "187", system: "Skin diseases" },
];

// Cap per classification to keep the generated site a reasonable size.
// Raised from the original 15-per-category prototype cap to 200 for
// broader real coverage. Raise or remove this to pull full classifications
// (they range from ~300 to ~1,600 diseases each — see README).
const MAX_PER_CLASSIFICATION = 200;

// ORPHAcodes that are always included regardless of where they'd fall in
// the capped sample. The classification tree's document order isn't
// alphabetical or clinically meaningful, so a small-ish cap can easily
// miss a specific disease you actually want in the demo — pin it here
// instead of relying on luck.
const PINNED_CODES = new Set([
  "97238", // Rippling muscle disease
  "206575", // Rippling muscle disease with myasthenia gravis
  "589", // Myasthenia gravis
  "420492", // Adult-onset cervical dystonia, DYT23 type
]);

// ORPHAcodes pinned in from OUTSIDE the 5 classifications above — PINNED_CODES
// only rescues a disease that's already inside one of those files from being
// cut by the per-classification cap. These live under a different Orphanet
// specialty branch entirely, so their name + system come from product7
// ("linearisation", see README's "Next steps to consider"), which assigns
// every one of Orphadata's 10,101 diseases to exactly one canonical
// specialty, instead of fetching that whole (otherwise unused) classification
// just for one disease.
const EXTRA_PINNED_CODES = new Set([
  "289390", // Primary Sjögren disease (Rare systemic or rheumatologic disease)
]);

const BASE = "https://www.orphadata.com/data";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    [
      "ClassificationNode",
      "Synonym",
      "TypeOfInheritance",
      "Prevalence",
      "HPODisorderAssociation",
      "AverageAgeOfOnset",
    ].includes(name),
});

async function downloadToCache(url, filename) {
  await mkdir(CACHE_DIR, { recursive: true });
  const dest = path.join(CACHE_DIR, filename);
  try {
    await stat(dest);
    console.log(`[cache] ${filename}`);
    return dest;
  } catch {
    // not cached — fall through to download
  }
  console.log(`[download] ${url}`);
  await execFileAsync("curl", ["-sL", "-o", dest, url]);
  return dest;
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// --- Classification files: real disease names + ORPHAcodes + system ---

// A node is a real, named, searchable entity ("Disease", "Clinical group",
// "Clinical subtype", "Malformation syndrome", etc.) unless its own
// DisorderType is "Category" — Orphanet's label for a pure tree-organizing
// grouping with no diagnosable entity behind it. Crucially, a real entity
// can still have children (e.g. "Myasthenia gravis" has clinical subtypes
// listed beneath it) — so eligibility is a DisorderType check, not a
// leaf-position check. An earlier version of this script used "no
// children" as the inclusion rule, which silently excluded well-known
// diseases like Myasthenia gravis in favor of only their subtypes.
function collectEligibleDisorders(node, acc) {
  const d = node.Disorder;
  const typeName = d?.DisorderType?.Name?.["#text"] ?? d?.DisorderType?.Name;
  if (typeName && typeName !== "Category") {
    acc.push({ code: String(d.OrphaCode), name: d.Name?.["#text"] ?? d.Name });
  }
  const childList = node.ClassificationNodeChildList;
  const children = childList?.ClassificationNode ?? [];
  for (const child of children) collectEligibleDisorders(child, acc);
}

// Round-robins across a classification's top-level branches so a capped
// sample covers a spread of sub-areas instead of exhausting the first
// branch depth-first (e.g. every Charcot-Marie-Tooth subtype before
// anything else in "Neurological diseases").
function sampleAcrossBranches(root, limit) {
  const childList = root.ClassificationNodeChildList;
  const branches = childList?.ClassificationNode ?? [];
  if (branches.length === 0) {
    const solo = [];
    collectEligibleDisorders(root, solo);
    return solo.slice(0, limit);
  }

  const perBranch = branches.map((branch) => {
    const eligible = [];
    collectEligibleDisorders(branch, eligible);
    return eligible;
  });

  const result = [];
  let round = 0;
  while (result.length < limit && perBranch.some((b) => round < b.length)) {
    for (const branch of perBranch) {
      if (result.length >= limit) break;
      if (branch[round]) result.push(branch[round]);
    }
    round += 1;
  }
  return result;
}

async function loadClassification({ id, system }) {
  const filename = `en_product3_${id}.xml`;
  const filePath = await downloadToCache(`${BASE}/xml/${filename}`, filename);
  const xml = await readFile(filePath, "utf-8");
  const data = parser.parse(xml);
  const classification = data.JDBOR.ClassificationList.Classification;
  const roots = classification.ClassificationNodeRootList.ClassificationNode;

  // Full walk (cheap — tree's already in memory) so pinned diseases are
  // found regardless of where they'd fall in the capped sample.
  const allEligible = [];
  for (const root of roots) collectEligibleDisorders(root, allEligible);
  const pinned = allEligible.filter((d) => PINNED_CODES.has(d.code));
  const pinnedCodes = new Set(pinned.map((d) => d.code));

  const remainingBudget = Math.max(0, MAX_PER_CLASSIFICATION - pinned.length);
  const sampled = [];
  for (const root of roots) {
    if (sampled.length >= remainingBudget) break;
    sampled.push(...sampleAcrossBranches(root, remainingBudget - sampled.length));
  }

  const combined = [...pinned, ...sampled.filter((d) => !pinnedCodes.has(d.code))];
  return combined.map((d) => ({ ...d, system }));
}

// --- product7.xml ("linearisation"): name + canonical specialty for
// EXTRA_PINNED_CODES diseases, which live outside the 5 classifications
// fetched above ---

async function loadExtraPinnedDisorders() {
  if (EXTRA_PINNED_CODES.size === 0) return [];

  const filePath = await downloadToCache(`${BASE}/xml/en_product7.xml`, "en_product7.xml");
  const xml = await readFile(filePath, "utf-8");
  const data = parser.parse(xml);
  const disorders = data.JDBOR.DisorderList.Disorder;

  const result = [];
  for (const d of disorders) {
    const code = String(d.OrphaCode);
    if (!EXTRA_PINNED_CODES.has(code)) continue;

    const associations = d.DisorderDisorderAssociationList?.DisorderDisorderAssociation;
    const association = Array.isArray(associations) ? associations[0] : associations;
    const system =
      association?.TargetDisorder?.Name?.["#text"] ??
      association?.TargetDisorder?.Name ??
      "Uncategorized";

    result.push({
      code,
      name: d.Name?.["#text"] ?? d.Name,
      system,
    });
  }
  return result;
}

// --- product1 (JSON): synonyms, keyed by OrphaCode ---

async function loadSynonyms() {
  const tarPath = await downloadToCache(
    "https://www.orphadata.com/data/json/en_product1.json.tar.gz",
    "en_product1.json.tar.gz"
  );
  const jsonPath = path.join(CACHE_DIR, "en_product1.json");
  try {
    await stat(jsonPath);
  } catch {
    await execFileAsync("tar", ["-xzf", tarPath, "-C", CACHE_DIR]);
  }
  const raw = await readFile(jsonPath, "utf-8");
  const data = JSON.parse(raw);
  const disorders = data.JDBOR[0].DisorderList[0].Disorder;

  const map = new Map();
  for (const d of disorders) {
    const synonyms = (d.SynonymList?.[0]?.Synonym ?? []).map((s) => s.label);
    map.set(String(d.OrphaCode), synonyms);
  }
  return map;
}

// --- product9_ages.xml ("natural history"): type of inheritance AND
// average age of onset both live in this one file — parse it once and
// return both maps rather than reading the 6.7MB file twice.

async function loadNaturalHistory() {
  const filePath = await downloadToCache(`${BASE}/xml/en_product9_ages.xml`, "en_product9_ages.xml");
  const xml = await readFile(filePath, "utf-8");
  const data = parser.parse(xml);
  const disorders = data.JDBOR.DisorderList.Disorder;

  const inheritanceByCode = new Map();
  const ageOfOnsetByCode = new Map();
  for (const d of disorders) {
    const code = String(d.OrphaCode);
    const types = (d.TypeOfInheritanceList?.TypeOfInheritance ?? []).map(
      (t) => t.Name?.["#text"] ?? t.Name
    );
    if (types.length > 0) inheritanceByCode.set(code, types);

    const onsets = (d.AverageAgeOfOnsetList?.AverageAgeOfOnset ?? []).map(
      (a) => a.Name?.["#text"] ?? a.Name
    );
    if (onsets.length > 0) ageOfOnsetByCode.set(code, onsets);
  }
  return { inheritanceByCode, ageOfOnsetByCode };
}

// --- product9_prev.xml: prevalence, keyed by OrphaCode ---

async function loadPrevalence() {
  const filePath = await downloadToCache(`${BASE}/xml/en_product9_prev.xml`, "en_product9_prev.xml");
  const xml = await readFile(filePath, "utf-8");
  const data = parser.parse(xml);
  const disorders = data.JDBOR.DisorderList.Disorder;

  const prevalenceByCode = new Map();
  const rarityByCode = new Map();
  for (const d of disorders) {
    const entries = d.PrevalenceList?.Prevalence ?? [];
    // Prefer a validated, worldwide, class-based estimate; fall back to
    // any entry that has a readable class label.
    const ranked = entries
      .filter((p) => p.PrevalenceClass?.Name)
      .sort((a, b) => {
        const score = (p) =>
          (p.PrevalenceGeographic?.Name === "Worldwide" ? 2 : 0) +
          (p.PrevalenceValidationStatus?.Name === "Validated" ? 1 : 0);
        return score(b) - score(a);
      });
    if (ranked.length > 0) {
      const p = ranked[0];
      const cls = p.PrevalenceClass.Name?.["#text"] ?? p.PrevalenceClass.Name;
      const geo = p.PrevalenceGeographic?.Name?.["#text"] ?? p.PrevalenceGeographic?.Name;
      const code = String(d.OrphaCode);
      prevalenceByCode.set(code, geo ? `${cls} (${geo})` : cls);
      rarityByCode.set(code, cls);
    }
  }
  return { prevalenceByCode, rarityByCode };
}

// --- product4.xml: HPO-coded clinical signs, keyed by OrphaCode ---

const FREQUENCY_RANK = {
  "Very frequent (99-80%)": 0,
  "Frequent (79-30%)": 1,
  "Occasional (29-5%)": 2,
};

async function loadSymptoms(neededCodes) {
  const filePath = await downloadToCache(`${BASE}/xml/en_product4.xml`, "en_product4.xml");
  const xml = await readFile(filePath, "utf-8");
  const data = parser.parse(xml);
  const statuses = data.JDBOR.HPODisorderSetStatusList.HPODisorderSetStatus;

  const map = new Map();
  for (const status of statuses) {
    const d = status.Disorder;
    const code = String(d.OrphaCode);
    if (!neededCodes.has(code)) continue; // skip parsing work for diseases we didn't select

    const assoc = d.HPODisorderAssociationList?.HPODisorderAssociation ?? [];
    const seenTerms = new Set();
    const terms = assoc
      .map((a) => ({
        term: a.HPO?.HPOTerm,
        freqName: a.HPOFrequency?.Name?.["#text"] ?? a.HPOFrequency?.Name,
      }))
      .filter((t) => t.term && t.freqName in FREQUENCY_RANK)
      .sort((a, b) => FREQUENCY_RANK[a.freqName] - FREQUENCY_RANK[b.freqName])
      .filter((t) => {
        if (seenTerms.has(t.term)) return false;
        seenTerms.add(t.term);
        return true;
      })
      .slice(0, 6)
      .map((t) => t.term);

    if (terms.length > 0) map.set(code, terms);
  }
  return map;
}

function buildNote(system, code) {
  // Orphadata's free bulk products don't include prose definitions, so
  // this is a short factual line built from real structured data rather
  // than invented medical description text.
  return `ORPHA:${code} is classified under "${system}" in the Orphanet nomenclature.`;
}

// Pulls the JDBOR release date from one of the source files, for the CC
// BY 4.0 attribution shown on the site (see README's "Attribution" section
// and the footer in Layout.astro). All product files in a given Orphadata
// release share the same date, so any one of them is representative.
async function getDataVersion() {
  const filePath = path.join(CACHE_DIR, "en_product9_prev.xml");
  const head = (await readFile(filePath, "utf-8")).slice(0, 300);
  const match = head.match(/date="([^"]+)"/);
  return match ? match[1].split(" ")[0] : "unknown";
}

async function main() {
  console.log("Fetching classification files...");
  const classificationResults = await Promise.all(CLASSIFICATIONS.map(loadClassification));

  console.log("Fetching extra pinned disorders outside the 5 classifications (product7)...");
  const extraPinned = await loadExtraPinnedDisorders();

  console.log("Fetching synonyms (product1)...");
  const synonymsByCode = await loadSynonyms();

  console.log("Fetching inheritance + age of onset (product9_ages)...");
  const { inheritanceByCode, ageOfOnsetByCode } = await loadNaturalHistory();

  console.log("Fetching prevalence + rarity (product9_prev)...");
  const { prevalenceByCode, rarityByCode } = await loadPrevalence();

  // De-duplicate by OrphaCode across classifications (a disease can be
  // cross-listed in more than one), keeping the first assignment.
  const seen = new Set();
  const usedSlugs = new Set();
  const merged = [];
  for (const list of [...classificationResults, extraPinned]) {
    for (const { code, name, system } of list) {
      if (seen.has(code)) continue;
      seen.add(code);

      let slug = slugify(name);
      if (usedSlugs.has(slug)) slug = `${slug}-${code}`;
      usedSlugs.add(slug);

      merged.push({ code, name, system, slug });
    }
  }

  console.log(`Fetching symptoms (product4) for ${merged.length} selected diseases...`);
  const neededCodes = new Set(merged.map((d) => d.code));
  const symptomsByCode = await loadSymptoms(neededCodes);

  const dataVersion = await getDataVersion();

  const diseases = merged.map(({ code, name, system, slug }) => ({
    slug,
    name,
    synonyms: synonymsByCode.get(code) ?? [],
    orphaCode: `ORPHA:${code}`,
    system,
    inheritance: inheritanceByCode.get(code) ?? ["Not documented in Orphadata"],
    ageOfOnset: ageOfOnsetByCode.get(code) ?? ["Not documented in Orphadata"],
    prevalence: prevalenceByCode.get(code) ?? "Not documented in Orphadata",
    rarity: rarityByCode.get(code) ?? "Not documented in Orphadata",
    note: buildNote(system, code),
    symptoms: symptomsByCode.get(code) ?? [],
  }));

  const output = { dataVersion, diseases };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${diseases.length} diseases (Orphadata release ${dataVersion}) to ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
