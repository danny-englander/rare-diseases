import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  // A brand-new dev server's very first real page load can trigger Vite
  // to discover and pre-bundle a dependency it hasn't optimized yet
  // (e.g. theme-change), which fires a full-page reload over the HMR
  // socket. If that lands while axe-core is mid-analysis, Playwright
  // sees "Execution context was destroyed" — a one-time cold-start
  // hiccup, not a real markup/contrast bug. Retrying in CI (where the
  // server always starts fresh) lets the retry hit an already-warmed
  // server instead of re-architecting the warm-up.
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:4321",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // `astro dev` on-the-fly renders every route (including the static
  // per-disease pages) without a full build, so it's the faster target
  // for a11y checks — search behavior differs from the built site (see
  // README), but that's irrelevant to markup/contrast/ARIA testing.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
