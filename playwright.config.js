import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4178",
    browserName: "chromium",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  // No traces or automatic failure screenshots: tests may later handle private data.
  webServer: {
    command: "npm run dev -- --port 4178 --strictPort",
    url: "http://127.0.0.1:4178/resume-coach",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
