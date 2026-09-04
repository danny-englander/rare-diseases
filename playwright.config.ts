import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
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
