const { test, expect } = require("@playwright/test");

test("browser-native logic tests pass", async ({ page }) => {
  await page.goto("/tests/index.html");
  await expect(page.locator("#results")).toContainText("tests passed.");
  await expect(page.locator(".test-result.fail")).toHaveCount(0);
});
