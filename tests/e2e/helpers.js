const path = require("path");
const { expect } = require("@playwright/test");

const fakeEnvPath = path.resolve(__dirname, "fake-env.js");

async function bootFakeApp(page) {
  await page.addInitScript({ path: fakeEnvPath });
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {
      // ignore storage clearing issues in non-standard contexts
    }
  });

  await page.goto("/index.html");
  await expect(page.locator("#map .fake-map-surface")).toBeVisible();
  await expect(page.locator("#settings-dialog")).not.toBeVisible();
}

async function addLocation(page, query, customName = "") {
  await page.getByRole("button", { name: "Add Candidate Location" }).click();
  await page.locator("#composer-input").fill(query);
  if (customName) {
    await page.locator("#composer-name-input").fill(customName);
  }
  await page.locator("#composer-add-button").click();
}

async function addFixedPoi(page, query, customName = "") {
  await page.getByRole("button", { name: "Add Point of Interest" }).click();
  await expect(page.locator("#composer-kind-select")).toHaveValue("FIXED");
  await page.locator("#composer-input").fill(query);
  if (customName) {
    await page.locator("#composer-name-input").fill(customName);
  }
  await page.locator("#composer-add-button").click();
}

async function addDynamicPoi(page, query, count = 3, customName = "") {
  await page.getByRole("button", { name: "Add Point of Interest" }).click();
  await page.locator("#composer-kind-select").selectOption("DYNAMIC");
  await page.locator("#composer-input").fill(query);
  await page.locator("#composer-count-input").fill(String(count));
  if (customName) {
    await page.locator("#composer-name-input").fill(customName);
  }
  await page.locator("#composer-add-button").click();
}

module.exports = {
  bootFakeApp,
  addLocation,
  addFixedPoi,
  addDynamicPoi,
};
