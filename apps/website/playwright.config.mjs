import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:8787", browserName: "chromium" },
  webServer: {
    command: "bun run build && wrangler dev --ip 127.0.0.1 --port 8787",
    url: "http://127.0.0.1:8787",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
