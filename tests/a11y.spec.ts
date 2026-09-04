import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// One representative detail page alongside the search page — the detail
// template is shared across every disease, so one instance exercises the
// markup without scanning all ~920 generated pages.
const PAGES = ["/", "/diseases/rippling-muscle-disease/"];
const THEMES = ["reflib", "reflib-dark"] as const;

// Layout.astro applies `data-theme` from localStorage before first paint
// (see the inline script in src/layouts/Layout.astro), so setting it via
// addInitScript before navigation is enough to land on a given theme —
// no UI interaction with the theme toggle needed.
async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => {
    window.localStorage.setItem("theme", t);
  }, theme);
}

function formatViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .map((v) => {
      const targets = v.nodes.map((n) => `    - ${n.target.join(" ")}`).join("\n");
      return `[${v.impact}] ${v.id}: ${v.help}\n${targets}`;
    })
    .join("\n\n");
}

for (const path of PAGES) {
  for (const theme of THEMES) {
    test(`${path} has no WCAG 2.1 AA violations (${theme} theme)`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto(path);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      expect(results.violations.length, formatViolations(results.violations)).toBe(0);
    });
  }
}
