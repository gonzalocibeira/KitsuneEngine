import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/smoke",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: "npm run dev:tamamo",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 60_000
    },
    {
      command: "npm run dev:kuzunoha",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: true,
      timeout: 60_000
    }
  ]
});
