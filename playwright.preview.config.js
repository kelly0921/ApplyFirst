import { defineConfig } from "@playwright/test";
import config from "./playwright.config.js";

export default defineConfig({
  ...config,
  webServer: {
    ...config.webServer,
    command: "npm run preview -- --port 4178 --strictPort",
    reuseExistingServer: false,
  },
});
