const { test, expect } = require("@playwright/test");
const {
  addDynamicPoi,
  addFixedPoi,
  addLocation,
  bootFakeApp,
  dragOverBoardJson,
  dropBoardJson,
  importBoardJson,
  uploadBoardJson,
} = require("./helpers");
const { installHeadedSceneBreaks } = require("./headed-scene-break");

installHeadedSceneBreaks(test);

test("can edit locations and fixed Points of Interest, and clearing a custom name restores the address label", async ({ page }) => {
  await bootFakeApp(page);

  await addLocation(page, "Karl-Liebknecht-Str. 1", "Home Base");
  await addFixedPoi(page, "Berlin Hauptbahnhof", "Office");

  await page.locator('[data-edit-kind="home"]').first().click();
  await expect(page.locator("#composer-add-button")).toHaveText("Save");
  await page.locator("#composer-name-input").fill("Townhouse");
  await page.locator("#composer-add-button").click();
  await expect(page.locator("#comparison-table-container")).toContainText("Townhouse");

  await page.locator('[data-edit-kind="home"]').first().click();
  await page.locator("#composer-name-input").fill("");
  await page.locator("#composer-add-button").click();
  await expect(page.locator("#comparison-table-container")).toContainText("Karl-Liebknecht-Str. 1");
  await expect(page.locator("#comparison-table-container")).not.toContainText("Townhouse");

  await page.locator('[data-edit-kind="destination"]').first().click();
  await expect(page.locator("#composer-add-button")).toHaveText("Save");
  await page.locator("#composer-name-input").fill("Work");
  await page.locator("#composer-add-button").click();
  await expect(page.locator("#comparison-table-container")).toContainText("Work");
  await expect(page.locator("#comparison-table-container")).not.toContainText("Office");
});

test("can edit dynamic nearby groups and update their query and count", async ({ page }) => {
  await bootFakeApp(page);

  await addLocation(page, "Karl-Liebknecht-Str. 1");
  await addDynamicPoi(page, "coffee", 2);
  await expect(page.locator("#comparison-table-container")).toContainText("nearest coffee #2");

  await page.locator('[data-edit-kind="dynamic"]').first().click();
  await expect(page.locator("#composer-kind-select")).toBeDisabled();
  await page.locator("#composer-input").fill("italian restaurant");
  await page.locator("#composer-count-input").fill("1");
  await page.locator("#composer-name-input").fill("");
  await page.locator("#composer-add-button").click();

  await expect(page.locator("#comparison-table-container")).toContainText("nearest italian restaurant #1");
  await expect(page.locator("#comparison-table-container")).not.toContainText("nearest coffee #2");
});

test("load dialog validates empty and invalid JSON before importing pasted JSON", async ({ page }) => {
  await bootFakeApp(page);

  await page.getByRole("button", { name: "Load…" }).click();
  await page.locator("#import-load-json-button").click();
  await expect(page.locator("#message-bar")).toContainText("Paste a JSON board export to import it.");

  await page.locator("#load-json-input").fill("{ not valid json");
  await page.locator("#import-load-json-button").click();
  await expect(page.locator("#message-bar")).toContainText("JSON import failed:");

  await page.locator("#load-json-input").fill(JSON.stringify(buildBoardState({
    homes: [
      {
        id: "home-imported",
        colorIndex: 0,
        location: {
          label: "Imported Location",
          address: "Karl-Liebknecht-Str. 1, 10178 Berlin, Germany",
          lat: 52.5216,
          lng: 13.4098,
        },
      },
    ],
  }), null, 2));
  await page.locator("#import-load-json-button").click();

  await expect(page.locator("#load-dialog")).not.toBeVisible();
  await expect(page.locator("#comparison-table-container")).toContainText("Imported Location");
});

test("upload and drag-and-drop JSON imports replace the current board state", async ({ page }) => {
  await bootFakeApp(page);

  await addLocation(page, "Karl-Liebknecht-Str. 1", "Existing");
  await expect(page.locator("#comparison-table-container")).toContainText("Existing");

  await uploadBoardJson(page, buildBoardState({
    homes: [
      {
        id: "home-uploaded",
        colorIndex: 1,
        location: {
          label: "Uploaded Location",
          address: "Rosa-Luxemburg-Straße 1, 10178 Berlin, Germany",
          lat: 52.5261,
          lng: 13.4115,
        },
      },
    ],
  }));
  await expect(page.locator("#comparison-table-container")).toContainText("Uploaded Location");
  await expect(page.locator("#comparison-table-container")).not.toContainText("Existing");

  await dragOverBoardJson(page, {});
  await expect(page.locator("#drop-overlay")).toBeVisible();

  await dropBoardJson(page, buildBoardState({
    homes: [
      {
        id: "home-dropped",
        colorIndex: 2,
        location: {
          label: "Dropped Location",
          address: "Heinrich-Heine-Straße 1, 10179 Berlin, Germany",
          lat: 52.5117,
          lng: 13.4165,
        },
      },
    ],
  }));

  await expect(page.locator("#drop-overlay")).not.toBeVisible();
  await expect(page.locator("#comparison-table-container")).toContainText("Dropped Location");
  await expect(page.locator("#comparison-table-container")).not.toContainText("Uploaded Location");
});

test("table, graph, and map marker selections stay in sync and can be cleared", async ({ page }) => {
  await bootFakeApp(page);

  await importBoardJson(page, buildBoardState({
    dynamicGroups: [{ id: "dynamic-a", label: "nearest coffee", primaryType: "coffee", count: 2 }],
  }));
  await expect(page.locator("#comparison-table-container")).toContainText("nearest coffee #2");

  await page.locator('#comparison-table-container [data-row-id="poi-a"][data-home-index="0"]').click();
  await expect(page.locator("#comparison-table-container .comparison-cell.is-highlighted")).toHaveCount(1);
  await expect(page.locator("#comparison-graph-container .graph-bar-button.is-highlighted")).toHaveCount(1);
  await expect(page.locator("#map")).toHaveAttribute("data-highlight-state", "route");

  await page.locator('#comparison-graph-container [data-row-id="poi-a"][data-home-index="1"]').click();
  await expect(page.locator("#comparison-table-container .comparison-cell.is-highlighted")).toHaveCount(1);
  await expect(page.locator("#comparison-graph-container .graph-bar-button.is-highlighted")).toHaveCount(1);
  await expect(page.locator("#map")).toHaveAttribute("data-highlight-state", "route");

  await page.locator('#map .fake-map-marker[title="Rosa-Luxemburg-Straße 1"]').evaluate((element) => element.click());
  await expect(page.locator("#comparison-table-container .comparison-cell.is-highlighted")).toHaveCount(0);
  await expect(page.locator('[data-table-focus-key="home:home-b"]')).toHaveClass(/comparison-row-focus/);
  await expect(page.locator("#map")).not.toHaveAttribute("data-highlight-state", /route|fallback/);

  await page.locator('#map .fake-map-marker[title="Berlin Hauptbahnhof"]').evaluate((element) => element.click());
  await expect(page.locator('[data-table-focus-key="column:poi-a"]')).toHaveClass(/is-table-focused/);

  await page.locator("header.topbar").click();
  await expect(page.locator('[data-table-focus-key="home:home-b"]')).not.toHaveClass(/comparison-row-focus/);
  await expect(page.locator('[data-table-focus-key="column:poi-a"]')).not.toHaveClass(/is-table-focused/);
});

test("heading buttons center fixed locations on the map", async ({ page }) => {
  await bootFakeApp(page);

  await importBoardJson(page, buildBoardState());
  await page.locator('[data-center-home-id="home-a"]').click();
  await expect(page.locator("#map")).toHaveAttribute("data-centered-location", "Karl-Liebknecht-Str. 1");

  await page.locator('[data-center-destination-id="poi-a"]').click();
  await expect(page.locator("#map")).toHaveAttribute("data-centered-location", "Berlin Hauptbahnhof");
});

test("cell links point to the expected Google Maps route and dynamic place URLs", async ({ page }) => {
  await bootFakeApp(page);

  await importBoardJson(page, buildBoardState({
    homes: [
      {
        id: "home-a",
        colorIndex: 0,
        location: {
          label: "Karl-Liebknecht-Str. 1",
          address: "Karl-Liebknecht-Str. 1, 10178 Berlin, Germany",
          placeId: "fake-place-karl-liebknecht-1",
          lat: 52.5216,
          lng: 13.4098,
        },
      },
    ],
    dynamicGroups: [{ id: "dynamic-a", label: "nearest coffee", primaryType: "coffee", count: 1 }],
    selectedMode: "BICYCLING",
    selectedDirection: "DESTINATIONS_TO_HOME",
  }));

  const routeLink = page.locator("#comparison-table-container .cell-external-link").first();
  await expect(routeLink).toHaveAttribute("href", /travelmode=bicycling/);
  await expect(routeLink).toHaveAttribute("href", /origin=Berlin\+Hauptbahnhof/);
  await expect(routeLink).toHaveAttribute("href", /destination=Karl-Liebknecht-Str\.\+1/);

  const dynamicPlaceLink = page.locator("#comparison-table-container .cell-detail-link--dynamic").first();
  await expect(dynamicPlaceLink).toHaveAttribute("href", /google\.com\/maps\/search/);
  await expect(dynamicPlaceLink).toHaveAttribute("href", /query_place_id=fake-nearby-/);
});

test("preset customization can add and remove travel scenarios", async ({ page }) => {
  await bootFakeApp(page);

  await page.locator("#preset-select").selectOption("__CUSTOMIZE__");
  await expect(page.locator("#preset-menu-panel")).toBeVisible();

  await page.locator("#preset-day-input").selectOption("SATURDAY");
  await page.locator("#preset-time-input").fill("14:15");
  await page.locator("#add-preset-button").click();

  await expect(page.locator("#preset-select")).toContainText("Saturday 14:15");
  const saturdayPreset = page.locator("#presets-list li").filter({ hasText: "Saturday 14:15" });
  await expect(saturdayPreset).toBeVisible();
  await saturdayPreset.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("#preset-select")).not.toContainText("Saturday 14:15");
});

test("settings can prompt for an API key, save it, and reset local storage", async ({ page }) => {
  await bootFakeApp(page, {
    runtimeConfig: {},
    skipApiKeyPrompt: false,
    expectSettingsDialogVisible: true,
  });

  await expect(page.locator("#settings-required-note")).toBeVisible();
  await page.locator("#api-key-input").fill("test-browser-key");
  await page.locator("#save-settings-button").click();
  await expect(page.locator("#settings-dialog")).not.toBeVisible();
  await expect.poll(() =>
    page.evaluate(() => JSON.parse(window.localStorage.getItem("jwd.runtimeConfig.v1")).googleMapsApiKey),
  ).toBe("test-browser-key");

  await addLocation(page, "Karl-Liebknecht-Str. 1");
  await addFixedPoi(page, "Berlin Hauptbahnhof");
  await expect(page.locator("#comparison-table-container")).toContainText("Berlin Hauptbahnhof");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.locator("#clear-local-storage-button").click();

  await expect(page.locator("#settings-dialog")).toBeVisible();
  await expect(page.locator("#comparison-status")).toContainText("Start by adding a location or a Point of Interest.");
  await expect(page.locator("#settings-required-note")).toBeVisible();
});

test("warning and error paths surface the expected feedback", async ({ page }) => {
  await bootFakeApp(page, {
    geocodeZeroResultQueries: ["supermarket"],
    geocodeErrors: { broken: "GEOCODER_GEOCODE: OVER_QUERY_LIMIT" },
  });

  await page.getByRole("button", { name: "Add Point of Interest" }).click();
  await page.locator("#composer-input").fill("supermarket");
  await page.waitForTimeout(350);
  await expect(page.locator("#composer-search-results")).toContainText("Doesn't seem to be an address. Try find near location instead?");

  await page.locator("#composer-input").fill("broken place");
  await page.waitForTimeout(350);
  await expect(page.locator("#message-bar")).toContainText("Search failed: GEOCODER_GEOCODE: OVER_QUERY_LIMIT");

  await page.locator("#composer-kind-select").selectOption("DYNAMIC");
  await page.locator("#composer-input").fill("coffee");
  await page.locator("#composer-count-input").fill("0");
  await page.locator("#composer-add-button").click();
  await expect(page.locator("#message-bar")).toContainText("Provide a nearby search query and a count between 1 and 10.");

  await page.getByRole("button", { name: "Add Candidate Location" }).click();
  await page.getByRole("button", { name: "Select on map" }).click();
  await page.getByRole("button", { name: "Confirm Location" }).click();
  await expect(page.locator("#message-bar")).toContainText("Click on the map to place the location first.");
});

test("provider load and travel-time failures are surfaced", async ({ page }) => {
  await bootFakeApp(page, {
    createProviderError: "Fake provider boot failed",
    expectMapSurface: false,
  });
  await expect(page.locator("#message-bar")).toContainText("Map could not load: Fake provider boot failed");
  await expect(page.locator("#map-status")).toContainText("Map could not load: Fake provider boot failed");

  await bootFakeApp(page, {
    computeMatrixError: "Simulated matrix failure",
  });
  await addLocation(page, "Karl-Liebknecht-Str. 1");
  await addFixedPoi(page, "Berlin Hauptbahnhof");
  await expect(page.locator("#message-bar")).toContainText("Travel-time query failed: Simulated matrix failure");
});

function buildBoardState(overrides = {}) {
  return {
    version: 1,
    homes: [
      {
        id: "home-a",
        colorIndex: 0,
        location: {
          label: "Karl-Liebknecht-Str. 1",
          address: "Karl-Liebknecht-Str. 1, 10178 Berlin, Germany",
          placeId: "fake-place-karl-liebknecht-1",
          lat: 52.5216,
          lng: 13.4098,
        },
      },
      {
        id: "home-b",
        colorIndex: 1,
        location: {
          label: "Rosa-Luxemburg-Straße 1",
          address: "Rosa-Luxemburg-Straße 1, 10178 Berlin, Germany",
          placeId: "fake-place-rosa-luxemburg-1",
          lat: 52.5261,
          lng: 13.4115,
        },
      },
    ],
    fixedDestinations: [
      {
        id: "poi-a",
        label: "Berlin Hauptbahnhof",
        location: {
          label: "Berlin Hauptbahnhof",
          address: "Berlin Hauptbahnhof, Europaplatz 1, 10557 Berlin, Germany",
          placeId: "fake-place-hbf",
          lat: 52.5251,
          lng: 13.3694,
        },
      },
      {
        id: "poi-b",
        label: "Heinrich-Heine-Straße 1",
        location: {
          label: "Heinrich-Heine-Straße 1",
          address: "Heinrich-Heine-Straße 1, 10179 Berlin, Germany",
          placeId: "fake-place-heinrich-heine-1",
          lat: 52.5117,
          lng: 13.4165,
        },
      },
    ],
    dynamicGroups: [],
    presets: [
      { id: "preset-a", dayType: "WEEKDAY", timeLocal: "08:30", label: "Weekday 8:30" },
      { id: "preset-b", dayType: "WEEKDAY", timeLocal: "17:30", label: "Weekday 17:30" },
      { id: "preset-c", dayType: "SUNDAY", timeLocal: "11:00", label: "Sunday 11:00" },
    ],
    selectedPresetId: "preset-a",
    selectedMode: "TRANSIT",
    selectedDirection: "HOME_TO_DESTINATIONS",
    highlightedHomeId: "home-a",
    view: "TABLE",
    ...overrides,
  };
}
