const { defineConfig } = require("@playwright/test");
const slowMo = Number(process.env.PW_SLOW_MO || 0);
const maximized = process.env.PW_MAXIMIZED === "1";

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: maximized ? null : undefined,
    launchOptions: slowMo > 0 || maximized
      ? {
          ...(slowMo > 0 ? { slowMo } : {}),
          ...(maximized ? { args: ["--start-maximized"] } : {}),
        }
      : undefined,
  },
  webServer: {
    command: "python3 -m http.server 8000",
    url: "http://localhost:8000/index.html",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "firefox",
      use: {
        browserName: "firefox",
      },
    },
  ],
});
