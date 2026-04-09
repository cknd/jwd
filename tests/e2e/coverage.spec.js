const path = require("path");
const { test, expect } = require("@playwright/test");
const { addDynamicPoi, addFixedPoi, addLocation, bootFakeApp, importBoardJson } = require("./helpers");
const {
  buildCoverageReport,
  summarizeCSSCoverage,
  summarizeJSCoverage,
  writeCoverageReport,
} = require("./coverage-utils");

test("collect rough browser execution coverage for the main app flows", async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== "chromium", "Playwright browser coverage is only supported in Chromium.");

  await page.coverage.startJSCoverage({
    resetOnNavigation: false,
    reportAnonymousScripts: false,
  });
  await page.coverage.startCSSCoverage({
    resetOnNavigation: false,
  });

  await bootFakeApp(page);

  await addLocation(page, "Karl-Liebknecht-Str. 1", "Home Base");
  await addLocation(page, "Rosa-Luxemburg-Straße 1");
  await addFixedPoi(page, "Berlin Hauptbahnhof", "Office");
  await addDynamicPoi(page, "coffee", 2);

  await page.locator("#mode-select").selectOption("DRIVING");
  await page.locator("#preset-select").selectOption({ index: 1 });
  await page.locator("#direction-toggle").click();

  await page.getByRole("button", { name: "Share" }).click();
  const exported = JSON.parse(await page.locator("#share-json-output").inputValue());
  await page.getByRole("button", { name: "Close" }).click();

  await importBoardJson(page, {
    ...exported,
    selectedMode: "WALKING",
    selectedDirection: "HOME_TO_DESTINATIONS",
    view: "GRAPH",
  });

  await page.locator('[data-request-delete-kind="destination"]').first().click();
  await page.locator('[data-confirm-delete-kind="destination"]').first().click();

  await page.getByRole("button", { name: "Add Candidate Location" }).click();
  await page.getByRole("button", { name: "Select on map" }).click();
  await page.locator("#map").click({ position: { x: 220, y: 150 } });
  await page.getByRole("button", { name: "Confirm Location" }).click();

  await page.goto("/tests/index.html");
  await expect(page.locator("#results")).toContainText("tests passed.");

  const [jsCoverage, cssCoverage] = await Promise.all([
    page.coverage.stopJSCoverage(),
    page.coverage.stopCSSCoverage(),
  ]);

  const origin = testInfo.project.use.baseURL || "http://127.0.0.1:8000";
  const repoRoot = process.cwd();
  const report = buildCoverageReport({
    jsSummary: await summarizeJSCoverage(jsCoverage, origin, repoRoot),
    cssSummary: await summarizeCSSCoverage(cssCoverage, origin, repoRoot),
  });

  const outputDir = path.resolve(process.cwd(), "test-results", "coverage");
  await writeCoverageReport(report, outputDir);

  expect(report.overall.totalBytes).toBeGreaterThan(0);
});
