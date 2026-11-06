import { defineConfig } from "@playwright/test";

export default defineConfig({
  // Concurrent browser windows would trigger the game's blur-to-pause behavior.
  workers: 1,
  testDir: "./tests",
  testMatch: process.env.FLAK_PERFORMANCE
    ? "performance.spec.ts"
    : "{browser,mobile}.spec.ts",
  outputDir: process.env.FLAK_PERFORMANCE
    ? "performance-results"
    : "test-results",
  projects: [
    { name: "chrome", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI,
  },
});
