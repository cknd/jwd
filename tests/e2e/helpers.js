const path = require("path");
const { expect } = require("@playwright/test");

const fakeEnvPath = path.resolve(__dirname, "fake-env.js");

async function bootFakeApp(page, options = {}) {
  await page.addInitScript((testOptions) => {
    window.JWD_TEST_OPTIONS = testOptions;
  }, options);
  await page.addInitScript({ path: fakeEnvPath });
  await page.addInitScript((preserveLocalStorage) => {
    if (preserveLocalStorage) {
      return;
    }
    try {
      window.localStorage.clear();
    } catch {
      // ignore storage clearing issues in non-standard contexts
    }
  }, options.preserveLocalStorage === true);

  await page.goto("/index.html");
  if (options.expectMapSurface !== false) {
    await expect(page.locator("#map .fake-map-surface")).toBeVisible();
  }
  if (options.expectSettingsDialogVisible) {
    await expect(page.locator("#settings-dialog")).toBeVisible();
  } else {
    await expect(page.locator("#settings-dialog")).not.toBeVisible();
  }
}

async function bootRealApp(page, googleMapsApiKey) {
  await page.addInitScript((apiKey) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem(
        "jwd.runtimeConfig.v1",
        JSON.stringify({
          googleMapsApiKey: apiKey,
        }),
      );
    } catch {
      // ignore storage setup issues in non-standard contexts
    }
  }, googleMapsApiKey);

  await page.goto("/index.html");
}

async function uploadBoardJson(page, state) {
  await page.getByRole("button", { name: "Load…" }).click();
  await page.locator("#load-json-file-input").setInputFiles({
    name: "board.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state, null, 2)),
  });
}

async function dragOverBoardJson(page, state = {}) {
  const payload = JSON.stringify(state, null, 2);
  await page.evaluate((jsonText) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([jsonText], "board.json", { type: "application/json" }));
    document.dispatchEvent(new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
  }, payload);
}

async function dropBoardJson(page, state) {
  const payload = JSON.stringify(state, null, 2);
  await page.evaluate((jsonText) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([jsonText], "board.json", { type: "application/json" }));
    document.dispatchEvent(new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
    document.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
  }, payload);
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

async function importBoardJson(page, state) {
  await page.getByRole("button", { name: "Load…" }).click();
  await page.locator("#load-json-input").fill(JSON.stringify(state, null, 2));
  await page.locator("#import-load-json-button").click();
}

module.exports = {
  bootFakeApp,
  bootRealApp,
  addLocation,
  addFixedPoi,
  addDynamicPoi,
  dragOverBoardJson,
  importBoardJson,
  uploadBoardJson,
  dropBoardJson,
};
