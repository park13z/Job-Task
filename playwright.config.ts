import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  use: { baseURL: "http://127.0.0.1:4174", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npm run build && tsx tests/harness/server.ts 4174",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
